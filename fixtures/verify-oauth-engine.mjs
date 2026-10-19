#!/usr/bin/env node
/**
 * Independent integration test for lib/oauth.js against the local OAuth rig.
 *
 * Drives the real engine the Host uses (discovery → DCR → PKCE → callback
 * exchange → Bearer injection → refresh → invalid_grant clearing → sign-out)
 * with an in-memory credential store and a fake webServer origin.
 *
 * Usage: node verify-oauth-engine.mjs [rigPort] [originPort]
 */

import { createOAuthEngine } from "../lib/oauth.js";

const RIG_PORT = Number(process.argv[2] ?? 8792);
const RIG = `http://127.0.0.1:${RIG_PORT}`;
const ORIGIN = `http://127.0.0.1:${Number(process.argv[3] ?? 59999)}`;

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` :: ${detail}`}`);
  }
}

// ---- in-memory credential store (same surface the engine uses) ----------
const records = new Map();
const credentials = {
  async readRecord(key) {
    const record = records.get(key);
    return record === undefined ? undefined : structuredClone(record);
  },
  async describeRecord(key) {
    return { configured: records.has(key), kind: records.get(key)?.kind, writable: true };
  },
  async modifyRecord(key, mutate) {
    const current = records.get(key);
    const next = await mutate(current === undefined ? undefined : structuredClone(current));
    if (next === undefined) return current;
    records.set(key, structuredClone(next));
    return structuredClone(next);
  },
  async deleteRecord(key) {
    records.delete(key);
  },
  async listRecords() {
    return [...records.keys()].map((key) => ({ key, kind: records.get(key)?.kind }));
  },
};

const engine = createOAuthEngine({
  getCredentials: () => credentials,
  getWebServer: () => ({ getOrigin: () => ORIGIN }),
  log: () => {},
});

const server = {
  name: "Rig",
  enabled: true,
  transport: "streamable-http",
  url: `${RIG}/mcp`,
  headers: {},
  toolCallTimeoutMs: 60000,
  oauth: { enabled: true, scopes: [], clientId: "", clientSecret: "", resourceMetadataUrl: "", authorizationServer: "" },
};

const onlyKey = () => [...records.keys()][0];
const stored = () => records.get(onlyKey())?.payload;

async function mcpCall(token, method, params) {
  const response = await fetch(`${RIG}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params === undefined ? {} : { params }) }),
  });
  return { status: response.status, body: await response.text() };
}

console.log("1. authorize() starts a PKCE flow and returns the URL");
const started = await engine.authorize(server);
check("status is pending", started.status === "pending", JSON.stringify(started));
const url = started.authorizationUrl ?? "";
check("authorization URL is absolute", url.startsWith(`${RIG}/authorize?`), url);
const authorizeUrl = new URL(url);
check("PKCE S256 challenge", authorizeUrl.searchParams.get("code_challenge_method") === "S256" && (authorizeUrl.searchParams.get("code_challenge") ?? "").length >= 40);
check("state is present", (authorizeUrl.searchParams.get("state") ?? "").length >= 16);
check("scope is mcp:connect", authorizeUrl.searchParams.get("scope") === "mcp:connect", authorizeUrl.searchParams.get("scope"));
check("RFC 8707 resource is sent", authorizeUrl.searchParams.get("resource") === `${RIG}/mcp`, authorizeUrl.searchParams.get("resource"));
check("dynamic client registration happened", (authorizeUrl.searchParams.get("client_id") ?? "").startsWith("client-"), authorizeUrl.searchParams.get("client_id"));
check("redirect_uri uses the live origin", authorizeUrl.searchParams.get("redirect_uri") === `${ORIGIN}/api/dsh-mcp-manager/oauth/callback`);

console.log("2. a second authorize() while pending is refused");
let secondRefused = false;
try {
  await engine.authorize(server);
} catch (error) {
  secondRefused = String(error?.code ?? error?.message ?? error).includes("inflight") || String(error?.code ?? "").includes("in-flight") || String(error?.message ?? "").includes("already");
}
check("concurrent attempt rejected", secondRefused);

console.log("3. consent redirect is consumed by handleCallback()");
const consent = await fetch(url, { redirect: "manual" });
const location = consent.headers.get("location") ?? "";
check("rig redirected to our callback", location.startsWith(`${ORIGIN}/api/dsh-mcp-manager/oauth/callback?`), location);
const callbackUrl = new URL(location);
const queried = Object.fromEntries(callbackUrl.searchParams);
const callback = await engine.handleCallback(queried, ORIGIN);
check("callback reports success", callback.ok === true, JSON.stringify({ ok: callback.ok, error: callback.error }));
check("callback names the server", callback.server === "Rig", String(callback.server));
check("success page is HTML without scripts", callback.html.includes("<") && !/script/i.test(callback.html));

console.log("4. the grant is stored, and never exposes the token");
check("one credential record exists", records.size === 1, [...records.keys()].join(","));
check("record key is 'mcp-manager/rig'", onlyKey() === "mcp-manager/rig", onlyKey());
check("record kind is grant", records.get(onlyKey())?.kind === "grant");
check("access token stored", typeof stored()?.accessToken === "string" && stored().accessToken.startsWith("at-"));
check("refresh token stored", typeof stored()?.refreshToken === "string" && stored().refreshToken.startsWith("rt-"));
check("expiry stored", typeof stored()?.expiresAt === "number");
const status1 = await engine.readStatus(server);
const statusJson = JSON.stringify(status1);
check("status says authorized", status1.authorized === true, statusJson);
check("status never carries a token", !statusJson.includes("at-") && !statusJson.includes("rt-") && !/"accessToken"/.test(statusJson), statusJson);

console.log("5. headerFor() injects a working bearer token");
const header1 = await engine.headerFor(server);
check("header is Bearer", typeof header1.header === "string" && header1.header.startsWith("Bearer at-"), JSON.stringify(header1));
const callAuthed = await mcpCall(header1.header.slice(7), "tools/list");
check("MCP accepts the token (tools/list 200)", callAuthed.status === 200, `${callAuthed.status} ${callAuthed.body.slice(0, 120)}`);
check("tools came back", callAuthed.body.includes("rig_ping") && callAuthed.body.includes("rig_whoami"));

console.log("6. an expired token is refreshed through the credential store");
const tokenBefore = stored().accessToken;
records.set(onlyKey(), { kind: "grant", payload: { ...stored(), expiresAt: Date.now() - 1000 } });
const header2 = await engine.headerFor(server);
check("new header issued", typeof header2.header === "string" && header2.header.startsWith("Bearer at-"), JSON.stringify(header2));
check("token rotated", header2.header?.slice(7) !== tokenBefore);
const statsAfterRefresh = await (await fetch(`${RIG}/_stats`)).json();
check("rig saw the refresh grant", statsAfterRefresh.refreshes >= 1, JSON.stringify(statsAfterRefresh));
const callRefreshed = await mcpCall(header2.header.slice(7), "tools/list");
check("refreshed token works", callRefreshed.status === 200, String(callRefreshed.status));

console.log("7. an invalid refresh token clears the grant");
records.set(onlyKey(), { kind: "grant", payload: { ...stored(), expiresAt: Date.now() - 1000, refreshToken: "rt-bogus" } });
const header3 = await engine.headerFor(server);
check("no header after failed refresh", header3.header === undefined, JSON.stringify(header3));
check("error reported", typeof header3.error === "string" && header3.error.length > 0, JSON.stringify(header3));
check("record cleared", records.size === 0, [...records.keys()].join(","));
const statusAfterClear = await engine.readStatus(server);
check("status says unauthorized", statusAfterClear.authorized === false, JSON.stringify(statusAfterClear));

console.log("8. paste-token stores a non-expiring grant, signOut removes it");
const pasted = await engine.approveWithToken(server, "manual-token-123");
check("paste reported authorized", pasted.authorized === true, JSON.stringify(pasted));
const statusPasted = await engine.readStatus(server);
check("pasted grant authorized, no expiry", statusPasted.authorized === true && statusPasted.expiresAt === null, JSON.stringify(statusPasted));
const header4 = await engine.headerFor(server);
check("pasted token injected verbatim", header4.header === "Bearer manual-token-123", JSON.stringify(header4));
await engine.signOut(server);
check("signOut removed the record", records.size === 0);
const header5 = await engine.headerFor(server);
check("no header after signOut", header5.header === undefined, JSON.stringify(header5));

console.log("9. wrong or replayed state fails closed");
const replay = await engine.handleCallback({ state: "0".repeat(32), code: "nope" }, ORIGIN);
check("unknown state rejected", replay.ok === false && records.size === 0, JSON.stringify({ ok: replay.ok, error: replay.error }));
check("failure page is HTML", replay.html.includes("<") && !/script/i.test(replay.html));

engine.dispose();
console.log(failures === 0 ? "\nALL ENGINE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
