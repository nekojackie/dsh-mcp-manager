# dsh-mcp-manager — OAuth addendum (v2)

Read `CONTRACT.md` first; v1 behaviour stays as shipped. This addendum adds **OAuth 2.1
authorization for `streamable-http` MCP servers**, so a server like Xmind (which publishes
`{"resource":"…","authorization_servers":[…],"required_scopes":["mcp:connect"]}` at
`/.well-known/oauth-protected-resource`) can be used without hand-copying a bearer token.

## 0. Why it is built here

`@deepseek-ai/dsh-mcp-client` supports only **static `headers`**. It has no token acquisition,
storage, refresh, or 401 retry. So the manager owns OAuth and injects the resulting
`Authorization: Bearer …` header into the child config it already builds.

Never write tokens into the plugin config or the profile patch. Tokens live in the Harness
credential store (`ctx.credentials`, a record of kind `grant`). The browser receives only
booleans, expiry, and scope.

## 1. Server config addition

```js
oauth: {
  enabled: boolean,            // default false
  scopes: string[],            // default [] → use the resource metadata's required scopes
  clientId: string,            // default "" → dynamic client registration (RFC 7591)
  clientSecret: string,        // default "" → public client (token_endpoint_auth_method "none")
  resourceMetadataUrl: string, // default "" → discover from the server URL
  authorizationServer: string, // default "" → use the resource metadata's authorization_servers[0]
}
```

Normalization: `oauth` may be absent (→ `{enabled:false}`). Reject `oauth.enabled:true` on a
`stdio` server (`oauth` is HTTP-only). Keep unknown keys out.

## 2. Credential record

Key: `credentialKey("mcp-manager", slug)` where `credentialKey` is `@deepseek-ai/dsh-credentials`'
grammar — a plain string `<scope>/<id>`, both segments matching `/^[a-z][a-z0-9-]*$/`. Import is
**not** needed: build the string yourself and validate both segments with that pattern.

`slug` = server name lowercased, characters outside `[a-z0-9-]` replaced by `-`, collapsed,
trimmed of leading/trailing `-`, prefixed with `s-` when it would not start with `[a-z]`.
Slugs must be stable for a given name and unique across the roster (append `-2`, `-3` on
collision, deterministically by roster order).

Record (via `ctx.credentials.modifyRecord(key, mutate)` / `readRecord` / `deleteRecord`):

```js
{ kind: "grant", payload: {
    v: 1,
    accessToken: string,
    tokenType: "Bearer",
    refreshToken?: string,
    scope?: string,
    expiresAt?: number,          // epoch ms; absent = non-expiring
    resource?: string,           // RFC 8707 resource indicator
    tokenEndpoint: string,
    authorizationServer?: string,
    clientId?: string,
    clientSecret?: string,       // only when the AS issued a confidential client
    obtainedAt: number,
} }
```

Every write goes through `modifyRecord` (serialized read-modify-write; that is what makes a
refresh safe). `payload` stays a plain JSON object.

## 3. Discovery and flow (implement in `lib/oauth.js`, node: builtins only)

Use `fetch` (global). All steps must honour an `AbortSignal`.

1. **Probe** (optional but recommended): `POST {url}` with
   `{jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"dsh-mcp-manager",version:"0.1.0"}}}`,
   headers `content-type: application/json`, `accept: application/json, text/event-stream`.
   Read `WWW-Authenticate`'s `resource_metadata` parameter when present; it overrides step 2's URL.
2. **Resource metadata**: `oauth.resourceMetadataUrl`, else `{origin}/.well-known/oauth-protected-resource`,
   else (on a non-200) `{origin}/.well-known/oauth-protected-resource{path}`. Fields:
   `resource`, `authorization_servers[0]`, `scopes_supported`.
3. **AS metadata**: `oauth.authorizationServer` or step 2's `authorization_servers[0]`; then
   `{as}/.well-known/oauth-authorization-server`, falling back to `{as}/.well-known/openid-configuration`.
   Fields used: `authorization_endpoint`, `token_endpoint`, `registration_endpoint`,
   `code_challenge_methods_supported`, `scopes_supported`, `token_endpoint_auth_methods_supported`.
   Require `S256` when advertised.
4. **Client registration**: `oauth.clientId` wins. Otherwise `POST registration_endpoint` with
   `{client_name:"DeepSeek Harness", redirect_uris:[redirectUri], grant_types:["authorization_code","refresh_token"], response_types:["code"], token_endpoint_auth_method:"none", scope}`.
   Accept `client_id` (and `client_secret` when returned). No `registration_endpoint` and no
   configured client id → a clear error naming both missing pieces (that is the "paste a token"
   fallback path, not a crash).
5. **PKCE**: verifier = 32 random bytes base64url; challenge = base64url(sha256(verifier)).
   `state` = 24 random bytes hex, single use.
6. **Authorization URL**: `authorization_endpoint` with `response_type=code`, `client_id`,
   `redirect_uri`, `scope` (config scopes, else `required_scopes`/`scopes_supported` from step 2/3,
   else omitted), `state`, `code_challenge`, `code_challenge_method=S256`, and `resource`
   (step 2's `resource`, else the server URL). Do not send `resource` when neither is known.
7. **Callback**: `GET {origin}/api/dsh-mcp-manager/oauth/callback?code&state[&error]`.
   Match `state` against the single pending attempt for that server, expiry 10 minutes, one use.
   On `error` → fail the attempt with the provider's `error_description`.
8. **Exchange**: `POST token_endpoint`, `grant_type=authorization_code`, `code`, `redirect_uri`,
   `client_id`, `code_verifier`, `resource`, plus `client_secret` when the client is confidential.
   Parse `{access_token, refresh_token, token_type, expires_in, scope}` → `expiresAt = now + expires_in*1000`.
9. **Refresh**: `grant_type=refresh_token`, `refresh_token`, `client_id`, `resource`, plus
   `client_secret`. Keep the old refresh token when the response omits one. A refresh that
   returns `invalid_grant` clears the stored record and reports `unauthorized`.
10. **Injection**: `readToken(server)` → record; when `expiresAt` is within 60 s or past and a
    `refreshToken` exists, refresh first (through `modifyRecord`), then return the access token.
    A failed refresh never throws out of spawn; it reports `error` in the auth state and the
    child spawns without an `Authorization` header.

Redirect URI is always `${webServer.getOrigin()}/api/dsh-mcp-manager/oauth/callback` and must be
built per attempt (the port changes between restarts), never persisted.

## 4. Auth state exposed to the client

```js
oauth: {
  enabled: boolean,
  authorized: boolean,          // a usable (or refreshable) token exists
  expiresAt: number | null,
  scope: string | null,
  client: "configured" | "dynamic" | null,
  error: string | null,         // last flow/refresh failure, cleared on success
}
```

Never include the token. `servers[].state` keeps its v1 meaning; `oauth.enabled && !authorized`
is *not* `error`, it is `no-tools` with `oauth.authorized:false`, so the UI can offer "Authorize".

## 5. HTTP bridge additions

All replies keep the v1 envelope and the loopback guard.

| method | path | body | value |
| --- | --- | --- | --- |
| POST | `/api/dsh-mcp-manager/oauth/authorize` | `{ name }` | `{ status:"pending", authorizationUrl }` or `{ status:"authorized" }` |
| POST | `/api/dsh-mcp-manager/oauth/paste-token` | `{ name, token }` | `{ authorized:true, expiresAt }` |
| POST | `/api/dsh-mcp-manager/oauth/refresh` | `{ name }` | `{ authorized, expiresAt }` |
| POST | `/api/dsh-mcp-manager/oauth/signout` | `{ name }` | `{ authorized:false }` |
| GET | `/api/dsh-mcp-manager/oauth/callback` | query | HTML page (see below) |

- `authorize` starts the attempt and returns the URL immediately; it must not block on the human.
- One attempt per server; a second call while pending answers `code:"authorization-in-flight"`.
- On a successful authorize/token/signout the affected child is disposed and respawned so the new
  header takes effect (same single-server path as `reconnect`).
- `paste-token` stores a grant with `expiresAt` absent (non-expiring) and the token endpoint when
  known (or empty). It is the escape hatch for servers without metadata/DCR.
- The callback route is **GET** and answers `text/html; charset=utf-8`: a one-line success or
  failure page (`<meta charset>`, no scripts, no external resources). Loopback guard applies
  (same-origin check is meaningless for a top-level navigation, so accept loopback remote address
  only and ignore `origin`/`sec-fetch-site` for this route).

## 6. Agent tool

One new tool, `mcp_manager_oauth`:

```
parameters: {
  type:"object", additionalProperties:false,
  properties: {
    name:   { type:"string", description:"Managed MCP server name." },
    action: { type:"string", enum:["status","authorize","signout","paste-token","refresh"] },
    token:  { type:"string", description:"Access token, only for action=paste-token." },
  },
  required:["name","action"],
}
```

`status` returns the auth view for that server; `authorize` returns the URL plus a note that a
human must open it; `signout`/`refresh` act immediately; `paste-token` stores the token and
respawns. Descriptions must say plainly that OAuth needs a human in a browser.

## 7. `lib/oauth.js` shape

Export a factory, no top-level side effects:

```js
export function createOAuthEngine(options) // { getCredentials, getWebServer, log }
// → {
//   slugOf(name), statusFor(server) /* sync view, best effort */,
//   async readStatus(server), async approveWithToken(server, token),
//   async authorize(server) → { status, authorizationUrl?, message? },
//   async handleCallback(query, origin) → { ok, html },
//   async refreshNow(server), async signOut(server),
//   async headerFor(server) → { header?: string, error?: string },
//   dispose(),
// }
```

`options.getCredentials()` and `options.getWebServer()` are lazy accessors (they may return
undefined); never capture services at module load.

## 8. Definition of done

- `node --check lib/oauth.js` and `node --check lib/index.js`.
- v1 behaviour unchanged when `oauth` is absent: same tools, same routes, same states.
- No token ever appears in `/state`, tool output, logs, or the profile patch.
- Report every deviation with its reason.
