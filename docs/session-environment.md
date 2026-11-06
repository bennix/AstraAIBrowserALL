# Exit-adaptive login environment

This feature adapts the current user's launch environment to Astra's detected browsing exit. It uses the validated IP-derived timezone and language profile; no country, timezone or language is fixed to Malaysia. Proxy changes in Astra trigger a lookup immediately; changes made in an external VPN/proxy app are noticed by periodic matching (up to five minutes, provided lookup services are reachable). A failed lookup retains the last successful profile and shows a failure status.

## Scope and platforms

Enable **Sync login environment** in Settings. This is opt-in because it affects applications launched afterward, not just Astra. The browser interface remains Chinese-first. The feature changes only `TZ`, `LANG`, `LANGUAGE`, `LC_ALL` and `LC_MESSAGES`. The separate tool-telemetry option temporarily adds `DISABLE_TELEMETRY=1` and `DISABLE_ERROR_REPORTING=1`; it is off by default and can affect Claude Code Remote Control. `HOME`, `PATH`, proxy credentials, shell startup files, account configuration and machine identity are not changed.

- macOS uses the current user's `launchctl` environment.
- Linux uses the current user's systemd environment manager; a working user D-Bus/systemd session is required. Services/applications launched through that manager see the new environment. Other desktop launchers or existing shells need not inherit it.
- Windows uses the current user's environment registry values and broadcasts an environment-change notification. A temporary RunOnce recovery entry covers an interrupted logout/reboot; it is removed on successful restore. The bundled Node runtime is copied into the private recovery directory so recovery can run independently of an app update or removal.

The same profile is also applied to Astra's process and newly created child processes. Already-running third-party programs cannot be retroactively reconfigured; they need restarting. Environment variables are not the operating-system clock, GUI language preferences, or a Linux virtual machine. Windows programs must actually support these variables to use them. No administrator-level timezone or language settings are changed.

The available UTF-8 locales are checked on macOS/Linux. If the exit country's primary POSIX locale is not installed, the first supported language from the region profile is used, with an explicit fallback status. For example, this Mac lacks `ms_MY.UTF-8`; `en_US.UTF-8` is an available English fallback while the browser can still use `ms-MY`. No invalid system locale is reported as installed.

## Restoration and ownership

Before changing anything, Astra records a private, atomic snapshot that distinguishes missing values from empty strings and preserves Windows string/expandable-string registry types. A cross-process lease prevents two Astra sessions from racing over the same login environment. Region changes update the active values without replacing the original snapshot.

Normal quit waits for restoration. A separate, network-free watchdog restores after forced process termination. Recovery records are retried at startup; Windows additionally registers a one-shot next-login recovery command for shutdown/power-loss cases. No userspace program can guarantee restoration during an abrupt power loss before the next execution opportunity. Do not remove the recovery directory while a session is active.

Restore uses compare-and-set: values changed independently by another application are left alone and reported. Failures retain the recovery record. The watchdog and recovery files operate only on the seven allowlisted keys; they contain no account tokens, cookies, exit IP, or workspace files. Permissions and recovery-component availability are checked before applying the environment.

## Validation

`npm run check:login-environment` exercises the native user-session API, normal restoration, and forced-termination recovery. It changes the seven scoped keys temporarily and checks that their exact initial states are restored. `.github/workflows/environment-checks.yml` runs the same native lifecycle check on macOS, Windows and Linux, in addition to adapter/ownership/locale tests. A Linux runner explicitly starts its user manager; unsupported desktops report a failure rather than claiming global success.

The design was informed by [Claude-Cage's guest environment setup](https://github.com/Lee-xeo/Claude-Cage/blob/8b9a855ea2ead6738c2819477173e9d110d5399f/internal/cage/guest-env.sh) and [region profiles](https://github.com/Lee-xeo/Claude-Cage/blob/8b9a855ea2ead6738c2819477173e9d110d5399f/internal/workbench/region.go). Cage changes an isolated Linux guest's actual system configuration; Astra's implementation is independently written and scopes reversible changes to the host user's launch environment. No Cage installer, VM image, or privileged guest script is executed.
