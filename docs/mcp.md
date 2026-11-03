# Local MCP integration

Settings provides an MCP server switch, a separate automated page actions switch, a port, configuration copy buttons and a connection test. Both switches default to off. The browser must remain open.

The server uses the official MCP SDK with stateless Streamable HTTP at `http://127.0.0.1:17890/mcp` by default. It binds only to loopback, checks Host, rejects browser Origin headers and requires a bearer credential encrypted by Electron safeStorage. Configuration copy buttons place that credential on the clipboard; keep it private. No AI API key is required for MCP.

Copy the Codex configuration into the client's MCP configuration, or use the JSON configuration with compatible clients. The connection test performs a real protocol handshake, tool discovery and tab inspection. It does not test another application's configuration.

`browser_tabs` lists tabs. `browser_read` inspects HTTP(S) pages and screenshots. `browser_action` supports navigation, tabs, clicks, typing, keys, scrolling and selection only when automated actions are enabled. Clients must take fresh snapshots, handle stale references and verify task completion. Page contents are untrusted data. The client remains responsible for authorization of consequential actions and credentials.

The main process owns tab access and dispatches page operations through the existing browser-agent command adapter and frame integration. There is no arbitrary script, cookie or filesystem tool. Existing in-app AI control retains its confirmation behavior. Concurrent AI and MCP page control is rejected.

Disabling the service cancels outstanding requests and prevents further calls. Disabling automated actions blocks subsequent writes. Already dispatched browser operations cannot be undone by cancellation. Signed-in page contents remain sensitive even in read-only mode.

Protocol reference: https://ts.sdk.modelcontextprotocol.io/server
