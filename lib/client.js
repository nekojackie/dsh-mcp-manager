window.__ModuleLoader__.load({
  id: "dsh-mcp-manager",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const { jsx, jsxs } = require("react/jsx-runtime");

    // #region styles
    // Only --dsw-alias-* tokens are used for colors, borders and text. No literal
    // palette colors and no prefers-color-scheme blocks: the host owns light/dark.
    const CSS = `
.mcpm-root{display:flex;flex-direction:column;gap:14px;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.mcpm-root,.mcpm-root *{box-sizing:border-box}
.mcpm-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;min-width:0}
.mcpm-headText{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1 1 240px}
.mcpm-title{margin:0;font-size:16px;line-height:24px;font-weight:600;color:var(--dsw-alias-label-primary)}
.mcpm-desc{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.mcpm-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:none}
.mcpm-btn{font:inherit;font-size:13px;line-height:20px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:background .15s ease,border-color .15s ease,color .15s ease;max-width:100%}
.mcpm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.mcpm-btn:active:not(:disabled){transform:scale(.98)}
.mcpm-btn:disabled{opacity:.5;cursor:default}
.mcpm-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.mcpm-btnPrimary{border-color:var(--dsw-alias-button-primary-fill);background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted)}
.mcpm-btnPrimary:hover:not(:disabled){border-color:var(--dsw-alias-button-primary-hover);background:var(--dsw-alias-button-primary-hover)}
.mcpm-btnSmall{height:26px;padding:0 9px;font-size:12px;line-height:18px}
.mcpm-btnDanger{color:var(--dsw-alias-label-error)}
.mcpm-btnDanger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
.mcpm-btnDangerSolid{border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-inverted)}
.mcpm-summary{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.mcpm-autoRefresh{display:flex;align-items:center;gap:4px 12px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;min-width:0}
.mcpm-autoRefreshError{color:var(--dsw-alias-label-error);word-break:break-word}
.mcpm-banner{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-l2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.mcpm-bannerWarn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-label)}
.mcpm-bannerError{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-error)}
.mcpm-bannerText{flex:1 1 200px;min-width:0;word-break:break-word;display:flex;flex-direction:column;gap:2px}
.mcpm-bannerActions{display:flex;align-items:center;gap:6px;flex:none;flex-wrap:wrap}
.mcpm-capDetail{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);word-break:break-word}
.mcpm-list{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none;min-width:0}
.mcpm-card{border:1px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);border-radius:8px;overflow:hidden;min-width:0}
.mcpm-cardHead{display:flex;align-items:center;gap:10px;padding:10px 12px;flex-wrap:wrap;min-width:0}
.mcpm-cardMain{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 240px}
.mcpm-nameRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.mcpm-name{font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mcpm-badge{font-size:11px;line-height:16px;font-weight:500;padding:0 6px;border-radius:4px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-fill-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.mcpm-state{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.mcpm-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-label-tertiary)}
.mcpm-dotConnected{background:var(--dsw-alias-state-success-primary)}
.mcpm-dotNoTools{background:var(--dsw-alias-state-warn-primary)}
.mcpm-dotDisabled{background:var(--dsw-alias-label-tertiary)}
.mcpm-dotError{background:var(--dsw-alias-state-error-primary)}
.mcpm-endpoint{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mcpm-serverError{font-size:12px;line-height:18px;color:var(--dsw-alias-label-error);word-break:break-word}
.mcpm-cardActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:none}
.mcpm-count{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-variant-numeric:tabular-nums}
.mcpm-connecting{display:inline-flex;align-items:center;gap:5px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary);white-space:nowrap}
.mcpm-connectingDot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-warn-primary);animation:mcpm-authPulse 1.2s ease-in-out infinite}
.mcpm-switch{position:relative;flex:none;width:32px;height:18px;padding:0;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-fill-l2);cursor:pointer;transition:background .15s ease,border-color .15s ease}
.mcpm-switch[aria-checked="true"]{border-color:var(--dsw-alias-button-primary-fill);background:var(--dsw-alias-button-primary-fill)}
.mcpm-switch:disabled{opacity:.5;cursor:default}
.mcpm-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.mcpm-thumb{position:absolute;top:1px;left:1px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-switch-thumb);transition:transform .15s ease}
.mcpm-switch[aria-checked="true"] .mcpm-thumb{transform:translateX(14px)}
.mcpm-confirmRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-l2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.mcpm-confirmText{flex:1 1 200px;min-width:0;word-break:break-word}
.mcpm-tools{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-l1);padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-width:0}
.mcpm-toolsHead{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.mcpm-toolsTitle{font-size:11px;line-height:16px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.mcpm-toolList{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;min-width:0}
.mcpm-tool{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);padding:8px 10px;display:flex;flex-direction:column;gap:4px;min-width:0}
.mcpm-toolName{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);word-break:break-all}
.mcpm-toolDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.mcpm-toolMeta{display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);min-width:0}
.mcpm-toolMetaLabel{flex:none;font-weight:500;color:var(--dsw-alias-label-tertiary)}
.mcpm-params{display:flex;align-items:center;flex-wrap:wrap;gap:4px;min-width:0}
.mcpm-param{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:16px;padding:0 6px;border-radius:4px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-fill-l1);color:var(--dsw-alias-label-secondary);word-break:break-all}
.mcpm-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 14px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.mcpm-emptyTitle{font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.mcpm-emptyInline{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);padding:2px 0}
.mcpm-errorDetail{max-width:100%;word-break:break-word;color:var(--dsw-alias-label-error)}
.mcpm-skeletonList{display:flex;flex-direction:column;gap:10px}
.mcpm-skeleton{height:64px;border-radius:8px;background:var(--dsw-alias-bg-skeleton)}
.mcpm-form{border:1px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:12px;min-width:0}
.mcpm-formTitle{margin:0;font-size:14px;line-height:22px;font-weight:600;color:var(--dsw-alias-label-primary)}
.mcpm-formGrid{display:flex;flex-direction:column;gap:10px;min-width:0}
.mcpm-formRow{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;min-width:0}
.mcpm-formRow>.mcpm-field{flex:1 1 220px}
.mcpm-formRow>.mcpm-fieldSmall{flex:0 1 170px}
.mcpm-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.mcpm-label{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.mcpm-input,.mcpm-select,.mcpm-textarea{font:inherit;font-size:13px;line-height:20px;width:100%;min-width:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-fill-l1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 10px;height:32px}
.mcpm-textarea{height:auto;min-height:64px;padding:6px 10px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:18px}
.mcpm-input:focus-visible,.mcpm-select:focus-visible,.mcpm-textarea:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-1px}
.mcpm-input:disabled,.mcpm-select:disabled,.mcpm-textarea:disabled{opacity:.5;cursor:default}
.mcpm-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.mcpm-fieldError{font-size:12px;line-height:18px;color:var(--dsw-alias-label-error)}
.mcpm-check{display:inline-flex;align-items:center;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);cursor:pointer;user-select:none;padding-top:20px}
.mcpm-check input{width:16px;height:16px;accent-color:var(--dsw-alias-button-primary-fill)}
.mcpm-check input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.mcpm-formActions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.mcpm-auth{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-l2);padding:8px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}
.mcpm-authHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.mcpm-authTitle{font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.mcpm-authBadge{font-size:11px;line-height:16px;font-weight:500;padding:0 6px;border-radius:4px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-fill-l1);color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.mcpm-authBadgeAuthorized{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.mcpm-authBadgeExpired{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.mcpm-authMeta{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);word-break:break-word}
.mcpm-authError{font-size:12px;line-height:18px;color:var(--dsw-alias-label-error);word-break:break-word}
.mcpm-authActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mcpm-authWaiting{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.mcpm-authPulse{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-business-primary);animation:mcpm-authPulse 1.2s ease-in-out infinite}
@keyframes mcpm-authPulse{0%,100%{opacity:.35}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.mcpm-authPulse{animation:none}}
.mcpm-tokenForm{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.mcpm-tokenInput{width:auto;flex:1 1 180px;max-width:260px}
.mcpm-tokenError{flex-basis:100%;font-size:12px;line-height:18px;color:var(--dsw-alias-label-error);word-break:break-word}
.mcpm-link{font-size:12px;line-height:18px;color:var(--dsw-alias-link);text-decoration:none;white-space:nowrap}
.mcpm-link:hover{text-decoration:underline}
.mcpm-link:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.mcpm-bannerInfo{border-color:var(--dsw-alias-state-business-primary)}
.mcpm-oauthSection{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-l1);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-width:0}
.mcpm-oauthTitle{font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.mcpm-oauthFields{display:flex;flex-direction:column;gap:10px;min-width:0}
.mcpm-oauthSecretActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:-4px}
.mcpm-checkInline{padding-top:0}
.mcpm-advanced{border-top:1px solid var(--dsw-alias-border-l2);padding-top:8px}
.mcpm-advancedSummary{cursor:pointer;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary);padding:2px 0;user-select:none}
.mcpm-advancedSummary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
@media (max-width:520px){.mcpm-header{flex-direction:column;align-items:stretch}.mcpm-actions{justify-content:flex-start}.mcpm-cardActions{width:100%}}
.mcpm-policy{border:1px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);border-radius:8px;padding:0 12px;min-width:0}
.mcpm-policy[open]{padding-bottom:12px}
.mcpm-policySummary{cursor:pointer;font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary);padding:10px 0;user-select:none}
.mcpm-policySummary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.mcpm-policyGrid{display:flex;flex-direction:column;gap:10px;min-width:0}
.mcpm-policyRow{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;min-width:0}
.mcpm-policyRow>.mcpm-field{flex:1 1 160px}
.mcpm-policyActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mcpm-policyError{font-size:12px;line-height:18px;color:var(--dsw-alias-label-error);word-break:break-word}
.mcpm-policyNote{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);word-break:break-word}
.mcpm-policyHint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);word-break:break-word}
`;
    // #endregion

    // #region constants
    const NS = "dsh-mcp-manager";
    const BRIDGE_PREFIX = "/api/dsh-mcp-manager";
    const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
    // OAuth waiting state: poll the bridge while a browser flow is pending.
    const OAUTH_POLL_MS = 2000;
    const OAUTH_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
    // Settle polling after a mutating action: the host respawns the child, and the
    // MCP handshake + initial tool sync finish a few seconds later.
    const SETTLE_POLL_MS = 1500;
    const SETTLE_TIMEOUT_MS = 40 * 1000;
    // #endregion

    // #region dictionary
    // One dictionary with `en` and `zh-CN` entries. Every visible string, including
    // aria-labels and error text, is looked up here through t().
    const DICTS = {
      en: {
        tabLabel: "MCP Servers",
        pageDescription: "Connect MCP servers and inspect every tool they expose.",
        summary: "{servers} servers · {tools} tools",
        refresh: "Refresh",
        refreshing: "Refreshing…",
        addServer: "Add server",
        retry: "Retry",
        dismiss: "Dismiss",
        loading: "Loading MCP servers…",
        loadFailed: "Couldn't load MCP servers.",
        loadFailedDetail: "Couldn't load MCP servers: {message}",
        bridgeUnreachable: "The MCP manager bridge is unreachable.",
        invalidResponse: "The bridge returned an unreadable response.",
        actionFailed: "Action failed: {message}",
        stateConnected: "Connected",
        stateNoTools: "No tools",
        stateDisabled: "Disabled",
        stateError: "Error",
        transportStdio: "stdio",
        transportHttp: "HTTP",
        toolsCount: "{count} tools",
        toolsHeading: "Tools",
        inputsLabel: "Inputs",
        noInputs: "No input parameters.",
        noDescription: "No description provided.",
        noToolsForServer: "This server exposes no tools yet. If it was just started, refresh in a moment.",
        noServersTitle: "No MCP servers yet",
        noServersHint: "Use “Add server” to connect a stdio command or a streamable HTTP endpoint.",
        noEndpoint: "No endpoint configured",
        edit: "Edit",
        reconnect: "Reconnect",
        remove: "Remove",
        confirmRemove: "Remove server",
        removePrompt: "Remove “{name}”? Its tools disappear immediately.",
        cancel: "Cancel",
        save: "Save",
        saving: "Saving…",
        fieldEnabled: "Enabled",
        expandTools: "Show tools for {name}",
        collapseTools: "Hide tools for {name}",
        formAddTitle: "Add MCP server",
        formEditTitle: "Edit MCP server",
        fieldName: "Name",
        fieldTransport: "Transport",
        fieldTimeout: "Tool call timeout (ms)",
        fieldCommand: "Command",
        fieldArgs: "Arguments",
        fieldEnv: "Environment",
        fieldCwd: "Working directory",
        fieldUrl: "URL",
        fieldHeaders: "Headers",
        hintName: "1–32 letters, digits, “_” or “-”.",
        hintArgs: "One argument per line.",
        hintEnv: "One KEY=VALUE pair per line.",
        hintHeaders: "One Key: value pair per line.",
        hintTimeout: "Positive integer in milliseconds. Default 60000.",
        validationNameRequired: "Name is required.",
        validationNameInvalid: "Name must be 1–32 letters, digits, “_” or “-”.",
        validationCommandRequired: "Command is required for stdio.",
        validationUrlRequired: "URL is required for HTTP.",
        validationTimeout: "Timeout must be a positive integer.",
        validationEnv: "Each environment line must be KEY=VALUE.",
        validationHeaders: "Each header line must be Key: value.",
        capabilitySpawnMissing: "Server spawning is unavailable; already registered MCP tools stay visible.",
        capabilityPersistMissing: "Saving the roster is unavailable; changes may not survive a restart.",
        oauthLabel: "OAuth",
        oauthAuthorized: "Authorized",
        oauthUnauthorized: "Not authorized",
        oauthExpired: "Expired",
        oauthExpires: "Expires {time}",
        oauthScope: "Scope: {scope}",
        oauthErrorPrefix: "OAuth error",
        oauthAuthorize: "Authorize (browser)",
        oauthPasteToken: "Paste token",
        oauthRefreshToken: "Refresh token",
        oauthSignOut: "Sign out",
        oauthWaiting: "Waiting for the browser…",
        oauthOpenLink: "Open authorization page",
        oauthCancelWait: "Stop waiting",
        oauthWaitStopped: "Stopped waiting for the browser.",
        oauthBrowserOpened: "Browser opened — finish authorization there.",
        oauthAuthorizeStarted: "Authorization started. Follow the instructions to continue.",
        oauthInFlight: "Authorization is already in progress in the browser.",
        oauthAuthorizedInfo: "Authorization completed.",
        oauthWaitTimeout: "Timed out waiting for the browser. Try again or paste a token.",
        oauthTokenLabel: "Token",
        oauthTokenRequired: "Enter a token.",
        oauthSaveToken: "Save token",
        oauthTokenSaved: "Token saved.",
        oauthPasteFailed: "Could not save the token: {message}",
        oauthRefreshed: "Token refreshed.",
        oauthRefreshUnauthorized: "Refresh did not authorize the server. Sign in again.",
        oauthSignedOut: "Signed out.",
        oauthFormTitle: "OAuth",
        oauthUse: "Use OAuth authorization",
        oauthFieldClientId: "Client ID",
        oauthFieldScopes: "Scopes",
        oauthHintScopes: "Space or comma separated; empty uses the server's required scopes.",
        oauthHintClientId: "Empty uses dynamic client registration.",
        oauthAdvanced: "Advanced",
        oauthFieldClientSecret: "Client secret",
        oauthSecretSetHint: "Saved — leave empty to keep it",
        oauthClearSecret: "Clear",
        oauthSecretWillClear: "The saved secret is cleared when you save.",
        oauthFieldResourceMetadata: "Resource metadata URL",
        oauthHintResourceMetadata: "Empty discovers it from the server URL.",
        oauthHintStdio: "OAuth is only available for streamable HTTP servers.",
        stateConnecting: "Connecting…",
        refreshServer: "Refresh {name}",
        durationMinutes: "{count} min",
        durationSeconds: "{count} s",
        autoRefreshLine: "Auto refresh: check every {interval}, renew {lead} ahead",
        autoRefreshOff: "Auto refresh: off (refreshIntervalMs = 0)",
        autoRefreshLast: "Last refresh: {time}",
        autoRefreshNext: "Next check: {time}",
        autoRefreshError: "Auto refresh error: {error}",
        refreshAll: "Renew all",
        refreshAllBusy: "Renewing all…",
        refreshAllSummary: "Renewed {refreshed} / failed {failed}",
        refreshAllFailedNames: "Failed: {names}",
        policyTitle: "Auto refresh settings",
        policyEnabled: "Enable auto refresh",
        policyInterval: "Check interval (seconds)",
        policyLead: "Renew ahead (seconds)",
        policyOnExpiry: "Renew even after expiry",
        policyOnExpiryHint: "When an MCP call fails as unauthorized, renew the token and reconnect that server once.",
        policySave: "Save",
        policySaving: "Saving…",
        policyRestore: "Restore defaults",
        policySaved: "Saved — the plugin is reloading…",
        policyUpdated: "Auto refresh settings updated.",
        policyFailed: "Could not save: {message}",
        policyValidation: "Enter a whole number of seconds between {min} and {max}.",
        policyKindTimer: "timer",
        policyKindExpiry: "after expiry",
        policyKindManual: "manual",
        policyLastKind: "Last renewal trigger: {kind}",
      },
      "zh-CN": {
        tabLabel: "MCP 服务器",
        pageDescription: "连接 MCP 服务器，查看它们提供的全部工具。",
        summary: "{servers} 个服务器 · {tools} 个工具",
        refresh: "刷新",
        refreshing: "刷新中…",
        addServer: "添加服务器",
        retry: "重试",
        dismiss: "关闭",
        loading: "正在加载 MCP 服务器…",
        loadFailed: "无法加载 MCP 服务器。",
        loadFailedDetail: "无法加载 MCP 服务器：{message}",
        bridgeUnreachable: "无法连接 MCP 管理器桥接。",
        invalidResponse: "桥接返回了无法解析的响应。",
        actionFailed: "操作失败：{message}",
        stateConnected: "已连接",
        stateNoTools: "无工具",
        stateDisabled: "已禁用",
        stateError: "错误",
        transportStdio: "stdio",
        transportHttp: "HTTP",
        toolsCount: "{count} 个工具",
        toolsHeading: "工具",
        inputsLabel: "输入参数",
        noInputs: "无输入参数。",
        noDescription: "暂无描述。",
        noToolsForServer: "该服务器尚未提供工具。若刚启动，请稍后刷新。",
        noServersTitle: "还没有 MCP 服务器",
        noServersHint: "使用“添加服务器”连接 stdio 命令或 streamable HTTP 端点。",
        noEndpoint: "未配置端点",
        edit: "编辑",
        reconnect: "重新连接",
        remove: "删除",
        confirmRemove: "删除服务器",
        removePrompt: "删除“{name}”？其工具将立即消失。",
        cancel: "取消",
        save: "保存",
        saving: "保存中…",
        fieldEnabled: "已启用",
        expandTools: "显示 {name} 的工具",
        collapseTools: "隐藏 {name} 的工具",
        formAddTitle: "添加 MCP 服务器",
        formEditTitle: "编辑 MCP 服务器",
        fieldName: "名称",
        fieldTransport: "传输方式",
        fieldTimeout: "工具调用超时（毫秒）",
        fieldCommand: "命令",
        fieldArgs: "参数",
        fieldEnv: "环境变量",
        fieldCwd: "工作目录",
        fieldUrl: "URL",
        fieldHeaders: "请求头",
        hintName: "1–32 个字母、数字、“_”或“-”。",
        hintArgs: "每行一个参数。",
        hintEnv: "每行一个 KEY=VALUE。",
        hintHeaders: "每行一个 Key: value。",
        hintTimeout: "正整数，单位毫秒。默认 60000。",
        validationNameRequired: "名称为必填项。",
        validationNameInvalid: "名称须为 1–32 个字母、数字、“_”或“-”。",
        validationCommandRequired: "stdio 传输需要命令。",
        validationUrlRequired: "HTTP 传输需要 URL。",
        validationTimeout: "超时必须为正整数。",
        validationEnv: "每行环境变量须为 KEY=VALUE。",
        validationHeaders: "每行请求头须为 Key: value。",
        capabilitySpawnMissing: "无法启动服务器；已注册的 MCP 工具仍会显示。",
        capabilityPersistMissing: "无法保存服务器清单；更改可能在重启后丢失。",
        oauthLabel: "OAuth",
        oauthAuthorized: "已授权",
        oauthUnauthorized: "未授权",
        oauthExpired: "已过期",
        oauthExpires: "过期时间：{time}",
        oauthScope: "范围：{scope}",
        oauthErrorPrefix: "OAuth 错误",
        oauthAuthorize: "授权（浏览器）",
        oauthPasteToken: "粘贴令牌",
        oauthRefreshToken: "刷新令牌",
        oauthSignOut: "退出授权",
        oauthWaiting: "等待浏览器完成…",
        oauthOpenLink: "打开授权页面",
        oauthCancelWait: "停止等待",
        oauthWaitStopped: "已停止等待浏览器。",
        oauthBrowserOpened: "已打开浏览器，请在那里完成授权。",
        oauthAuthorizeStarted: "授权已开始，请按提示继续。",
        oauthInFlight: "浏览器中的授权正在进行中。",
        oauthAuthorizedInfo: "授权已完成。",
        oauthWaitTimeout: "等待浏览器超时。请重试或粘贴令牌。",
        oauthTokenLabel: "令牌",
        oauthTokenRequired: "请输入令牌。",
        oauthSaveToken: "保存令牌",
        oauthTokenSaved: "令牌已保存。",
        oauthPasteFailed: "保存令牌失败：{message}",
        oauthRefreshed: "令牌已刷新。",
        oauthRefreshUnauthorized: "刷新未能授权服务器，请重新授权。",
        oauthSignedOut: "已退出授权。",
        oauthFormTitle: "OAuth",
        oauthUse: "使用 OAuth 授权",
        oauthFieldClientId: "客户端 ID",
        oauthFieldScopes: "授权范围",
        oauthHintScopes: "以空格或逗号分隔；留空则使用服务器要求的范围。",
        oauthHintClientId: "留空则使用动态客户端注册。",
        oauthAdvanced: "高级",
        oauthFieldClientSecret: "客户端密钥",
        oauthSecretSetHint: "已保存（留空则保持不变）",
        oauthClearSecret: "清除",
        oauthSecretWillClear: "保存后将清除已保存的密钥。",
        oauthFieldResourceMetadata: "资源元数据 URL",
        oauthHintResourceMetadata: "留空则从服务器 URL 自动发现。",
        oauthHintStdio: "OAuth 仅适用于 streamable HTTP 服务器。",
        stateConnecting: "正在连接…",
        refreshServer: "刷新 {name}",
        durationMinutes: "{count} 分钟",
        durationSeconds: "{count} 秒",
        autoRefreshLine: "自动续期：每 {interval}检查，提前 {lead}续期",
        autoRefreshOff: "自动续期：已关闭（refreshIntervalMs = 0）",
        autoRefreshLast: "上次续期：{time}",
        autoRefreshNext: "下次检查：{time}",
        autoRefreshError: "自动续期错误：{error}",
        refreshAll: "全部续期",
        refreshAllBusy: "全部续期中…",
        refreshAllSummary: "已续期 {refreshed} 个 / 失败 {failed} 个",
        refreshAllFailedNames: "失败：{names}",
        policyTitle: "自动续期设置",
        policyEnabled: "启用自动续期",
        policyInterval: "检查间隔（秒）",
        policyLead: "提前续期（秒）",
        policyOnExpiry: "过期后仍自动续期",
        policyOnExpiryHint: "MCP 调用被判定为未授权时，自动换新令牌并重连该服务器一次。",
        policySave: "保存",
        policySaving: "保存中…",
        policyRestore: "恢复默认",
        policySaved: "已保存，插件正在重载…",
        policyUpdated: "自动续期设置已更新。",
        policyFailed: "保存失败：{message}",
        policyValidation: "请输入 {min}–{max} 之间的整数秒。",
        policyKindTimer: "定时",
        policyKindExpiry: "过期后自愈",
        policyKindManual: "手动",
        policyLastKind: "上次续期触发：{kind}",
      },
    };
    // The built-in client locale ids are `zh` and `en`; `zh` is registered with the
    // same Chinese entries as `zh-CN` so bind() resolves the active locale.
    const LOCALE_DICTS = {
      en: DICTS.en,
      "zh-CN": DICTS["zh-CN"],
      zh: DICTS["zh-CN"],
    };
    // #endregion

    // #region locale plumbing
    let localeService = null;
    let boundT = null;

    function detectLocale() {
      try {
        if (localeService && typeof localeService.getSnapshot === "function") {
          const snapshot = localeService.getSnapshot();
          const active = snapshot && snapshot.active;
          if (typeof active === "string" && active) {
            return active.toLowerCase().indexOf("zh") === 0 ? "zh-CN" : "en";
          }
        }
      } catch (error) {
        // fall through to the browser heuristic
      }
      try {
        const languages = (typeof navigator !== "undefined" && navigator.languages) || [];
        const first = languages[0] || (typeof navigator !== "undefined" ? navigator.language : "") || "";
        return String(first).toLowerCase().indexOf("zh") === 0 ? "zh-CN" : "en";
      } catch (error) {
        return "en";
      }
    }

    function plainT(key, params) {
      const dict = DICTS[detectLocale()] || DICTS.en;
      let template = dict[key];
      if (template === undefined) template = DICTS.en[key];
      if (template === undefined) template = key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    }

    function t(key, params) {
      if (boundT) {
        try {
          const value = boundT(key, params);
          if (typeof value === "string" && value !== key) return value;
        } catch (error) {
          // fall back to the local dictionary
        }
      }
      return plainT(key, params);
    }

    function initLocale(ctx) {
      try {
        localeService = ctx.get("locale") || null;
      } catch (error) {
        localeService = null;
      }
      if (!localeService) return;
      try {
        if (typeof localeService.bind === "function") boundT = localeService.bind(NS);
      } catch (error) {
        boundT = null;
      }
      try {
        ctx.effect(() => {
          const dispose = localeService.register(NS, LOCALE_DICTS);
          return () => {
            try {
              dispose();
            } catch (error) {
              // dictionary already gone
            }
          };
        }, "dsh-mcp-manager: locale dictionaries");
      } catch (error) {
        // registration is best effort; plainT still serves every string
      }
    }
    // #endregion

    // #region bridge
    async function postBridge(route, payload) {
      let response;
      try {
        response = await fetch(BRIDGE_PREFIX + "/" + route, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload || {}),
        });
      } catch (error) {
        throw new Error(t("bridgeUnreachable"));
      }
      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new Error(t("invalidResponse"));
      }
      if (!data || typeof data !== "object") throw new Error(t("invalidResponse"));
      return data;
    }

    function bridgeMessage(result) {
      if (result && typeof result.message === "string" && result.message) return result.message;
      return t("bridgeUnreachable");
    }

    function errorMessage(error) {
      if (error && typeof error.message === "string" && error.message) return error.message;
      return t("bridgeUnreachable");
    }
    // #endregion

    // #region data helpers
    function asArray(value) {
      return Array.isArray(value) ? value : [];
    }

    function serverState(server) {
      const raw = server && typeof server.state === "string" ? server.state : "";
      if (raw === "connected" || raw === "no-tools" || raw === "disabled" || raw === "error") return raw;
      if (server && server.enabled === false) return "disabled";
      if (server && typeof server.error === "string" && server.error) return "error";
      if (server && Number(server.toolCount) > 0) return "connected";
      return "no-tools";
    }

    const STATE_LABEL_KEY = {
      connected: "stateConnected",
      "no-tools": "stateNoTools",
      disabled: "stateDisabled",
      error: "stateError",
    };
    const STATE_DOT_CLASS = {
      connected: "mcpm-dotConnected",
      "no-tools": "mcpm-dotNoTools",
      disabled: "mcpm-dotDisabled",
      error: "mcpm-dotError",
    };

    function toolCountOf(server, tools) {
      const count = Number(server && server.toolCount);
      if (Number.isFinite(count) && count >= 0) return count;
      return tools.length;
    }

    function endpointOf(server) {
      if (!server) return "";
      if (server.transport === "streamable-http") {
        return typeof server.url === "string" ? server.url : "";
      }
      const command = typeof server.command === "string" ? server.command : "";
      const args = asArray(server.args).filter((arg) => typeof arg === "string" && arg !== "");
      return [command].concat(args).filter((part) => part !== "").join(" ");
    }

    function toolInputKeys(tool) {
      if (tool && Array.isArray(tool.inputKeys) && tool.inputKeys.length > 0) return tool.inputKeys;
      const properties = tool && tool.parameters && tool.parameters.properties;
      if (properties && typeof properties === "object") return Object.keys(properties);
      return [];
    }

    function oauthOf(server) {
      const oauth = server && server.oauth;
      return oauth && typeof oauth === "object" ? oauth : null;
    }

    function oauthStatusOf(oauth) {
      if (!oauth || oauth.authorized !== true) return "unauthorized";
      if (typeof oauth.expiresAt === "number" && oauth.expiresAt > 0 && oauth.expiresAt <= Date.now()) return "expired";
      return "authorized";
    }

    const OAUTH_BADGE_KEY = {
      authorized: "oauthAuthorized",
      expired: "oauthExpired",
      unauthorized: "oauthUnauthorized",
    };

    function formatExpiry(expiresAt) {
      if (typeof expiresAt !== "number" || !isFinite(expiresAt) || expiresAt <= 0) return "";
      try {
        return new Date(expiresAt).toLocaleString(detectLocale());
      } catch (error) {
        return "";
      }
    }

    function formatClock(value) {
      if (typeof value !== "number" || !isFinite(value) || value <= 0) return "";
      try {
        return new Date(value).toLocaleTimeString(detectLocale());
      } catch (error) {
        return "";
      }
    }

    function formatDuration(ms) {
      const value = Number(ms);
      if (!isFinite(value) || value <= 0) return "";
      if (value < 60000) {
        return t("durationSeconds", { count: Math.max(1, Math.round(value / 1000)) });
      }
      const minutes = Math.round((value / 60000) * 10) / 10;
      return t("durationMinutes", { count: minutes });
    }

    function parseScopes(text) {
      const scopes = [];
      for (const part of String(text || "").split(/[\s,]+/)) {
        const scope = part.trim();
        if (scope && scopes.indexOf(scope) === -1) scopes.push(scope);
      }
      return scopes;
    }

    function findServerByName(servers, name) {
      for (const server of asArray(servers)) {
        if (server && server.name === name) return server;
      }
      return undefined;
    }

    function serverHasError(server) {
      if (server && typeof server.error === "string" && server.error) return true;
      const oauth = oauthOf(server);
      return !!(oauth && typeof oauth.error === "string" && oauth.error);
    }

    // True while the host may still be connecting or syncing tools for this server.
    function serverNeedsSettle(server) {
      if (!server) return false;
      if (server.enabled === false) return false;
      if (serverHasError(server)) return false;
      if (server.connecting === true) return true;
      if (Number(server.toolCount) > 0) return false;
      const oauth = oauthOf(server);
      // An enabled-but-unauthorized OAuth server will not connect on its own.
      if (oauth && oauth.enabled === true && oauth.authorized !== true) return false;
      return true;
    }

    function serverCanForceReconnect(server) {
      if (!server) return false;
      if (server.enabled === false) return false;
      if (server.connecting === true) return false;
      if (serverHasError(server)) return false;
      return Number(server.toolCount) === 0;
    }

    function parseArgLines(text) {
      return String(text || "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }

    function parseKeyValueLines(text, separator) {
      const value = {};
      const lines = String(text || "").split("\n");
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const index = line.indexOf(separator);
        if (index <= 0) return { error: true, value: value };
        const key = line.slice(0, index).trim();
        if (!key) return { error: true, value: value };
        value[key] = line.slice(index + 1).trim();
      }
      return { error: false, value: value };
    }

    function mapToText(map, separator) {
      if (!map || typeof map !== "object") return "";
      return Object.keys(map)
        .map((key) => key + separator + String(map[key]))
        .join("\n");
    }

    function emptyServer() {
      return {
        name: "",
        enabled: true,
        transport: "stdio",
        command: "",
        args: [],
        env: {},
        cwd: "",
        url: "",
        headers: {},
        toolCallTimeoutMs: 60000,
        failOnStartupError: false,
        oauth: { enabled: false, scopes: [], clientId: "", clientSecret: "", clientSecretSet: false, resourceMetadataUrl: "", authorizationServer: "" },
      };
    }

    function draftFromServer(server) {
      const source = server || {};
      const oauth = source.oauth && typeof source.oauth === "object" ? source.oauth : {};
      return {
        name: typeof source.name === "string" ? source.name : "",
        transport: source.transport === "streamable-http" ? "streamable-http" : "stdio",
        command: typeof source.command === "string" ? source.command : "",
        args: asArray(source.args).join("\n"),
        env: mapToText(source.env, "="),
        cwd: typeof source.cwd === "string" ? source.cwd : "",
        url: typeof source.url === "string" ? source.url : "",
        headers: mapToText(source.headers, ": "),
        enabled: source.enabled !== false,
        toolCallTimeoutMs: Number.isInteger(source.toolCallTimeoutMs) && source.toolCallTimeoutMs > 0 ? source.toolCallTimeoutMs : 60000,
        failOnStartupError: source.failOnStartupError === true,
        oauthEnabled: oauth.enabled === true,
        oauthScopes: asArray(oauth.scopes).join(" "),
        oauthClientId: typeof oauth.clientId === "string" ? oauth.clientId : "",
        // The secret value never reaches the browser; only its presence does.
        oauthClientSecret: "",
        oauthClientSecretSet: oauth.clientSecretSet === true,
        oauthClientSecretClear: false,
        oauthResourceMetadataUrl: typeof oauth.resourceMetadataUrl === "string" ? oauth.resourceMetadataUrl : "",
        oauthAuthorizationServer: typeof oauth.authorizationServer === "string" ? oauth.authorizationServer : "",
      };
    }

    function validateDraft(draft) {
      const errors = {};
      const name = String(draft.name || "").trim();
      if (!name) errors.name = t("validationNameRequired");
      else if (!NAME_PATTERN.test(name)) errors.name = t("validationNameInvalid");
      const isStdio = draft.transport !== "streamable-http";
      if (isStdio && !String(draft.command || "").trim()) errors.command = t("validationCommandRequired");
      if (!isStdio && !String(draft.url || "").trim()) errors.url = t("validationUrlRequired");
      const timeout = Number(String(draft.toolCallTimeoutMs).trim());
      if (!Number.isInteger(timeout) || timeout <= 0) errors.timeout = t("validationTimeout");
      const env = isStdio ? parseKeyValueLines(draft.env, "=") : { error: false, value: {} };
      if (env.error) errors.env = t("validationEnv");
      const headers = isStdio ? { error: false, value: {} } : parseKeyValueLines(draft.headers, ":");
      if (headers.error) errors.headers = t("validationHeaders");
      if (Object.keys(errors).length > 0) return { ok: false, errors: errors };
      const server = {
        name: name,
        enabled: draft.enabled !== false,
        transport: isStdio ? "stdio" : "streamable-http",
        toolCallTimeoutMs: timeout,
        failOnStartupError: draft.failOnStartupError === true,
      };
      if (isStdio) {
        server.command = String(draft.command || "").trim();
        server.args = parseArgLines(draft.args);
        server.env = env.value;
        server.cwd = String(draft.cwd || "").trim();
      } else {
        server.url = String(draft.url || "").trim();
        server.headers = headers.value;
      }
      // CONTRACT-OAUTH §1: exactly these six keys, always present. OAuth is
      // HTTP-only, so a stdio server is serialized with enabled:false.
      server.oauth = {
        enabled: isStdio ? false : draft.oauthEnabled === true,
        scopes: parseScopes(draft.oauthScopes),
        clientId: String(draft.oauthClientId || "").trim(),
        // Host merge rule: "" keeps the stored secret, a string replaces it,
        // null clears it. Always include the key.
        clientSecret: draft.oauthClientSecretClear === true ? null : String(draft.oauthClientSecret || ""),
        resourceMetadataUrl: String(draft.oauthResourceMetadataUrl || "").trim(),
        authorizationServer: String(draft.oauthAuthorizationServer || "").trim(),
      };
      return { ok: true, server: server };
    }
    // #endregion

    // #region presentational components
    function FormField(props) {
      return jsxs("div", {
        className: "mcpm-field" + (props.small ? " mcpm-fieldSmall" : ""),
        children: [
          jsx("label", { className: "mcpm-label", htmlFor: props.id, children: props.label }),
          props.control,
          props.hint ? jsx("p", { className: "mcpm-hint", children: props.hint }) : null,
          props.error ? jsx("div", { className: "mcpm-fieldError", children: props.error }) : null,
        ],
      });
    }

    function ToolItem(props) {
      const tool = props.tool || {};
      const name = typeof tool.publicName === "string" && tool.publicName ? tool.publicName : typeof tool.rawName === "string" ? tool.rawName : "";
      const description = typeof tool.description === "string" && tool.description.trim() ? tool.description : t("noDescription");
      const keys = toolInputKeys(tool);
      return jsxs("li", {
        className: "mcpm-tool",
        children: [
          jsx("div", { className: "mcpm-toolName", title: name, children: name }),
          jsx("div", { className: "mcpm-toolDesc", children: description }),
          jsxs("div", {
            className: "mcpm-toolMeta",
            children: [
              jsx("span", { className: "mcpm-toolMetaLabel", children: t("inputsLabel") }),
              keys.length === 0
                ? jsx("span", { children: t("noInputs") })
                : jsx("span", {
                    className: "mcpm-params",
                    children: keys.map((key) => jsx("code", { className: "mcpm-param", children: key }, key)),
                  }),
            ],
          }),
        ],
      });
    }

    function ServerCard(props) {
      const server = props.server || {};
      const tools = asArray(props.tools);
      const state = serverState(server);
      const stateText = t(STATE_LABEL_KEY[state]);
      const endpoint = endpointOf(server);
      const count = toolCountOf(server, tools);
      const blocked = props.busy !== "";
      const enabled = server.enabled !== false;
      const transportLabel = server.transport === "streamable-http" ? t("transportHttp") : t("transportStdio");
      const oauth = oauthOf(server);
      const oauthEnabled = !!(oauth && oauth.enabled === true);
      const authStatus = oauthStatusOf(oauth);
      const authBadgeText = t(OAUTH_BADGE_KEY[authStatus]);
      const authBadgeClass =
        authStatus === "authorized" ? "mcpm-authBadgeAuthorized" : authStatus === "expired" ? "mcpm-authBadgeExpired" : "mcpm-authBadgeUnauthorized";
      const expiryText = oauth ? formatExpiry(oauth.expiresAt) : "";
      const scopeText = oauth && typeof oauth.scope === "string" ? oauth.scope : "";
      const oauthError = oauth && typeof oauth.error === "string" ? oauth.error : "";
      const auth = props.auth || {};
      const cardRefreshing = props.busy === "card-refresh:" + server.name;
      return jsxs("li", {
        className: "mcpm-card",
        children: [
          jsxs("div", {
            className: "mcpm-cardHead",
            children: [
              jsxs("div", {
                className: "mcpm-cardMain",
                children: [
                  jsxs("div", {
                    className: "mcpm-nameRow",
                    children: [
                      jsx("span", { className: "mcpm-name", title: server.name, children: server.name }),
                      jsx("span", { className: "mcpm-badge", children: transportLabel }),
                      jsxs("span", {
                        className: "mcpm-state",
                        title: stateText,
                        children: [
                          jsx("span", {
                            className: "mcpm-dot " + STATE_DOT_CLASS[state],
                            "aria-hidden": "true",
                          }),
                          jsx("span", { children: stateText }),
                        ],
                      }),
                    ],
                  }),
                  jsx("div", {
                    className: "mcpm-endpoint",
                    title: endpoint || t("noEndpoint"),
                    children: endpoint || t("noEndpoint"),
                  }),
                  server.error ? jsx("div", { className: "mcpm-serverError", children: t("stateError") + ": " + server.error }) : null,
                ],
              }),
              jsxs("div", {
                className: "mcpm-cardActions",
                children: [
                  server.connecting === true
                    ? jsxs("span", {
                        className: "mcpm-connecting",
                        children: [
                          jsx("span", { className: "mcpm-connectingDot", "aria-hidden": "true" }),
                          jsx("span", { children: t("stateConnecting") }),
                        ],
                      })
                    : null,
                  jsx("span", { className: "mcpm-count", children: t("toolsCount", { count: count }) }),
                  jsx("button", {
                    type: "button",
                    role: "switch",
                    className: "mcpm-switch",
                    "aria-checked": enabled,
                    "aria-label": t("fieldEnabled"),
                    title: t("fieldEnabled"),
                    disabled: blocked,
                    onClick: props.onToggleEnabled,
                    children: jsx("span", { className: "mcpm-thumb", "aria-hidden": "true" }),
                  }),
                  jsx("button", {
                    type: "button",
                    className: "mcpm-btn mcpm-btnSmall",
                    disabled: blocked || !enabled,
                    onClick: props.onReconnect,
                    children: t("reconnect"),
                  }),
                  jsx("button", {
                    type: "button",
                    className: "mcpm-btn mcpm-btnSmall",
                    disabled: blocked,
                    "aria-label": t("refreshServer", { name: server.name }),
                    onClick: props.onRefresh,
                    children: cardRefreshing ? t("refreshing") : t("refresh"),
                  }),
                  jsx("button", {
                    type: "button",
                    className: "mcpm-btn mcpm-btnSmall",
                    disabled: blocked,
                    onClick: props.onEdit,
                    children: t("edit"),
                  }),
                  jsx("button", {
                    type: "button",
                    className: "mcpm-btn mcpm-btnSmall mcpm-btnDanger",
                    disabled: blocked,
                    onClick: props.onRemoveRequest,
                    children: t("remove"),
                  }),
                  jsx("button", {
                    type: "button",
                    className: "mcpm-btn mcpm-btnSmall",
                    "aria-expanded": !!props.expanded,
                    "aria-label": props.expanded ? t("collapseTools", { name: server.name }) : t("expandTools", { name: server.name }),
                    onClick: props.onToggle,
                    children: props.expanded ? "▴" : "▾",
                  }),
                ],
              }),
            ],
          }),
          oauthEnabled
            ? jsxs("div", {
                className: "mcpm-auth",
                children: [
                  jsxs("div", {
                    className: "mcpm-authHead",
                    children: [
                      jsx("span", { className: "mcpm-authTitle", children: t("oauthLabel") }),
                      jsx("span", { className: "mcpm-authBadge " + authBadgeClass, children: authBadgeText }),
                      expiryText ? jsx("span", { className: "mcpm-authMeta", children: t("oauthExpires", { time: expiryText }) }) : null,
                      scopeText ? jsx("span", { className: "mcpm-authMeta", children: t("oauthScope", { scope: scopeText }) }) : null,
                    ],
                  }),
                  oauthError ? jsx("div", { className: "mcpm-authError", children: t("oauthErrorPrefix") + ": " + oauthError }) : null,
                  auth.waiting
                    ? jsxs("div", {
                        className: "mcpm-authWaiting",
                        "aria-live": "polite",
                        children: [
                          jsx("span", { className: "mcpm-authPulse", "aria-hidden": "true" }),
                          jsx("span", { children: t("oauthWaiting") }),
                          auth.url ? jsx("a", { className: "mcpm-link", href: auth.url, target: "_blank", rel: "noopener noreferrer", children: t("oauthOpenLink") }) : null,
                          jsx("button", {
                            type: "button",
                            className: "mcpm-btn mcpm-btnSmall",
                            disabled: blocked,
                            onClick: auth.onOpenPaste,
                            children: t("oauthPasteToken"),
                          }),
                          jsx("button", {
                            type: "button",
                            className: "mcpm-btn mcpm-btnSmall",
                            onClick: auth.onCancelWait,
                            children: t("oauthCancelWait"),
                          }),
                        ],
                      })
                    : jsxs("div", {
                        className: "mcpm-authActions",
                        children: [
                          jsx("button", {
                            type: "button",
                            className: "mcpm-btn mcpm-btnSmall",
                            disabled: blocked,
                            onClick: auth.onAuthorize,
                            children: t("oauthAuthorize"),
                          }),
                          jsx("button", {
                            type: "button",
                            className: "mcpm-btn mcpm-btnSmall",
                            disabled: blocked,
                            onClick: auth.onOpenPaste,
                            children: t("oauthPasteToken"),
                          }),
                          jsx("button", {
                            type: "button",
                            className: "mcpm-btn mcpm-btnSmall",
                            disabled: blocked || authStatus === "unauthorized",
                            onClick: auth.onRefresh,
                            children: t("oauthRefreshToken"),
                          }),
                          jsx("button", {
                            type: "button",
                            className: "mcpm-btn mcpm-btnSmall mcpm-btnDanger",
                            disabled: blocked || authStatus === "unauthorized",
                            onClick: auth.onSignOut,
                            children: t("oauthSignOut"),
                          }),
                        ],
                      }),
                  auth.token
                    ? jsxs("form", {
                        className: "mcpm-tokenForm",
                        onSubmit: (event) => {
                          if (event && typeof event.preventDefault === "function") event.preventDefault();
                          if (typeof auth.onSubmitToken === "function") auth.onSubmitToken();
                        },
                        children: [
                          jsx("input", {
                            className: "mcpm-input mcpm-tokenInput",
                            type: "password",
                            value: auth.token.value,
                            "aria-label": t("oauthTokenLabel"),
                            autoComplete: "new-password",
                            spellCheck: false,
                            disabled: blocked,
                            onChange: (event) => {
                              if (typeof auth.onTokenChange === "function") auth.onTokenChange(event.target.value);
                            },
                          }),
                          jsx("button", {
                            type: "submit",
                            className: "mcpm-btn mcpm-btnSmall",
                            disabled: blocked || !String(auth.token.value || "").trim(),
                            children: t("oauthSaveToken"),
                          }),
                          jsx("button", {
                            type: "button",
                            className: "mcpm-btn mcpm-btnSmall",
                            onClick: auth.onCancelPaste,
                            children: t("cancel"),
                          }),
                          auth.token.error ? jsx("div", { className: "mcpm-tokenError", children: auth.token.error }) : null,
                        ],
                      })
                    : null,
                ],
              })
            : null,
          props.pendingRemove
            ? jsxs("div", {
                className: "mcpm-confirmRow",
                children: [
                  jsx("span", { className: "mcpm-confirmText", children: t("removePrompt", { name: server.name }) }),
                  jsx("button", {
                    type: "button",
                    className: "mcpm-btn mcpm-btnSmall mcpm-btnDangerSolid",
                    disabled: blocked,
                    onClick: props.onRemoveConfirm,
                    children: t("confirmRemove"),
                  }),
                  jsx("button", {
                    type: "button",
                    className: "mcpm-btn mcpm-btnSmall",
                    disabled: blocked,
                    onClick: props.onRemoveCancel,
                    children: t("cancel"),
                  }),
                ],
              })
            : null,
          props.expanded
            ? jsxs("div", {
                className: "mcpm-tools",
                children: [
                  jsxs("div", {
                    className: "mcpm-toolsHead",
                    children: [
                      jsx("span", { className: "mcpm-toolsTitle", children: t("toolsHeading") }),
                      jsx("span", { className: "mcpm-count", children: t("toolsCount", { count: tools.length }) }),
                    ],
                  }),
                  tools.length === 0
                    ? jsx("div", { className: "mcpm-emptyInline", children: t("noToolsForServer") })
                    : jsx("ul", {
                        className: "mcpm-toolList",
                        children: tools.map((tool, index) =>
                          jsx(ToolItem, { tool: tool }, String(tool && (tool.publicName || tool.rawName) ? tool.publicName || tool.rawName : index))
                        ),
                      }),
                ],
              })
            : null,
        ],
      });
    }

    function ServerForm(props) {
      const [draft, setDraft] = React.useState(() => draftFromServer(props.initial));
      const [errors, setErrors] = React.useState({});
      const [submitError, setSubmitError] = React.useState("");
      const [submitting, setSubmitting] = React.useState(false);
      const mountedRef = React.useRef(true);
      const formId = React.useId();
      const idFor = (name) => formId + "-" + name;

      React.useEffect(() => {
        mountedRef.current = true;
        return () => {
          mountedRef.current = false;
        };
      }, []);

      const saving = submitting || !!props.saving;
      const isStdio = draft.transport !== "streamable-http";

      function updateField(field, value) {
        setDraft((previous) => {
          const next = Object.assign({}, previous);
          next[field] = value;
          return next;
        });
        setErrors((previous) => {
          if (!previous[field]) return previous;
          const next = Object.assign({}, previous);
          delete next[field];
          return next;
        });
        setSubmitError("");
      }

      function changeTransport(value) {
        setDraft((previous) => {
          const next = Object.assign({}, previous);
          next.transport = value === "streamable-http" ? "streamable-http" : "stdio";
          // OAuth is HTTP-only: switching to stdio forces the option off.
          if (next.transport === "stdio") next.oauthEnabled = false;
          return next;
        });
        setErrors((previous) => {
          const next = Object.assign({}, previous);
          delete next.command;
          delete next.url;
          return next;
        });
        setSubmitError("");
      }

      async function handleSubmit(event) {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (saving) return;
        const validation = validateDraft(draft);
        if (!validation.ok) {
          setErrors(validation.errors);
          return;
        }
        setErrors({});
        setSubmitting(true);
        let result;
        try {
          result = await props.onSubmit(validation.server);
        } catch (error) {
          result = { ok: false, message: errorMessage(error) };
        }
        if (!mountedRef.current) return;
        setSubmitting(false);
        if (result && !result.ok) setSubmitError(result.message || t("bridgeUnreachable"));
      }

      const nameField = jsx(FormField, {
        id: idFor("name"),
        label: t("fieldName"),
        hint: t("hintName"),
        error: errors.name,
        control: jsx("input", {
          id: idFor("name"),
          className: "mcpm-input",
          type: "text",
          value: draft.name,
          autoComplete: "off",
          spellCheck: false,
          disabled: saving,
          onChange: (event) => updateField("name", event.target.value),
        }),
      }, "name");

      const transportField = jsx(FormField, {
        id: idFor("transport"),
        label: t("fieldTransport"),
        small: true,
        control: jsx("select", {
          id: idFor("transport"),
          className: "mcpm-select",
          value: draft.transport,
          disabled: saving,
          onChange: (event) => changeTransport(event.target.value),
          children: [
            jsx("option", { value: "stdio", children: t("transportStdio") }, "stdio"),
            jsx("option", { value: "streamable-http", children: t("transportHttp") }, "http"),
          ],
        }),
      }, "transport");

      const transportFields = isStdio
        ? [
            jsx(FormField, {
              id: idFor("command"),
              label: t("fieldCommand"),
              error: errors.command,
              control: jsx("input", {
                id: idFor("command"),
                className: "mcpm-input",
                type: "text",
                value: draft.command,
                autoComplete: "off",
                spellCheck: false,
                disabled: saving,
                onChange: (event) => updateField("command", event.target.value),
              }),
            }, "command"),
            jsx(FormField, {
              id: idFor("args"),
              label: t("fieldArgs"),
              hint: t("hintArgs"),
              control: jsx("textarea", {
                id: idFor("args"),
                className: "mcpm-textarea",
                rows: 3,
                value: draft.args,
                spellCheck: false,
                disabled: saving,
                onChange: (event) => updateField("args", event.target.value),
              }),
            }, "args"),
            jsx(FormField, {
              id: idFor("env"),
              label: t("fieldEnv"),
              hint: t("hintEnv"),
              error: errors.env,
              control: jsx("textarea", {
                id: idFor("env"),
                className: "mcpm-textarea",
                rows: 2,
                value: draft.env,
                spellCheck: false,
                disabled: saving,
                onChange: (event) => updateField("env", event.target.value),
              }),
            }, "env"),
            jsx(FormField, {
              id: idFor("cwd"),
              label: t("fieldCwd"),
              control: jsx("input", {
                id: idFor("cwd"),
                className: "mcpm-input",
                type: "text",
                value: draft.cwd,
                autoComplete: "off",
                spellCheck: false,
                disabled: saving,
                onChange: (event) => updateField("cwd", event.target.value),
              }),
            }, "cwd"),
          ]
        : [
            jsx(FormField, {
              id: idFor("url"),
              label: t("fieldUrl"),
              error: errors.url,
              control: jsx("input", {
                id: idFor("url"),
                className: "mcpm-input",
                type: "text",
                value: draft.url,
                autoComplete: "off",
                spellCheck: false,
                disabled: saving,
                onChange: (event) => updateField("url", event.target.value),
              }),
            }, "url"),
            jsx(FormField, {
              id: idFor("headers"),
              label: t("fieldHeaders"),
              hint: t("hintHeaders"),
              error: errors.headers,
              control: jsx("textarea", {
                id: idFor("headers"),
                className: "mcpm-textarea",
                rows: 3,
                value: draft.headers,
                spellCheck: false,
                disabled: saving,
                onChange: (event) => updateField("headers", event.target.value),
              }),
            }, "headers"),
          ];

      const secretHint =
        draft.oauthClientSecretClear === true
          ? t("oauthSecretWillClear")
          : draft.oauthClientSecretSet === true
            ? t("oauthSecretSetHint")
            : "";
      const secretActions =
        draft.oauthClientSecretSet === true || draft.oauthClientSecretClear === true
          ? jsxs("div", {
              className: "mcpm-oauthSecretActions",
              children: [
                draft.oauthClientSecretClear === true
                  ? jsx("button", {
                      type: "button",
                      className: "mcpm-btn mcpm-btnSmall",
                      disabled: saving,
                      onClick: () => updateField("oauthClientSecretClear", false),
                      children: t("cancel"),
                    })
                  : jsx("button", {
                      type: "button",
                      className: "mcpm-btn mcpm-btnSmall",
                      disabled: saving,
                      onClick: () => {
                        updateField("oauthClientSecret", "");
                        updateField("oauthClientSecretClear", true);
                      },
                      children: t("oauthClearSecret"),
                    }),
              ],
            })
          : null;

      const oauthFields =
        isStdio || draft.oauthEnabled !== true
          ? null
          : jsxs("div", {
              className: "mcpm-oauthFields",
              children: [
                jsx(FormField, {
                  id: idFor("oauth-client-id"),
                  label: t("oauthFieldClientId"),
                  hint: t("oauthHintClientId"),
                  control: jsx("input", {
                    id: idFor("oauth-client-id"),
                    className: "mcpm-input",
                    type: "text",
                    value: draft.oauthClientId,
                    autoComplete: "off",
                    spellCheck: false,
                    disabled: saving,
                    onChange: (event) => updateField("oauthClientId", event.target.value),
                  }),
                }, "oauth-client-id"),
                jsx(FormField, {
                  id: idFor("oauth-scopes"),
                  label: t("oauthFieldScopes"),
                  hint: t("oauthHintScopes"),
                  control: jsx("input", {
                    id: idFor("oauth-scopes"),
                    className: "mcpm-input",
                    type: "text",
                    value: draft.oauthScopes,
                    autoComplete: "off",
                    spellCheck: false,
                    disabled: saving,
                    onChange: (event) => updateField("oauthScopes", event.target.value),
                  }),
                }, "oauth-scopes"),
                jsxs("details", {
                  className: "mcpm-advanced",
                  children: [
                    jsx("summary", { className: "mcpm-advancedSummary", children: t("oauthAdvanced") }),
                    jsxs("div", {
                      className: "mcpm-oauthFields",
                      children: [
                        jsx(FormField, {
                          id: idFor("oauth-client-secret"),
                          label: t("oauthFieldClientSecret"),
                          hint: secretHint,
                          control: jsx("input", {
                            id: idFor("oauth-client-secret"),
                            className: "mcpm-input",
                            type: "password",
                            value: draft.oauthClientSecret,
                            autoComplete: "new-password",
                            spellCheck: false,
                            disabled: saving,
                            onChange: (event) => {
                              updateField("oauthClientSecret", event.target.value);
                              if (draft.oauthClientSecretClear === true) updateField("oauthClientSecretClear", false);
                            },
                          }),
                        }, "oauth-client-secret"),
                        secretActions,
                        jsx(FormField, {
                          id: idFor("oauth-resource-metadata"),
                          label: t("oauthFieldResourceMetadata"),
                          hint: t("oauthHintResourceMetadata"),
                          control: jsx("input", {
                            id: idFor("oauth-resource-metadata"),
                            className: "mcpm-input",
                            type: "text",
                            value: draft.oauthResourceMetadataUrl,
                            autoComplete: "off",
                            spellCheck: false,
                            disabled: saving,
                            onChange: (event) => updateField("oauthResourceMetadataUrl", event.target.value),
                          }),
                        }, "oauth-resource-metadata"),
                      ],
                    }),
                  ],
                }),
              ],
            });

      const oauthSection = jsxs("div", {
        className: "mcpm-oauthSection",
        children: [
          jsx("div", { className: "mcpm-oauthTitle", children: t("oauthFormTitle") }),
          jsxs("label", {
            className: "mcpm-check mcpm-checkInline",
            htmlFor: idFor("oauth-enabled"),
            children: [
              jsx("input", {
                id: idFor("oauth-enabled"),
                type: "checkbox",
                checked: isStdio ? false : draft.oauthEnabled === true,
                disabled: saving || isStdio,
                onChange: (event) => updateField("oauthEnabled", event.target.checked),
              }),
              jsx("span", { children: t("oauthUse") }),
            ],
          }),
          isStdio ? jsx("p", { className: "mcpm-hint", children: t("oauthHintStdio") }) : null,
          oauthFields,
        ],
      });

      const metaRow = jsxs("div", {
        className: "mcpm-formRow",
        children: [
          jsx(FormField, {
            id: idFor("timeout"),
            label: t("fieldTimeout"),
            hint: t("hintTimeout"),
            error: errors.timeout,
            small: true,
            control: jsx("input", {
              id: idFor("timeout"),
              className: "mcpm-input",
              type: "number",
              min: "1",
              step: "1",
              value: draft.toolCallTimeoutMs,
              inputMode: "numeric",
              disabled: saving,
              onChange: (event) => updateField("toolCallTimeoutMs", event.target.value),
            }),
          }, "timeout"),
          jsx("label", {
            className: "mcpm-check",
            htmlFor: idFor("enabled"),
            children: [
              jsx("input", {
                id: idFor("enabled"),
                type: "checkbox",
                checked: draft.enabled,
                disabled: saving,
                onChange: (event) => updateField("enabled", event.target.checked),
              }),
              jsx("span", { children: t("fieldEnabled") }),
            ],
          }, "enabled"),
        ],
      });

      return jsxs("form", {
        className: "mcpm-form",
        onSubmit: handleSubmit,
        children: [
          jsx("h3", {
            className: "mcpm-formTitle",
            children: props.mode === "edit" ? t("formEditTitle") : t("formAddTitle"),
          }),
          submitError ? jsx("div", { className: "mcpm-banner mcpm-bannerError", role: "alert", children: submitError }) : null,
          jsxs("div", {
            className: "mcpm-formRow",
            children: [nameField, transportField],
          }),
          jsx("div", { className: "mcpm-formGrid", children: transportFields }),
          oauthSection,
          metaRow,
          jsxs("div", {
            className: "mcpm-formActions",
            children: [
              jsx("button", {
                type: "button",
                className: "mcpm-btn",
                disabled: saving,
                onClick: props.onCancel,
                children: t("cancel"),
              }),
              jsx("button", {
                type: "submit",
                className: "mcpm-btn mcpm-btnPrimary",
                disabled: saving,
                children: saving ? t("saving") : t("save"),
              }),
            ],
          }),
        ],
      });
    }
    // #endregion

    // #region page
    function RefreshPolicyPanel(props) {
      const info = props && props.info && typeof props.info === "object" ? props.info : {};
      const [open, setOpen] = React.useState(false);
      const [enabled, setEnabled] = React.useState(info.enabled === true);
      const [intervalSec, setIntervalSec] = React.useState(String(Math.max(1, Math.round((Number(info.intervalMs) || 300000) / 1000))));
      const [leadSec, setLeadSec] = React.useState(String(Math.max(1, Math.round((Number(info.leadMs) || 600000) / 1000))));
      const [onExpiry, setOnExpiry] = React.useState(info.refreshOnExpiry !== false);
      const [saving, setSaving] = React.useState(false);
      const [error, setError] = React.useState("");
      const [note, setNote] = React.useState("");

      // Re-sync the form when the host reports a different policy (the reload a
      // save causes delivers the accepted, clamped values).
      const signature = [info.enabled === true, Number(info.intervalMs) || 0, Number(info.leadMs) || 0, info.refreshOnExpiry !== false].join("|");
      const signatureRef = React.useRef(signature);
      React.useEffect(() => {
        if (signatureRef.current === signature) return;
        signatureRef.current = signature;
        setEnabled(info.enabled === true);
        setIntervalSec(String(Math.max(1, Math.round((Number(info.intervalMs) || 300000) / 1000))));
        setLeadSec(String(Math.max(1, Math.round((Number(info.leadMs) || 600000) / 1000))));
        setOnExpiry(info.refreshOnExpiry !== false);
      }, [signature]);

      function parseSeconds(raw) {
        const trimmed = String(raw === undefined || raw === null ? "" : raw).trim();
        if (!/^\d+$/.test(trimmed)) return undefined;
        const value = Number(trimmed);
        if (!Number.isFinite(value) || value < 1 || value > 86400) return undefined;
        return value;
      }

      function submit(payload) {
        if (saving) return;
        setSaving(true);
        setError("");
        setNote("");
        void (async () => {
          try {
            const result = await postBridge("config", payload);
            if (!result || result.ok !== true) {
              setError(t("policyFailed", { message: bridgeMessage(result) }));
              return;
            }
            setNote(t("policySaved"));
            if (props && typeof props.onSaved === "function") props.onSaved();
          } catch (failure) {
            setError(t("policyFailed", { message: errorMessage(failure) }));
          } finally {
            setSaving(false);
          }
        })();
      }

      function save() {
        const interval = enabled ? parseSeconds(intervalSec) : 0;
        if (enabled && interval === undefined) {
          setError(t("policyValidation", { min: 1, max: 86400 }));
          return;
        }
        const lead = parseSeconds(leadSec);
        if (lead === undefined) {
          setError(t("policyValidation", { min: 1, max: 86400 }));
          return;
        }
        submit({
          refreshIntervalMs: enabled ? interval * 1000 : 0,
          refreshLeadMs: lead * 1000,
          refreshOnExpiry: onExpiry === true,
        });
      }

      function restore() {
        setEnabled(true);
        setIntervalSec("300");
        setLeadSec("600");
        setOnExpiry(true);
        submit({ refreshIntervalMs: 300000, refreshLeadMs: 600000, refreshOnExpiry: true });
      }

      const kind = typeof info.lastRunKind === "string" ? info.lastRunKind : "";
      const kindLabel = kind === "timer" ? t("policyKindTimer") : kind === "expiry" ? t("policyKindExpiry") : kind === "manual" ? t("policyKindManual") : "";

      return jsxs("details", {
        className: "mcpm-policy",
        open: open,
        onToggle: (event) => {
          setOpen(event.currentTarget.open === true);
        },
        children: [
          jsx("summary", { className: "mcpm-policySummary", children: t("policyTitle") }, "summary"),
          jsxs(
            "div",
            {
              className: "mcpm-policyGrid",
              children: [
                jsxs(
                  "label",
                  {
                    className: "mcpm-check mcpm-checkInline",
                    children: [
                      jsx("input", {
                        type: "checkbox",
                        checked: enabled === true,
                        disabled: saving,
                        onChange: (event) => {
                          setEnabled(event.currentTarget.checked === true);
                        },
                      }, "check"),
                      jsx("span", { children: t("policyEnabled") }, "text"),
                    ],
                  },
                  "enabled",
                ),
                jsxs(
                  "div",
                  {
                    className: "mcpm-policyRow",
                    children: [
                      jsxs(
                        "div",
                        {
                          className: "mcpm-field",
                          children: [
                            jsx("label", { className: "mcpm-label", htmlFor: "mcpm-policy-interval", children: t("policyInterval") }, "label"),
                            jsx("input", {
                              id: "mcpm-policy-interval",
                              className: "mcpm-input",
                              type: "number",
                              min: 1,
                              max: 86400,
                              step: 1,
                              value: intervalSec,
                              disabled: saving || enabled !== true,
                              onChange: (event) => {
                                setIntervalSec(event.currentTarget.value);
                              },
                            }, "input"),
                          ],
                        },
                        "interval",
                      ),
                      jsxs(
                        "div",
                        {
                          className: "mcpm-field",
                          children: [
                            jsx("label", { className: "mcpm-label", htmlFor: "mcpm-policy-lead", children: t("policyLead") }, "label"),
                            jsx("input", {
                              id: "mcpm-policy-lead",
                              className: "mcpm-input",
                              type: "number",
                              min: 1,
                              max: 86400,
                              step: 1,
                              value: leadSec,
                              disabled: saving,
                              onChange: (event) => {
                                setLeadSec(event.currentTarget.value);
                              },
                            }, "input"),
                          ],
                        },
                        "lead",
                      ),
                    ],
                  },
                  "row",
                ),
                jsxs(
                  "label",
                  {
                    className: "mcpm-check mcpm-checkInline",
                    children: [
                      jsx("input", {
                        type: "checkbox",
                        checked: onExpiry === true,
                        disabled: saving,
                        onChange: (event) => {
                          setOnExpiry(event.currentTarget.checked === true);
                        },
                      }, "check"),
                      jsx("span", { children: t("policyOnExpiry") }, "text"),
                    ],
                  },
                  "onexpiry",
                ),
                jsx("p", { className: "mcpm-policyHint", children: t("policyOnExpiryHint") }, "hint"),
                kindLabel ? jsx("p", { className: "mcpm-policyNote", children: t("policyLastKind", { kind: kindLabel }) }, "kind") : null,
                error ? jsx("div", { className: "mcpm-policyError", role: "alert", children: error }, "error") : null,
                note ? jsx("div", { className: "mcpm-policyNote", children: note }, "note") : null,
                jsxs(
                  "div",
                  {
                    className: "mcpm-policyActions",
                    children: [
                      jsx("button", {
                        type: "button",
                        className: "mcpm-btn mcpm-btnPrimary mcpm-btnSmall",
                        disabled: saving,
                        onClick: save,
                        children: saving ? t("policySaving") : t("policySave"),
                      }, "save"),
                      jsx("button", {
                        type: "button",
                        className: "mcpm-btn mcpm-btnSmall",
                        disabled: saving,
                        onClick: restore,
                        children: t("policyRestore"),
                      }, "restore"),
                    ],
                  },
                  "actions",
                ),
              ],
            },
            "body",
          ),
        ],
      });
    }

    function McpManagerPage() {
      const [state, setState] = React.useState({ status: "loading" });
      const [expanded, setExpanded] = React.useState({});
      const [form, setForm] = React.useState(null);
      const [pendingRemove, setPendingRemove] = React.useState(null);
      const [busy, setBusy] = React.useState("");
      const [actionError, setActionError] = React.useState(null);
      const [tokenForm, setTokenForm] = React.useState(null);
      const [authWaiting, setAuthWaiting] = React.useState({});
      const [authLinks, setAuthLinks] = React.useState({});
      const [infoMessage, setInfoMessage] = React.useState(null);
      const [, setLocaleRevision] = React.useState(0);
      const [, setExpiryTick] = React.useState(0);
      const mountedRef = React.useRef(true);
      const seqRef = React.useRef(0);
      const settleRef = React.useRef(null);

      function applyPayload(value) {
        const payload = value && typeof value === "object" ? value : {};
        setState((previous) => ({
          status: "ready",
          servers: asArray(payload.servers),
          tools: asArray(payload.tools),
          capabilities:
            payload.capabilities && typeof payload.capabilities === "object"
              ? payload.capabilities
              : previous.status === "ready"
                ? previous.capabilities
                : null,
        }));
      }

      function stopSettle() {
        const current = settleRef.current;
        if (!current) return;
        settleRef.current = null;
        if (current.timer !== null) {
          clearTimeout(current.timer);
          current.timer = null;
        }
      }

      // After a mutating action the host respawns the child; keep polling /state
      // until every affected server has tools, an error, or is disabled.
      // One loop at a time: starting a new one supersedes the previous one.
      function startSettle(names) {
        if (!mountedRef.current) return;
        stopSettle();
        const targets = [];
        for (const name of asArray(names)) {
          if (typeof name === "string" && name && targets.indexOf(name) === -1) targets.push(name);
        }
        if (targets.length === 0) return;
        const controller = { names: targets, deadline: Date.now() + SETTLE_TIMEOUT_MS, timer: null };
        settleRef.current = controller;

        function schedule() {
          if (!mountedRef.current || settleRef.current !== controller) return;
          controller.timer = setTimeout(() => {
            void tick();
          }, SETTLE_POLL_MS);
        }

        async function tick() {
          if (!mountedRef.current || settleRef.current !== controller) return;
          controller.timer = null;
          let result = null;
          try {
            result = await postBridge("state", {});
          } catch (error) {
            result = null;
          }
          if (!mountedRef.current || settleRef.current !== controller) return;
          if (result && result.ok === true) {
            applyPayload(result.value);
            const serverList = asArray(result.value && result.value.servers);
            let pending = false;
            for (const target of targets) {
              if (serverNeedsSettle(findServerByName(serverList, target))) {
                pending = true;
                break;
              }
            }
            if (!pending) {
              stopSettle();
              return;
            }
          }
          if (Date.now() >= controller.deadline) {
            stopSettle();
            return;
          }
          schedule();
        }

        schedule();
      }

      async function loadInitial() {
        stopSettle();
        const seq = ++seqRef.current;
        setState({ status: "loading" });
        setActionError(null);
        try {
          const result = await postBridge("state", {});
          if (!mountedRef.current || seq !== seqRef.current) return;
          if (!result || result.ok !== true) {
            setState({ status: "error", message: bridgeMessage(result) });
            return;
          }
          applyPayload(result.value);
        } catch (error) {
          if (!mountedRef.current || seq !== seqRef.current) return;
          setState({ status: "error", message: errorMessage(error) });
        }
      }

      async function refresh() {
        if (state.status !== "ready") {
          await loadInitial();
          return;
        }
        const seq = ++seqRef.current;
        setBusy("refresh");
        setActionError(null);
        stopSettle();
        try {
          const result = await postBridge("state", {});
          if (!mountedRef.current || seq !== seqRef.current) return;
          if (!result || result.ok !== true) {
            setActionError({ message: t("loadFailedDetail", { message: bridgeMessage(result) }), retry: refresh });
            return;
          }
          applyPayload(result.value);
        } catch (error) {
          if (!mountedRef.current || seq !== seqRef.current) return;
          setActionError({ message: t("loadFailedDetail", { message: errorMessage(error) }), retry: refresh });
        } finally {
          if (mountedRef.current && seq === seqRef.current) setBusy("");
        }
      }

      async function callBridge(route, payload, busyKey) {
        stopSettle();
        seqRef.current += 1;
        setBusy(busyKey);
        setActionError(null);
        try {
          const result = await postBridge(route, payload);
          if (!mountedRef.current) return { ok: false, message: "" };
          if (!result || result.ok !== true) return { ok: false, message: bridgeMessage(result) };
          applyPayload(result.value);
          return { ok: true, message: "" };
        } catch (error) {
          return { ok: false, message: errorMessage(error) };
        } finally {
          if (mountedRef.current) setBusy("");
        }
      }

      function reportActionError(result, retry) {
        if (!mountedRef.current || result.ok) return;
        setActionError({ message: t("actionFailed", { message: result.message || t("bridgeUnreachable") }), retry: retry });
      }

      function clearOauthWaiting(name) {
        setAuthWaiting((previous) => {
          if (!(name in previous)) return previous;
          const next = Object.assign({}, previous);
          delete next[name];
          return next;
        });
        setAuthLinks((previous) => {
          if (!(name in previous)) return previous;
          const next = Object.assign({}, previous);
          delete next[name];
          return next;
        });
      }

      // OAuth routes answer the auth view only (no servers/tools), so they must
      // not go through applyPayload(); the caller re-syncs /state afterwards.
      async function callBridgeRaw(route, payload, busyKey) {
        stopSettle();
        seqRef.current += 1;
        setBusy(busyKey);
        setActionError(null);
        try {
          const result = await postBridge(route, payload);
          if (!mountedRef.current) return { ok: false, message: "", code: "", value: null };
          if (!result || result.ok !== true) {
            return { ok: false, message: bridgeMessage(result), code: typeof result.code === "string" ? result.code : "", value: null };
          }
          return { ok: true, message: "", code: "", value: result.value && typeof result.value === "object" ? result.value : {} };
        } catch (error) {
          return { ok: false, message: errorMessage(error), code: "", value: null };
        } finally {
          if (mountedRef.current) setBusy("");
        }
      }

      async function syncState() {
        if (!mountedRef.current) return null;
        try {
          const result = await postBridge("state", {});
          if (!mountedRef.current) return null;
          if (!result || result.ok !== true) {
            setActionError({ message: t("loadFailedDetail", { message: bridgeMessage(result) }), retry: () => { void syncState(); } });
            return null;
          }
          applyPayload(result.value);
          return result.value && typeof result.value === "object" ? result.value : {};
        } catch (error) {
          if (mountedRef.current) {
            setActionError({ message: t("loadFailedDetail", { message: errorMessage(error) }), retry: () => { void syncState(); } });
          }
          return null;
        }
      }

      /**
       * Re-sync after a policy save. The save persists through configEditor, which
       * reloads this plugin, so /state can fail for a moment; retry quietly instead
       * of showing an error.
       */
      async function quietResync() {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          try {
            const result = await postBridge("state", {});
            if (result && result.ok === true && mountedRef.current) {
              applyPayload(result.value);
              setInfoMessage(t("policyUpdated"));
              return;
            }
          } catch (error) {
            // Still reloading; try again shortly.
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      async function authorizeOauth(server) {
        const name = server.name;
        setInfoMessage(null);
        const result = await callBridgeRaw("oauth/authorize", { name: name }, "oauth-authorize:" + name);
        if (!mountedRef.current) return;
        if (!result.ok) {
          if (result.code === "authorization-in-flight") {
            // Another attempt (agent tool or another tab) is pending: wait, do not error.
            setAuthWaiting((previous) => {
              const next = Object.assign({}, previous);
              next[name] = Date.now();
              return next;
            });
            setInfoMessage(t("oauthInFlight"));
            return;
          }
          reportActionError(result, () => {
            void authorizeOauth(server);
          });
          return;
        }
        const value = result.value || {};
        if (value.status === "authorized") {
          clearOauthWaiting(name);
          setInfoMessage(t("oauthAuthorizedInfo"));
          await syncState();
          startSettle([name]);
          return;
        }
        const rawAuthorizationUrl = typeof value.authorizationUrl === "string" ? value.authorizationUrl : "";
        // Only ever open an absolute http(s) authorization endpoint.
        const authorizationUrl = /^https?:\/\//i.test(rawAuthorizationUrl) ? rawAuthorizationUrl : "";
        if (authorizationUrl && typeof window !== "undefined" && typeof window.open === "function") {
          try {
            window.open(authorizationUrl, "_blank", "noopener,noreferrer");
          } catch (error) {
            // popup blocked: the card keeps a clickable fallback link
          }
        }
        setAuthLinks((previous) => {
          const next = Object.assign({}, previous);
          if (authorizationUrl) next[name] = authorizationUrl;
          else delete next[name];
          return next;
        });
        setAuthWaiting((previous) => {
          const next = Object.assign({}, previous);
          next[name] = Date.now();
          return next;
        });
        setInfoMessage(authorizationUrl ? t("oauthBrowserOpened") : t("oauthAuthorizeStarted"));
      }

      async function submitOauthToken(server) {
        const current = tokenForm;
        if (!current || current.name !== server.name) return;
        const name = server.name;
        const token = String(current.value || "").trim();
        if (!token) {
          setTokenForm({ name: name, value: "", error: t("oauthTokenRequired") });
          return;
        }
        // Drop the token from React state before the request leaves the page.
        setTokenForm({ name: name, value: "", error: "" });
        const result = await callBridgeRaw("oauth/paste-token", { name: name, token: token }, "oauth-paste:" + name);
        if (!mountedRef.current) return;
        if (!result.ok) {
          setTokenForm({ name: name, value: "", error: t("oauthPasteFailed", { message: result.message || t("bridgeUnreachable") }) });
          return;
        }
        setTokenForm(null);
        clearOauthWaiting(name);
        setInfoMessage(t("oauthTokenSaved"));
        await syncState();
        startSettle([name]);
      }

      async function refreshOauth(server) {
        const name = server.name;
        const result = await callBridgeRaw("oauth/refresh", { name: name }, "oauth-refresh:" + name);
        if (!mountedRef.current) return;
        if (!result.ok) {
          reportActionError(result, () => {
            void refreshOauth(server);
          });
          return;
        }
        clearOauthWaiting(name);
        const value = result.value || {};
        setInfoMessage(value.authorized === false ? t("oauthRefreshUnauthorized") : t("oauthRefreshed"));
        await syncState();
        startSettle([name]);
      }

      async function signOutOauth(server) {
        const name = server.name;
        const result = await callBridgeRaw("oauth/signout", { name: name }, "oauth-signout:" + name);
        if (!mountedRef.current) return;
        if (!result.ok) {
          reportActionError(result, () => {
            void signOutOauth(server);
          });
          return;
        }
        clearOauthWaiting(name);
        setTokenForm((previous) => (previous && previous.name === name ? null : previous));
        setInfoMessage(t("oauthSignedOut"));
        await syncState();
        startSettle([name]);
      }

      function cancelOauthWait(name) {
        clearOauthWaiting(name);
        setInfoMessage(t("oauthWaitStopped"));
      }

      // Per-card manual refresh: always re-sync /state; if the card is enabled with
      // zero tools and is neither connecting nor errored, force a /reconnect too
      // (that child may be stuck), then follow the settle poll.
      async function refreshServerCard(server) {
        const name = server.name;
        if (busy !== "") return;
        stopSettle();
        seqRef.current += 1;
        setBusy("card-refresh:" + name);
        setActionError(null);
        try {
          const stateResult = await postBridge("state", {});
          if (!mountedRef.current) return;
          if (!stateResult || stateResult.ok !== true) {
            setActionError({ message: t("loadFailedDetail", { message: bridgeMessage(stateResult) }), retry: () => { void refreshServerCard(server); } });
            return;
          }
          applyPayload(stateResult.value);
          let current = findServerByName(asArray(stateResult.value && stateResult.value.servers), name) || server;
          let reconnected = false;
          if (serverCanForceReconnect(current)) {
            const reconnectResult = await postBridge("reconnect", { name: name });
            if (!mountedRef.current) return;
            if (!reconnectResult || reconnectResult.ok !== true) {
              setActionError({ message: t("actionFailed", { message: bridgeMessage(reconnectResult) }), retry: () => { void refreshServerCard(server); } });
              return;
            }
            applyPayload(reconnectResult.value);
            current = findServerByName(asArray(reconnectResult.value && reconnectResult.value.servers), name) || current;
            reconnected = true;
          }
          if (reconnected || serverNeedsSettle(current)) startSettle([name]);
        } catch (error) {
          if (mountedRef.current) {
            setActionError({ message: t("loadFailedDetail", { message: errorMessage(error) }), retry: () => { void refreshServerCard(server); } });
          }
        } finally {
          if (mountedRef.current) setBusy("");
        }
      }

      async function refreshAllOauth() {
        if (busy !== "") return;
        // The route answers counts only (no servers/tools); sync /state afterwards.
        const result = await callBridgeRaw("oauth/refresh-all", { force: true }, "refresh-all");
        if (!mountedRef.current) return;
        if (!result.ok) {
          reportActionError(result, () => {
            void refreshAllOauth();
          });
          return;
        }
        const value = result.value || {};
        const refreshed = Number(value.refreshed);
        const failed = Number(value.failed);
        const failedNames = [];
        const refreshedNames = [];
        for (const entry of asArray(value.results)) {
          if (!entry || typeof entry.name !== "string" || !entry.name) continue;
          if (entry.refreshed === true && refreshedNames.indexOf(entry.name) === -1) refreshedNames.push(entry.name);
          if (typeof entry.error === "string" && entry.error && failedNames.indexOf(entry.name) === -1) failedNames.push(entry.name);
        }
        let message = t("refreshAllSummary", {
          refreshed: Number.isFinite(refreshed) ? refreshed : 0,
          failed: Number.isFinite(failed) ? failed : 0,
        });
        if (failedNames.length > 0) message += " " + t("refreshAllFailedNames", { names: failedNames.join(", ") });
        setInfoMessage(message);
        const synced = await syncState();
        // The host respawns every child it refreshed: follow those cards through the
        // existing settle loop (same single controller; no new timer). Skip disabled
        // or removed servers using the freshly synced roster.
        if (refreshedNames.length > 0) {
          if (!synced) {
            startSettle(refreshedNames);
          } else {
            const serverList = asArray(synced.servers);
            const settleNames = refreshedNames.filter((name) => {
              const target = findServerByName(serverList, name);
              return !!target && target.enabled !== false;
            });
            startSettle(settleNames);
          }
        }
      }

      async function toggleEnabled(server, enabled) {
        const result = await callBridge("enabled", { name: server.name, enabled: enabled }, "enabled:" + server.name);
        if (result.ok) startSettle([server.name]);
        reportActionError(result, () => {
          void toggleEnabled(server, enabled);
        });
      }

      async function reconnect(server) {
        const result = await callBridge("reconnect", { name: server.name }, "reconnect:" + server.name);
        if (result.ok) startSettle([server.name]);
        reportActionError(result, () => {
          void reconnect(server);
        });
      }

      async function removeServer(name) {
        const result = await callBridge("remove", { name: name }, "remove:" + name);
        if (!mountedRef.current) return;
        if (result.ok) {
          setPendingRemove(null);
          clearOauthWaiting(name);
          setTokenForm((previous) => (previous && previous.name === name ? null : previous));
          setExpanded((previous) => {
            if (!previous[name]) return previous;
            const next = Object.assign({}, previous);
            delete next[name];
            return next;
          });
          return;
        }
        reportActionError(result, () => {
          void removeServer(name);
        });
      }

      async function saveServer(server) {
        const result = await callBridge("upsert", { server: server }, "save");
        if (!result.ok) return result;
        if (mountedRef.current) {
          setForm(null);
          setPendingRemove(null);
          setActionError(null);
          startSettle([server.name]);
        }
        return result;
      }

      function toggleExpanded(name) {
        setExpanded((previous) => {
          const next = Object.assign({}, previous);
          if (next[name]) delete next[name];
          else next[name] = true;
          return next;
        });
      }

      function openAdd() {
        if (busy !== "") return;
        setPendingRemove(null);
        setActionError(null);
        setTokenForm(null);
        setInfoMessage(null);
        setForm({ mode: "add", initial: emptyServer() });
      }

      function openEdit(server) {
        if (busy !== "") return;
        setPendingRemove(null);
        setActionError(null);
        setTokenForm(null);
        setInfoMessage(null);
        setForm({ mode: "edit", initial: server });
      }

      React.useEffect(() => {
        mountedRef.current = true;
        let unsubscribe = null;
        try {
          if (localeService && typeof localeService.subscribe === "function") {
            unsubscribe = localeService.subscribe(() => {
              if (mountedRef.current) setLocaleRevision((value) => value + 1);
            });
          }
        } catch (error) {
          unsubscribe = null;
        }
        void loadInitial();
        return () => {
          mountedRef.current = false;
          stopSettle();
          try {
            if (typeof unsubscribe === "function") unsubscribe();
          } catch (error) {
            // subscription already gone
          }
        };
      }, []);

      // Poll /state while a browser authorization is pending (2 s interval, 5 min
      // cap). The interval is cleared on unmount and whenever the pending set changes.
      React.useEffect(() => {
        const pendingNames = Object.keys(authWaiting);
        if (pendingNames.length === 0) return undefined;
        let disposed = false;
        const tick = async () => {
          if (disposed || !mountedRef.current) return;
          let result;
          try {
            result = await postBridge("state", {});
          } catch (error) {
            return;
          }
          if (disposed || !mountedRef.current) return;
          if (!result || result.ok !== true) return;
          applyPayload(result.value);
          const now = Date.now();
          const serverList = asArray(result.value && result.value.servers);
          const authorizedNames = [];
          const failedNames = [];
          const timedOut = [];
          for (const pendingName of pendingNames) {
            const target = findServerByName(serverList, pendingName);
            const targetOauth = target && target.oauth && typeof target.oauth === "object" ? target.oauth : null;
            const authorized = !!(targetOauth && targetOauth.authorized === true);
            const failed = !!(targetOauth && typeof targetOauth.error === "string" && targetOauth.error);
            if (authorized) authorizedNames.push(pendingName);
            else if (failed) failedNames.push(pendingName);
            else if (now - authWaiting[pendingName] > OAUTH_WAIT_TIMEOUT_MS) timedOut.push(pendingName);
          }
          const finished = authorizedNames.concat(failedNames);
          if (finished.length === 0 && timedOut.length === 0) return;
          for (const doneName of finished.concat(timedOut)) {
            setAuthWaiting((previous) => {
              const next = Object.assign({}, previous);
              delete next[doneName];
              return next;
            });
            setAuthLinks((previous) => {
              const next = Object.assign({}, previous);
              delete next[doneName];
              return next;
            });
          }
          // Hand the browser-flow wait over to the settle poll: the host is
          // respawning the child and its tool sync is still in flight.
          if (authorizedNames.length > 0) startSettle(authorizedNames);
          if (timedOut.length > 0) setInfoMessage(t("oauthWaitTimeout"));
          else if (authorizedNames.length > 0) setInfoMessage(t("oauthAuthorizedInfo"));
        };
        const timer = setInterval(() => {
          void tick();
        }, OAUTH_POLL_MS);
        return () => {
          disposed = true;
          clearInterval(timer);
        };
      }, [authWaiting]);

      // Refresh the expiry derivation periodically while any OAuth token has an
      // expiry, so a token that runs out while the page sits open flips to 已过期.
      React.useEffect(() => {
        let hasExpiry = false;
        if (state.status === "ready") {
          for (const candidate of asArray(state.servers)) {
            const candidateOauth = oauthOf(candidate);
            if (candidateOauth && candidateOauth.enabled === true && typeof candidateOauth.expiresAt === "number") {
              hasExpiry = true;
              break;
            }
          }
        }
        if (!hasExpiry) return undefined;
        const timer = setInterval(() => {
          if (mountedRef.current) setExpiryTick((value) => value + 1);
        }, 30000);
        return () => {
          clearInterval(timer);
        };
      }, [state]);

      const ready = state.status === "ready";
      const servers = ready ? asArray(state.servers) : [];
      const tools = ready ? asArray(state.tools) : [];
      const capabilities = ready && state.capabilities && typeof state.capabilities === "object" ? state.capabilities : null;

      const autoRefreshInfo = capabilities && capabilities.autoRefresh && typeof capabilities.autoRefresh === "object" ? capabilities.autoRefresh : null;

      const toolsByServer = {};
      for (const tool of tools) {
        const serverName = tool && typeof tool.server === "string" ? tool.server : "";
        if (!toolsByServer[serverName]) toolsByServer[serverName] = [];
        toolsByServer[serverName].push(tool);
      }

      let content;
      if (state.status === "loading") {
        content = jsxs("div", {
          className: "mcpm-skeletonList",
          role: "status",
          "aria-busy": "true",
          "aria-label": t("loading"),
          children: [
            jsx("div", { className: "mcpm-skeleton" }),
            jsx("div", { className: "mcpm-skeleton" }),
            jsx("div", { className: "mcpm-skeleton" }),
          ],
        });
      } else if (state.status === "error") {
        content = jsxs("div", {
          className: "mcpm-empty",
          role: "alert",
          children: [
            jsx("div", { className: "mcpm-emptyTitle", children: t("loadFailed") }),
            state.message ? jsx("div", { className: "mcpm-errorDetail", children: state.message }) : null,
            jsx("button", {
              type: "button",
              className: "mcpm-btn mcpm-btnSmall",
              onClick: () => {
                void loadInitial();
              },
              children: t("retry"),
            }),
          ],
        });
      } else if (servers.length === 0) {
        content = jsxs("div", {
          className: "mcpm-empty",
          children: [
            jsx("div", { className: "mcpm-emptyTitle", children: t("noServersTitle") }),
            jsx("div", { children: t("noServersHint") }),
          ],
        });
      } else {
        content = jsx("ul", {
          className: "mcpm-list",
          children: servers.map((server) =>
            jsx(
              ServerCard,
              {
                server: server,
                tools: toolsByServer[server.name] || [],
                expanded: !!expanded[server.name],
                busy: busy,
                pendingRemove: pendingRemove === server.name,
                auth: {
                  waiting: !!authWaiting[server.name],
                  url: authLinks[server.name] || "",
                  token: tokenForm && tokenForm.name === server.name ? tokenForm : null,
                  onAuthorize: () => {
                    void authorizeOauth(server);
                  },
                  onOpenPaste: () => {
                    setTokenForm({ name: server.name, value: "", error: "" });
                  },
                  onCancelPaste: () => setTokenForm(null),
                  onTokenChange: (value) => {
                    setTokenForm((previous) => (previous && previous.name === server.name ? { name: server.name, value: value, error: "" } : previous));
                  },
                  onSubmitToken: () => {
                    void submitOauthToken(server);
                  },
                  onRefresh: () => {
                    void refreshOauth(server);
                  },
                  onSignOut: () => {
                    void signOutOauth(server);
                  },
                  onCancelWait: () => cancelOauthWait(server.name),
                },
                onToggle: () => toggleExpanded(server.name),
                onToggleEnabled: () => {
                  void toggleEnabled(server, server.enabled === false);
                },
                onReconnect: () => {
                  void reconnect(server);
                },
                onRefresh: () => {
                  void refreshServerCard(server);
                },
                onEdit: () => openEdit(server),
                onRemoveRequest: () => {
                  if (busy === "") setPendingRemove(server.name);
                },
                onRemoveCancel: () => setPendingRemove(null),
                onRemoveConfirm: () => {
                  void removeServer(server.name);
                },
              },
              server.name
            )
          ),
        });
      }

      const capabilityIssues = [];
      if (capabilities && capabilities.spawn === false) capabilityIssues.push(t("capabilitySpawnMissing"));
      if (capabilities && capabilities.persist === false) capabilityIssues.push(t("capabilityPersistMissing"));
      const capabilityBanner =
        capabilityIssues.length > 0
          ? jsx("div", {
              className: "mcpm-banner mcpm-bannerWarn",
              role: "status",
              children: jsxs("div", {
                className: "mcpm-bannerText",
                children: [
                  jsx("div", { children: capabilityIssues.join(" ") }),
                  capabilities && typeof capabilities.detail === "string" && capabilities.detail
                    ? jsx("div", { className: "mcpm-capDetail", children: capabilities.detail })
                    : null,
                ],
              }),
            })
          : null;

      const actionErrorBanner = actionError
        ? jsxs("div", {
            className: "mcpm-banner mcpm-bannerError",
            role: "alert",
            children: [
              jsx("div", { className: "mcpm-bannerText", children: actionError.message }),
              jsxs("div", {
                className: "mcpm-bannerActions",
                children: [
                  actionError.retry
                    ? jsx("button", {
                        type: "button",
                        className: "mcpm-btn mcpm-btnSmall",
                        disabled: busy !== "",
                        onClick: actionError.retry,
                        children: t("retry"),
                      })
                    : null,
                  jsx("button", {
                    type: "button",
                    className: "mcpm-btn mcpm-btnSmall",
                    onClick: () => setActionError(null),
                    children: t("dismiss"),
                  }),
                ],
              }),
            ],
          })
        : null;

      const infoBanner = infoMessage
        ? jsxs("div", {
            className: "mcpm-banner mcpm-bannerInfo",
            role: "status",
            children: [
              jsx("div", { className: "mcpm-bannerText", children: infoMessage }),
              jsxs("div", {
                className: "mcpm-bannerActions",
                children: [
                  jsx("button", {
                    type: "button",
                    className: "mcpm-btn mcpm-btnSmall",
                    onClick: () => setInfoMessage(null),
                    children: t("dismiss"),
                  }),
                ],
              }),
            ],
          })
        : null;

      let autoRefreshLine = null;
      if (ready && autoRefreshInfo) {
        const refreshEnabled = autoRefreshInfo.enabled === true;
        const parts = [];
        if (refreshEnabled) {
          parts.push(jsx("span", {
            children: t("autoRefreshLine", {
              interval: formatDuration(autoRefreshInfo.intervalMs),
              lead: formatDuration(autoRefreshInfo.leadMs),
            }),
          }, "line"));
        } else {
          parts.push(jsx("span", { children: t("autoRefreshOff") }, "off"));
        }
        const lastTime = formatClock(autoRefreshInfo.lastRunAt);
        if (lastTime) parts.push(jsx("span", { children: t("autoRefreshLast", { time: lastTime }) }, "last"));
        const nextTime = formatClock(autoRefreshInfo.nextRunAt);
        if (nextTime) parts.push(jsx("span", { children: t("autoRefreshNext", { time: nextTime }) }, "next"));
        if (typeof autoRefreshInfo.lastError === "string" && autoRefreshInfo.lastError) {
          parts.push(jsx("span", { className: "mcpm-autoRefreshError", children: t("autoRefreshError", { error: autoRefreshInfo.lastError }) }, "error"));
        }
        autoRefreshLine = jsxs("div", { className: "mcpm-autoRefresh", children: parts });
      }

      const policyPanel =
        ready && autoRefreshInfo
          ? jsx(
              RefreshPolicyPanel,
              {
                info: autoRefreshInfo,
                onSaved: () => {
                  void quietResync();
                },
              },
              "policy",
            )
          : null;

      const formPanel = form
        ? jsx(
            ServerForm,
            {
              mode: form.mode,
              initial: form.initial,
              saving: busy === "save",
              onSubmit: saveServer,
              onCancel: () => {
                if (busy !== "save") setForm(null);
              },
            },
            "form:" + form.mode + ":" + (form.initial && form.initial.name ? form.initial.name : "new")
          )
        : null;

      return jsxs("div", {
        className: "mcpm-root",
        children: [
          jsx("style", { children: CSS }),
          jsxs("div", {
            className: "mcpm-header",
            children: [
              jsxs("div", {
                className: "mcpm-headText",
                children: [
                  jsx("h2", { className: "mcpm-title", children: t("tabLabel") }),
                  jsx("p", { className: "mcpm-desc", children: t("pageDescription") }),
                ],
              }),
              jsxs("div", {
                className: "mcpm-actions",
                children: [
                  jsx("button", {
                    type: "button",
                    className: "mcpm-btn",
                    disabled: busy !== "",
                    onClick: () => {
                      void refresh();
                    },
                    children: busy === "refresh" ? t("refreshing") : t("refresh"),
                  }),
                  autoRefreshInfo
                    ? jsx("button", {
                        type: "button",
                        className: "mcpm-btn",
                        disabled: busy !== "",
                        onClick: () => {
                          void refreshAllOauth();
                        },
                        children: busy === "refresh-all" ? t("refreshAllBusy") : t("refreshAll"),
                      })
                    : null,
                  jsx("button", {
                    type: "button",
                    className: "mcpm-btn mcpm-btnPrimary",
                    disabled: busy !== "" || !!form,
                    onClick: openAdd,
                    children: t("addServer"),
                  }),
                ],
              }),
            ],
          }),
          autoRefreshLine,
          policyPanel,
          ready ? jsx("div", { className: "mcpm-summary", children: t("summary", { servers: servers.length, tools: tools.length }) }) : null,
          capabilityBanner,
          actionErrorBanner,
          infoBanner,
          formPanel,
          content,
        ],
      });
    }
    // #endregion

    // #region registration
    function apply(ctx) {
      try {
        initLocale(ctx);
      } catch (error) {
        // locale is optional; the navigator fallback keeps the page usable
      }
      ctx.slots.inject("settings.plugins.tab", () =>
        ctx.slots.register(
          {
            name: "settings.plugins.tab",
            id: "mcp-servers",
            order: 40,
            label: () => t("tabLabel"),
          },
          () => jsx(McpManagerPage, {})
        )
      );
    }

    exports.inject = ["slots"];
    exports.apply = apply;
    return module.exports;
  },
});
