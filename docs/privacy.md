# Privacy controls and network boundaries

WebContents receive the disable_non_proxied_udp WebRTC policy before navigation. The macOS development build reported No Leak on BrowserLeaks, without local/public WebRTC addresses.

Secure DNS is enabled by default. proxy.cjs owns proxy configuration for web, AI and media sessions. proxy-dns.cjs is its loopback adapter: it resolves website hostnames with Cloudflare DoH through an isolated upstream session, then connects the configured proxy to the returned IP. HTTPS remains an end-to-end tunnel: the original hostname is retained by the browser for SNI and normal certificate validation. This adapter replaces handing website hostname resolution to an upstream HTTP proxy, because configureHostResolver alone cannot control that proxy's DNS. Resolution failure is fail-closed. IP literals do not require DNS. Proxy endpoint bootstrap, PAC evaluation, upstream traffic inspection and other applications remain outside this guarantee. The upstream proxy client's configuration is not modified. Supported routes are direct, HTTP CONNECT, HTTPS CONNECT and unauthenticated SOCKS5.

Strict fingerprint controls restrict common canvas, WebGL, audio and font reads in document preloads. Claude/Anthropic domains and challenges.cloudflare.com are explicit compatibility exceptions for verification; network controls and privacy signals remain active. Worker/cross-frame coverage and resistance to all fingerprinting methods are not guaranteed. Sites may break when reads are denied. Settings changes to fingerprint controls and JavaScript privacy signals require a restart.

Do Not Track and Global Privacy Control express a preference; websites may ignore them. Login state, cookies, IP/ASN, timezone, screen characteristics and behavior can still identify users. No anonymity, VPN invisibility or account-risk score guarantee is made.

Browsing history is local, capped at 1,000 entries. The History menu opens the latest 100 entries. History deletion also clears tab navigation stacks. Cookie/site-data deletion clears the browsing session's storage/cache after confirmation, retaining app settings and the encrypted AI key. Clearing local history is not a secure disk wipe.

External DNS validation on the macOS development build: BrowserLeaks reported six Cloudflare resolvers, one ISP (Cloudflare), and one location. This is an observation for the tested network, not a guarantee for every proxy configuration.

Bookmarks are stored locally and support explicit addition/removal through the star button, Cmd/Ctrl+D and the Bookmarks menu.
