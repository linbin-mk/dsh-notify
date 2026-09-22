English | [简体中文](https://github.com/linbin-mk/dsh-notify/blob/main/README.md)

# dsh-notify

[![npm version](https://img.shields.io/npm/v/@linbin-mk/dsh-notify)](https://www.npmjs.com/package/@linbin-mk/dsh-notify)
[![publish workflow](https://github.com/linbin-mk/dsh-notify/actions/workflows/publish.yml/badge.svg)](https://github.com/linbin-mk/dsh-notify/actions/workflows/publish.yml)
[![license](https://img.shields.io/npm/l/@linbin-mk/dsh-notify)](LICENSE)
[![node](https://img.shields.io/node/v/@linbin-mk/dsh-notify)](package.json)
[![platform](https://img.shields.io/badge/platform-macOS%2013%2B-lightgrey)](#requirements)

`dsh-notify` is a pure third-party DeepSeek Harness bundle for macOS. It adds one status item to the system menu bar: the Harness whale mark followed by the number of live Agents whose authoritative status is `running`. When the count is zero, only the whale remains visible. While subscribed events await user action, the number becomes their total and the letters identify the event types: `Q` means a question and `S` means an approval, so `2-QS` means one of each. Both subscriptions and their sweeping attention effect default to on. Click the item to focus the open Google Chrome tab for this Harness process; it never opens a new tab. Its Web Client half contributes a Notifications page to the built-in Settings panel, where the indicator and event subscriptions can be managed without restarting Harness.

## Features

- **Live session count** — the whale mark followed by the number of Agents whose authoritative status is `running`, and nothing but the whale when that number is zero.
- **Pending event markers** — the number switches to the total of subscribed events awaiting user action, with `Q` per pending question and `S` per pending approval.
- **Sweeping attention effect** — a highlight sweeps across the status item while a subscribed event is pending.
- **Click to focus** — clicking the item brings the Google Chrome tab already showing this Harness process to the front. It never opens a new tab.
- **Settings without a restart** — the indicator, both subscriptions, and the sweep can be toggled live from the built-in Settings panel.

## Requirements

- macOS 13 or later, on Apple silicon or Intel
- Node.js `^22.19` or `>=24`
- DeepSeek Harness `0.1.5-rc.1` or a compatible `0.1.5` prerelease, with a Web profile that provides `ctx.agents`, `ctx.settings`, and `ctx.webServer`
- Xcode Command Line Tools when building from this checkout; packed artifacts contain the universal native helper

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

## Settings

The Host plugin registers the `dsh-notify` settings namespace. All four fields default to `true` and are written through Harness's revision-fenced settings transport, so changes apply immediately without restarting Harness.

| Setting | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | Show the menu bar status item. Turning it off closes the native helper and awaits its exit. |
| `questionMarkers` | `true` | Count pending user questions and add a `Q` for each one. |
| `approvalMarkers` | `true` | Count pending approvals and add an `S` for each one. |
| `sweep` | `true` | Sweep the status item while a subscribed event is pending. |

While at least one marker letter is visible, the number reports the subscribed pending events instead of the session count. Turning both subscriptions off restores the plain session count, and sweep then has nothing to animate.

## How counting works

The indicator counts the complete Agent activity interval, including consecutive queued turns and final checkpoints. It does not infer activity from open turns or individual messages. Existing live Agents are scanned when the plugin loads, so profile live reload does not reset an active count to zero.

## Build and verify

```sh
npm test
file native/dsh-notify-menubar
```

The build compiles the AppKit helper for `arm64` and `x86_64`, then combines both slices into one universal executable. The tests cover Agent counting, live enable/disable ownership, the Client bundle's settings registration and switch behavior, and an AppKit probe that loads the packaged whale SVG without creating a status item.

## Troubleshooting

- **`dsh plugin add` reports 404 right after a release.** A brand-new version takes a few minutes to appear on the registry read path; the tarball, `dist-tags`, and the search index usually resolve first. Retry shortly.
- **Installing through a mirror fails with `ERR_PNPM_FETCH_404`.** Mirrors such as npmmirror sync new versions on their own schedule. Add `--registry=https://registry.npmjs.org` to that one command, or wait for the mirror.
- **pnpm refuses or prompts for a just-released version.** That is pnpm's `minimumReleaseAge` delay. Allow the package (pnpm records it under `minimumReleaseAgeExclude`) or wait out the window.
- **Clicking the item does not bring Chrome forward.** The helper only focuses a tab that is already open on this Harness origin, and it never opens one; `no open Chrome tab matches the Harness Web client` on stderr means nothing matched. macOS also gates control of other applications behind Automation permission, so a denied prompt leaves the count working while focus stays silent.
- **The status item never appears.** Check that the plugin row survived install:

  ```sh
  dsh --profile web-notify --dump-config | grep -A 2 notify-menubar
  ```

## Lifecycle and privacy

Disabling the indicator closes and awaits the native helper; disabling a subscription removes only its letter and count from the status item; disabling sweep keeps all subscribed letters visible. Enabling the indicator starts a new helper and immediately publishes the current settings and counts. The plugin listens only to `agent/status`, `agent/disposed`, `user-questions/request`, and `approval/request`. It sends the native helper non-negative aggregate session and subscribed-event counts, marker letters, and the sweeping preference over stdin; it sends no session IDs, prompts, model output, credentials, or file paths. Unloading the plugin removes all listeners, asks the helper to quit, and waits for the process to exit, escalating to termination only if graceful shutdown stalls.

## License

MIT — see `LICENSE`.

The whale outline in `native/whale.svg` is DeepSeek Harness's MIT-licensed `FishLogo` asset, reproduced unmodified; `NOTICE` carries the upstream copyright and license text. As a macOS template image it appears black in the light menu bar and automatically changes contrast in dark appearances.
