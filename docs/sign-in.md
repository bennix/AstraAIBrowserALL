# Authentication window integration

The main process keeps recognized identity-provider windows as native Electron popups with the opener's existing Session and sandbox preferences. HTTPS X, Twitter, Google identity, Apple identity and Muse pages may create an initial empty/about:blank authentication handoff window. X onboarding, flow and OAuth callback routes remain popups rather than being diverted into independent tabs. Ordinary links still open as tabs. Identity host checks reject lookalike origins and insecure provider URLs.

Settings can export up to 300 recent authentication status events from memory. Exports contain coarse route categories, HTTP status codes and recognized console error categories. They exclude query strings, credentials, cookies, request/response bodies and arbitrary path segments. Events are not persisted by default. The existing explicitly enabled developer diagnostic log remains separate.

Popup routing tests establish opener-session preservation and routing boundaries. They do not prove that a remote account login succeeds. First-login validation requires a fresh profile and a user-completed Google authentication challenge. Network restrictions or X account risk checks can still cause login failures and require evidence from the failing machine.

## Diagnostic format 2

Format 2 also includes api.x.com and api.twitter.com, known network error identifiers, effective and report-only COOP directives, and recognized window-operation warnings. The response-header observer returns headers unchanged. COOP console warnings alone do not establish an authentication failure.

The Chromium integration layer can observe X onboarding task responses and export numeric error codes. Raw response bodies are inspected transiently, never exported or persisted, and Google credential responses are excluded. Script exception descriptions are reduced to fixed categories. This instrumentation diagnoses failures; it does not disable origin isolation or establish that sign-in is repaired.

Apple authorization and authentication-widget paths on appleid.apple.com and idmsa.apple.com remain native authentication popups. These exact HTTPS authentication paths use native rendering and font APIs to avoid a blank authentication form under strict fingerprint restrictions. Unrelated Apple account pages and lookalike hosts keep strict protection. Apple account verification still requires a user-completed sign-in.

X canvas compatibility also covers the signed-out root landing page while a username login input is present. It is checked dynamically at each protected read; removal of the login input restores restrictions. Audio, WebGL and font restrictions on X remain unchanged.
