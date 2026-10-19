# dsh-mcp-manager — implementation contract

Goal: a DeepSeek Harness (DSH) plugin that lets a user **manage MCP servers from inside DSH**
(list / add / enable / disable / remove / reconnect) and **see every tool each server exposes,
with its description**.

The plugin is a normal DSH bundle installed into the `desktop` profile. It ships two halves
plus display resources. This file is the binding contract between the two halves; do not
change a field name, endpoint, or tool signature unilaterally.

Deliverable directory (workspace): `C:\Users\Xi\Documents\temp\dsh-mcp-manager`
Package name: `dsh-mcp-manager` · patch row id: `mcp-manager`

```
package.json        Lead (done)
cordis.patch.yml    Lead (done)
locale/en.json      Lead (done)
locale/zh.json      Lead (done)
icon.svg            Lead (done)
lib/index.js        Host developer  (owner: host-dev)
lib/client.js       Client developer (owner: client-dev)
```

Write ONLY your own file. Do not run `plugin_manager`, do not install anything, do not edit
the profile under `C:\Users\Xi\.dsh`. The Lead installs and verifies.

## 0. How the plugin works (design fixed by the Lead)

`@deepseek-ai/dsh-mcp-client` is the shipped bridge that connects **one** MCP server and
registers that server's tools on the Harness tool registry under the public name
`mcp__<serverName>__<rawToolName>`. Its module exports `{ name, inject, Config, apply }` and
its `Config` is a union discriminated on `transport` (`"stdio"` | `"streamable-http"`).

The manager therefore **supervises real mcp-client child plugin instances**: for each enabled
entry of its own `servers` config it calls `ctx.plugin(<mcp-client>, <mcp-client config>)` on
its own context. The tools that then appear are ordinary MCP tools of this Harness — no
private protocol, no re-implementation of MCP.

The roster lives in this plugin row's own `config.servers` and is persisted through the
Harness `configEditor` service, which writes the profile patch (`cordis.patch.yml`) and
reconciles the Loader — i.e. the fleet survives a restart and is user-editable YAML.

## 1. Managed server shape (canonical, persisted)

```js
{
  name: string,                  // mcp serverName, /^[A-Za-z0-9_-]{1,32}$/, unique
  enabled: boolean,              // default true
  transport: "stdio" | "streamable-http",
  command: string,               // stdio only
  args: string[],                // stdio only, default []
  env: Record<string,string>,    // stdio only, default {}
  cwd: string,                   // stdio only, default ""
  url: string,                   // streamable-http only
  headers: Record<string,string>,// streamable-http only, default {}
  toolCallTimeoutMs: number,     // default 60000
  failOnStartupError: boolean    // default false
}
```

Normalization rules (`normalizeServer`): drop keys not relevant to the chosen transport,
default the rest, coerce `args` to string[], `env`/`headers` to string maps, clamp
`toolCallTimeoutMs` to a positive integer. Validation errors are returned, never thrown at
the plugin level.

Mapping to the child plugin config:

```js
// stdio
{ transport:"stdio", serverName:name, command, args, env, cwd,
  toolCallTimeoutMs, failOnStartupError }
// streamable-http
{ transport:"streamable-http", serverName:name, url, headers,
  toolCallTimeoutMs, failOnStartupError }
```

## 2. Host: `lib/index.js`

Module exports: `export const name = "mcp-manager"`, `export const inject = ["tools"]`,
`export async function apply(ctx, config)`. **Do not export `Config`** (no Schemastery
dependency; the roster is validated in code).

### 2.1 Spawning

```js
let mcpClientPromise
function loadMcpClient() {
  mcpClientPromise ??= import("@deepseek-ai/dsh-mcp-client").then((mod) => ({
    name: "mcp-client",
    inject: mod.inject,
    apply: mod.apply,
    Config: mod.Config,
  })).catch((error) => { mcpClientPromise = undefined; throw error })
  return mcpClientPromise
}
```

Lazy dynamic import is deliberate: if the bridge is missing, the manager still loads and
still lists `mcp__*` tools registered by any other mcp-client row; it reports the reason in
`capabilities`.

Per server, wrapped in `try/catch` (a child that fails must never kill the manager):

```js
const plugin = await loadMcpClient()
const disposer = ctx.plugin(plugin, toMcpClientConfig(server))
```

Track `Map<name, { disposer, startedAt, error }>`. Register every disposer with
`ctx.effect(...)` so plugin unload/reload tears the fleet down. Put the whole reconcile in
one `ctx.effect` whose cleanup disposes all children.

Never `await` child readiness (a hung server must not block activation). Never throw out of
`apply`.

### 2.2 Reading tool descriptors

`ctx.tools.schemas()` → `ToolSchema[]` (`{ name, description, parameters }`) for the global
view. Keep entries whose name matches `mcp__…__…`. Attribute a tool to a server by longest
configured `name` prefix (`mcp__<name>__`); otherwise split after the `mcp__` prefix at the
next `__` and use that token as the server label. `rawName` = the remainder after the
server prefix. `inputKeys` = `Object.keys(parameters?.properties ?? {})`.

Per server `toolCount` = number of attributed tools.

### 2.3 Derived per-server state

- `disabled` — `enabled === false`
- `error` — spawn threw; `error` carries the message
- `connected` — `toolCount > 0`
- `no-tools` — enabled and spawned but no tools registered yet (still connecting, a server
  that genuinely exposes none, or a silent failure)

Do not invent a "connected" signal that does not exist.

### 2.4 Agent tools (`ctx.tools.register`, plain ToolDefinition objects)

Register each inside `ctx.effect(...)`. Every definition is:

```js
{
  name, description, parameters,          // parameters = JSON-Schema object
  output: {
    schema: { type: "object", additionalProperties: true, properties: { } },
    render(_args, value) { return [{ type: "text", text: <readable text> }] },
  },
  async execute(args, exec) { /* return JSON value; throw Error for user-facing failure */ },
}
```

Tools (names and parameters are fixed):

| name | parameters | returns |
| --- | --- | --- |
| `mcp_manager_list` | `{}` | `{ servers:[...], capabilities }` — each server minus `tools` |
| `mcp_manager_add` | `{ name, transport, command?, args?, env?, cwd?, url?, headers?, enabled?, toolCallTimeoutMs?, failOnStartupError? }` | `{ server, servers }` |
| `mcp_manager_remove` | `{ name }` | `{ removed:name, servers }` |
| `mcp_manager_set_enabled` | `{ name, enabled }` | `{ server, servers }` |
| `mcp_manager_tools` | `{ server? }` | `{ tools:[...], servers:[{name,toolCount}] }` |

`mcp_manager_add` on an existing `name` replaces that entry (upsert). Persist first, then
return the fresh roster; a persistence failure must be reported as a tool error with the
`configEditor` reason, and the in-memory roster must not diverge from the persisted one.
Descriptions must be model-facing English, state exactly what changes, and mention that the
roster is shared with the Settings page.

### 2.5 Persistence

```js
function managerEntry() {
  const editor = ctx.get("configEditor")
  if (!editor || typeof editor.entries !== "function") return
  return editor.entries().find((entry) => entry.options?.name === "dsh-mcp-manager")
}

async function persistServers(servers) {
  const editor = ctx.get("configEditor")
  const entry = managerEntry()
  if (!editor || !entry) throw new Error("<actionable reason>")
  await editor.edit(entry, (current) => ({ ...current, servers }))
}
```

`configEditor.edit` writes the profile patch and reconciles the Loader, which disposes and
re-applies this plugin. Therefore: persist, do not await any respawn of your own, and do not
mutate in-memory state after the call. Wrap the call so a rejection surfaces as an error
message (the profile may be read-only or the row may be overridden by a home patch).

### 2.6 HTTP bridge for the Client half

`ctx.inject(["webServer"], (inner) => inner.webServer.register(route))` for each route, inside
an effect. Route shape: `{ kind: "exact", path, handler(req, res) }`. Copy the proven
`isLoopbackRequest` / `writeJson` / `readJsonBody` helpers from
`C:\Users\Xi\.dsh\plugins\dsh-free-search\lib\index.js` (search for `function isLoopbackRequest`,
`function writeJson`, `function readJsonBody`) — re-implement them locally, do not import that
package. Every route: POST only, loopback only, JSON body, `content-type: application/json`.

All routes answer `{ ok: true, value }` or `{ ok: false, code, message }` with HTTP 200 for
handled outcomes (400 for malformed JSON, 403/405 from the guard).

| path | body | value |
| --- | --- | --- |
| `/api/dsh-mcp-manager/state` | `{}` or empty | `{ servers, tools, capabilities }` |
| `/api/dsh-mcp-manager/upsert` | `{ server }` | `{ servers, tools }` |
| `/api/dsh-mcp-manager/remove` | `{ name }` | `{ servers, tools }` |
| `/api/dsh-mcp-manager/enabled` | `{ name, enabled }` | `{ servers, tools }` |
| `/api/dsh-mcp-manager/reconnect` | `{ name }` | `{ servers, tools }` |

`state` full payload:

```js
{
  servers: [{
    name, enabled, transport,
    command, args, env, cwd,                 // stdio
    url, headers,                            // streamable-http
    toolCallTimeoutMs, failOnStartupError,
    toolCount, state, error,                 // state as in 2.3, error?: string
  }],
  tools: [{ server, publicName, rawName, description, parameters, inputKeys }],
  capabilities: { spawn: boolean, persist: boolean, detail: string },
}
```

`upsert` / `remove` / `enabled` / `reconnect` persist through `configEditor` exactly like the
tools do, so the returned roster is the persisted one. `reconnect` does not persist; it
disposes and respawns that one child.

## 3. Client: `lib/client.js`

Browser module in the plain-JS loader form (copy the envelope from
`C:\Users\Xi\.dsh\plugins\dsh-free-search\lib\client.js`, lines 1–10 and the tail):

```js
window.__ModuleLoader__.load({
  id: "dsh-mcp-manager",
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports
    const React = require("react")
    const { jsx, jsxs } = require("react/jsx-runtime")
    // components...
    exports.inject = ["slots"]
    exports.apply = function apply(ctx) { /* slot registration */ }
    return module.exports
  },
})
```

No imports of Harness Client packages, no bundler, no JSX syntax (plain `jsx(...)` calls).

### 3.1 Slot

`settings.plugins.tab` (kind `list`, scope root): one page inside Settings → Plugins.
It currently has one occupant with `id: "all"`. Register:

```js
ctx.slots.inject("settings.plugins.tab", () =>
  ctx.slots.register(
    { name: "settings.plugins.tab", id: "mcp-servers", order: 40, label: () => t("tabLabel") },
    () => jsx(McpManagerPage, {}),
  ))
```

`label` is a thunk so it follows the active locale.

### 3.2 Data flow

`fetch('/api/dsh-mcp-manager/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })`
→ `{ ok, value }`. Same for the mutation routes. Keep relative URLs (same origin). Because the
bridge replies HTTP 200 with `ok:false`, always check `ok`, not `response.ok`.

After every mutation use the returned `{ servers, tools }` as the new state (do not refetch
unnecessarily). Show inline errors; never blank the page.

### 3.3 Page requirements

- Title + one-line description, Refresh, and an "Add server" primary action.
- Server cards. Each card shows: `name`, transport badge (`stdio` / `HTTP`), the endpoint
  (`command args` for stdio, `url` for HTTP), a state dot from `state`
  (`connected` / `no-tools` / `disabled` / `error`) with a localized label, the tool count,
  and actions: enable/disable switch (`role="switch"` + `aria-checked`), Reconnect, Edit,
  Remove (with a confirm step, not `window.confirm` unless you implement it as a two-click
  inline confirm).
- Expanding a card lists that server's tools: public name (monospace), description, and the
  input parameter names. Show a clear empty state per server and for the whole page.
- Add/Edit form: `name`, `transport` select, then transport-specific fields — stdio:
  `command`, `args` (one per line), `env` (`KEY=VALUE` per line), `cwd`; HTTP: `url`,
  `headers` (`Key: value` per line). Plus `enabled` checkbox and `toolCallTimeoutMs`.
  Client-side validation mirroring §1 (name pattern, required command/url). Save/Cancel.
- Remove/disable confirmations and error messages must be localized.
- Loading skeleton/spinner and a retry path when the bridge is unreachable (report it, do
  not crash).

### 3.4 Styling and locale

- Use only `--dsw-alias-*` theme tokens for colors, borders, and text; no literal palette
  colors, no `prefers-color-scheme` blocks. Query the exact token names with
  `cordis_inspect_query` `{ platform: "client", provider: "Theme", method: "listTokens" }`.
- Render the component-local `<style>` as a React element inside the page component so
  unmounting removes it (see `references/ui-plugin.md`); prefix classes `mcpm-`.
- Match the host's Settings look: compact rows, 13px body text, 12px meta text, 8px radii,
  subtle separators, host button/switch geometry.
- Locale: register `en` and `zh-CN` dictionaries through the Client locale service when it is
  available (`ctx.get("locale")`; `locale.register(ns, locale, dict)` then
  `locale.bind(ns)`), wrapped in try/catch, with a fallback that picks `zh` when
  `navigator.languages[0]` starts with `zh` and `en` otherwise. Every visible string,
  including `aria-label`s and error text, comes from the dictionary. Re-render on locale
  change if the service exposes `subscribe`.

## 4. Definition of done (both halves)

- `node --check lib/index.js` / `node --check lib/client.js` pass.
- No new runtime dependency beyond `@deepseek-ai/dsh-mcp-client` (host, dynamic import only)
  and the browser module table (`react`, `react/jsx-runtime`).
- No file writes outside your own file; no profile edits; no installs.
- Report back: what you implemented, the exact exported surface, anything in this contract you
  could not honor and why.
