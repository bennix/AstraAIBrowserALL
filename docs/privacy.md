# Privacy controls and network boundaries

WebContents receive the disable_non_proxied_udp WebRTC policy before navigation. The macOS development build reported No Leak on BrowserLeaks, without local/public WebRTC addresses.

Secure DNS is enabled by default. proxy.cjs owns proxy configuration for web, AI and media sessions. proxy-dns.cjs is its loopback adapter: it resolves website hostnames with Cloudflare DoH through an isolated upstream session, then connects the configured proxy to the returned IP. HTTPS remains an end-to-end tunnel: the original hostname is retained by the browser for SNI and normal certificate validation. This adapter replaces handing website hostname resolution to an upstream HTTP proxy, because configureHostResolver alone cannot control that proxy's DNS. Resolution failure is fail-closed. IP literals do not require DNS. Proxy endpoint bootstrap, PAC evaluation, upstream traffic inspection and other applications remain outside this guarantee. The upstream proxy client's configuration is not modified. Supported routes are direct, HTTP CONNECT, HTTPS CONNECT and unauthenticated SOCKS5.

Strict fingerprint controls apply deterministic per-origin, per-browser-session micro-noise to common Canvas 2D readouts/exports, AudioBuffer.getChannelData and float AnalyserNode readouts. A cryptographically random session salt stays in preload arguments/closures, rather than a page-global variable. Exported canvases use temporary copies; audio channels are perturbed once rather than accumulating noise on repeated reads. WebGL contexts/capability parameters, font metrics and API constructors remain native. Exports above 1,048,576 pixels use native output to avoid large temporary bitmap allocations; this is not comprehensive fingerprint protection. Claude/Anthropic domains, gemini.google.com, accounts.google.com and challenges.cloudflare.com are explicit compatibility exceptions for verification; network controls and privacy signals remain active.

On HTTPS x.com, twitter.com, grok.com and www.grok.com, strict fingerprint restrictions are bypassed for compatibility. Other hosts retain their existing policy.

The readout-noise injection is document-level; Worker/cross-frame fingerprint-read coverage and resistance to all fingerprinting methods are not guaranteed. JS modifications and noise can be detected; no Function.prototype.toString spoofing is installed. Native canvas taint/security checks remain effective. Settings changes to fingerprint controls and JavaScript privacy signals require a restart.

Do Not Track and Global Privacy Control express a preference; websites may ignore them. When enabled, navigator.doNotTrack reports "1" to match the DNT: 1 request header, and the GPC property matches Sec-GPC: 1. App-specific Astra/Electron version tokens are omitted from the User-Agent, while the actual Chromium engine/OS identity and native Client Hints are retained consistently in requests, pages and dedicated workers. These changes reduce extra identifying markers; they do not conceal the upstream proxy's TCP stack or latency. Login state, cookies, IP/ASN, timezone, screen characteristics and behavior can still identify users. No anonymity, VPN invisibility or account-risk score guarantee is made.

Browsing history is local, capped at 1,000 entries. The History menu opens the latest 100 entries. History deletion also clears tab navigation stacks. Cookie/site-data deletion clears the browsing session's storage/cache after confirmation, retaining app settings and the encrypted AI key. Clearing local history is not a secure disk wipe.

External DNS validation on the macOS development build: BrowserLeaks reported six Cloudflare resolvers, one ISP (Cloudflare), and one location. This is an observation for the tested network, not a guarantee for every proxy configuration.

Bookmarks are stored locally and support explicit addition/removal through the star button, Cmd/Ctrl+D and the Bookmarks menu.

The interface remains Chinese-first while website region settings are independent. By default, website-region matching queries [ipapi.co](https://ipapi.co/api/) through the same browsing session/proxy used by tabs, with [ipwho.is](https://ipwhois.io/documentation) as a fallback. Requests omit cookies; no GPS is used. Only country, IANA timezone, language list, provider and match timestamp are cached locally, not the response IP or precise location. Matching runs on startup, proxy changes, manual refresh and every five minutes. Results are approximate and split routing or conflicting geolocation databases can cause mismatches. Query failure retains the last successful profile (or manual/system values if none exists) and exposes the failure in Settings. Manual mode disables these matching requests and accepts validated IANA zones.

Main tab profiles are applied before external navigation, including matching Accept-Language and navigator.languages. UA Client Hints are captured from Chromium itself in an isolated local secure-origin fixture, rather than fabricated or cleared. New dedicated/nested workers receive the same language/identity override before execution; timezone is applied through Chromium's native emulation. Dedicated Worker/page/header consistency is covered by a real Electron fixture; every shared/service-worker lifecycle or cross-frame case is not guaranteed. Operating-system settings are unchanged.

On 2026-11-06, the macOS development build was checked at [who.1ms.dog](https://who.1ms.dog/zh-cn/). The detected exit was Malaysia; automatic matching selected Asia/Kuala_Lumpur and ms-MY,en,zh,ta. The site marked timezone/IP, language/IP, page/Worker consistency and WebRTC public-IP leakage as passing. Its warning count fell from 6 to 4, while its overall concealment grade remained F. DNS geography (Singapore versus Malaysia), latency, proxy TCP characteristics and detectable JS noise remained. These observations describe that tested route, not an anonymity or proxy-concealment guarantee.

Run `npm run check:privacy-browser` to verify deterministic Canvas/PNG/Blob/Offscreen/Audio behavior, origin/session separation, native WebGL/audio availability, canvas taint protection, page/Worker/header locale consistency and the native WebRTC policy using isolated local fixtures.

## X login compatibility validation

On the macOS development build, a clean browser profile completed Google sign-in, Google two-step verification and X email verification, then returned to the authenticated X home timeline without a browser-forced redirect. Restarting the same profile retained its X session. Regression checks cover native APIs on X and Grok and continued protection on unrelated hosts.

WeduLab lessons and other sites can create native WebGL/WebGPU rendering contexts and use native font metrics. Canvas/audio readout noise remains enabled on these sites when strict protection is selected.

Google Notebook (`https://notebook.google.com` and the legacy `https://notebooklm.google.com`) uses the same native font/canvas compatibility as Gemini to avoid application bootstrap failures. This adds no exception for other Google subdomains. Image context menus copy decoded images through Chromium’s native clipboard API without requiring page canvas access.

Google account-add windows keep their native authentication flow and shared browser session. After a first-party Google/YouTube application finishes loading, Astra opens that final URL (including account-routing parameters) in a normal tab and closes the login window only after the tab loads successfully. Third-party OAuth callbacks remain in their native windows.

A resolver IP geolocated in another country is not by itself proof that the local ISP or real client IP leaked. Public anycast resolvers can have geographically misleading IP records. The application does not disable encrypted DNS, WebRTC safeguards, or browser certificate checks to improve a third-party concealment score. A purchased proxy's remote DNS, UDP support, TCP characteristics, exit reputation and extra network distance are controlled by the provider/network rather than the browser.

## Optional telemetry and agent access

Astra's source does not integrate Datadog analytics or automatically send hostnames, machine IDs, Git commit IDs or workspace status. Model requests do send the user-supplied conversation, explicitly included webpage text/images, and browser-task observations to the configured ZenMux service; that is functional data transmission, not a guarantee of zero data leaving the device. External pages and separately installed tools have their own network behavior.

MCP and automated actions remain off by default. When enabled, MCP now exposes only the active tab unless background-tab access is explicitly enabled. It supplies browser tools, not shell, arbitrary JavaScript, cookie export or arbitrary filesystem access. Its bearer credential remains encrypted locally; requests are bound to loopback with Host/Origin checks. A separately installed MCP client or plugin is outside this application's sandbox.

The [Claude Code network documentation](https://code.claude.com/docs/en/network-config) distinguishes the model/API, optional Datadog intake, browser bridge and update hosts. Blocking all four addresses from a screenshot would also break legitimate functionality. The optional login-environment telemetry controls use [documented opt-out variables](https://code.claude.com/docs/en/data-usage#telemetry-services), preserve API/update addresses, and can affect Remote Control. They only reach tools launched with the new environment, not an already-running CLI.

Encrypted DNS now offers explicit Cloudflare or Google selection. Google queries request a zero-length EDNS client subnet. DNS failure still has no plaintext/direct resolver fallback for visited hostnames. DNS-provider/proxy bootstrap remains outside that guarantee. On the tested Malaysia route, both providers reported Singapore resolvers without a shared client subnet; no same-country DNS or proxy-concealment improvement is claimed. The country of a public resolver alone does not establish a leak of the real client IP.

[Exit-adaptive login environment and restoration](session-environment.md) describes the optional cross-platform host-session scope, locale fallbacks, watchdog, and recovery boundaries.

### Detailed device Client Hints

Astra withholds the optional `platformVersion`, `architecture`, `bitness` and
`model` values through Chromium's native User-Agent metadata override. The same
metadata is applied to pages and attached Worker/frame targets, covering native
`navigator.userAgentData` reads and Client Hint request headers without replacing
those JavaScript methods. Real platform family, mobile status and engine versions
remain available for compatibility. WebGL/GPU enums, screen geometry, font metrics
and API constructors remain native; this change does not conceal the operating
system family, all hardware inference, or a proxy server's TCP fingerprint.

Protocol reference: https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#type-UserAgentMetadata
Validation: `npm run check` and `npm run check:privacy-browser` (local secure-origin
fixtures verify empty architecture/OS-version hints and matching page/Worker
identity while preserving native WebGL rendering and existing Canvas/audio checks).

### Legacy fingerprint mode

The settings switch “使用 0.1.16 指纹屏蔽模式” defaults on when unset.
After restarting, it selects the fingerprint preload preserved from release
0.1.16 (`b788e5b`). Turning it off selects the current Canvas/audio noise preload.
Both obey the existing strict-protection master switch and retain their site
compatibility exceptions. The legacy mode can block graphics/audio/font features.
This selector does not revert other fixes, reduced Client Hints, exit-region
matching or login-environment settings. Save privacy settings and restart to apply.

### IPv6-only proxy exits

The encrypted DNS bridge queries both A and AAAA records, retains multiple usable
addresses and staggers connection attempts through the selected proxy. A rejected
or blackholed IPv4 destination no longer prevents trying IPv6. SOCKS5 uses the
numeric IPv4/IPv6 address types from RFC 1928; HTTP CONNECT brackets IPv6 literals.
Plain HTTP IPv6 literals do not enter DNS resolution. Cloudflare JSON queries use the official dual-stack
`https://cloudflare-dns.com/dns-query` endpoint. Chromium resolver bootstrap uses
both encrypted literal endpoints (`1.1.1.1` and `2606:4700:4700::1111`) to avoid
requiring DNS to resolve its own DNS server. DNS, TLS validation and configured proxy routing remain in
force; failed proxy attempts do not add an unconfigured direct fallback.

Tests use local IPv6 proxy fixtures on macOS, Windows and Linux, including an
IPv6-only exit, blackholed IPv4, failed A lookup, literal IPv6, HTTP CONNECT,
SOCKS5 and fail-closed behavior. These do not replace testing a user's provider.
An IPv6-only exit still needs provider-side translation to reach IPv4-only sites.

References: https://www.rfc-editor.org/info/rfc1928/ and
https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/

### Navigation and background environment startup

New tabs apply a cached exit-region profile immediately. Without a cached profile,
region detection can delay initial navigation by at most 1.5 seconds; later lookup
results update the locale in the background. Global login-environment startup is
not part of the navigation dependency chain. Its recovery helper has a 20-second
readiness deadline with bounded startup diagnostics; environment variables are
only changed after the helper confirms readiness. Original five-second startup
failures were not reproduced consistently; the installed signed runtime also has
a real Electron-parent handshake probe.

### Website language priority

Website language defaults to Chinese first, then English, independently of the
exit timezone. Settings also provide English first or an explicit exit-language
choice. Browser language headers, page/Worker locale and optional login-session
locale use this preference. A preferred Chinese/English language is also applied
to Gemini's main application `hl` query parameter; sign-in paths, other hosts,
and the explicit exit-language choice are not rewritten. Other sites may still
use their own account or cookie language setting. Preferring Chinese/English can
differ from the exit country's majority language; this is an intentional user
preference, not a claim to hide that difference.
