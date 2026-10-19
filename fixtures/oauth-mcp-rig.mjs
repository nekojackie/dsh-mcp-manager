#!/usr/bin/env node
/**
 * OAuth 2.1 authorization server + OAuth-protected MCP resource server, on one port.
 *
 * Test rig for dsh-mcp-manager's OAuth support ONLY — not part of the plugin bundle.
 * It implements:
 *   - RFC 9728 protected-resource metadata (origin-level and path-suffixed)
 *   - RFC 8414 authorization-server metadata
 *   - RFC 7591 dynamic client registration
 *   - authorization_code + PKCE(S256) with automatic consent (no human)
 *   - refresh_token with rotation
 *   - a Streamable-HTTP MCP endpoint that requires `Authorization: Bearer …`
 *
 * Usage:  node oauth-mcp-rig.mjs [port]        (default 8792)
 *
 * Control endpoints:
 *   GET  /_stats          counters (registrations, authorize, grants, refreshes, mcp, rejected)
 *   POST /_expire         force every issued access token to be expired now
 */

import { createServer } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

const PORT = Number(process.argv[2] ?? 8792);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const RESOURCE = `${ORIGIN}/mcp`;
const SCOPE = "mcp:connect";
let accessTtlS = 3600;

const stats = {
  metadata: 0,
  registrations: 0,
  authorize: 0,
  grants: 0,
  refreshes: 0,
  mcp: 0,
  rejected: 0,
  invalidGrants: 0,
};

/** accessToken -> { expiresAt, clientId, scope, resource } */
const accessTokens = new Map();
/** refreshToken -> { clientId, scope, resource } */
const refreshTokens = new Map();
/** code -> { clientId, redirectUri, challenge, scope, resource, expiresAt, used } */
const authCodes = new Map();

const TOOLS = [
  {
    name: "rig_ping",
    description: "Answer pong. Requires a valid OAuth bearer token.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "rig_whoami",
    description: "Return the granted scope and client id of the caller's token.",
    inputSchema: { type: "object", properties: {} },
  },
];

function json(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(payload);
}

function html(res, status, body) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>rig</title>${body}`);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      resolve(text);
    });
  });
}

function parseBody(text, contentType) {
  if (typeof text !== "string" || text.length === 0) return undefined;
  if (String(contentType ?? "").includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function pkceChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function metadataResource() {
  return {
    resource: RESOURCE,
    authorization_servers: [ORIGIN],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
  };
}

function metadataAs() {
  return {
    issuer: ORIGIN,
    authorization_endpoint: `${ORIGIN}/authorize`,
    token_endpoint: `${ORIGIN}/token`,
    registration_endpoint: `${ORIGIN}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    resource_indicators_supported: true,
  };
}

function issueTokens(clientId, scope, resource) {
  const accessToken = `at-${randomUUID()}`;
  const refreshToken = `rt-${randomUUID()}`;
  accessTokens.set(accessToken, { expiresAt: Date.now() + accessTtlS * 1000, clientId, scope, resource });
  refreshTokens.set(refreshToken, { clientId, scope, resource });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: accessTtlS,
    refresh_token: refreshToken,
    scope,
  };
}

function bearerOf(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string") return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : undefined;
}

async function handleMcp(req, res, bodyText) {
  const token = bearerOf(req);
  const record = token === undefined ? undefined : accessTokens.get(token);
  if (record === undefined || record.expiresAt <= Date.now()) {
    stats.rejected += 1;
    json(
      res,
      401,
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } },
      {
        "www-authenticate": `Bearer realm="mock", error="invalid_token", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`,
      },
    );
    return;
  }
  stats.mcp += 1;
  const message = parseBody(bodyText, req.headers["content-type"]);
  if (message === undefined) {
    json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    return;
  }

  if (message.id === undefined || message.id === null) {
    res.writeHead(202);
    res.end();
    return;
  }

  const { id, method, params } = message;
  const reply = (result) => json(res, 200, { jsonrpc: "2.0", id, result });

  switch (method) {
    case "initialize":
      reply({
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "oauth-rig", version: "0.1.0" },
      });
      return;
    case "ping":
      reply({});
      return;
    case "tools/list":
      reply({ tools: TOOLS });
      return;
    case "tools/call": {
      const name = params?.name;
      if (name === "rig_ping") {
        reply({ content: [{ type: "text", text: "pong" }] });
        return;
      }
      if (name === "rig_whoami") {
        reply({ content: [{ type: "text", text: `client=${record.clientId} scope=${record.scope} resource=${record.resource}` }] });
        return;
      }
      reply({ isError: true, content: [{ type: "text", text: `unknown tool: ${String(name)}` }] });
      return;
    }
    case "resources/list":
      reply({ resources: [] });
      return;
    case "resources/templates/list":
      reply({ resourceTemplates: [] });
      return;
    case "prompts/list":
      reply({ prompts: [] });
      return;
    default:
      json(res, 200, { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${String(method)}` } });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", ORIGIN);
  const pathname = url.pathname;

  // ---- discovery -------------------------------------------------------
  if (
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname === "/.well-known/oauth-protected-resource/mcp"
  ) {
    stats.metadata += 1;
    json(res, 200, metadataResource());
    return;
  }
  if (pathname === "/.well-known/oauth-authorization-server" || pathname === "/.well-known/openid-configuration") {
    stats.metadata += 1;
    json(res, 200, metadataAs());
    return;
  }

  // ---- control ---------------------------------------------------------
  if (pathname === "/_stats") {
    json(res, 200, stats);
    return;
  }
  if (pathname === "/_ttl" && req.method === "POST") {
    const body = parseBody(await readBody(req), req.headers["content-type"]) ?? {};
    const seconds = Number(body.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      json(res, 400, { error: "seconds must be a positive number" });
      return;
    }
    accessTtlS = seconds;
    json(res, 200, { accessTtlSeconds: accessTtlS });
    return;
  }
  if (pathname === "/_expire" && req.method === "POST") {
    for (const record of accessTokens.values()) record.expiresAt = 0;
    json(res, 200, { expired: accessTokens.size });
    return;
  }

  // ---- dynamic client registration ------------------------------------
  if (pathname === "/register" && req.method === "POST") {
    const body = parseBody(await readBody(req), req.headers["content-type"]) ?? {};
    stats.registrations += 1;
    json(res, 201, {
      client_id: `client-${randomUUID()}`,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: "none",
      redirect_uris: Array.isArray(body.redirect_uris) ? body.redirect_uris : [],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: body.client_name ?? "test client",
    });
    return;
  }

  // ---- authorization endpoint (auto-consent) --------------------------
  if (pathname === "/authorize" && req.method === "GET") {
    stats.authorize += 1;
    const clientId = url.searchParams.get("client_id") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const challenge = url.searchParams.get("code_challenge") ?? "";
    const method = url.searchParams.get("code_challenge_method") ?? "";
    const scope = url.searchParams.get("scope") ?? SCOPE;
    const resource = url.searchParams.get("resource") ?? RESOURCE;

    if (!redirectUri || !clientId) {
      html(res, 400, "<h3>missing client_id or redirect_uri</h3>");
      return;
    }
    if (method !== "S256" || challenge.length < 16) {
      html(res, 400, "<h3>this rig requires PKCE S256</h3>");
      return;
    }

    const code = `code-${randomUUID()}`;
    authCodes.set(code, {
      clientId,
      redirectUri,
      challenge,
      scope,
      resource,
      expiresAt: Date.now() + 5 * 60_000,
      used: false,
    });

    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    if (state) target.searchParams.set("state", state);
    res.writeHead(302, { location: target.href });
    res.end();
    return;
  }

  // ---- token endpoint --------------------------------------------------
  if (pathname === "/token" && req.method === "POST") {
    const body = parseBody(await readBody(req), req.headers["content-type"]) ?? {};
    const grantType = body.grant_type;

    if (grantType === "authorization_code") {
      const entry = authCodes.get(String(body.code ?? ""));
      if (entry === undefined || entry.used || entry.expiresAt <= Date.now()) {
        stats.invalidGrants += 1;
        json(res, 400, { error: "invalid_grant", error_description: "authorization code is unknown, used, or expired" });
        return;
      }
      if (String(body.client_id ?? "") !== entry.clientId) {
        stats.invalidGrants += 1;
        json(res, 400, { error: "invalid_grant", error_description: "client_id mismatch" });
        return;
      }
      if (String(body.redirect_uri ?? "") !== entry.redirectUri) {
        stats.invalidGrants += 1;
        json(res, 400, { error: "invalid_grant", error_description: "redirect_uri mismatch" });
        return;
      }
      const verifier = String(body.code_verifier ?? "");
      const expected = pkceChallenge(verifier);
      const given = entry.challenge;
      if (
        verifier.length === 0 ||
        expected.length !== given.length ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(given))
      ) {
        stats.invalidGrants += 1;
        json(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
        return;
      }
      entry.used = true;
      stats.grants += 1;
      json(res, 200, issueTokens(entry.clientId, entry.scope, entry.resource));
      return;
    }

    if (grantType === "refresh_token") {
      const presented = String(body.refresh_token ?? "");
      const entry = refreshTokens.get(presented);
      if (entry === undefined) {
        stats.invalidGrants += 1;
        json(res, 400, { error: "invalid_grant", error_description: "refresh token is unknown" });
        return;
      }
      refreshTokens.delete(presented); // rotation
      stats.refreshes += 1;
      json(res, 200, issueTokens(entry.clientId, entry.scope, entry.resource));
      return;
    }

    json(res, 400, { error: "unsupported_grant_type" });
    return;
  }

  // ---- protected MCP resource -----------------------------------------
  if (pathname === "/mcp") {
    if (req.method === "GET") {
      res.writeHead(405, { allow: "POST" });
      res.end();
      return;
    }
    if (req.method === "DELETE") {
      res.writeHead(200);
      res.end();
      return;
    }
    if (req.method === "POST") {
      await handleMcp(req, res, await readBody(req));
      return;
    }
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }

  json(res, 404, { error: "not found", path: pathname });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`oauth-mcp-rig listening on ${ORIGIN} (resource ${RESOURCE})\n`);
});
