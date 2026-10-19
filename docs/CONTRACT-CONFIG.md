# dsh-mcp-manager — editable refresh policy + renewal after expiry (v4 addendum)

Everything in `CONTRACT.md`, `CONTRACT-OAUTH.md` and `CONTRACT-REFRESH.md` still holds. This adds
(a) a **settings surface** for the renewal policy instead of hand-editing YAML, and (b) renewal
that also fires **after a token has already expired**, not only inside the lead window.

## 1. Config additions (top level of the plugin row, beside `servers`)

```js
refreshIntervalMs: number,   // unchanged: default 300000, 0 disables, clamp 1000..86400000
refreshLeadMs: number,       // unchanged: default 600000, clamp 1000..86400000
refreshOnExpiry: boolean,    // NEW: default true
```

`refreshOnExpiry` enables the two reactive paths in §3. Normalize/validate in code; a missing or
non-boolean value means `true`.

## 2. Settings route (new)

`POST /api/dsh-mcp-manager/config`

- body: `{ refreshIntervalMs?: number, refreshLeadMs?: number, refreshOnExpiry?: boolean }` (all optional)
- validates and clamps exactly like normalization, rejects a body with none of the three keys
  (`code:"invalid-body"`), persists through the SAME `configEditor.edit` path the roster uses
  (`{ ...current, refreshIntervalMs, refreshLeadMs, refreshOnExpiry }` — never drop `servers`),
  then returns `{ refreshIntervalMs, refreshLeadMs, refreshOnExpiry }`.
- a persistence failure is a tool-level error with the reason (`persistence-unavailable` /
  `persistence-failed`), same as the roster routes.
- **It reloads the plugin** (configEditor reconciles). So: persist, then return the accepted values
  without touching in-memory state afterwards.

`capabilities.autoRefresh` gains `refreshOnExpiry` and `lastRunKind`:

```js
autoRefresh: {
  enabled, intervalMs, leadMs, refreshOnExpiry,   // policy (the source of truth for the UI form)
  lastRunAt, lastRefreshed, lastError, nextRunAt, // unchanged
  lastRunKind: "timer" | "expiry" | "manual" | null,
}
```

## 3. Renewal after expiry (two reactive paths)

(a) **Timer covers expired tokens explicitly.** A grant with a refresh token whose `expiresAt` is
already in the past is ALWAYS due on the next tick, even when `readStatus()` would call it
unauthorized. Treat "expired but refreshable" as the strongest due signal.

(b) **Failure-triggered self-heal.** When `refreshOnExpiry` is true, listen on the Host event
`tools/result`:

```js
ctx.on("tools/result", (exec, result) => { ... })
```

- Ignore anything whose `exec.name` does not match `mcp__<managedServerName>__`.
- Ignore successes (`result.isError !== true`) and any error text that does not look like an
  authorization failure — match `/401|403|unauthor|invalid[_-]?token|token.{0,12}expired|expired.{0,12}token|missing.{0,12}token|bearer/i`
  against `result.error?.message` and the collected text content.
- For a matching failure: `oauthEngine.refreshNow(server)` then `respawnAuth(server)`.
- Guards: per-server cooldown 30 s (never more than one self-heal per server per 30 s), a max of
  3 consecutive self-heal attempts per server, and exponential backoff (30 s, 60 s, 120 s) while the
  refresh keeps failing. Clear the counter after a successful refresh.
- The listener must never throw and must never await inside the emit (start the work with `void`).

(c) **Fast retry after any failed renewal.** When a renewal fails for a server (timer path or
self-heal), re-check that server after `min(30000 * 2^consecutiveFailures, max(30000, refreshIntervalMs))`
instead of waiting the full interval. One successful renewal resets the counter. This is a
per-server `nextAttemptAt`; the global tick schedule is unchanged.

## 4. Settings UI (client)

A collapsible **自动续期设置** block on the MCP Servers page (above the server list, below the
header), driven by `capabilities.autoRefresh`:

- switch 启用自动续期 (maps to interval > 0; turning it off persists `refreshIntervalMs: 0` and
  remembers nothing),
- number input 检查间隔（秒） — seconds, min 1, max 86400, prefilled from `intervalMs/1000`,
- number input 提前续期（秒） — seconds, min 1, max 86400, prefilled from `leadMs/1000`,
- switch 过期后仍自动续期 — `refreshOnExpiry`,
- 保存 button → `POST /config` with the three values converted back to ms (or `0` for a disabled
  interval); 恢复默认 button → 300000 / 600000 / true; both with a busy label,
- after a successful save show "已保存，插件正在重载…" and then re-sync `/state` (retry a few times
  over ~10 s, because the reload briefly disposes the plugin);
- validation errors are inline and localized; when `capabilities.autoRefresh` is absent render nothing.

Every new string goes into the en + zh-CN dictionaries; tokens only; `mcpm-` classes.

## 5. Definition of done

- `node --check` on `lib/index.js` and `lib/client.js`.
- Live proof with the local OAuth rig: an **already expired** grant is renewed by the next tick
  without any manual action; a forced 401-style tool failure triggers a self-heal refresh (cooldown
  respected); `POST /config` changes the interval/lead/on-expiry, persists to the profile patch and
  the new values appear in `capabilities.autoRefresh` after the reload.
- No token anywhere; v1-v3 behaviour unchanged when the new keys are absent.
