# WebRTC network boundary

Every WebContents receives Electron's `disable_non_proxied_udp` IP handling policy at creation, before page navigation. This includes browser tabs, authentication windows and the application shell. The policy prevents WebRTC from using direct, non-proxied UDP independently of the configured browsing proxy.

The WebRTC API remains available. Connectivity that depends on direct UDP may fail or use a supported TCP/relay path. This policy does not make HTTP requests anonymous or replace a proxy/VPN.

The macOS development build was checked on BrowserLeaks WebRTC Leak Test and reported No Leak, with no local or public WebRTC IP candidates. Other operating systems and network configurations require independent runtime validation.
