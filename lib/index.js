/**
 * dsh-mcp-manager — Host half.
 *
 * Supervises real `@deepseek-ai/dsh-mcp-client` child plugin instances. Every
 * enabled entry of this plugin row's own `config.servers` is spawned with
 * `ctx.plugin(<mcp-client>, <mcp-client config>)` on this plugin's context, so
 * each MCP server's tools land on the Harness tool registry as ordinary
 * `mcp__<serverName>__<rawName>` tools. There is no private MCP protocol and no
 * MCP re-implementation here.
 *
 * The roster is:
 * - persisted through the Harness `configEditor` service (profile patch +
 *   Loader reconciliation, so it survives restart and stays user-editable YAML),
 * - exposed to the agent through six `mcp_manager_*` tools,
 * - exposed to the Client half through loopback-only routes under
 *   `/api/dsh-mcp-manager/`,
 * - optionally authorized over OAuth 2.1 (v2 addendum) for streamable-http
 *   servers: the engine in `./oauth.js` owns discovery, dynamic client
 *   registration, PKCE, exchange and refresh, and the resulting
 *   `Authorization: Bearer …` header is injected into the child config.
 *   Tokens live only in the Harness credentials service, never in this row's
 *   config, state, tool output, or logs.
 *
 * Framework notes (verified against the installed Cordis 4.0.5 / Loader 1.0.6):
 * - `ctx.plugin(plugin, config)` returns a Cordis Fiber (an `Object.create(fiber)`
 *   wrapper), not a bare disposer; `toDisposer` adapts it.
 * - The bridge module is resolved lazily, first through a dynamic `import()`,
 *   then through the Loader's own resolver (`ctx.loader.import`), which is the
 *   exact resolver profile rows use.
 * - `configEditor.edit` writes the patch and reconciles the Loader, which
 *   disposes and re-applies this plugin. So: persist, never respawn ourselves,
 *   and never mutate in-memory state after the call.
 * - A failing child server, a failed persistence, or a missing
 *   `configEditor`/`webServer` never escapes `apply`; the reason is recorded and
 *   the plugin stays alive and useful (listing `mcp__*` tools still works).
 *
 * ESM. The only non-relative import is the lazily awaited dynamic
 * `import("@deepseek-ai/dsh-mcp-client")`; the OAuth engine is the sibling
 * relative module `./oauth.js`.
 */

import { accessSync, constants as fsConstants, statSync } from "node:fs"
import { delimiter } from "node:path"
import { createOAuthEngine } from "./oauth.js"

//#region constants

const PACKAGE_NAME = "dsh-mcp-manager"
const ROW_ID = "mcp-manager"
const MCP_CLIENT_SPECIFIER = "@deepseek-ai/dsh-mcp-client"
const MCP_TOOL_PREFIX = "mcp__"
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60000
const MAX_TOOL_CALL_TIMEOUT_MS = 2147483647
const MAX_JSON_BODY_BYTES = 64 * 1024
const API_PREFIX = "/api/dsh-mcp-manager"

// Scheduled OAuth token refresh (CONTRACT-REFRESH §1/§2).
const DEFAULT_REFRESH_INTERVAL_MS = 300000
const DEFAULT_REFRESH_LEAD_MS = 600000
const MIN_REFRESH_INTERVAL_MS = 1000
const MAX_REFRESH_INTERVAL_MS = 86400000
const REFRESH_TICK_BUDGET_MS = 60000

/** Model-facing output schema shared by all six tools (unconstrained JSON). */
const OBJECT_OUTPUT_SCHEMA = { type: "object", additionalProperties: true, properties: {} }

/** Fixed, script-free pages for OAuth-callback guard failures (no user data). */
const BRIDGE_PAGE_BLOCKED = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MCP authentication</title></head><body><p>This callback accepts loopback requests only.</p></body></html>'
const BRIDGE_PAGE_FAILED =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MCP authentication</title></head><body><p>Authorization failed. Return to DeepSeek Harness and try again from the MCP Servers page.</p></body></html>'

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

/**
 * Split a command line pasted into the single `command` field — the shape the
 * environment monitor reports and the one users naturally copy from a shell —
 * into the executable plus its leading arguments. Only the first token is the
 * executable, matching how a shell would read the line.
 *
 * @param {string} text raw `command` value.
 * @returns {{ command: string, args: string[] }}
 */
function splitPastedCommandLine(text) {
  const parts = []
  let current = ""
  let quote = ""
  const source = text.trim()
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quote !== "") {
      if (char === quote) quote = ""
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === " " || char === "\t") {
      if (current !== "") {
        parts.push(current)
        current = ""
      }
      continue
    }
    current += char
  }
  if (current !== "") parts.push(current)
  return { command: parts[0] ?? "", args: parts.slice(1) }
}

/**
 * Whether one command token names something the launcher can execute: a path
 * that exists, or a bare program name resolvable on PATH.
 *
 * @param {string} command candidate executable.
 * @returns {string | undefined} a user-facing reason when it cannot be run.
 */
function commandProblem(command) {
  const looksLikePath = /[\\/]/.test(command) || /^[A-Za-z]:/.test(command)
  if (!looksLikePath) {
    const pathValue = typeof process.env.PATH === "string" ? process.env.PATH : ""
    const extensions =
      process.platform === "win32" ? (typeof process.env.PATHEXT === "string" ? process.env.PATHEXT.split(";") : [".EXE", ".CMD", ".BAT"]) : [""]
    for (const directory of pathValue.split(delimiter)) {
      if (directory === "") continue
      for (const extension of extensions) {
        try {
          accessSync(`${directory}${process.platform === "win32" ? "\\" : "/"}${command}${extension}`, fsConstants.X_OK)
          return undefined
        } catch {
          // Try the next candidate.
        }
      }
    }
    return `"${command}" was not found on PATH; use the absolute path to the executable`
  }
  try {
    const info = statSync(command)
    if (!info.isFile()) return `"${command}" is not a file`
    accessSync(command, fsConstants.X_OK)
    return undefined
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : ""
    if (code === "EACCES" || code === "EPERM") return `"${command}" exists but is not executable (permission denied)`
    return `"${command}" does not exist`
  }
}

/** Reassemble `command` + `args`, quoting tokens that contain whitespace. */
function shellCommandLine(command, args) {
  const quoteToken = (token) => (/[\s"]/.test(token) ? `"${token.replaceAll('"', '\\"')}"` : token)
  return [command, ...(Array.isArray(args) ? args : [])].map(quoteToken).join(" ")
}

/** User-facing failure carrying a stable machine-readable code. */
function userError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function normalizeFlag(value, fallback) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase()
    if (lowered === "true") return true
    if (lowered === "false") return false
  }
  return fallback
}

function toStringList(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== undefined && entry !== null).map((entry) => String(entry))
  if (typeof value === "string") {
    if (value.trim() === "") return []
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "")
  }
  return []
}

function toStringMap(value) {
  if (!isRecord(value)) return {}
  const result = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null) continue
    result[String(key)] = String(entry)
  }
  return result
}

function normalizeTimeout(value) {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_TOOL_CALL_TIMEOUT_MS
  return Math.min(MAX_TOOL_CALL_TIMEOUT_MS, Math.max(1, Math.floor(numeric)))
}

/**
 * Clamp one auto-refresh timing value (CONTRACT-REFRESH §1): `0` disables the
 * timer when `allowOff` is set, anything else clamps to 1 s..24 h, and a
 * non-numeric value falls back to the default.
 */
function normalizeRefreshMs(value, fallback, allowOff) {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN
  if (!Number.isFinite(numeric)) return fallback
  if (allowOff && numeric === 0) return 0
  return Math.min(MAX_REFRESH_INTERVAL_MS, Math.max(MIN_REFRESH_INTERVAL_MS, Math.floor(numeric)))
}

//#endregion

//#region roster normalization (CONTRACT §1)

/**
 * Validate and normalize one managed-server entry.
 *
 * Keys irrelevant to the chosen transport are dropped, everything else is
 * defaulted. Never throws: invalid input is reported as `{ ok: false, error }`.
 *
 * @param {unknown} input raw entry (tool argument, HTTP body, or YAML config).
 * @returns {{ ok: true, server: object } | { ok: false, error: string }}
 */
function normalizeServer(input) {
  if (!isRecord(input)) return { ok: false, error: "server must be an object" }

  const name = typeof input.name === "string" ? input.name.trim() : ""
  if (name === "") return { ok: false, error: 'server.name is required' }
  if (!SERVER_NAME_PATTERN.test(name)) {
    return { ok: false, error: `server.name "${name}" must match /^[A-Za-z0-9_-]{1,32}$/ (letters, digits, "_" and "-", at most 32 characters)` }
  }

  const rawTransport = input.transport === undefined || input.transport === null ? "stdio" : input.transport
  const transport = rawTransport === "stdio" ? "stdio" : rawTransport === "streamable-http" || rawTransport === "streamable_http" || rawTransport === "http" ? "streamable-http" : undefined
  if (transport === undefined) {
    return { ok: false, error: `server.transport must be "stdio" or "streamable-http" (received ${JSON.stringify(rawTransport)})` }
  }

  const enabled = normalizeFlag(input.enabled, true)
  const toolCallTimeoutMs = normalizeTimeout(input.toolCallTimeoutMs)
  const failOnStartupError = normalizeFlag(input.failOnStartupError, false)

  // OAuth 2.1 is HTTP-only (CONTRACT-OAUTH §1). Keys outside the canonical set
  // are dropped; an auth view accidentally passed back reads as "off" unless
  // `enabled` is true.
  const rawOAuth = isRecord(input.oauth) ? input.oauth : {}
  const oauthEnabled = normalizeFlag(rawOAuth.enabled, false)
  const oauth = {
    enabled: oauthEnabled,
    scopes: toStringList(rawOAuth.scopes),
    clientId: typeof rawOAuth.clientId === "string" ? rawOAuth.clientId.trim() : "",
    clientSecret: typeof rawOAuth.clientSecret === "string" ? rawOAuth.clientSecret : "",
    resourceMetadataUrl: typeof rawOAuth.resourceMetadataUrl === "string" ? rawOAuth.resourceMetadataUrl.trim() : "",
    authorizationServer: typeof rawOAuth.authorizationServer === "string" ? rawOAuth.authorizationServer.trim() : "",
  }

  if (transport === "stdio") {
    if (oauthEnabled) return { ok: false, error: 'oauth.enabled is supported only for the "streamable-http" transport' }
    const rawCommand = typeof input.command === "string" ? input.command.trim() : ""
    if (rawCommand === "") return { ok: false, error: 'server.command is required for the "stdio" transport' }
    // A pasted command line ("'/path/app.exe' mcp image") is not an executable.
    // Split it, and let the first token win over whatever `args` carried.
    const split = splitPastedCommandLine(rawCommand)
    const command = split.command
    const args = split.args.length > 0 ? split.args : toStringList(input.args)
    const problem = commandProblem(command)
    if (problem !== undefined) return { ok: false, error: `server.command ${problem}` }
    return {
      ok: true,
      server: {
        name,
        enabled,
        transport,
        command,
        args,
        env: toStringMap(input.env),
        cwd: typeof input.cwd === "string" ? input.cwd.trim() : "",
        toolCallTimeoutMs,
        failOnStartupError,
        oauth: { enabled: false },
      },
    }
  }

  const url = typeof input.url === "string" ? input.url.trim() : ""
  if (url === "") return { ok: false, error: 'server.url is required for the "streamable-http" transport' }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, error: `server.url "${url}" is not an absolute URL` }
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `server.url must use http:// or https:// (received ${parsed.protocol})` }
  }
  return {
    ok: true,
    server: {
      name,
      enabled,
      transport,
      url,
      headers: toStringMap(input.headers),
      toolCallTimeoutMs,
      failOnStartupError,
      oauth,
    },
  }
}

/**
 * Normalize a whole persisted roster. Invalid and duplicate entries are
 * dropped and reported as human-readable issues; this never throws.
 *
 * @param {unknown} raw `config.servers`.
 * @returns {{ servers: object[], issues: string[] }}
 */
function normalizeRoster(raw) {
  const issues = []
  const servers = []
  const seen = new Set()
  if (raw === undefined || raw === null) return { servers, issues }
  if (!Array.isArray(raw)) {
    issues.push("config.servers is not an array, so no MCP server was loaded")
    return { servers, issues }
  }
  raw.forEach((entry, index) => {
    const result = normalizeServer(entry)
    if (!result.ok) {
      issues.push(`config.servers[${index}] was ignored: ${result.error}`)
      return
    }
    if (seen.has(result.server.name)) {
      issues.push(`config.servers[${index}] was ignored: duplicate server name "${result.server.name}"`)
      return
    }
    seen.add(result.server.name)
    servers.push(result.server)
  })
  return { servers, issues }
}

/**
 * Map one managed server to the child `@deepseek-ai/dsh-mcp-client` config.
 * `authorizationHeader`, when present, is the OAuth bearer token resolved by the
 * engine; it overrides a static `Authorization` header for this spawn only and
 * is never persisted.
 */
function toMcpClientConfig(server, authorizationHeader) {
  if (server.transport === "streamable-http") {
    const headers = { ...server.headers }
    if (typeof authorizationHeader === "string" && authorizationHeader !== "") headers.Authorization = authorizationHeader
    return {
      transport: "streamable-http",
      serverName: server.name,
      url: server.url,
      headers,
      toolCallTimeoutMs: server.toolCallTimeoutMs,
      failOnStartupError: server.failOnStartupError,
    }
  }
  return {
    transport: "stdio",
    serverName: server.name,
    command: server.command,
    args: server.args,
    env: server.env,
    cwd: server.cwd,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    failOnStartupError: server.failOnStartupError,
  }
}

//#endregion

//#region tool descriptors (CONTRACT §2.2)

/** Whether a registered tool name is an MCP public name (`mcp__<server>__<tool>`). */
function isMcpPublicName(name) {
  if (typeof name !== "string" || !name.startsWith(MCP_TOOL_PREFIX)) return false
  return name.slice(MCP_TOOL_PREFIX.length).includes("__")
}

/**
 * Project the global tool schemas onto MCP tool descriptors.
 *
 * A tool belongs to the longest configured server name whose `mcp__<name>__`
 * prefix it carries; otherwise the token between `mcp__` and the next `__` is
 * used as the server label, which also covers servers registered by other
 * `mcp-client` rows in this profile.
 *
 * @param {unknown} schemas `ctx.tools.schemas()` output.
 * @param {object[]} servers currently configured managed servers.
 */
function attributeTools(schemas, servers) {
  const configured = servers.map((server) => server.name).sort((left, right) => right.length - left.length)
  const tools = []
  for (const schema of Array.isArray(schemas) ? schemas : []) {
    const publicName = isRecord(schema) && typeof schema.name === "string" ? schema.name : ""
    if (!isMcpPublicName(publicName)) continue
    let server
    let rawName
    const matched = configured.find((candidate) => publicName.startsWith(`${MCP_TOOL_PREFIX}${candidate}__`))
    if (matched !== undefined) {
      server = matched
      rawName = publicName.slice(MCP_TOOL_PREFIX.length + matched.length + 2)
    } else {
      const rest = publicName.slice(MCP_TOOL_PREFIX.length)
      const split = rest.indexOf("__")
      if (split > 0) {
        server = rest.slice(0, split)
        rawName = rest.slice(split + 2)
      } else {
        server = rest
        rawName = ""
      }
    }
    const parameters = isRecord(schema.parameters) ? schema.parameters : {}
    const properties = isRecord(parameters.properties) ? parameters.properties : {}
    tools.push({
      server,
      publicName,
      rawName,
      description: typeof schema.description === "string" ? schema.description : "",
      parameters,
      inputKeys: Object.keys(properties),
    })
  }
  tools.sort((left, right) => left.publicName.localeCompare(right.publicName))
  return tools
}

//#endregion

//#region rendering

function textContent(text) {
  return [{ type: "text", text: String(text) }]
}

function serverEndpoint(server) {
  if (server.transport === "streamable-http") return typeof server.url === "string" ? server.url : ""
  return shellCommandLine(server.command, server.args)
}

function renderServerSummary(server) {
  const bits = [server.transport === "streamable-http" ? "streamable-http" : "stdio", server.state ?? "no-tools", `${server.toolCount ?? 0} tool${(server.toolCount ?? 0) === 1 ? "" : "s"}`]
  const endpoint = serverEndpoint(server)
  const head = `- ${server.name} [${bits.join(", ")}]${endpoint === "" ? "" : `: ${endpoint}`}`
  return server.error === undefined || server.error === "" ? head : `${head} — error: ${server.error}`
}

function renderRoster(value, heading) {
  const servers = isRecord(value) && Array.isArray(value.servers) ? value.servers : []
  const lines = [heading]
  if (servers.length === 0) lines.push("No MCP servers are managed yet.")
  for (const server of servers) if (isRecord(server)) lines.push(renderServerSummary(server))
  const capabilities = isRecord(value) ? value.capabilities : undefined
  if (isRecord(capabilities)) {
    lines.push(`Capabilities: spawn=${capabilities.spawn === true ? "yes" : "no"}, persist=${capabilities.persist === true ? "yes" : "no"}.`)
    if (typeof capabilities.detail === "string" && capabilities.detail !== "") lines.push(capabilities.detail)
  }
  return textContent(lines.join("\n"))
}

function renderTools(value, heading) {
  const tools = isRecord(value) && Array.isArray(value.tools) ? value.tools : []
  const lines = [heading]
  if (tools.length === 0) lines.push("No MCP tools are exposed by the tool registry right now.")
  for (const tool of tools) {
    if (!isRecord(tool)) continue
    const inputs = Array.isArray(tool.inputKeys) && tool.inputKeys.length > 0 ? ` (inputs: ${tool.inputKeys.join(", ")})` : ""
    lines.push(`- ${tool.publicName}${inputs}${typeof tool.description === "string" && tool.description !== "" ? `: ${tool.description}` : ""}`)
  }
  return textContent(lines.join("\n"))
}

function renderOAuth(value, heading) {
  const lines = [heading]
  if (isRecord(value) && typeof value.checked === "number") {
    lines.push(`Checked ${value.checked}: refreshed ${value.refreshed ?? 0}, failed ${value.failed ?? 0}, skipped ${value.skipped ?? 0}.`)
    for (const result of Array.isArray(value.results) ? value.results : []) {
      if (!isRecord(result)) continue
      const outcome = result.refreshed === true ? "refreshed" : typeof result.error === "string" ? `failed — ${result.error}` : "skipped (not due)"
      lines.push(`- ${String(result.name)}: ${outcome}`)
    }
    if (typeof value.error === "string" && value.error !== "") lines.push(value.error)
    const timer = isRecord(value.autoRefresh) ? value.autoRefresh : undefined
    if (timer !== undefined) {
      lines.push(
        timer.enabled === true
          ? `Auto-refresh: every ${Math.round(timer.intervalMs / 1000)} s, renewing ${Math.round(timer.leadMs / 1000)} s before expiry.`
          : "Auto-refresh: disabled.",
      )
    }
    return textContent(lines.join("\n"))
  }
  const oauth = isRecord(value) && isRecord(value.oauth) ? value.oauth : undefined
  if (oauth === undefined) {
    lines.push("No OAuth state is available for this server.")
  } else if (oauth.enabled !== true) {
    lines.push("OAuth is not enabled for this server.")
  } else {
    lines.push(`Authorized: ${oauth.authorized === true ? "yes" : "no"}`)
    if (typeof oauth.expiresAt === "number") lines.push(`Expires: ${new Date(oauth.expiresAt).toISOString()}`)
    if (typeof oauth.scope === "string" && oauth.scope !== "") lines.push(`Scope: ${oauth.scope}`)
    if (typeof oauth.client === "string") lines.push(`Client: ${oauth.client}`)
    if (typeof oauth.error === "string" && oauth.error !== "") lines.push(`Last error: ${oauth.error}`)
  }
  if (isRecord(value) && typeof value.authorizationUrl === "string") lines.push(`Authorization URL: ${value.authorizationUrl}`)
  if (isRecord(value) && typeof value.message === "string" && value.message !== "") lines.push(value.message)
  return textContent(lines.join("\n"))
}

//#endregion

//#region HTTP bridge helpers (CONTRACT §2.6)

/** Loopback check for the OAuth callback: remote address only (browser navigation). */
function isLoopbackAddress(request) {
  const address = request.socket.remoteAddress
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1"
}

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false
  const host = request.headers.host
  if (typeof host !== "string") return false
  let hostUrl
  try {
    hostUrl = new URL("http://" + host)
  } catch {
    return false
  }
  if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false
  if (request.headers["sec-fetch-site"] === "cross-site") return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function writeJson(res, status, body, headers) {
  if (res.writableEnded || res.headersSent) return
  const payload = JSON.stringify(body)
  try {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "referrer-policy": "no-referrer",
      ...headers,
    })
    res.end(payload)
  } catch {
    // The socket may already be gone; the bridge never lets that escape.
  }
}

/** Self-contained HTML answer for the OAuth callback (browser navigation). */
function writeHtml(res, status, html) {
  if (res.writableEnded || res.headersSent) return
  try {
    res.writeHead(status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    })
    res.end(html)
  } catch {
    // Same as writeJson: the socket may already be gone.
  }
}

/**
 * Parse the callback query string into a plain object. Bounded to 8 KiB so a
 * hostile navigation cannot make us buffer an arbitrary body.
 */
function parseQuery(requestUrl) {
  const raw = typeof requestUrl === "string" ? requestUrl : ""
  const question = raw.indexOf("?")
  if (question < 0) return {}
  const query = raw.slice(question + 1)
  if (query.length > 8192) return {}
  const params = new URLSearchParams(query)
  const result = {}
  for (const [key, value] of params.entries()) result[key] = value
  return result
}

/**
 * Read a JSON object body. An empty body is treated as `{}` so the `state`
 * route accepts both `{}` and no body. Oversized and malformed bodies are
 * reported, never thrown.
 */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return { ok: false, reason: "too-large" }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString("utf8").trim()
  if (text === "") return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, reason: "invalid-json" }
  }
}

//#endregion

//#region bridge module resolution (CONTRACT §2.1 + two-stage fallback)

let mcpClientPromise
let mcpClientLoaded = false
/** Human-readable reason recorded when the bridge module cannot be resolved. */
let mcpClientFailure

/**
 * Normalize whatever the ESM import or the Loader resolver produced into the
 * object-plugin shape Cordis accepts. Uses the Loader's own `unwrapExports`
 * when present, because that is the exact normalization profile rows get.
 */
function unwrapMcpClient(namespace, via, loader) {
  const candidates = [namespace]
  if (loader !== undefined && loader !== null && typeof loader.unwrapExports === "function") {
    try {
      candidates.push(loader.unwrapExports(namespace))
    } catch {
      // A broken unwrap must not hide the module's own named exports.
    }
  }
  if (isRecord(namespace) && namespace.default !== undefined) candidates.push(namespace.default)
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined && typeof candidate.apply === "function") {
      return { name: "mcp-client", inject: candidate.inject, apply: candidate.apply, Config: candidate.Config }
    }
  }
  throw new Error(`${MCP_CLIENT_SPECIFIER} resolved via ${via} but exposes no apply() function`)
}

async function importMcpClient(ctx) {
  let primaryError
  try {
    return unwrapMcpClient(await import(MCP_CLIENT_SPECIFIER), "dynamic import")
  } catch (error) {
    primaryError = error
  }
  const primaryDetail = errorMessage(primaryError)
  let loader
  try {
    loader = ctx.get("loader")
  } catch {
    loader = undefined
  }
  if (loader === undefined || loader === null || typeof loader.import !== "function") {
    mcpClientFailure = `cannot resolve ${MCP_CLIENT_SPECIFIER}: stage 1 (dynamic import) failed (${primaryDetail}); stage 2 (loader.import) is unavailable because this context has no loader service`
    throw primaryError
  }
  try {
    return unwrapMcpClient(await loader.import(MCP_CLIENT_SPECIFIER), "loader.import", loader)
  } catch (error) {
    mcpClientFailure = `cannot resolve ${MCP_CLIENT_SPECIFIER}: stage 1 (dynamic import) failed (${primaryDetail}); stage 2 (loader.import) failed (${errorMessage(error)})`
    // Rethrow the original import error; the stage detail lives in mcpClientFailure.
    throw primaryError
  }
}

/**
 * Lazily resolve the shipped MCP bridge once per process. The cache is cleared
 * on failure so a later spawn (after an install) can try again.
 */
function loadMcpClient(ctx) {
  if (mcpClientPromise !== undefined) return mcpClientPromise
  mcpClientPromise = importMcpClient(ctx)
    .then((wrapper) => {
      mcpClientLoaded = true
      mcpClientFailure = undefined
      return wrapper
    })
    .catch((error) => {
      mcpClientPromise = undefined
      throw error
    })
  return mcpClientPromise
}

//#endregion

//#region plugin

export const name = "mcp-manager"
export const inject = ["tools"]

export async function apply(ctx, config) {
  try {
    install(ctx, config)
  } catch (error) {
    try {
      ctx.logger.error(`dsh-mcp-manager: activation failed: ${errorMessage(error)}`)
    } catch {
      // Logging itself must never escape apply.
    }
  }
}

/** Cordis `ctx.plugin` returns a Fiber; adapt any accepted shape to a disposer. */
function toDisposer(fiber) {
  if (typeof fiber === "function") return fiber
  if (fiber !== null && typeof fiber === "object" && typeof fiber.dispose === "function") return () => fiber.dispose()
  return () => {}
}

function install(ctx, config) {
  const logger = ctx.logger

  const warn = (message) => {
    try {
      logger.warn(message)
    } catch {
      // Logging failures are not the plugin's problem.
    }
  }
  const logError = (message) => {
    try {
      logger.error(message)
    } catch {
      // Same.
    }
  }
  const service = (serviceName) => {
    try {
      if (typeof ctx.get === "function") return ctx.get(serviceName) ?? undefined
      return ctx[serviceName] ?? undefined
    } catch {
      return undefined
    }
  }

  const normalized = normalizeRoster(isRecord(config) ? config.servers : undefined)
  const configIssues = [...normalized.issues]
  let roster = normalized.servers
  /** name -> { disposer, startedAt, error, settleError, settled } */
  const live = new Map()
  let disposing = false
  let bridgeState = "pending"
  let bridgePaths = []

  // One engine per activation. Its lazy accessors resolve the services on every
  // call, so a credentials/webServer that mounts later still works, and a
  // missing service degrades instead of throwing.
  const oauthEngine = createOAuthEngine({
    getCredentials: () => service("credentials"),
    getWebServer: () => service("webServer"),
    log: {
      warn: (message) => warn(`dsh-mcp-manager: oauth: ${message}`),
    },
  })
  // Assign credential slugs in roster order so collision suffixes (`-2`, `-3`)
  // stay deterministic and stable across reloads.
  for (const server of roster) oauthEngine.slugOf(server.name)

  // Scheduled token refresh (CONTRACT-REFRESH). The timer itself is owned by an
  // effect registered at the end of install; this is the state it reports.
  const refreshIntervalMs = normalizeRefreshMs(isRecord(config) ? config.refreshIntervalMs : undefined, DEFAULT_REFRESH_INTERVAL_MS, true)
  const refreshLeadMs = normalizeRefreshMs(isRecord(config) ? config.refreshLeadMs : undefined, DEFAULT_REFRESH_LEAD_MS, false)
  // Renewal also fires AFTER expiry (CONTRACT-CONFIG §3): the timer already
  // treats an expired grant as due, and a 401-shaped MCP tool failure triggers
  // an immediate refresh + respawn when this is on.
  const refreshOnExpiry = normalizeFlag(isRecord(config) ? config.refreshOnExpiry : undefined, true) === true
  const autoRefresh = { lastRunAt: null, lastRefreshed: 0, lastError: null, nextRunAt: null, lastRunKind: null }
  /** name -> { failures, nextAttemptAt }: fast retry after a failed renewal. */
  const refreshBackoff = new Map()
  /** name -> { lastAt, attempts, pending }: failure-triggered self-heal guards. */
  const selfHeal = new Map()
  let refreshHandle = null
  let refreshStopped = false
  let refreshTicking = false

  //#region persistence (CONTRACT §2.5)

  /** This plugin's own editable profile row, preferring the Loader entry that owns our fiber. */
  function managerEntry() {
    let entries
    try {
      const editor = service("configEditor")
      if (editor === undefined || typeof editor.entries !== "function") return undefined
      entries = editor.entries()
    } catch {
      return undefined
    }
    if (!Array.isArray(entries)) return undefined
    let own
    try {
      own = ctx.fiber === undefined || ctx.fiber === null ? undefined : ctx.fiber.entry
    } catch {
      own = undefined
    }
    if (own !== undefined) {
      for (const entry of entries) if (entry === own) return own
    }
    for (const entry of entries) if (entry !== null && typeof entry === "object" && entry.options?.name === PACKAGE_NAME) return entry
    for (const entry of entries) if (entry !== null && typeof entry === "object" && entry.options?.id === ROW_ID) return entry
    return undefined
  }

  /**
   * Persist the roster through the Loader. Resolves only after the Loader has
   * reconciled (which disposes and re-applies this plugin), so callers must not
   * assume their own fiber is still running afterwards.
   */
  async function persistRoster(nextServers) {
    const editor = service("configEditor")
    if (editor === undefined || typeof editor.entries !== "function" || typeof editor.edit !== "function") {
      throw userError(
        "persistence-unavailable",
        "the configEditor service is not available in this profile, so the MCP roster cannot be saved; enable the config editor row, or add the servers to the profile patch (cordis.patch.yml) by hand",
      )
    }
    const entry = managerEntry()
    if (entry === undefined) {
      throw userError(
        "persistence-unavailable",
        `no editable profile row named "${PACKAGE_NAME}" was found, so the MCP roster cannot be saved; install this plugin as a profile patch row (id "${ROW_ID}") first`,
      )
    }
    try {
      await editor.edit(entry, (current) => ({ ...(isRecord(current) ? current : {}), servers: nextServers }))
    } catch (error) {
      throw userError("persistence-failed", `the MCP roster could not be written to the profile patch: ${errorMessage(error)}`)
    }
    roster = nextServers
    configIssues.length = 0
  }

  //#endregion

  //#region derived state (CONTRACT §2.3)

  function currentTools() {
    let schemas = []
    try {
      const registry = service("tools")
      if (registry !== undefined && registry !== null && typeof registry.schemas === "function") schemas = registry.schemas() ?? []
    } catch (error) {
      warn(`dsh-mcp-manager: could not read the tool registry: ${errorMessage(error)}`)
    }
    return attributeTools(schemas, roster)
  }

  /** Non-secret OAuth config of one server (never the client secret itself). */
  function oauthConfigView(server) {
    const raw = isRecord(server.oauth) ? server.oauth : {}
    return {
      enabled: raw.enabled === true,
      scopes: Array.isArray(raw.scopes) ? raw.scopes.map((entry) => String(entry)) : [],
      clientId: typeof raw.clientId === "string" ? raw.clientId : "",
      resourceMetadataUrl: typeof raw.resourceMetadataUrl === "string" ? raw.resourceMetadataUrl : "",
      authorizationServer: typeof raw.authorizationServer === "string" ? raw.authorizationServer : "",
      clientSecretSet: typeof raw.clientSecret === "string" && raw.clientSecret !== "",
    }
  }

  /**
   * The one OAuth view returned to the Client half, the agent tool and /state:
   * auth state (CONTRACT-OAUTH §4) plus the non-secret config so the Edit form
   * can round-trip it. `clientSecretSet` is presence only; the value never
   * leaves the profile.
   */
  async function oauthStatusView(server) {
    const config = oauthConfigView(server)
    let auth
    try {
      auth = await oauthEngine.readStatus(server)
    } catch (error) {
      auth = { enabled: config.enabled, authorized: false, expiresAt: null, scope: null, client: null, error: errorMessage(error) }
    }
    return {
      enabled: auth !== undefined && auth !== null && auth.enabled === true,
      authorized: auth !== undefined && auth !== null && auth.authorized === true,
      expiresAt: typeof auth?.expiresAt === "number" ? auth.expiresAt : null,
      scope: typeof auth?.scope === "string" ? auth.scope : null,
      client: auth?.client === "configured" || auth?.client === "dynamic" ? auth.client : null,
      error: typeof auth?.error === "string" ? auth.error : null,
      scopes: config.scopes,
      clientId: config.clientId,
      resourceMetadataUrl: config.resourceMetadataUrl,
      authorizationServer: config.authorizationServer,
      clientSecretSet: config.clientSecretSet,
    }
  }

  async function serverViews(tools) {
    const counts = new Map()
    for (const tool of tools) counts.set(tool.server, (counts.get(tool.server) ?? 0) + 1)
    const views = []
    for (const server of roster) {
      const record = live.get(server.name)
      const toolCount = counts.get(server.name) ?? 0
      const error = record === undefined ? undefined : record.error ?? record.settleError
      let state
      if (server.enabled === false) state = "disabled"
      else if (error !== undefined) state = "error"
      else if (toolCount > 0) state = "connected"
      else state = "no-tools"
      // `oauth` is the merged view: auth state plus non-secret config. It never
      // carries the access token or the client secret.
      const view = { ...server, toolCount, state, oauth: await oauthStatusView(server) }
      if (error !== undefined) view.error = error
      // A child that is spawned but has not settled yet is still connecting. The
      // page keeps polling while this is true, so a freshly authorized server
      // shows its tools without the user pressing refresh.
      view.connecting = server.enabled !== false && record !== undefined && record.settled !== true && error === undefined
      views.push(view)
    }
    return views
  }

  function describeCapabilities() {
    const details = []
    let spawn
    if (mcpClientFailure !== undefined) {
      spawn = false
      details.push(mcpClientFailure)
    } else if (mcpClientLoaded) {
      spawn = true
      details.push("the mcp-client bridge is loaded")
    } else {
      spawn = true
      details.push("mcp-client bridge resolution is deferred until the first enabled server is spawned")
    }

    let persist = false
    const editor = service("configEditor")
    const entry = editor !== undefined && editor !== null && typeof editor.edit === "function" ? managerEntry() : undefined
    if (editor === undefined || editor === null || typeof editor.edit !== "function") {
      details.push("persistence is unavailable: this profile mounts no configEditor service, so the roster cannot be written to the profile patch")
    } else if (entry === undefined) {
      details.push(`persistence is unavailable: no editable profile row named "${PACKAGE_NAME}" (id "${ROW_ID}") was found`)
    } else {
      persist = true
      details.push(`persistence writes the profile patch row "${String(entry.options?.id ?? ROW_ID)}" through configEditor`)
    }

    const credentials = service("credentials")
    const oauth =
      credentials !== undefined &&
      credentials !== null &&
      typeof credentials.readRecord === "function" &&
      typeof credentials.modifyRecord === "function" &&
      typeof credentials.deleteRecord === "function"
    if (!oauth) {
      details.push("OAuth is unavailable: this profile mounts no credentials service, so tokens cannot be stored or read; servers still connect with static headers")
    } else {
      details.push("OAuth 2.1 is available for streamable-http servers; tokens live in the credentials service")
    }

    if (bridgeState === "ready") details.push(`${bridgePaths.length} client bridge route${bridgePaths.length === 1 ? "" : "s"} registered on webServer`)
    else if (bridgeState === "unavailable") details.push("the client bridge is unavailable: this profile mounts no webServer, so the Settings page cannot reach /api/dsh-mcp-manager/*")
    else details.push("the client bridge is waiting for webServer to activate")

    if (refreshIntervalMs > 0) {
      details.push(`auto-refresh checks every ${Math.round(refreshIntervalMs / 1000)} s and renews a token ${Math.round(refreshLeadMs / 1000)} s before it expires`)
    } else {
      details.push("auto-refresh is disabled (refreshIntervalMs is 0); tokens are only renewed at spawn or on demand")
    }

    if (configIssues.length > 0) details.push(`config issues: ${configIssues.join("; ")}`)

    return { spawn, persist, oauth, autoRefresh: autoRefreshView(), detail: details.join("; ") }
  }

  async function statePayload() {
    const tools = currentTools()
    return { servers: await serverViews(tools), tools, capabilities: describeCapabilities() }
  }

  async function mutationPayload() {
    const tools = currentTools()
    return { servers: await serverViews(tools), tools }
  }

  //#endregion

  //#region OAuth helpers (CONTRACT-OAUTH §5)

  /** Look up one managed server; throws a user-facing error when absent. */
  function requireServer(rawName) {
    const nameValue = requireName(rawName)
    const server = roster.find((entry) => entry.name === nameValue)
    if (server === undefined) throw unknownServer(nameValue)
    return server
  }

  function requireOAuthServer(server) {
    if (server.transport !== "streamable-http" || !isRecord(server.oauth) || server.oauth.enabled !== true) {
      throw userError("oauth-disabled", `OAuth is not enabled for "${server.name}"; turn on oauth for a streamable-http server first`)
    }
    return server
  }

  /** Dispose and respawn one child so a changed token/header takes effect. */
  async function respawnAuth(server) {
    const record = live.get(server.name)
    live.delete(server.name)
    if (record !== undefined) await disposeRecord(record)
    if (server.enabled === false || disposing) return
    await spawnServer(server)
  }

  //#endregion

  //#region scheduled token refresh (CONTRACT-REFRESH §2-§4)

  /** The one object /state, the refresh-all route and the tool all report. */
  function autoRefreshView() {
    const enabled = refreshIntervalMs > 0
    return {
      enabled,
      intervalMs: refreshIntervalMs,
      leadMs: refreshLeadMs,
      refreshOnExpiry,
      lastRunAt: autoRefresh.lastRunAt,
      lastRefreshed: autoRefresh.lastRefreshed,
      lastError: autoRefresh.lastError,
      nextRunAt: enabled ? autoRefresh.nextRunAt : null,
      lastRunKind: autoRefresh.lastRunKind,
    }
  }

  /** Whether a server can ever be renewed on a schedule (static filter only). */
  function autoRefreshCandidate(server) {
    return server.enabled !== false && server.transport === "streamable-http" && isRecord(server.oauth) && server.oauth.enabled === true
  }

  /**
   * One refresh pass, shared by the timer, the `/oauth/refresh-all` route and
   * the tool. No network call happens for a server that is not due: `readStatus`
   * only reads the credential store, and a grant without a refresh token is
   * rejected by the engine before it touches the network.
   */
  async function refreshAllServers(options = {}) {
    const force = options.force === true
    const budgetMs = typeof options.budgetMs === "number" && options.budgetMs > 0 ? options.budgetMs : 0
    const deadlineAt = budgetMs > 0 ? Date.now() + budgetMs : 0
    // The timer stops with its effect; a manual run only stops with the plugin.
    const interrupted = typeof options.interrupted === "function" ? options.interrupted : () => disposing
    const results = []
    let refreshed = 0
    let failed = 0
    let skipped = 0
    let runError = null

    for (const server of roster) {
      if (interrupted()) {
        runError = "the refresh run stopped because the manager is reloading"
        break
      }
      if (deadlineAt > 0 && Date.now() > deadlineAt) {
        runError = `the refresh run exceeded its ${Math.round(budgetMs / 1000)} s budget; the remaining servers are retried on the next tick`
        break
      }
      if (!autoRefreshCandidate(server)) continue

      // A failed renewal backs off instead of hammering the authorization server.
      const backoff = refreshBackoff.get(server.name)
      if (!force && backoff !== undefined && backoff.nextAttemptAt > Date.now()) {
        skipped += 1
        results.push({ name: server.name, refreshed: false, error: null })
        continue
      }

      let status
      try {
        status = await oauthEngine.readStatus(server)
      } catch (error) {
        failed += 1
        results.push({ name: server.name, refreshed: false, error: errorMessage(error) })
        continue
      }
      if (!status || status.enabled !== true) continue
      const expiresAt = typeof status.expiresAt === "number" && Number.isFinite(status.expiresAt) ? status.expiresAt : null
      // Non-expiring or missing grant: nothing to schedule.
      if (expiresAt === null) continue
      if (!force && expiresAt - Date.now() > refreshLeadMs) {
        skipped += 1
        results.push({ name: server.name, refreshed: false, error: null })
        continue
      }

      try {
        await oauthEngine.refreshNow(server)
        refreshBackoff.delete(server.name)
        if (interrupted()) {
          skipped += 1
          results.push({ name: server.name, refreshed: false, error: null })
          continue
        }
        await respawnAuth(server)
        refreshed += 1
        results.push({ name: server.name, refreshed: true, error: null })
      } catch (error) {
        const code = typeof error?.code === "string" ? error.code : ""
        if (code === "no-refresh-token" || code === "unauthorized") {
          // Not renewable; no network call was made.
          skipped += 1
          results.push({ name: server.name, refreshed: false, error: null })
          continue
        }
        failed += 1
        const failures = (refreshBackoff.get(server.name)?.failures ?? 0) + 1
        const waitMs = Math.min(30000 * 2 ** (failures - 1), Math.max(30000, refreshIntervalMs))
        refreshBackoff.set(server.name, { failures, nextAttemptAt: Date.now() + waitMs })
        results.push({ name: server.name, refreshed: false, error: errorMessage(error) })
      }
    }

    return {
      checked: results.length,
      refreshed,
      failed,
      skipped,
      results,
      autoRefresh: autoRefreshView(),
      ...(runError === null ? {} : { error: runError }),
    }
  }

  /** (Re-)arm the one-shot timer; the chain re-arms after every tick. */
  function armRefreshTimer() {
    if (refreshStopped || disposing || refreshIntervalMs <= 0) return
    autoRefresh.nextRunAt = Date.now() + refreshIntervalMs
    try {
      refreshHandle = setTimeout(() => {
        refreshHandle = null
        void runRefreshTick()
      }, refreshIntervalMs)
      if (refreshHandle !== null && refreshHandle !== undefined && typeof refreshHandle.unref === "function") refreshHandle.unref()
    } catch (error) {
      refreshHandle = null
      autoRefresh.lastError = `could not arm the refresh timer: ${errorMessage(error)}`
      warn(`dsh-mcp-manager: ${autoRefresh.lastError}`)
    }
  }

  /** One timer tick. Never throws; always re-arms unless the plugin is going away. */
  async function runRefreshTick() {
    if (refreshStopped || disposing) return
    if (refreshTicking) {
      // A previous tick is still running: skip this round and try again later.
      armRefreshTimer()
      return
    }
    refreshTicking = true
    autoRefresh.lastRunAt = Date.now()
    autoRefresh.lastRunKind = "timer"
    let refreshedCount = 0
    try {
      const outcome = await refreshAllServers({
        force: false,
        budgetMs: REFRESH_TICK_BUDGET_MS,
        interrupted: () => refreshStopped || disposing,
      })
      refreshedCount = outcome.refreshed
      autoRefresh.lastError = typeof outcome.error === "string" ? outcome.error : null
    } catch (error) {
      autoRefresh.lastError = errorMessage(error)
      warn(`dsh-mcp-manager: the OAuth refresh tick failed: ${errorMessage(error)}`)
    } finally {
      autoRefresh.lastRefreshed = refreshedCount
      refreshTicking = false
      if (!refreshStopped) armRefreshTimer()
    }
  }

  /**
   * Persist the renewal policy on this plugin's own row. Uses the same Loader
   * path as the roster, so the plugin reloads with the new values; callers must
   * not touch in-memory state afterwards.
   */
  async function persistRefreshPolicy(policy) {
    const editor = service("configEditor")
    if (editor === undefined || typeof editor.entries !== "function" || typeof editor.edit !== "function") {
      throw userError(
        "persistence-unavailable",
        "the configEditor service is not available in this profile, so the auto-refresh policy cannot be saved; edit the profile patch (cordis.patch.yml) by hand instead",
      )
    }
    const entry = managerEntry()
    if (entry === undefined) {
      throw userError(
        "persistence-unavailable",
        `no editable profile row named "${PACKAGE_NAME}" was found, so the auto-refresh policy cannot be saved`,
      )
    }
    try {
      await editor.edit(entry, (current) => ({
        ...(isRecord(current) ? current : {}),
        refreshIntervalMs: policy.refreshIntervalMs,
        refreshLeadMs: policy.refreshLeadMs,
        refreshOnExpiry: policy.refreshOnExpiry,
      }))
    } catch (error) {
      throw userError("persistence-failed", `the auto-refresh policy could not be written to the profile patch: ${errorMessage(error)}`)
    }
  }

  // Renewal after expiry (CONTRACT-CONFIG §3b): an MCP call that fails like an
  // auth failure renews the token and reconnects that one server, so the next
  // call works without the user doing anything.
  const SELF_HEAL_MAX_ATTEMPTS = 3
  const SELF_HEAL_BASE_MS = 30000
  const AUTH_FAILURE_PATTERN = /401|403|unauthor|invalid[_-]?token|token.{0,12}expired|expired.{0,12}token|missing.{0,12}token|bearer/i

  function maybeSelfHeal(server, reason) {
    if (!refreshOnExpiry || disposing) return
    const state = selfHeal.get(server.name) ?? { lastAt: 0, attempts: 0, pending: false }
    if (state.pending) return
    if (state.attempts >= SELF_HEAL_MAX_ATTEMPTS) return
    const waitMs = state.attempts === 0 ? SELF_HEAL_BASE_MS : SELF_HEAL_BASE_MS * 2 ** (state.attempts - 1)
    if (Date.now() - state.lastAt < waitMs) return
    state.pending = true
    state.lastAt = Date.now()
    selfHeal.set(server.name, state)
    void (async () => {
      try {
        await oauthEngine.refreshNow(server)
        await respawnAuth(server)
        state.attempts = 0
        refreshBackoff.delete(server.name)
        autoRefresh.lastRunKind = "expiry"
        autoRefresh.lastRunAt = Date.now()
        autoRefresh.lastError = null
      } catch (error) {
        state.attempts += 1
        const message = errorMessage(error)
        autoRefresh.lastRunKind = "expiry"
        autoRefresh.lastRunAt = Date.now()
        autoRefresh.lastError = `self-heal for "${server.name}" failed: ${message}`
        warn(`dsh-mcp-manager: self-heal for "${server.name}" failed after "${reason}": ${message}`)
      } finally {
        state.pending = false
      }
    })()
  }

  function registerSelfHealListener() {
    if (!refreshOnExpiry) return
    try {
      ctx.effect(
        () =>
          ctx.on("tools/result", (exec, result) => {
            try {
              if (!refreshOnExpiry || disposing) return
              if (result === null || typeof result !== "object" || result.isError !== true) return
              const toolName = typeof exec?.name === "string" ? exec.name : ""
              if (!toolName.startsWith(MCP_TOOL_PREFIX)) return
              const server = roster.find((entry) => toolName.startsWith(`${MCP_TOOL_PREFIX}${entry.name}__`))
              if (server === undefined || !autoRefreshCandidate(server)) return
              const pieces = []
              if (typeof result.error?.message === "string") pieces.push(result.error.message)
              if (Array.isArray(result.content)) {
                for (const block of result.content) {
                  if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") pieces.push(block.text)
                }
              }
              const text = pieces.join(" ")
              if (!AUTH_FAILURE_PATTERN.test(text)) return
              maybeSelfHeal(server, text.slice(0, 200))
            } catch {
              // A listener must never throw out of the emit.
            }
          }),
        "dsh-mcp-manager: oauth self-heal",
      )
    } catch (error) {
      warn(`dsh-mcp-manager: could not listen for tool results: ${errorMessage(error)}`)
    }
  }

  //#endregion

  //#region mutations (shared by agent tools and the HTTP bridge)

  function requireName(rawName) {
    const nameValue = typeof rawName === "string" ? rawName.trim() : ""
    if (nameValue === "") throw userError("invalid-body", '"name" is required and must be a non-empty string')
    return nameValue
  }

  function unknownServer(nameValue) {
    const known = roster.map((server) => server.name)
    return userError("unknown-server", `no managed MCP server is named "${nameValue}"; known names: ${known.length > 0 ? known.join(", ") : "(none)"}`)
  }

  /**
   * Client-secret merge rule (Lead decision on CONTRACT-OAUTH §1): a non-empty
   * string replaces the stored secret; `""` or absent keeps it (a form that
   * never saw the value must be able to save without wiping it); `null` clears
   * it. `null` only arrives over the HTTP bridge, so it is tolerated here and
   * normalized to `""` for persistence.
   */
  function mergeOAuthSecret(input) {
    if (!isRecord(input) || !isRecord(input.oauth)) return input
    const rawSecret = input.oauth.clientSecret
    const nameValue = typeof input.name === "string" ? input.name.trim() : ""
    const existing = nameValue === "" ? undefined : roster.find((entry) => entry.name === nameValue)
    const stored =
      existing !== undefined && isRecord(existing.oauth) && typeof existing.oauth.clientSecret === "string" ? existing.oauth.clientSecret : ""
    let resolved
    if (rawSecret === null) resolved = ""
    else if (typeof rawSecret === "string" && rawSecret !== "") resolved = rawSecret
    else resolved = stored
    return { ...input, oauth: { ...input.oauth, clientSecret: resolved } }
  }

  /** A persisted server with the client secret reduced to its presence. */
  function publicServer(server) {
    return { ...server, oauth: oauthConfigView(server) }
  }

  async function upsertServer(input) {
    const result = normalizeServer(mergeOAuthSecret(input))
    if (!result.ok) throw userError("invalid-server", result.error)
    const server = result.server
    const nextServers = roster.slice()
    const index = nextServers.findIndex((entry) => entry.name === server.name)
    if (index >= 0) nextServers[index] = server
    else nextServers.push(server)
    await persistRoster(nextServers)
    return { server: publicServer(server), ...(await mutationPayload()) }
  }

  async function removeServer(rawName) {
    const nameValue = requireName(rawName)
    const index = roster.findIndex((entry) => entry.name === nameValue)
    if (index < 0) throw unknownServer(nameValue)
    const nextServers = roster.slice()
    nextServers.splice(index, 1)
    await persistRoster(nextServers)
    return { removed: nameValue, ...(await mutationPayload()) }
  }

  async function setEnabledServer(rawName, rawEnabled) {
    const nameValue = requireName(rawName)
    if (typeof rawEnabled !== "boolean") throw userError("invalid-body", '"enabled" is required and must be a boolean')
    const index = roster.findIndex((entry) => entry.name === nameValue)
    if (index < 0) throw unknownServer(nameValue)
    const server = { ...roster[index], enabled: rawEnabled }
    const nextServers = roster.slice()
    nextServers[index] = server
    await persistRoster(nextServers)
    return { server: publicServer(server), ...(await mutationPayload()) }
  }

  /** Does not persist: disposes and respawns exactly one child. */
  async function reconnectServer(rawName) {
    const nameValue = requireName(rawName)
    const server = roster.find((entry) => entry.name === nameValue)
    if (server === undefined) throw unknownServer(nameValue)
    if (server.enabled === false) throw userError("server-disabled", `"${nameValue}" is disabled; enable it before reconnecting`)
    if (disposing) throw userError("unavailable", "the manager is reloading; retry the reconnect in a moment")
    const record = live.get(nameValue)
    live.delete(nameValue)
    if (record !== undefined) await disposeRecord(record)
    await spawnServer(server)
    return await mutationPayload()
  }

  //#endregion

  //#region child fleet (CONTRACT §2.1)

  async function disposeRecord(record) {
    const disposer = record === undefined ? undefined : record.disposer
    if (typeof disposer !== "function") return
    record.disposer = null
    try {
      await disposer()
    } catch (error) {
      warn(`dsh-mcp-manager: disposing the mcp-client child for "${String(record.name)}" failed: ${errorMessage(error)}`)
    }
  }

  /**
   * Start one child. Never awaited for readiness: only module resolution and
   * `ctx.plugin()` run here; the child's own startup is observed in the
   * background so a hung MCP server cannot block activation.
   */
  async function spawnServer(server) {
    if (disposing) return undefined
    const record = { name: server.name, startedAt: Date.now(), disposer: null, error: undefined, settleError: undefined, settled: false }
    live.set(server.name, record)

    // A stdio server whose executable cannot run will never publish tools, and
    // the MCP client reports that only on its own logger. Check up front so the
    // page shows `error` with a fixable reason instead of a forever "0 tools".
    if (server.transport === "stdio") {
      const problem = commandProblem(server.command)
      if (problem !== undefined) {
        record.error = `server.command ${problem}`
        record.settled = true
        return record
      }
    }

    let bridge
    try {
      bridge = await loadMcpClient(ctx)
    } catch (error) {
      record.error = mcpClientFailure ?? `could not load ${MCP_CLIENT_SPECIFIER}: ${errorMessage(error)}`
      record.settled = true
      return record
    }

    // The fleet may have been torn down, or this name re-spawned, while the
    // bridge module was resolving.
    if (disposing || live.get(server.name) !== record || ctx.fiber === undefined || ctx.fiber === null || ctx.fiber.uid === null) {
      return record
    }

    // Resolve the OAuth header for this spawn. `headerFor` never throws: a
    // failed refresh is recorded as the server's oauth.error and the child
    // spawns without an Authorization header.
    let authorizationHeader
    if (server.transport === "streamable-http" && isRecord(server.oauth) && server.oauth.enabled === true) {
      const authorization = await oauthEngine.headerFor(server)
      if (authorization !== undefined && authorization !== null && typeof authorization.header === "string") authorizationHeader = authorization.header
      if (disposing || live.get(server.name) !== record || ctx.fiber === undefined || ctx.fiber === null || ctx.fiber.uid === null) {
        return record
      }
    }

    let fiber
    try {
      fiber = ctx.plugin(bridge, toMcpClientConfig(server, authorizationHeader))
    } catch (error) {
      record.error = `could not start the mcp-client child for "${server.name}": ${errorMessage(error)}`
      record.settled = true
      return record
    }
    record.disposer = toDisposer(fiber)

    let readiness
    try {
      readiness = fiber !== null && fiber !== undefined && typeof fiber.await === "function" ? fiber.await() : undefined
    } catch (error) {
      readiness = Promise.reject(error)
    }
    if (readiness !== undefined && readiness !== null && typeof readiness.then === "function") {
      const settle = () => {
        record.settled = true
      }
      void readiness
        .then(settle, (error) => {
          record.settled = true
          record.settleError = `the mcp-client child for "${server.name}" failed to start: ${errorMessage(error)}`
        })
        .catch(() => {})
    } else {
      record.settled = true
    }
    return record
  }

  function reconcile() {
    const wanted = roster.filter((server) => server.enabled !== false)
    const wantedNames = new Set(wanted.map((server) => server.name))
    for (const [serverName, record] of [...live.entries()]) {
      if (wantedNames.has(serverName)) continue
      live.delete(serverName)
      void disposeRecord(record)
    }
    for (const server of wanted) {
      if (live.has(server.name)) continue
      void spawnServer(server)
    }
  }

  //#endregion

  //#region tool definitions (CONTRACT §2.4)

  function toolDefinitions() {
    return [
      {
        name: "mcp_manager_list",
        description:
          "List every MCP server managed by dsh-mcp-manager: name, transport, endpoint, enabled flag, connection state, tool count, and any startup error. Read-only. The roster it reports is the same one shown in Settings > Plugins > MCP Servers.",
        parameters: { type: "object", additionalProperties: false, properties: {} },
        output: {
          schema: OBJECT_OUTPUT_SCHEMA,
          render(_args, value) {
            return renderRoster(value, "Managed MCP servers")
          },
        },
        async execute() {
          const tools = currentTools()
          return { servers: await serverViews(tools), capabilities: describeCapabilities() }
        },
      },
      {
        name: "mcp_manager_add",
        description:
          "Add one MCP server to the managed roster, or replace the entry with the same name (upsert). Replacing overwrites that entry's transport, endpoint, env/headers, OAuth settings, tool call timeout and enabled flag; other servers are untouched. Persists to the profile patch, then the Harness reloads the plugin and spawns the child MCP client. Only enabled servers are connected. For a streamable-http server, oauth.enabled switches on OAuth 2.1: the manager discovers the authorization server, registers a client dynamically, and uses PKCE; the first authorization itself needs a human in a browser via mcp_manager_oauth action=authorize. The roster is shared with Settings > Plugins > MCP Servers.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
              description: 'MCP server name, also the tool prefix: tools appear as mcp__<name>__<tool>. Must match /^[A-Za-z0-9_-]{1,32}$/ and be unique in the roster.',
            },
            transport: {
              type: "string",
              enum: ["stdio", "streamable-http"],
              description: 'Connection transport: "stdio" spawns a local process (command/args/env/cwd), "streamable-http" calls a remote URL (url/headers).',
            },
            command: { type: "string", description: 'Executable to spawn, e.g. "node" or "C:/tools/server.exe" — the program only, not the whole command line. Required for "stdio"; a full command line is split into command + args automatically, and a path that does not exist is rejected.' },
            args: { type: "array", items: { type: "string" }, description: 'Command arguments, one entry per argument. Used for "stdio" only.' },
            env: { type: "object", additionalProperties: true, description: 'Extra environment variables as a string map, e.g. {"API_KEY":"..."}. Used for "stdio" only.' },
            cwd: { type: "string", description: 'Working directory for the spawned process. Used for "stdio" only.' },
            url: { type: "string", description: 'Absolute http(s) MCP endpoint. Required for "streamable-http".' },
            headers: { type: "object", additionalProperties: true, description: 'Extra HTTP request headers as a string map. Used for "streamable-http" only.' },
            enabled: { type: "boolean", description: "Whether the server is connected after the reload. Defaults to true; a disabled server stays saved but spawns nothing." },
            toolCallTimeoutMs: { type: "integer", description: "Per tool call timeout in milliseconds. Defaults to 60000." },
            failOnStartupError: { type: "boolean", description: "When true, a failed initial connection is reported as a startup error. Defaults to false." },
            oauth: {
              type: "object",
              additionalProperties: true,
              description:
                "OAuth 2.1 settings for a streamable-http server: { enabled, scopes?: string[], clientId?, clientSecret?, resourceMetadataUrl?, authorizationServer? }. Omit for static-header or stdio servers.",
            },
          },
          required: ["name", "transport"],
        },
        output: {
          schema: OBJECT_OUTPUT_SCHEMA,
          render(_args, value) {
            const server = isRecord(value) ? value.server : undefined
            return renderRoster(value, `Saved MCP server "${isRecord(server) ? String(server.name) : ""}".`)
          },
        },
        async execute(args) {
          const result = await upsertServer(args)
          return { server: result.server, servers: result.servers }
        },
      },
      {
        name: "mcp_manager_remove",
        description:
          "Remove one MCP server from the managed roster and delete its saved configuration. After the Harness reloads the plugin the child MCP client is disposed, so its mcp__<name>__* tools disappear. Persists to the profile patch. The roster is shared with Settings > Plugins > MCP Servers.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", description: "Name of the managed MCP server to remove." },
          },
          required: ["name"],
        },
        output: {
          schema: OBJECT_OUTPUT_SCHEMA,
          render(_args, value) {
            const removed = isRecord(value) && typeof value.removed === "string" ? value.removed : ""
            return renderRoster(value, `Removed MCP server "${removed}".`)
          },
        },
        async execute(args) {
          const result = await removeServer(isRecord(args) ? args.name : undefined)
          return { removed: result.removed, servers: result.servers }
        },
      },
      {
        name: "mcp_manager_set_enabled",
        description:
          "Enable or disable one managed MCP server without deleting its configuration. Disabling keeps the entry saved but disposes its child MCP client, so its mcp__<name>__* tools disappear; enabling spawns it again. Persists to the profile patch. The roster is shared with Settings > Plugins > MCP Servers.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", description: "Name of the managed MCP server to enable or disable." },
            enabled: { type: "boolean", description: "true connects the server after the reload, false keeps it saved but disconnected." },
          },
          required: ["name", "enabled"],
        },
        output: {
          schema: OBJECT_OUTPUT_SCHEMA,
          render(_args, value) {
            const server = isRecord(value) ? value.server : undefined
            const label = isRecord(server) ? String(server.name) : ""
            const verb = isRecord(server) && server.enabled === false ? "Disabled" : "Enabled"
            return renderRoster(value, `${verb} MCP server "${label}".`)
          },
        },
        async execute(args) {
          const result = await setEnabledServer(isRecord(args) ? args.name : undefined, isRecord(args) ? args.enabled : undefined)
          return { server: result.server, servers: result.servers }
        },
      },
      {
        name: "mcp_manager_tools",
        description:
          "List the MCP tools currently registered on the Harness tool registry, with their public mcp__<server>__<tool> name, description, and input parameter names. Optionally filter to one server. Read-only: it never connects or reconnects a server.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            server: { type: "string", description: "Optional managed server name; omit to list every MCP tool." },
          },
        },
        output: {
          schema: OBJECT_OUTPUT_SCHEMA,
          render(_args, value) {
            const filtered = isRecord(value) && Array.isArray(value.tools) ? value.tools.length : 0
            return renderTools(value, `${filtered} MCP tool${filtered === 1 ? "" : "s"}`)
          },
        },
        async execute(args) {
          const tools = currentTools()
          const wanted = isRecord(args) && typeof args.server === "string" ? args.server.trim() : ""
          const servers = roster.map((server) => ({ name: server.name, toolCount: tools.filter((tool) => tool.server === server.name).length }))
          if (wanted === "") return { tools, servers }
          const filteredTools = tools.filter((tool) => tool.server === wanted)
          if (filteredTools.length === 0 && !roster.some((server) => server.name === wanted)) {
            const known = roster.map((server) => server.name)
            throw userError("unknown-server", `no MCP tools are exposed for "${wanted}", and it is not a managed server; managed names: ${known.length > 0 ? known.join(", ") : "(none)"}`)
          }
          return { tools: filteredTools, servers }
        },
      },
      {
        name: "mcp_manager_oauth",
        description:
          "Inspect or change OAuth 2.1 authorization for managed streamable-http MCP servers. action=status returns one server's auth view (authorized, expiry, scope, client kind, last error, non-secret config); it needs name. action=authorize starts the authorization flow and returns the authorization URL immediately — a HUMAN must open that URL in a browser and finish the consent screen, because this tool cannot complete an interactive login; it needs name. action=paste-token stores a bearer token you supply (the fallback when the server publishes no registration or metadata) and respawns the server; it needs name and token. action=refresh rotates that server's stored token and needs name. action=signout deletes the stored token and needs name. action=refresh-all needs NO name: it renews every managed server whose token is due for the scheduled refresh, returns the counts and per-server results, and reports the auto-refresh timer state. The roster and this auth state are shared with Settings > Plugins > MCP Servers. This tool never returns or logs a token.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", description: "Managed MCP server name. Required for every action except refresh-all." },
            action: {
              type: "string",
              enum: ["status", "authorize", "signout", "paste-token", "refresh", "refresh-all"],
              description: "What to do: one server's auth (name required) or renew everything that is due (refresh-all, no name).",
            },
            token: { type: "string", description: "Access token, only for action=paste-token. It is stored in the credentials service and never echoed back." },
          },
          required: ["action"],
        },
        output: {
          schema: OBJECT_OUTPUT_SCHEMA,
          render(_args, value) {
            return renderOAuth(value, "MCP server OAuth")
          },
        },
        async execute(args) {
          const action = isRecord(args) && typeof args.action === "string" ? args.action.trim() : ""
          if (action === "refresh-all") {
        if (!disposing) autoRefresh.lastRunKind = "manual"
            // Deliberately does not require `name`.
            const outcome = await refreshAllServers({ force: false })
            return { status: "refresh-all", ...outcome }
          }
          if (action !== "status" && action !== "authorize" && action !== "paste-token" && action !== "refresh" && action !== "signout") {
            throw userError("invalid-body", `unknown OAuth action "${action}"; use status, authorize, signout, paste-token, refresh or refresh-all`)
          }
          const server = requireServer(isRecord(args) ? args.name : undefined)
          if (action === "status") {
            // Status is informational: it answers for any managed server, even
            // one with OAuth turned off (the view then reports enabled:false).
            return { status: "status", oauth: await oauthStatusView(server) }
          }
          if (action === "authorize") {
            requireOAuthServer(server)
            const outcome = await oauthEngine.authorize(server)
            return {
              status: outcome.status,
              ...(typeof outcome.authorizationUrl === "string" ? { authorizationUrl: outcome.authorizationUrl } : {}),
              message:
                outcome.status === "pending"
                  ? "A human must open authorizationUrl in a browser and finish the consent screen; the Harness then completes the exchange and the server reconnects automatically."
                  : "The server already holds a usable token; sign out first to authorize again.",
              oauth: await oauthStatusView(server),
            }
          }
          if (action === "paste-token") {
            requireOAuthServer(server)
            const token = isRecord(args) && typeof args.token === "string" ? args.token : ""
            const result = await oauthEngine.approveWithToken(server, token)
            await respawnAuth(server)
            return { status: "authorized", authorized: result.authorized === true, expiresAt: result.expiresAt ?? null, oauth: await oauthStatusView(server) }
          }
          if (action === "refresh") {
            requireOAuthServer(server)
            const result = await oauthEngine.refreshNow(server)
            await respawnAuth(server)
            return { status: "refreshed", authorized: result.authorized === true, expiresAt: result.expiresAt ?? null, oauth: await oauthStatusView(server) }
          }
          await oauthEngine.signOut(server)
          await respawnAuth(server)
          return { status: "signed-out", authorized: false, oauth: await oauthStatusView(server) }
        },
      },
    ]
  }

  function registerAgentTools() {
    try {
      ctx.effect(() => {
        const disposers = []
        for (const definition of toolDefinitions()) {
          try {
            const dispose = ctx.tools.register(definition)
            if (typeof dispose === "function") disposers.push(dispose)
          } catch (error) {
            warn(`dsh-mcp-manager: could not register tool "${definition.name}": ${errorMessage(error)}`)
          }
        }
        return () => {
          for (const dispose of disposers) {
            try {
              dispose()
            } catch (error) {
              warn(`dsh-mcp-manager: tool disposer failed: ${errorMessage(error)}`)
            }
          }
        }
      }, "dsh-mcp-manager: agent tools")
    } catch (error) {
      logError(`dsh-mcp-manager: agent tool registration failed: ${errorMessage(error)}`)
    }
  }

  //#endregion

  //#region HTTP bridge registration (CONTRACT §2.6)

  async function serveRoute(route, req, res) {
    const method = route.method === "GET" ? "GET" : "POST"
    if (method === "GET") {
      // Browser top-level navigation: same-origin checks are meaningless here,
      // so the guard is the loopback remote address only (CONTRACT-OAUTH §5).
      if (!isLoopbackAddress(req)) {
        writeHtml(res, 403, BRIDGE_PAGE_BLOCKED)
        return
      }
      if (req.method !== "GET") {
        writeJson(res, 405, { ok: false, code: "method-not-allowed", message: `${route.path} accepts GET only` }, { allow: "GET" })
        return
      }
      let origin = ""
      try {
        const webServer = service("webServer")
        if (webServer !== undefined && webServer !== null && typeof webServer.getOrigin === "function") origin = String(webServer.getOrigin()).replace(/\/+$/, "")
      } catch {
        origin = ""
      }
      try {
        const outcome = await route.action(parseQuery(req.url), origin)
        const html = isRecord(outcome) && typeof outcome.html === "string" ? outcome.html : BRIDGE_PAGE_FAILED
        writeHtml(res, isRecord(outcome) && outcome.ok === true ? 200 : 400, html)
        if (isRecord(outcome) && outcome.ok === true && typeof outcome.server === "string") {
          const server = roster.find((entry) => entry.name === outcome.server)
          if (server !== undefined) {
            try {
              await respawnAuth(server)
            } catch (error) {
              warn(`dsh-mcp-manager: respawning "${server.name}" after authorization failed: ${errorMessage(error)}`)
            }
          }
        }
      } catch (error) {
        warn(`dsh-mcp-manager: oauth callback failed: ${errorMessage(error)}`)
        writeHtml(res, 500, BRIDGE_PAGE_FAILED)
      }
      return
    }

    try {
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { ok: false, code: "forbidden", message: "this bridge accepts loopback requests only" })
        return
      }
      if (req.method !== "POST") {
        writeJson(res, 405, { ok: false, code: "method-not-allowed", message: `${route.path} accepts POST only` }, { allow: "POST" })
        return
      }
      const body = await readJsonBody(req)
      if (body.ok !== true) {
        writeJson(res, 400, { ok: false, code: "invalid-json", message: body.reason === "too-large" ? "request body exceeds 64 KiB" : "request body is not valid JSON" })
        return
      }
      if (!isRecord(body.value)) {
        writeJson(res, 400, { ok: false, code: "invalid-body", message: "request body must be a JSON object" })
        return
      }
      const value = await route.action(body.value)
      writeJson(res, 200, { ok: true, value })
    } catch (error) {
      writeJson(res, 200, {
        ok: false,
        code: typeof error?.code === "string" ? error.code : "failed",
        message: errorMessage(error),
      })
    }
  }

  function registerBridge() {
    const routes = [
      { path: `${API_PREFIX}/state`, action: async () => statePayload() },
      {
        path: `${API_PREFIX}/upsert`,
        action: async (body) => {
          const result = await upsertServer(body.server)
          return { servers: result.servers, tools: result.tools }
        },
      },
      {
        path: `${API_PREFIX}/remove`,
        action: async (body) => {
          const result = await removeServer(body.name)
          return { servers: result.servers, tools: result.tools }
        },
      },
      {
        path: `${API_PREFIX}/enabled`,
        action: async (body) => {
          const result = await setEnabledServer(body.name, body.enabled)
          return { servers: result.servers, tools: result.tools }
        },
      },
      {
        path: `${API_PREFIX}/reconnect`,
        action: async (body) => {
          const result = await reconnectServer(body.name)
          return { servers: result.servers, tools: result.tools }
        },
      },
      {
        method: "POST",
        path: `${API_PREFIX}/config`,
        action: async (body) => {
          const input = isRecord(body) ? body : {}
          const hasInterval = Object.hasOwn(input, "refreshIntervalMs")
          const hasLead = Object.hasOwn(input, "refreshLeadMs")
          const hasOnExpiry = Object.hasOwn(input, "refreshOnExpiry")
          if (!hasInterval && !hasLead && !hasOnExpiry) {
            throw userError("invalid-body", 'provide at least one of "refreshIntervalMs", "refreshLeadMs", "refreshOnExpiry"')
          }
          const policy = {
            refreshIntervalMs: hasInterval ? normalizeRefreshMs(input.refreshIntervalMs, DEFAULT_REFRESH_INTERVAL_MS, true) : refreshIntervalMs,
            refreshLeadMs: hasLead ? normalizeRefreshMs(input.refreshLeadMs, DEFAULT_REFRESH_LEAD_MS, false) : refreshLeadMs,
            refreshOnExpiry: hasOnExpiry ? normalizeFlag(input.refreshOnExpiry, true) === true : refreshOnExpiry,
          }
          await persistRefreshPolicy(policy)
          return policy
        },
      },
      {
        method: "POST",
        path: `${API_PREFIX}/oauth/authorize`,
        action: async (body) => {
          const server = requireOAuthServer(requireServer(body.name))
          let outcome
          try {
            outcome = await oauthEngine.authorize(server)
          } catch (error) {
            // An abandoned browser step must not lock the user out for ten
            // minutes: supersede that attempt and start exactly one fresh one.
            const code = typeof error?.code === "string" ? error.code : ""
            if (code === "authorization-in-flight" && typeof oauthEngine.cancelAttempt === "function") {
              oauthEngine.cancelAttempt(server)
              outcome = await oauthEngine.authorize(server)
            } else {
              throw error
            }
          }
          return {
            status: outcome.status,
            ...(typeof outcome.authorizationUrl === "string" ? { authorizationUrl: outcome.authorizationUrl } : {}),
            ...(typeof outcome.message === "string" ? { message: outcome.message } : {}),
          }
        },
      },
      {
        method: "POST",
        path: `${API_PREFIX}/oauth/paste-token`,
        action: async (body) => {
          const server = requireOAuthServer(requireServer(body.name))
          if (typeof body.token !== "string" || body.token.trim() === "") {
            throw userError("invalid-body", '"token" is required and must be a non-empty string')
          }
          const result = await oauthEngine.approveWithToken(server, body.token)
          await respawnAuth(server)
          return { authorized: result.authorized === true, expiresAt: result.expiresAt ?? null }
        },
      },
      {
        method: "POST",
        path: `${API_PREFIX}/oauth/refresh`,
        action: async (body) => {
          const server = requireOAuthServer(requireServer(body.name))
          const result = await oauthEngine.refreshNow(server)
          await respawnAuth(server)
          return { authorized: result.authorized === true, expiresAt: result.expiresAt ?? null }
        },
      },
      {
        method: "POST",
        path: `${API_PREFIX}/oauth/signout`,
        action: async (body) => {
          // Allowed even when oauth was just turned off, so a stale grant can be
          // cleared instead of lingering in the credentials store.
          const server = requireServer(body.name)
          await oauthEngine.signOut(server)
          await respawnAuth(server)
          return { authorized: false }
        },
      },
      {
        // "Renew everything now": same pass as the timer, optionally ignoring
        // the lead window (that is what the page's button sends).
        method: "POST",
        path: `${API_PREFIX}/oauth/refresh-all`,
        action: async (body) => {
          if (!disposing) autoRefresh.lastRunKind = "manual"
          return refreshAllServers({ force: body.force === true })
        },
      },
      {
        // Browser top-level navigation, so GET + loopback-address-only guard.
        method: "GET",
        path: `${API_PREFIX}/oauth/callback`,
        action: async (query, origin) => oauthEngine.handleCallback(query, origin),
      },
    ]

    try {
      ctx.inject(["webServer"], (inner) => {
        try {
          inner.effect(() => {
            const disposers = []
            const paths = []
            for (const route of routes) {
              try {
                const dispose = inner.webServer.register({
                  kind: "exact",
                  path: route.path,
                  handler: (req, res) => {
                    void serveRoute(route, req, res)
                  },
                })
                if (typeof dispose === "function") disposers.push(dispose)
                paths.push(route.path)
              } catch (error) {
                warn(`dsh-mcp-manager: could not register ${route.path}: ${errorMessage(error)}`)
              }
            }
            bridgePaths = paths
            bridgeState = paths.length > 0 ? "ready" : "unavailable"
            return () => {
              bridgeState = "pending"
              bridgePaths = []
              for (const dispose of disposers) {
                try {
                  dispose()
                } catch (error) {
                  warn(`dsh-mcp-manager: route disposer failed: ${errorMessage(error)}`)
                }
              }
            }
          }, "dsh-mcp-manager: client bridge")
        } catch (error) {
          bridgeState = "unavailable"
          logError(`dsh-mcp-manager: client bridge registration failed: ${errorMessage(error)}`)
        }
      })
    } catch (error) {
      bridgeState = "unavailable"
      logError(`dsh-mcp-manager: webServer injection failed: ${errorMessage(error)}`)
    }
  }

  //#endregion

  // Install order: the fleet first (so enabled servers start connecting early),
  // then the agent tools, then the Client bridge.
  try {
    ctx.effect(() => {
      reconcile()
      return async () => {
        disposing = true
        const records = [...live.values()]
        live.clear()
        for (const record of records) {
          // One bad disposer must not abort the teardown of the rest.
          try {
            await disposeRecord(record)
          } catch (error) {
            warn(`dsh-mcp-manager: disposing "${String(record?.name)}" failed: ${errorMessage(error)}`)
          }
        }
      }
    }, "dsh-mcp-manager: MCP child fleet")
  } catch (error) {
    logError(`dsh-mcp-manager: could not own the MCP child fleet: ${errorMessage(error)}`)
  }

  // Abort in-flight OAuth requests and drop pending attempts with the plugin.
  try {
    ctx.effect(() => () => {
      try {
        oauthEngine.dispose()
      } catch (error) {
        warn(`dsh-mcp-manager: disposing the OAuth engine failed: ${errorMessage(error)}`)
      }
    }, "dsh-mcp-manager: oauth engine")
  } catch (error) {
    logError(`dsh-mcp-manager: could not own the OAuth engine: ${errorMessage(error)}`)
  }

  // One timer per activation: a setTimeout chain owned by this effect. It is
  // registered last, so Cordis disposes it FIRST on unload (cleanup runs in
  // reverse registration order) and no tick can outlive the engine it uses.
  if (refreshIntervalMs > 0) {
    try {
      ctx.effect(() => {
        armRefreshTimer()
        return () => {
          refreshStopped = true
          autoRefresh.nextRunAt = null
          if (refreshHandle !== null) {
            try {
              clearTimeout(refreshHandle)
            } catch {
              // Already gone.
            }
            refreshHandle = null
          }
        }
      }, "dsh-mcp-manager: oauth refresh timer")
    } catch (error) {
      autoRefresh.lastError = `the refresh timer could not be started: ${errorMessage(error)}`
      logError(`dsh-mcp-manager: could not own the refresh timer: ${errorMessage(error)}`)
    }
  }

  registerSelfHealListener()
  registerAgentTools()
  registerBridge()
}

//#endregion
