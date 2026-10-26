English | [简体中文](https://github.com/linbin-mk/dsh-notify/blob/main/README.md)

# dsh-notify

[![npm version](https://img.shields.io/npm/v/@linbin-mk/dsh-notify)](https://www.npmjs.com/package/@linbin-mk/dsh-notify)
[![publish workflow](https://github.com/linbin-mk/dsh-notify/actions/workflows/publish.yml/badge.svg)](https://github.com/linbin-mk/dsh-notify/actions/workflows/publish.yml)
[![license](https://img.shields.io/npm/l/@linbin-mk/dsh-notify)](LICENSE)
[![node](https://img.shields.io/node/v/@linbin-mk/dsh-notify)](package.json)
[![platform](https://img.shields.io/badge/platform-macOS%2013%2B-lightgrey)](#requirements)

`dsh-notify` is a pure third-party DeepSeek Harness plugin for macOS. It keeps one whale status item in the system menu bar: the mark is followed by the number of live Agents whose authoritative status is `running`, and when that number is zero only the whale remains. While subscribed events await user action, the number becomes their total and the letters identify the event types: `Q` means a question and `S` means an approval, so `2-QS` means one of each. Click the item to focus the open Google Chrome tab for this Harness process; it never opens a new tab. Its Web Client half contributes a Notifications page to the built-in Settings panel, where the indicator, both event subscriptions, and the sweeping attention effect can be managed without restarting Harness.

## Screenshots

**Menu bar status item** (drawn with the same AppKit logic the packaged helper uses):

| State | Menu bar |
| --- | --- |
| Idle: no Agent running | <img src="https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/menubar-idle.png" width="360" alt="Only the whale is visible when idle"> |
| Running: 3 Agents | <img src="https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/menubar-running.png" width="360" alt="The menu bar shows the whale and the number 3"> |
| Pending: 1 question + 1 approval | <img src="https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/menubar-pending.png" width="360" alt="The menu bar shows the whale and 2-QS"> |
| Sweep: an event awaits action | <img src="https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/menubar-sweep.gif" width="360" alt="A highlight sweeps over the whale and the numbers"> |

**Settings → Notifications**: toggle the indicator, event subscriptions, and sweep live without restarting Harness.

![The Notifications page in the Settings panel](https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/settings-notify-en.png)

**Settings → Plugins**: the inventory shows the icon, localized name, and capability description.

![The menu bar activity indicator in the plugin inventory](https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/plugin-row-en.png)

## Features

- **Live session count** — the whale mark followed by the number of Agents whose authoritative status is `running`, and nothing but the whale when that number is zero.
- **Pending event markers** — the number switches to the total of subscribed events awaiting user action, with `Q` per pending question and `S` per pending approval.
- **Sweeping attention effect** — a highlight sweeps over the whale mark and the numbers while a subscribed event is pending. It is clipped to the icon and the glyphs instead of covering the whole status item.
- **Click to focus** — clicking the item brings the Google Chrome tab already showing this Harness process to the front. It never opens a new tab.
- **Settings without a restart** — the indicator, both subscriptions, and the sweep can be toggled live from the built-in Settings panel.
- **Display metadata in the plugin lists** — the package ships `icon.png` (a whale with a bell notification badge on a white rounded-square tile) plus `locale/en.json` and `locale/zh.json` with `meta.title`/`meta.description`. The Harness Plugin Manager, bundle details and the **Settings → Plugins** inventory read them **without activating the plugin**, so the row shows a localized name and capability description with its own icon instead of package-name fallback text and generic artwork.

## Requirements

- macOS 13 or later, on Apple silicon or Intel
- Node.js `^22.19` or `>=24`
- DeepSeek Harness `0.2.1-rc.3` or a compatible `0.2.1` prerelease (verified on `0.2.1-rc.3`, source checkout `22ddee3792`), with a Web profile that provides `ctx.agents`, `ctx.webServer`, and the settings service
- Peer baseline `0.2.1-rc.3`: a profile still on the `0.2.1` alpha line must upgrade Harness to `0.2.1-rc.3` or newer first; otherwise `dsh plugin add` rejects the plugin as incompatible
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
dsh plugin --profile web-notify add ./linbin-mk-dsh-notify-0.7.0.tgz
```

Either artifact already contains the universal native helper, so no Xcode installation is needed. Installing from a Git checkout does need Xcode Command Line Tools: pnpm runs the package's `prepare` script, which compiles that helper, and blocks it until the key it prints is allowlisted under `allowBuilds` in the profile's `pnpm-workspace.yaml`.

Remove it from the same profile with:

```sh
dsh plugin --profile web-notify remove @linbin-mk/dsh-notify
```

## Settings

The Host half declares the four fields in its Cordis `Config` and marks every one live-editable (`.volatile()`); the profile entry id `notify-menubar` is their settings namespace. The built-in Settings page in the browser half reads and writes those fields: a write goes through Harness's revision-fenced settings transport into the active profile's Cordis patch, and a change confined to these fields is committed into the running references without remounting the plugin, so it applies immediately without restarting Harness.

| Setting | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | Show the menu bar status item. Turning it off closes the native helper and awaits its exit. |
| `questionMarkers` | `true` | Count pending user questions and add a `Q` for each one. |
| `approvalMarkers` | `true` | Count pending approvals and add an `S` for each one. |
| `sweep` | `true` | Sweep the whale mark and the numbers while a subscribed event is pending. |

While at least one marker letter is visible, the number reports the subscribed pending events instead of the session count. Turning both subscriptions off restores the plain session count, and sweep then has nothing to animate.

## How counting works

The indicator counts the complete Agent activity interval, including consecutive queued turns and final checkpoints. It does not infer activity from open turns or individual messages. Existing live Agents are scanned when the plugin loads, so profile live reload does not reset an active count to zero.

## Build and verify

```sh
npm test                                         # build the helper and run test/plugin.test.js + test/display-metadata.test.js
node --test test/display-metadata.test.js        # plugin-list display metadata only
file native/dsh-notify-menubar
```

The build compiles the AppKit helper for `arm64` and `x86_64`, then combines both slices into one universal executable. `npm test` covers two suites:

- `test/plugin.test.js` — Agent counting, live enable/disable ownership, the Host half's volatile Config references and their `loader/volatile-update` follow-up, Web origin composition from the listener protocol and bind address (IPv6 bracketed) with an advertised root taking precedence, the Client bundle's reads and switch writes through `ctx.configForms`, the package-name ownership of its injected stylesheet, and an AppKit probe that loads the packaged whale SVG without creating a status item. The Settings page now keys editability on the configuration-form snapshot's `status` and `writable` alone: upstream removed `ConfigFormSnapshot.mode` in Harness `0.2.1-alpha.3`, so a `ready` and writable snapshot is editable and no longer has to report `mode === 'host'`.
- `test/display-metadata.test.js` — checks the plugin-list display metadata by the same resolution rules as `readPluginMeta` (`dsh-app-boot`): `@linbin-mk/dsh-notify/locale/en.json` and its sibling `locale/zh.json` both resolve through the package's self-referencing `exports`, use language ids as filenames, and carry non-empty, mutually distinct Chinese and English `meta.title`/`meta.description`; `./icon` resolves to a square PNG image no larger than 256 KiB (`icon.png`: a whale with a bell notification badge on a white rounded-square tile); and `package.json`'s `files` and `exports` both carry `icon.png` and `locale/*.json` while the `"."`, `"./client"`, and `"./cordis.patch.yml"` runtime exports stay unchanged. `readPluginMeta` goes through Node's ESM resolver without executing plugin code, so a missing export, a malformed dictionary, or a resource left out of the packed `files` only degrades the row to package-name text and generic artwork — there is no runtime error.

## Troubleshooting

- **Before 0.2.2: the Web GUI shows `Failed to load plugins` and does not start.** Versions `0.2.0` and `0.2.1` register the client bundle under the short name `dsh-notify`, while Harness keys the client module table by **package name** (`@linbin-mk/dsh-notify`); the mismatch aborts the whole browser boot. The Host half and the menu bar keep working, so `--dump-config` looks fine. Fixed in `0.2.2`; upgrade, or remove the plugin meanwhile.
- **Before 0.5.0: nothing installs after a Harness upgrade — `dsh plugin add` is rejected with `incompatible-version` (and an already-installed older version quietly disappears).** Harness `0.2.0` introduced a peer-version gate: `dsh plugin add` checks every `@deepseek-ai/dsh-*` peer range in the manifest and refuses the install when it does not match the running Harness. An older version already in the profile is skipped at startup instead — the launch log lists a skipped bundle, the plugin does not load, and `--dump-config` shows no `notify-menubar`. `0.5.0` aligns the peer ranges to `0.2.1-alpha.2`; upgrade the plugin, or admit the old version explicitly with the `dsh plugin allow-version` command the error prints.
- **`dsh plugin add` reports 404 right after a release.** A brand-new version takes a few minutes to appear on the registry read path; the tarball, `dist-tags`, and the search index usually resolve first. Retry shortly.
- **Installing through a mirror fails with `ERR_PNPM_FETCH_404`.** Mirrors such as npmmirror sync new versions on their own schedule. Add `--registry=https://registry.npmjs.org` to that one command, or wait for the mirror.
- **pnpm refuses or prompts for a just-released version.** That is pnpm's `minimumReleaseAge` delay. Allow the package (pnpm records it under `minimumReleaseAgeExclude`) or wait out the window.
- **Clicking the item does not bring Chrome forward.** The helper only focuses a tab that is already open on this Harness origin, and it never opens one; `no open Chrome tab matches the Harness Web client` on stderr means nothing matched. macOS also gates control of other applications behind Automation permission, so a denied prompt leaves the count working while focus stays silent.
- **The status item never appears.** Check that the plugin row survived install (this covers the Host half only; client-half failures surface in the browser console):

  ```sh
  dsh --profile web-notify --dump-config | grep -A 2 notify-menubar
  ```

## Lifecycle and privacy

Disabling the indicator closes and awaits the native helper; disabling a subscription removes only its letter and count from the status item; disabling sweep keeps all subscribed letters visible. Enabling the indicator starts a new helper and immediately publishes the current settings and counts. The plugin listens only to `agent/status`, `agent/disposed`, `user-questions/request`, and `approval/request`. It sends the native helper non-negative aggregate session and subscribed-event counts, marker letters, and the sweeping preference over stdin; it sends no session IDs, prompts, model output, credentials, or file paths. Unloading the plugin removes all listeners, asks the helper to quit, and waits for the process to exit, escalating to termination only if graceful shutdown stalls.

## License

MIT — see `LICENSE`.

The whale outline in `native/whale.svg` is DeepSeek Harness's MIT-licensed `FishLogo` asset, reproduced unmodified; `NOTICE` carries the upstream copyright and license text. As a macOS template image it appears black in the light menu bar and automatically changes contrast in dark appearances. The plugin-list icon `icon.png` is original artwork made for this plugin (a whale with a bell notification badge on a white rounded-square tile); its whale motif follows DeepSeek's whale identity. The MIT attribution in `NOTICE` covers both `native/whale.svg` and the whale motif in the icon.
