# huashu-chrome integration

Source: https://github.com/alchaincyf/huashu-chrome

The MIT-licensed content script is preserved unchanged with its license. Astra adapts its Chrome messaging entrypoint inside Electron isolated world 999. The upstream MCP server, Chrome extension service worker, remote bridge, debugger transport, and arbitrary evaluation tools are not installed. Current integration exposes the snapshot, read_text, query, click, type, key, scroll, wait, and expect actions through a bounded ZenMux tool loop. Mutating actions require a local approval dialog. Embedded frames are listed through Electron CDP and operated in isolated frame contexts. Same-process frame snapshots and contenteditable input have local fixture coverage. Out-of-process cross-origin frames and other CDP-only actions require further validation.
