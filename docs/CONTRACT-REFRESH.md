# dsh-mcp-manager — scheduled token refresh (v3 addendum)

Read `CONTRACT.md` and `CONTRACT-OAUTH.md` first; everything they say still holds. This adds a
**timer that renews OAuth access tokens before they expire**, so a long-lived connection does not
sit on an expired bearer token until the next spawn.

## 0. Why

Today a token is only renewed lazily, in `engine.headerFor()` at spawn time (60 s skew). A server
that stays connected keeps the token it was spawned with, so after the token expires every tool
call fails 401 until something respawns the child. Proactive renewal fixes that window.

## 1. Config (top-level fields of the plugin row, beside `servers`)

```js
refreshIntervalMs: number,  // default 300000 (5 min). 0 disables the timer. Clamp 1000..86400000.
refreshLeadMs: number,      // default 600000 (10 min). Renew when expiresAt - now <= lead. Clamp 1000..86400000.
```

Both are optional; validate/clamp in code (no `Config` export). Values below 60 s are for testing
only — say so in the README.

## 2. Timer

- One timer per plugin instance, owned by a `ctx.effect` whose cleanup clears it. `setTimeout` chain
  (re-arm after each tick), never `setInterval`; call `.unref?.()` on the handle.
- A tick that starts while the previous one is still running is skipped (guard flag).
- Per tick, for every roster entry that is `enabled === true`, `transport === "streamable-http"`,
  `oauth.enabled === true`, and whose stored grant has a `refreshToken` and a numeric `expiresAt`:
  - **due** when `expiresAt - Date.now() <= refreshLeadMs`;
  - refresh it with `oauthEngine.refreshNow(server)`. On success **respawn that one child**
    (`respawnAuth`) so the live connection carries the new token. On failure keep going; the engine
    already records `oauth.error` (`invalid_grant` clears the grant and reports unauthorized).
- Anything else is skipped without a network call: no due token, no grant, disabled server, stdio
  server, oauth disabled, or `refreshIntervalMs === 0`.
- A tick never throws out of the effect. Cap the whole tick at ~60 s (skip the rest and try again
  next time) so one slow authorization server cannot wedge the timer forever.

## 3. Manual "renew everything now"

New bridge route and tool action:

| surface | shape |
| --- | --- |
| `POST /api/dsh-mcp-manager/oauth/refresh-all` | body `{ force?: boolean }` → `{ checked, refreshed, failed, skipped, results:[{name, refreshed, error}] }` |
| tool `mcp_manager_oauth` | action `refresh-all`, `name` not required for this action |

`force: true` renews every eligible server **regardless of the lead window** (that is what the page
button sends). Without `force`, it applies the same due test as the timer. `checked` counts eligible
servers; `skipped` counts eligible ones that were not due.

Tool schema change: `required` becomes `["action"]`; every action except `refresh-all` still needs
`name`. Say that in the descriptions.

## 4. State exposure

`statePayload().capabilities.autoRefresh`:

```js
autoRefresh: {
  enabled: boolean,        // refreshIntervalMs > 0
  intervalMs: number,
  leadMs: number,
  lastRunAt: number | null,      // start of the last tick
  lastRefreshed: number,         // servers renewed by the last tick
  lastError: string | null,      // last tick-level failure (e.g. timer could not run)
  nextRunAt: number | null,      // lastRunAt + intervalMs, when enabled
}
```

`/state`, `/oauth/refresh-all`, and the tool all read the same object. Never include a token.

## 5. Client (only what is needed)

- One compact line in the page header area: 自动续期：每 N 分钟检查，提前 M 分钟续期（关闭时说明已关闭）
  plus `上次续期：<time>` / `下次检查：<time>` when present, and a **全部续期** button that POSTs
  `/oauth/refresh-all { force: true }`, shows a busy label, then applies the returned counts as an
  info line (`已续期 N 个 / 失败 M 个`) and re-syncs `/state`.
- No per-server change is required beyond what v2 already shows (过期时间). Keep the existing
  per-card 刷新令牌.
- New strings go into both dictionaries; tokens only; `mcpm-` classes.

## 6. Definition of done

- `node --check` on both host files and `lib/client.js`.
- Live proof with the local OAuth rig: `refreshIntervalMs` low + `refreshLeadMs` covering the token
  lifetime → the rig's `refreshes` counter increases **without any tool call or manual action**, the
  child is respawned, and `mcp__Rig__*` tools keep working afterwards.
- `refresh-all {force:true}` renews immediately; `{force:false}` skips a token that is not due.
- Disabling the timer (`refreshIntervalMs: 0`) stops all of it; cleanup leaves no timer behind.
- No token in `/state`, tool output, logs, or the profile patch.
