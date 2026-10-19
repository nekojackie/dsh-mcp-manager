/**
 * dsh-mcp-manager — OAuth 2.1 engine (Host side).
 *
 * Self-contained: `node:` builtins and the global `fetch` only. No Harness
 * package imports, because the credential key grammar is built locally:
 * `<scope>/<id>` with both segments matching `/^[a-z][a-z0-9-]*$/`.
 *
 * The engine owns discovery (RFC 9728 protected-resource metadata + RFC 8414
 * authorization-server metadata), dynamic client registration (RFC 7591),
 * authorization-code + PKCE S256 (RFC 7636), token exchange, refresh, and the
 * in-memory pending-attempt table for the browser redirect. Tokens are written
 * ONLY through `ctx.credentials.modifyRecord` (a serialized read-modify-write)
 * and are never returned to the caller, rendered, or logged.
 *
 * Wiring contract (see CONTRACT-OAUTH.md §7):
 *
 *   createOAuthEngine({ getCredentials, getWebServer, log }) => {
 *     slugOf, statusFor, readStatus, approveWithToken, authorize,
 *     handleCallback, refreshNow, signOut, headerFor, dispose
 *   }
 *
 * `getCredentials()` / `getWebServer()` are lazy accessors and may return
 * `undefined`; services are never captured at module load.
 *
 * Network rules: every request carries an AbortSignal (the engine's own, plus
 * the caller's when supplied) and a timeout via `AbortSignal.timeout`.
 */

import { createHash, randomBytes } from "node:crypto"

//#region constants

const CREDENTIAL_SCOPE = "mcp-manager"
const KEY_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/
const CALLBACK_PATH = "/api/dsh-mcp-manager/oauth/callback"
const PENDING_TTL_MS = 10 * 60 * 1000
const REFRESH_SKEW_MS = 60 * 1000
const DISCOVERY_TTL_MS = 5 * 60 * 1000
const PROBE_TIMEOUT_MS = 4000
const DISCOVERY_TIMEOUT_MS = 8000
const TOKEN_TIMEOUT_MS = 15000
const USER_AGENT = "dsh-mcp-manager/0.1.0"
const CLIENT_NAME = "DeepSeek Harness"

//#endregion

//#region small utilities

function errorMessage(error) {
  if (error instanceof Error) return error.message || error.name || "unknown error"
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function text(value) {
  return typeof value === "string" ? value : ""
}

/** User-facing OAuth failure carrying a stable machine-readable code. */
function oauthError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function stringArray(value) {
  if (!Array.isArray(value)) return []
  return value.filter((entry) => typeof entry === "string" && entry.trim() !== "").map((entry) => entry.trim())
}

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

/** Deterministic credential slug for a server name (CONTRACT-OAUTH §2). */
function slugify(name) {
  let slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
  if (!/^[a-z]/.test(slug)) slug = `s-${slug}`
  return slug
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;"
      case "<": return "&lt;"
      case ">": return "&gt;"
      case '"': return "&quot;"
      default: return "&#39;"
    }
  })
}

/** One-line, script-free, resource-free page for the browser callback. */
function htmlPage(heading, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title><style>body{font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.25rem}h1{font-size:1.15rem;margin:0 0 .5rem}p{margin:0}</style></head><body><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(message)}</p></body></html>`
}

function successPage(serverName) {
  return htmlPage("Authorization complete", `The MCP server "${serverName}" is now authorized. You can close this tab and return to DeepSeek Harness.`)
}

function failurePage(message) {
  return htmlPage("Authorization failed", `${message} You can close this tab and try again from the MCP Servers page.`)
}

function tokenErrorDescription(json, response) {
  if (isRecord(json)) {
    const code = text(json.error)
    const description = text(json.error_description)
    if (code !== "" || description !== "") return [code || "token request failed", description].filter(Boolean).join(": ")
  }
  return `the token endpoint answered HTTP ${response.status}`
}

function grantPayload(record) {
  if (!isRecord(record)) return undefined
  if (record.kind !== "grant") return undefined
  return isRecord(record.payload) ? record.payload : undefined
}

//#endregion

//#region engine

/**
 * Create one OAuth engine. Options are lazy accessors so the engine never
 * captures a service at module load (CONTRACT-OAUTH §7).
 *
 * @param {{ getCredentials?: () => unknown, getWebServer?: () => unknown, log?: { warn?: (message: string) => void } }} [options]
 */
export function createOAuthEngine(options = {}) {
  const getCredentials = typeof options.getCredentials === "function" ? options.getCredentials : () => undefined
  const getWebServer = typeof options.getWebServer === "function" ? options.getWebServer : () => undefined
  const log = isRecord(options.log) ? options.log : {}
  const warn = (message) => {
    try {
      log.warn?.(message)
    } catch {
      // Logging must never break the flow.
    }
  }

  /** name -> slug assignment, deterministic in first-ask order (roster order). */
  const slugs = new Map()
  const assignedSlugs = new Set()
  /** state -> attempt */
  const pendingByState = new Map()
  /** server name -> attempt */
  const pendingByName = new Map()
  /** server name -> discovery record */
  const discoveryCache = new Map()
  /** server name -> grant payload (or null when known-absent) */
  const recordCache = new Map()
  /** server name -> last failure message (or null) */
  const errorCache = new Map()

  const controller = new AbortController()
  let disposed = false

  //#region credentials

  function credentialsService() {
    if (disposed) return undefined
    let service
    try {
      service = getCredentials()
    } catch {
      service = undefined
    }
    if (service === undefined || service === null) return undefined
    if (typeof service.readRecord !== "function") return undefined
    if (typeof service.modifyRecord !== "function") return undefined
    if (typeof service.deleteRecord !== "function") return undefined
    return service
  }

  function keyFor(name) {
    const slug = slugOf(name)
    if (!KEY_SEGMENT_PATTERN.test(CREDENTIAL_SCOPE) || !KEY_SEGMENT_PATTERN.test(slug)) {
      throw oauthError("credential-key", `could not build a credential key for "${String(name)}": the segment "${slug}" is outside the credential-key grammar`)
    }
    return `${CREDENTIAL_SCOPE}/${slug}`
  }

  async function readRecordRaw(credentials, key) {
    try {
      return await credentials.readRecord(key)
    } catch (error) {
      throw oauthError("credentials-failed", `could not read the stored OAuth credential: ${errorMessage(error)}`)
    }
  }

  async function readGrant(server) {
    const credentials = credentialsService()
    if (credentials === undefined) {
      throw oauthError("credentials-unavailable", "the credentials service is not available in this profile, so OAuth tokens cannot be read or stored")
    }
    const record = await readRecordRaw(credentials, keyFor(server.name))
    const payload = grantPayload(record)
    recordCache.set(server.name, payload ?? null)
    return payload
  }

  /** Write one grant through the service's serialized read-modify-write. */
  async function writeGrant(server, mutate) {
    const credentials = credentialsService()
    if (credentials === undefined) {
      throw oauthError("credentials-unavailable", "the credentials service is not available in this profile, so OAuth tokens cannot be stored")
    }
    const key = keyFor(server.name)
    let written
    try {
      written = await credentials.modifyRecord(key, async (current) => {
        const replaced = await mutate(grantPayload(current))
        if (replaced === undefined) return undefined
        return { kind: "grant", payload: replaced }
      })
    } catch (error) {
      throw oauthError("credentials-failed", `could not store the OAuth credential: ${errorMessage(error)}`)
    }
    const payload = grantPayload(written)
    recordCache.set(server.name, payload ?? null)
    return payload
  }

  async function clearGrant(server) {
    const credentials = credentialsService()
    recordCache.set(server.name, null)
    if (credentials === undefined) return
    try {
      await credentials.deleteRecord(keyFor(server.name))
    } catch (error) {
      warn(`could not delete the stored credential for "${server.name}": ${errorMessage(error)}`)
    }
  }

  //#endregion

  //#region config + views

  function oauthConfig(server) {
    const raw = isRecord(server?.oauth) ? server.oauth : {}
    return {
      enabled: raw.enabled === true,
      scopes: Array.isArray(raw.scopes) ? raw.scopes.map((entry) => String(entry)).filter((entry) => entry.trim() !== "") : [],
      clientId: text(raw.clientId).trim(),
      clientSecret: text(raw.clientSecret),
      resourceMetadataUrl: text(raw.resourceMetadataUrl).trim(),
      authorizationServer: text(raw.authorizationServer).trim(),
    }
  }

  function isHttpServer(server) {
    return isRecord(server) && server.transport === "streamable-http"
  }

  function usableToken(payload, enabled) {
    if (!enabled || !isRecord(payload)) return false
    if (text(payload.accessToken) === "") return false
    const expiresAt = typeof payload.expiresAt === "number" && Number.isFinite(payload.expiresAt) ? payload.expiresAt : undefined
    if (expiresAt === undefined) return true
    if (expiresAt > Date.now()) return true
    return text(payload.refreshToken) !== ""
  }

  function viewFor(server, payload, errorOverride) {
    const config = oauthConfig(server)
    const enabled = config.enabled === true && isHttpServer(server)
    const current = isRecord(payload) ? payload : undefined
    const expiresAt = current && typeof current.expiresAt === "number" && Number.isFinite(current.expiresAt) ? current.expiresAt : null
    const scope = current && text(current.scope) !== "" ? text(current.scope) : null
    const clientId = current ? text(current.clientId) : ""
    let client = null
    if (clientId !== "") client = config.clientId !== "" && clientId === config.clientId ? "configured" : "dynamic"
    const error = errorOverride !== undefined ? errorOverride : enabled ? errorCache.get(server.name) ?? null : null
    return {
      enabled,
      authorized: enabled && usableToken(current, enabled),
      expiresAt,
      scope,
      client,
      error: error === undefined ? null : error,
    }
  }

  /** Synchronous best-effort view from the last read (CONTRACT-OAUTH §7). */
  function statusFor(server) {
    const cached = recordCache.get(server.name)
    return viewFor(server, cached === undefined || cached === null ? undefined : cached, undefined)
  }

  async function readStatus(server) {
    const config = oauthConfig(server)
    if (config.enabled !== true || !isHttpServer(server)) {
      recordCache.delete(server.name)
      return viewFor(server, undefined, null)
    }
    if (credentialsService() === undefined) {
      return viewFor(server, recordCache.get(server.name) ?? undefined, "the credentials service is not available, so OAuth tokens cannot be read")
    }
    try {
      const payload = await readGrant(server)
      return viewFor(server, payload, undefined)
    } catch (error) {
      const cached = recordCache.get(server.name)
      return viewFor(server, cached === undefined || cached === null ? undefined : cached, errorMessage(error))
    }
  }

  //#endregion

  //#region slugs

  /**
   * Stable credential slug for a server name. Suffixes (`-2`, `-3`, …) resolve
   * collisions deterministically in first-ask order, which the Host half fixes
   * to roster order.
   */
  function slugOf(name) {
    const key = String(name)
    const cached = slugs.get(key)
    if (cached !== undefined) return cached
    const base = slugify(key)
    let candidate = base
    let suffix = 2
    while (assignedSlugs.has(candidate)) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    slugs.set(key, candidate)
    assignedSlugs.add(candidate)
    return candidate
  }

  //#endregion

  //#region HTTP

  async function request(url, init = {}) {
    const timeoutMs = typeof init.timeoutMs === "number" ? init.timeoutMs : DISCOVERY_TIMEOUT_MS
    const timeout = AbortSignal.timeout(timeoutMs)
    const signals = [timeout, controller.signal]
    if (init.signal !== undefined && init.signal !== null) signals.push(init.signal)
    const signal = typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : timeout
    let response
    try {
      response = await fetch(url, {
        method: init.method ?? "GET",
        headers: { "user-agent": USER_AGENT, ...(isRecord(init.headers) ? init.headers : {}) },
        body: init.body,
        signal,
        redirect: "follow",
        cache: "no-store",
      })
    } catch (error) {
      if (controller.signal.aborted) throw oauthError("aborted", "the OAuth request was cancelled because the manager is shutting down")
      const aborted = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
      throw oauthError("network", `${init.method ?? "GET"} ${url} failed: ${aborted ? `no response within ${timeoutMs} ms` : errorMessage(error)}`)
    }
    let body = ""
    try {
      body = await response.text()
    } catch {
      body = ""
    }
    return { response, body }
  }

  function parseJson(body) {
    if (typeof body !== "string" || body.trim() === "") return undefined
    try {
      return JSON.parse(body)
    } catch {
      return undefined
    }
  }

  async function fetchJsonObject(url, init) {
    const { response, body } = await request(url, init)
    return { response, json: parseJson(body) }
  }

  async function postForm(url, form, signal) {
    const { response, body } = await request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: form.toString(),
      timeoutMs: TOKEN_TIMEOUT_MS,
      signal,
    })
    return { response, json: parseJson(body) }
  }

  //#endregion

  //#region discovery

  function resourceMetadataCandidates(server, config, hintedUrl) {
    if (config.resourceMetadataUrl !== "") return [config.resourceMetadataUrl]
    if (hintedUrl !== undefined && hintedUrl !== "") return [hintedUrl]
    let parsed
    try {
      parsed = new URL(server.url)
    } catch {
      throw oauthError("invalid-url", `"${String(server.name)}" has no absolute URL to discover OAuth metadata from`)
    }
    const candidates = [`${parsed.origin}/.well-known/oauth-protected-resource`]
    const path = parsed.pathname.replace(/\/+$/, "")
    if (path !== "" && path !== "/") candidates.push(`${parsed.origin}/.well-known/oauth-protected-resource${path}`)
    return candidates
  }

  function parseResourceMetadataHint(headerValue) {
    const header = text(headerValue)
    if (header === "") return ""
    const quoted = /resource_metadata="([^"]+)"/i.exec(header)
    if (quoted !== null && quoted[1] !== undefined) return quoted[1].trim()
    const bare = /resource_metadata=([^,\s]+)/i.exec(header)
    if (bare !== null && bare[1] !== undefined) return bare[1].replace(/^"|"$/g, "").trim()
    return ""
  }

  /** Optional probe: read `resource_metadata` off the MCP endpoint's 401. */
  async function probeResourceMetadata(server) {
    try {
      const { response } = await request(server.url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "dsh-mcp-manager", version: "0.1.0" },
          },
        }),
        timeoutMs: PROBE_TIMEOUT_MS,
      })
      return parseResourceMetadataHint(response.headers.get("www-authenticate"))
    } catch {
      return ""
    }
  }

  async function discoverAuthorizationServer(authorizationServer) {
    const base = authorizationServer.replace(/\/+$/, "")
    const candidates = [`${base}/.well-known/oauth-authorization-server`, `${base}/.well-known/openid-configuration`]
    const problems = []
    for (const candidate of candidates) {
      try {
        const { response, json } = await fetchJsonObject(candidate, { headers: { accept: "application/json" }, timeoutMs: DISCOVERY_TIMEOUT_MS })
        if (response.status === 200 && isRecord(json) && text(json.token_endpoint).trim() !== "") {
          return { ...json, metadataUrl: candidate }
        }
        problems.push(`${candidate}: HTTP ${response.status}`)
      } catch (error) {
        problems.push(`${candidate}: ${errorMessage(error)}`)
      }
    }
    throw oauthError("discovery-failed", `could not read authorization-server metadata at ${base} (${problems.join("; ")})`)
  }

  async function discover(server, config) {
    const cached = discoveryCache.get(server.name)
    if (cached !== undefined && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached

    const hinted = config.resourceMetadataUrl === "" ? await probeResourceMetadata(server) : ""
    const candidates = resourceMetadataCandidates(server, config, hinted)
    const problems = []
    let resourceMetadata
    let resourceMetadataUrl = ""
    for (const candidate of candidates) {
      try {
        const { response, json } = await fetchJsonObject(candidate, { headers: { accept: "application/json" }, timeoutMs: DISCOVERY_TIMEOUT_MS })
        if (response.status === 200 && isRecord(json)) {
          resourceMetadata = json
          resourceMetadataUrl = candidate
          break
        }
        problems.push(`${candidate}: HTTP ${response.status}`)
      } catch (error) {
        problems.push(`${candidate}: ${errorMessage(error)}`)
      }
    }
    if (resourceMetadata === undefined) {
      throw oauthError("discovery-failed", `could not discover OAuth protected-resource metadata for "${server.name}" (${problems.join("; ") || "no candidate URL"}). Paste an access token instead, or set oauth.resourceMetadataUrl.`)
    }

    const resource = text(resourceMetadata.resource).trim() || text(server.url)
    const authorizationServer =
      config.authorizationServer !== ""
        ? config.authorizationServer
        : text(Array.isArray(resourceMetadata.authorization_servers) ? resourceMetadata.authorization_servers[0] : "").trim()
    if (authorizationServer === "") {
      throw oauthError("discovery-failed", `the protected-resource metadata for "${server.name}" names no authorization server; set oauth.authorizationServer or paste an access token instead`)
    }
    const asMetadata = await discoverAuthorizationServer(authorizationServer)
    const record = {
      at: Date.now(),
      resourceMetadata,
      resourceMetadataUrl,
      resource,
      authorizationServer,
      asMetadata,
      requiredScopes: stringArray(resourceMetadata.required_scopes),
      supportedScopes: stringArray(resourceMetadata.scopes_supported),
    }
    discoveryCache.set(server.name, record)
    return record
  }

  function resolveScope(server, config, record) {
    if (config.scopes.length > 0) return config.scopes.join(" ")
    if (record.requiredScopes.length > 0) return record.requiredScopes.join(" ")
    if (record.supportedScopes.length > 0) return record.supportedScopes.join(" ")
    return stringArray(record.resourceMetadata.required_scopes).join(" ")
  }

  //#endregion

  //#region token exchange

  function tokenPayload(json, previous, context) {
    const accessToken = text(json.access_token)
    if (accessToken === "") throw oauthError("token-exchange-failed", "the token endpoint returned no access_token")
    const rawExpires = json.expires_in
    const seconds = typeof rawExpires === "number" ? rawExpires : typeof rawExpires === "string" && rawExpires.trim() !== "" ? Number(rawExpires) : Number.NaN
    const expiresAt = Number.isFinite(seconds) && seconds > 0 ? Date.now() + Math.floor(seconds * 1000) : undefined
    const refreshToken = text(json.refresh_token) || (previous ? text(previous.refreshToken) : "")
    const scope = text(json.scope) || (previous ? text(previous.scope) : "") || text(context.scope)
    const payload = { v: 1, accessToken, tokenType: "Bearer", obtainedAt: Date.now() }
    if (refreshToken !== "") payload.refreshToken = refreshToken
    if (scope !== "") payload.scope = scope
    if (expiresAt !== undefined) payload.expiresAt = expiresAt
    if (text(context.resource) !== "") payload.resource = text(context.resource)
    if (text(context.tokenEndpoint) !== "") payload.tokenEndpoint = text(context.tokenEndpoint)
    if (text(context.authorizationServer) !== "") payload.authorizationServer = text(context.authorizationServer)
    if (text(context.clientId) !== "") payload.clientId = text(context.clientId)
    if (text(context.clientSecret) !== "") payload.clientSecret = text(context.clientSecret)
    return payload
  }

  async function ensureClient(server, config, record, scope, redirectUri) {
    if (config.clientId !== "") return { clientId: config.clientId, clientSecret: config.clientSecret, mode: "configured" }
    const registrationEndpoint = text(record.asMetadata.registration_endpoint).trim()
    if (registrationEndpoint === "") {
      throw oauthError(
        "registration-unavailable",
        `"${server.name}" publishes no dynamic client registration endpoint and oauth.clientId is empty; set oauth.clientId (and oauth.clientSecret when the authorization server issues one), or paste an access token instead`,
      )
    }
    const body = {
      client_name: CLIENT_NAME,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }
    if (scope !== "") body.scope = scope
    const { response, json } = await fetchJsonObject(registrationEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      timeoutMs: TOKEN_TIMEOUT_MS,
    })
    const clientId = isRecord(json) ? text(json.client_id).trim() : ""
    if (!response.ok || clientId === "") {
      throw oauthError("registration-failed", `dynamic client registration at ${registrationEndpoint} failed (HTTP ${response.status}${isRecord(json) && text(json.error) !== "" ? `: ${text(json.error)}` : ""})`)
    }
    return { clientId, clientSecret: text(json.client_secret), mode: "dynamic" }
  }

  function currentOrigin() {
    let webServer
    try {
      webServer = getWebServer()
    } catch {
      webServer = undefined
    }
    if (webServer === undefined || webServer === null || typeof webServer.getOrigin !== "function") {
      throw oauthError("web-server-unavailable", "the Harness web server is not available, so the OAuth redirect URI cannot be built; paste an access token instead")
    }
    let origin
    try {
      origin = String(webServer.getOrigin()).replace(/\/+$/, "")
    } catch (error) {
      throw oauthError("web-server-unavailable", `could not read the Harness web origin: ${errorMessage(error)}`)
    }
    if (origin === "") throw oauthError("web-server-unavailable", "the Harness web origin is empty, so the OAuth redirect URI cannot be built")
    return origin
  }

  function authMethodsAllowBasic(record) {
    const methods = stringArray(record.asMetadata.token_endpoint_auth_methods_supported)
    return methods.includes("client_secret_basic") && !methods.includes("client_secret_post")
  }

  async function exchangeCode(attempt, server, code) {
    const form = new URLSearchParams()
    form.set("grant_type", "authorization_code")
    form.set("code", code)
    form.set("redirect_uri", attempt.redirectUri)
    form.set("client_id", attempt.client.clientId)
    form.set("code_verifier", attempt.verifier)
    if (attempt.resource !== "") form.set("resource", attempt.resource)
    const useBasic = attempt.client.clientSecret !== "" && attempt.basicAuth === true
    let response
    let json
    if (useBasic) {
      const result = await request(attempt.tokenEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          authorization: `Basic ${Buffer.from(`${attempt.client.clientId}:${attempt.client.clientSecret}`).toString("base64")}`,
        },
        body: form.toString(),
        timeoutMs: TOKEN_TIMEOUT_MS,
      })
      response = result.response
      json = parseJson(result.body)
    } else {
      if (attempt.client.clientSecret !== "") form.set("client_secret", attempt.client.clientSecret)
      const result = await postForm(attempt.tokenEndpoint, form, undefined)
      response = result.response
      json = result.json
    }
    if (!response.ok || !isRecord(json) || text(json.access_token) === "") {
      const providerError = isRecord(json) ? text(json.error) : ""
      if (providerError === "invalid_grant") throw oauthError("invalid-grant", tokenErrorDescription(json, response))
      throw oauthError("token-exchange-failed", tokenErrorDescription(json, response))
    }
    return tokenPayload(json, undefined, {
      resource: attempt.resource,
      tokenEndpoint: attempt.tokenEndpoint,
      authorizationServer: attempt.authorizationServer,
      scope: attempt.scope,
      clientId: attempt.client.clientId,
      clientSecret: attempt.client.clientSecret,
    })
  }

  //#endregion

  //#region refresh

  async function resolveTokenEndpoint(server, config) {
    const cached = discoveryCache.get(server.name)
    if (cached !== undefined) {
      const endpoint = text(cached.asMetadata.token_endpoint).trim()
      if (endpoint !== "") return endpoint
    }
    try {
      const record = await discover(server, config)
      return text(record.asMetadata.token_endpoint).trim()
    } catch (error) {
      warn(`token-endpoint discovery failed for "${server.name}": ${errorMessage(error)}`)
      return ""
    }
  }

  /**
   * Refresh through `modifyRecord`: the network call happens outside the lock,
   * the write is a serialized read-modify-write, and a refresh token rotated by
   * another writer wins over ours instead of clobbering it.
   */
  async function refreshWithLock(server) {
    const credentials = credentialsService()
    if (credentials === undefined) throw oauthError("credentials-unavailable", "the credentials service is not available, so the OAuth token cannot be refreshed")
    const config = oauthConfig(server)
    const key = keyFor(server.name)
    const existing = grantPayload(await readRecordRaw(credentials, key))
    if (existing === undefined) throw oauthError("unauthorized", `no OAuth token is stored for "${server.name}"; authorize it first`)
    const usedRefreshToken = text(existing.refreshToken)
    if (usedRefreshToken === "") throw oauthError("no-refresh-token", `the stored token for "${server.name}" has no refresh token; authorize it again`)
    const tokenEndpoint = text(existing.tokenEndpoint).trim() || (await resolveTokenEndpoint(server, config))
    if (tokenEndpoint === "") throw oauthError("no-token-endpoint", `no token endpoint is known for "${server.name}"; authorize it again`)
    const clientId = text(existing.clientId) || config.clientId
    const clientSecret = text(existing.clientSecret) || config.clientSecret
    const resource = text(existing.resource) || text(server.url)
    const authorizationServer = text(existing.authorizationServer) || text(discoveryCache.get(server.name)?.authorizationServer)

    const form = new URLSearchParams()
    form.set("grant_type", "refresh_token")
    form.set("refresh_token", usedRefreshToken)
    if (clientId !== "") form.set("client_id", clientId)
    if (resource !== "") form.set("resource", resource)
    const cachedDiscovery = discoveryCache.get(server.name)
    const useBasic = clientSecret !== "" && cachedDiscovery !== undefined && authMethodsAllowBasic(cachedDiscovery)
    let response
    let json
    if (useBasic) {
      const result = await request(tokenEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: form.toString(),
        timeoutMs: TOKEN_TIMEOUT_MS,
      })
      response = result.response
      json = parseJson(result.body)
    } else {
      if (clientSecret !== "") form.set("client_secret", clientSecret)
      const result = await postForm(tokenEndpoint, form, undefined)
      response = result.response
      json = result.json
    }

    if (!response.ok || !isRecord(json) || text(json.access_token) === "") {
      const providerError = isRecord(json) ? text(json.error) : ""
      if (providerError === "invalid_grant") {
        const current = grantPayload(await readRecordRaw(credentials, key))
        const currentRefreshToken = current === undefined ? "" : text(current.refreshToken)
        if (current !== undefined && currentRefreshToken !== "" && currentRefreshToken !== usedRefreshToken) {
          // Another writer rotated the token first; keep theirs.
          recordCache.set(server.name, current)
          errorCache.set(server.name, null)
          return current
        }
        await clearGrant(server)
        const message = "the authorization was revoked or expired; authorize the server again"
        errorCache.set(server.name, message)
        throw oauthError("unauthorized", message)
      }
      const message = tokenErrorDescription(json, response)
      errorCache.set(server.name, message)
      throw oauthError("refresh-failed", message)
    }

    const next = tokenPayload(json, existing, { tokenEndpoint, resource, authorizationServer, clientId, clientSecret })
    let finalPayload
    const written = await credentials.modifyRecord(key, async (current) => {
      const currentPayload = grantPayload(current)
      if (currentPayload !== undefined && text(currentPayload.refreshToken) !== usedRefreshToken) {
        finalPayload = currentPayload
        return undefined
      }
      return { kind: "grant", payload: next }
    })
    if (finalPayload === undefined) finalPayload = grantPayload(written)
    const settled = finalPayload ?? next
    recordCache.set(server.name, settled)
    errorCache.set(server.name, null)
    return settled
  }

  //#endregion

  //#region public surface

  async function authorize(server) {
    if (disposed) throw oauthError("unavailable", "the manager is shutting down")
    const config = oauthConfig(server)
    if (!isHttpServer(server) || !config.enabled) {
      throw oauthError("oauth-disabled", `OAuth is not enabled for "${server.name}"; enable oauth on a streamable-http server first`)
    }
    const existingPending = pendingByName.get(server.name)
    if (existingPending !== undefined) {
      if (Date.now() < existingPending.expiresAt) {
        const minutes = Math.max(1, Math.ceil((existingPending.expiresAt - Date.now()) / 60000))
        throw oauthError("authorization-in-flight", `an authorization for "${server.name}" is already waiting for the browser to finish; complete it or wait up to ${minutes} minute(s)`)
      }
      pendingByName.delete(server.name)
      pendingByState.delete(existingPending.state)
    }

    if (credentialsService() === undefined) {
      throw oauthError("credentials-unavailable", "the credentials service is not available in this profile, so an authorized token could not be stored")
    }

    const previous = await readGrant(server).catch(() => undefined)
    if (usableToken(previous, true)) return { status: "authorized" }

    const redirectUri = `${currentOrigin()}${CALLBACK_PATH}`
    const record = await discover(server, config)
    const methods = stringArray(record.asMetadata.code_challenge_methods_supported)
    if (methods.length > 0 && !methods.includes("S256")) {
      throw oauthError("pkce-unsupported", `the authorization server for "${server.name}" does not support PKCE S256 (advertised: ${methods.join(", ")})`)
    }
    const scope = resolveScope(server, config, record)
    const client = await ensureClient(server, config, record, scope, redirectUri)
    const verifier = base64url(randomBytes(32))
    const challenge = base64url(createHash("sha256").update(verifier).digest())
    const state = randomBytes(24).toString("hex")

    const authorizationEndpoint = text(record.asMetadata.authorization_endpoint).trim()
    if (authorizationEndpoint === "") {
      throw oauthError("discovery-failed", `the authorization-server metadata for "${server.name}" has no authorization_endpoint`)
    }
    const tokenEndpoint = text(record.asMetadata.token_endpoint).trim()
    if (tokenEndpoint === "") {
      throw oauthError("discovery-failed", `the authorization-server metadata for "${server.name}" has no token_endpoint`)
    }

    let authorizationUrl
    try {
      authorizationUrl = new URL(authorizationEndpoint)
    } catch {
      throw oauthError("discovery-failed", `the authorization_endpoint "${authorizationEndpoint}" is not an absolute URL`)
    }
    const resource = record.resource || text(server.url)
    authorizationUrl.searchParams.set("response_type", "code")
    authorizationUrl.searchParams.set("client_id", client.clientId)
    authorizationUrl.searchParams.set("redirect_uri", redirectUri)
    if (scope !== "") authorizationUrl.searchParams.set("scope", scope)
    authorizationUrl.searchParams.set("state", state)
    authorizationUrl.searchParams.set("code_challenge", challenge)
    authorizationUrl.searchParams.set("code_challenge_method", "S256")
    if (resource !== "") authorizationUrl.searchParams.set("resource", resource)

    const attempt = {
      server,
      serverName: server.name,
      state,
      verifier,
      redirectUri,
      scope,
      resource,
      authorizationServer: record.authorizationServer,
      tokenEndpoint,
      client,
      basicAuth: record.asMetadata !== undefined && authMethodsAllowBasic(record),
      createdAt: Date.now(),
      expiresAt: Date.now() + PENDING_TTL_MS,
    }
    pendingByState.set(state, attempt)
    pendingByName.set(server.name, attempt)
    errorCache.set(server.name, null)

    return {
      status: "pending",
      authorizationUrl: authorizationUrl.toString(),
      message: `Open this URL in a browser and finish the consent screen for "${server.name}"; DeepSeek Harness completes the exchange automatically and this call returns immediately.`,
    }
  }

  async function handleCallback(query, origin) {
    const params = isRecord(query) ? query : {}
    const state = text(params.state).trim()
    if (state === "") return { ok: false, server: null, html: failurePage("The authorization response is missing its state parameter, so it cannot be matched to a pending authorization.") }

    const attempt = pendingByState.get(state)
    if (attempt === undefined) {
      return { ok: false, server: null, html: failurePage("This authorization response is unknown or was already used.") }
    }
    // Single use: consume the attempt before doing any work.
    pendingByState.delete(state)
    if (pendingByName.get(attempt.serverName) === attempt) pendingByName.delete(attempt.serverName)

    if (Date.now() > attempt.expiresAt) {
      const message = "the authorization request expired after 10 minutes"
      errorCache.set(attempt.serverName, message)
      return { ok: false, server: attempt.serverName, error: message, html: failurePage(`${message[0].toUpperCase()}${message.slice(1)}. Start it again from the MCP Servers page.`) }
    }

    const providerError = text(params.error).trim()
    if (providerError !== "") {
      const description = text(params.error_description).trim()
      const message = description !== "" ? description : providerError
      errorCache.set(attempt.serverName, message)
      return { ok: false, server: attempt.serverName, error: message, html: failurePage(`The provider refused the authorization: ${message}.`) }
    }

    const code = text(params.code).trim()
    if (code === "") {
      const message = "the authorization response carried no code"
      errorCache.set(attempt.serverName, message)
      return { ok: false, server: attempt.serverName, error: message, html: failurePage(`${message[0].toUpperCase()}${message.slice(1)}.`) }
    }

    try {
      const payload = await exchangeCode(attempt, attempt.server, code)
      await writeGrant(attempt.server, () => payload)
      errorCache.set(attempt.serverName, null)
      return { ok: true, server: attempt.serverName, html: successPage(attempt.serverName) }
    } catch (error) {
      const message = errorMessage(error)
      errorCache.set(attempt.serverName, message)
      return { ok: false, server: attempt.serverName, error: message, html: failurePage(`The token exchange failed: ${message}.`) }
    }
  }

  async function approveWithToken(server, token) {
    const config = oauthConfig(server)
    if (!isHttpServer(server) || !config.enabled) {
      throw oauthError("oauth-disabled", `OAuth is not enabled for "${server.name}"; enable oauth on a streamable-http server first`)
    }
    const accessToken = text(token).trim()
    if (accessToken === "") throw oauthError("invalid-token", "the access token is empty")
    if (credentialsService() === undefined) {
      throw oauthError("credentials-unavailable", "the credentials service is not available in this profile, so the token cannot be stored")
    }

    const previous = await readGrant(server).catch(() => undefined)
    const cachedDiscovery = discoveryCache.get(server.name)
    const tokenEndpoint = text(previous?.tokenEndpoint).trim() || text(cachedDiscovery?.asMetadata?.token_endpoint).trim()
    const clientId = text(previous?.clientId) || config.clientId
    const clientSecret = text(previous?.clientSecret) || config.clientSecret
    const payload = {
      v: 1,
      accessToken,
      tokenType: "Bearer",
      obtainedAt: Date.now(),
      tokenEndpoint,
      resource: text(previous?.resource) || text(server.url),
    }
    if (clientId !== "") payload.clientId = clientId
    if (clientSecret !== "") payload.clientSecret = clientSecret
    const authorizationServer = text(previous?.authorizationServer)
    if (authorizationServer !== "") payload.authorizationServer = authorizationServer

    await writeGrant(server, () => payload)
    errorCache.set(server.name, null)
    return { authorized: true, expiresAt: null }
  }

  async function refreshNow(server) {
    const config = oauthConfig(server)
    if (!isHttpServer(server) || !config.enabled) {
      throw oauthError("oauth-disabled", `OAuth is not enabled for "${server.name}"; enable oauth on a streamable-http server first`)
    }
    const payload = await refreshWithLock(server)
    errorCache.set(server.name, null)
    return {
      authorized: true,
      expiresAt: typeof payload.expiresAt === "number" && Number.isFinite(payload.expiresAt) ? payload.expiresAt : null,
    }
  }

  async function signOut(server) {
    const attempt = pendingByName.get(server.name)
    if (attempt !== undefined) {
      pendingByName.delete(server.name)
      pendingByState.delete(attempt.state)
    }
    await clearGrant(server)
    errorCache.set(server.name, null)
    return { authorized: false }
  }

  /**
   * Resolve the header to inject at spawn time. Never throws: an auth failure is
   * reported as `{ error }` so the child still spawns (without the header).
   */
  async function headerFor(server) {
    const config = oauthConfig(server)
    if (!isHttpServer(server) || !config.enabled) return {}
    try {
      if (credentialsService() === undefined) {
        const message = "the credentials service is not available, so no OAuth token can be injected"
        errorCache.set(server.name, message)
        return { error: message }
      }
      let payload = await readGrant(server)
      if (payload === undefined) return {}
      const expiresAt = typeof payload.expiresAt === "number" && Number.isFinite(payload.expiresAt) ? payload.expiresAt : undefined
      const refreshToken = text(payload.refreshToken)
      const needsRefresh = expiresAt !== undefined && expiresAt <= Date.now() + REFRESH_SKEW_MS
      if (needsRefresh && refreshToken !== "") {
        payload = await refreshWithLock(server)
      } else if (needsRefresh) {
        // Expired and not refreshable: not authorized, not an error.
        return {}
      }
      const accessToken = text(payload.accessToken)
      if (accessToken === "") return {}
      errorCache.set(server.name, null)
      return { header: `Bearer ${accessToken}` }
    } catch (error) {
      const message = errorMessage(error)
      errorCache.set(server.name, message)
      return { error: message }
    }
  }

  /**
   * Withdraw a pending authorization attempt for one server WITHOUT touching its
   * stored grant. A user who abandons the browser step must be able to start
   * over immediately instead of waiting out the pending TTL.
   */
  function cancelAttempt(server) {
    const name = text(server?.name)
    const attempt = pendingByName.get(name)
    if (attempt === undefined) return { cancelled: false }
    pendingByName.delete(name)
    pendingByState.delete(attempt.state)
    return { cancelled: true }
  }

  function dispose() {
    disposed = true
    try {
      controller.abort()
    } catch {
      // Already aborted.
    }
    pendingByState.clear()
    pendingByName.clear()
    discoveryCache.clear()
    recordCache.clear()
    errorCache.clear()
    slugs.clear()
    assignedSlugs.clear()
  }

  return { slugOf, statusFor, readStatus, approveWithToken, authorize, cancelAttempt, handleCallback, refreshNow, signOut, headerFor, dispose }
}

//#endregion
