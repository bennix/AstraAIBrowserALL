# Authentication window integration

The main process keeps recognized identity-provider windows as native Electron popups with the opener's existing Session and sandbox preferences. HTTPS X, Twitter, Google identity, Apple identity and Muse pages may create an initial empty/about:blank authentication handoff window. X onboarding, flow and OAuth callback routes remain popups rather than being diverted into independent tabs. Ordinary links still open as tabs. Identity host checks reject lookalike origins and insecure provider URLs.

Settings can export up to 1,000 recent authentication status events from memory. Exports contain coarse route categories, HTTP status codes and recognized console error categories. They exclude query strings, credentials, cookies, request/response bodies and arbitrary path segments. Events are not persisted by default. The existing explicitly enabled developer diagnostic log remains separate.

Popup routing tests establish opener-session preservation and routing boundaries. They do not prove that a remote account login succeeds. First-login validation requires a fresh profile and a user-completed Google authentication challenge. Network restrictions or X account risk checks can still cause login failures and require evidence from the failing machine.

## Diagnostic format 2

Format 2 also includes api.x.com and api.twitter.com, known network error identifiers, effective and report-only COOP directives, and recognized window-operation warnings. The response-header observer returns headers unchanged. COOP console warnings alone do not establish an authentication failure.

The Chromium integration layer can observe X onboarding task responses and export numeric error codes. Raw response bodies are inspected transiently, never exported or persisted, and Google credential responses are excluded. Script exception descriptions are reduced to fixed categories. This instrumentation diagnoses failures; it does not disable origin isolation or establish that sign-in is repaired.

Apple authorization and authentication-widget paths on appleid.apple.com and idmsa.apple.com remain native authentication popups. These exact HTTPS authentication paths use native rendering and font APIs to avoid a blank authentication form under strict fingerprint restrictions. Unrelated Apple account pages and lookalike hosts keep strict protection. Apple account verification still requires a user-completed sign-in.

On HTTPS x.com, twitter.com, grok.com and www.grok.com, strict fingerprint restrictions are bypassed for compatibility. Other hosts retain their existing policy.

The response observer also covers SSO initialization, SSO finalization, version 2 onboarding tasks and guest activation, including HTTP 200 responses that contain application errors. Exports include a fixed stage category and allowlisted login subtask identifiers, never flow tokens or arbitrary subtask content. HTTP success alone does not prove sign-in success.

## Cross-machine testing with diagnostic format 3

Reproduce the failure and immediately use Settings > Export login diagnostics. The export contains app, Electron, Chromium, OS and CPU architecture versions, selected privacy switches, proxy mode (not its address), website languages and timezone. Sequential event numbers, capture start/export timestamps and a dropped-event counter identify incomplete captures. The bounded memory buffer retains the latest 1,000 events and is discarded on exit. Nothing is uploaded automatically.

Record separately whether this was a fresh installation or an existing profile, which provider was used, and whether the error appeared before or after provider authentication. Test with the same account and network in another browser. A successful HTTP response is not proof of authenticated state; verify the home timeline and account controls. Never send passwords or verification codes with the report.
