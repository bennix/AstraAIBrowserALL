# Authentication window integration

The main process keeps recognized identity-provider windows as native Electron popups with the opener's existing Session and sandbox preferences. HTTPS X, Twitter, Google identity and Muse pages may create an initial empty/about:blank authentication handoff window. X onboarding, flow and OAuth callback routes remain popups rather than being diverted into independent tabs. Ordinary links still open as tabs. Identity host checks reject lookalike origins and insecure provider URLs.

Settings can export up to 300 recent authentication status events from memory. Exports contain coarse route categories, HTTP status codes and recognized console error categories. They exclude query strings, credentials, cookies, request/response bodies and arbitrary path segments. Events are not persisted by default. The existing explicitly enabled developer diagnostic log remains separate.

Popup routing tests establish opener-session preservation and routing boundaries. They do not prove that a remote account login succeeds. First-login validation requires a fresh profile and a user-completed Google authentication challenge. Network restrictions or X account risk checks can still cause login failures and require evidence from the failing machine.
