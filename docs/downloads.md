# File download integration

The media module owns ordinary Electron DownloadItem tracking as well as media helper jobs. The main process binds the browser session once and publishes file progress through the existing download shelf channel. File updates include received bytes, known total bytes, percentage, sampled speed and estimated remaining time. Unknown totals remain indeterminate.

Recoverable interruptions attempt resume at most three times with 2, 5 and 10 second delays. The shelf also offers manual resume. Terminal interruptions retain a manual retry action, which starts a new download using Electron's normal destination selection. Server support determines whether resume preserves received bytes or starts over. Retry timers are cleared on completion, cancellation and shutdown. Cancelled entries are removed from the shelf; cancellation does not delete an existing completed file.

Download state is currently scoped to the running application. Resume after quitting the browser is not implemented.
