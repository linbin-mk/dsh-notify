[English](README.md) | [简体中文](README.zh.md)

# dsh-notify

`dsh-notify` is a pure third-party DeepSeek Harness bundle for macOS. It adds one status item to the system menu bar: the Harness whale mark followed by the number of live Agents whose authoritative status is `running`. When the count is zero, only the whale remains visible. While subscribed events await user action, the number becomes their total and the letters identify the event types: `Q` means a question and `S` means an approval, so `2-QS` means one of each. Both subscriptions and their sweeping attention effect default to on. Click the item to focus the open Google Chrome tab for this Harness process; it never opens a new tab. Its Web Client half contributes a Notifications page to the built-in Settings panel, where the indicator and event subscriptions can be managed without restarting Harness.

The indicator counts the complete Agent activity interval, including consecutive queued turns and final checkpoints. It does not infer activity from open turns or individual messages. Existing live Agents are scanned when the plugin loads, so profile live reload does not reset an active count to zero.

## Requirements

- macOS 13 or later, on Apple silicon or Intel
- Node.js `^22.19` or `>=24`
- DeepSeek Harness `0.1.5-rc.1` or a compatible `0.1.5` prerelease, with a Web profile that provides `ctx.agents`, `ctx.settings`, and `ctx.webServer`
- Xcode Command Line Tools when building from this checkout; packed artifacts contain the universal native helper

## Build and verify

```sh
npm test
file native/dsh-notify-menubar
```

The build compiles the AppKit helper for `arm64` and `x86_64`, then combines both slices into one universal executable. The tests cover Agent counting, live enable/disable ownership, the Client bundle's settings registration and switch behavior, and an AppKit probe that loads the packaged whale SVG without creating a status item.

## Install

Install the published package into a custom Web profile. The artifact contains no path dependency on a Harness checkout, and its `dsh.bundle` patch adds the Host and Client plugin rows automatically:

```sh
dsh --profile web-notify --from-default-profile web --dump-config
dsh plugin --profile web-notify add @linbin-mk/dsh-notify
dsh --profile web-notify
```

To install a locally built tarball instead:

```sh
npm test
npm pack
dsh plugin --profile web-notify add ./linbin-mk-dsh-notify-0.2.0.tgz
```

Either artifact already contains the universal native helper, so no Xcode installation is needed. Installing from a Git checkout does need Xcode Command Line Tools: pnpm runs the package's `prepare` script, which compiles that helper, and blocks it until the key it prints is allowlisted under `allowBuilds` in the profile's `pnpm-workspace.yaml`.

Remove it from the same profile with:

```sh
dsh plugin --profile web-notify remove @linbin-mk/dsh-notify
```

## Lifecycle and privacy

The Host plugin registers the `dsh-notify` settings namespace with live `enabled`, `questionMarkers`, `approvalMarkers`, and `sweep` booleans. The Web Client writes those fields through Harness's revision-fenced settings transport. All default to `true`. Disabling the indicator closes and awaits the native helper; disabling a subscription removes only its letter and count from the status item; disabling sweep keeps all subscribed letters visible. Enabling the indicator starts a new helper and immediately publishes the current settings and counts. The plugin listens only to `agent/status`, `agent/disposed`, `user-questions/request`, and `approval/request`. It sends the native helper non-negative aggregate session and subscribed-event counts, marker letters, and the sweeping preference over stdin; it sends no session IDs, prompts, model output, credentials, or file paths. Unloading the plugin removes all listeners, asks the helper to quit, and waits for the process to exit, escalating to termination only if graceful shutdown stalls.

The whale outline is copied from DeepSeek Harness's MIT-licensed `FishLogo` asset; `NOTICE` reproduces the upstream copyright and license text. As a macOS template image it appears black in the light menu bar and automatically changes contrast in dark appearances.
