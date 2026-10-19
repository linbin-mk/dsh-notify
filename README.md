[English](https://github.com/linbin-mk/dsh-notify/blob/main/README.en.md) | 简体中文

# dsh-notify

[![npm 版本](https://img.shields.io/npm/v/@linbin-mk/dsh-notify)](https://www.npmjs.com/package/@linbin-mk/dsh-notify)
[![发布流水线](https://github.com/linbin-mk/dsh-notify/actions/workflows/publish.yml/badge.svg)](https://github.com/linbin-mk/dsh-notify/actions/workflows/publish.yml)
[![许可证](https://img.shields.io/npm/l/@linbin-mk/dsh-notify)](LICENSE)
[![Node](https://img.shields.io/node/v/@linbin-mk/dsh-notify)](package.json)
[![平台](https://img.shields.io/badge/platform-macOS%2013%2B-lightgrey)](#要求)

`dsh-notify` 是一个纯第三方的 DeepSeek Harness macOS 插件。它在系统菜单栏常驻一个鲸鱼状态项：鲸鱼后显示当前状态为 `running` 的 Agent 数量，计数为零时只显示鲸鱼。当已订阅的事件等待用户处理时，数字改为这些事件的总数，并用字母标识事件类型：`Q` 表示提问，`S` 表示审批，因此 `2-QS` 表示各有一个提问和审批等待处理。点击状态项会切换到此 Harness 进程已打开的 Google Chrome 标签页，绝不会新建标签页。Web Client 端还会在内置设置面板中加入“通知”页面，状态项、两类事件订阅和扫光提示都可以在不重启 Harness 的情况下管理。

## 截图

**菜单栏状态项**（与随包辅助程序相同的 AppKit 绘制逻辑）：

| 场景 | 菜单栏显示 |
| --- | --- |
| 空闲：没有 Agent 运行 | <img src="https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/menubar-idle.png" width="360" alt="空闲时菜单栏只显示鲸鱼"> |
| 运行中：3 个 Agent | <img src="https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/menubar-running.png" width="360" alt="菜单栏显示鲸鱼和数字 3"> |
| 待处理：1 个提问 + 1 个审批 | <img src="https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/menubar-pending.png" width="360" alt="菜单栏显示鲸鱼和 2-QS"> |
| 扫光：有事件等待处理 | <img src="https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/menubar-sweep.gif" width="360" alt="扫光掠过鲸鱼和数字"> |

**设置 → 通知**：状态项、事件订阅和扫光都可以即时开关，无需重启 Harness。

![设置面板中的通知页](https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/settings-notify-zh.png)

**设置 → 插件**：插件清单会直接显示图标、名称和能力说明。

![插件清单中的菜单栏活动指示器](https://raw.githubusercontent.com/linbin-mk/dsh-notify/main/docs/screenshots/plugin-row-zh.png)

## 功能

- **实时会话计数** —— 鲸鱼标志后跟随状态为 `running` 的 Agent 数量；数量为零时只显示鲸鱼。
- **待处理事件标记** —— 数字切换为等待用户处理的已订阅事件总数，每个待处理提问计一个 `Q`，每个待处理审批计一个 `S`。
- **扫光强化提示** —— 有已订阅事件等待处理时，一道扫光会掠过鲸鱼图标和旁边的数字；高光只落在图标与字形上，不会铺满整个状态项。
- **点击聚焦** —— 点击状态项会把已打开此 Harness 进程的 Google Chrome 标签页切到前台，绝不会新建标签页。
- **免重启改设置** —— 状态项、两类订阅和扫光都可在内置设置面板中实时开关。
- **插件清单里的展示信息** —— 包内自带 `icon.png`（白底圆角方块上的鲸鱼与铃铛通知徽标）与 `locale/en.json`、`locale/zh.json` 两份 `meta.title`/`meta.description`。Harness 的插件管理器、bundle 详情与**设置 → 插件**清单在**不激活插件**的前提下读取它们，因此插件行显示的是带图标的中英文名称与能力说明，而不是包名回退文本和默认占位图。

## 要求

- Apple 芯片或 Intel 处理器的 macOS 13 或更高版本
- Node.js `^22.19` 或 `>=24`
- DeepSeek Harness `0.2.1-alpha.3` 或兼容的 `0.2.1` 预发布版本（已在 `0.2.1-rc.2` 上验证），以及提供 `ctx.agents`、`ctx.webServer` 和设置服务的 Web profile
- 从本检出目录构建时需要 Xcode Command Line Tools；打包产物已包含通用原生辅助程序

## 安装

把已发布的包安装进自定义 Web profile。产物不含任何指向 Harness checkout 的路径依赖，`dsh.bundle` patch 会自动加入 Host 和 Client 插件行：

```sh
dsh --profile web-notify --from-default-profile web --dump-config
dsh plugin --profile web-notify add @linbin-mk/dsh-notify
dsh --profile web-notify
```

改为安装本地构建的 tarball：

```sh
npm test
npm pack
dsh plugin --profile web-notify add ./linbin-mk-dsh-notify-0.6.1.tgz
```

两种产物都已包含通用原生辅助程序，无需安装 Xcode。如果改为从 Git 检出安装，则需要 Xcode Command Line Tools：pnpm 会运行包的 `prepare` 脚本编译该辅助程序并阻止执行，直到你把 pnpm 打印的那个键加入 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds`。

从同一个 profile 移除插件：

```sh
dsh plugin --profile web-notify remove @linbin-mk/dsh-notify
```

## 设置

Host 半侧在自己的 Cordis `Config` 中声明这四个字段，并全部标记为可实时编辑（`.volatile()`）；profile 中的插件行 id `notify-menubar` 就是它的设置命名空间。浏览器半侧的内置设置页通过这些字段读写：写入经 Harness 带修订保护的设置传输落到当前 profile 的 Cordis patch，只改这些字段时 Harness 会把新值提交进正在运行的引用而不重挂插件，因此修改会立即生效，无需重启 Harness。

| 设置 | 默认值 | 作用 |
| --- | --- | --- |
| `enabled` | `true` | 是否显示菜单栏状态项。关闭后会关闭原生辅助程序并等待其退出。 |
| `questionMarkers` | `true` | 统计待处理提问，每个提问对应一个 `Q`。 |
| `approvalMarkers` | `true` | 统计待处理审批，每个审批对应一个 `S`。 |
| `sweep` | `true` | 有已订阅事件等待处理时，为鲸鱼图标和旁边的数字添加扫光效果。 |

只要有标记字母显示，数字就表示已订阅的待处理事件数，而不再是会话数。把两类订阅都关闭后，数字恢复为会话数，扫光也就没有可播放的对象了。

## 计数方式

状态项统计 Agent 的完整活动区间，包括连续排队的轮次和最终检查点。它不会根据未关闭的轮次或单条消息推断活动状态。插件加载时会扫描已有的活跃 Agent，因此配置实时重载不会将活动数重置为零。

## 构建与验证

```sh
npm test                                    # 编译辅助程序并运行 test/plugin.test.js 与 test/display-metadata.test.js
node --test test/display-metadata.test.js   # 只校验插件清单展示信息
file native/dsh-notify-menubar
```

构建过程会分别为 `arm64` 和 `x86_64` 编译 AppKit 辅助程序，再将两个架构合并为一个通用可执行文件。`npm test` 覆盖两部分：

- `test/plugin.test.js` —— Agent 计数、运行期间的启用和停用行为、Host 半侧实时配置引用与 `loader/volatile-update` 的联动、Web 源按监听协议与绑定地址组装（IPv6 加方括号）并以广告地址优先、Client 插件经 `ctx.configForms` 读取配置并写回开关、注入样式表的包名归属，以及加载随包提供的鲸鱼 SVG 且不创建状态项的 AppKit 探测。设置页的可编辑性现在只看配置表单快照的 `status` 与 `writable`：上游在 Harness `0.2.1-alpha.3` 移除了 `ConfigFormSnapshot.mode`，快照为 `ready` 且可写即视为可编辑，不再要求 `mode === 'host'`。
- `test/display-metadata.test.js` —— 按 `readPluginMeta`（`dsh-app-boot`）的同一套解析规则校验插件清单展示信息：`@linbin-mk/dsh-notify/locale/en.json` 与同目录的 `locale/zh.json` 都能经包自引用 `exports` 解析、文件名是语言 id、`meta.title`/`meta.description` 非空且中英文不同；`./icon` 解析到不超过 256 KiB 的方形 PNG 图标（`icon.png`：白底圆角方块上的鲸鱼与铃铛通知徽标）；`package.json` 的 `files` 与 `exports` 同时携带 `icon.png` 与 `locale/*.json`，而 `"."`、`"./client"`、`"./cordis.patch.yml"` 三个运行时导出保持不变。`readPluginMeta` 走 Node 的 ESM 解析器且不执行插件代码，所以缺少导出、字典格式错误或资源没被 `files` 带进 tarball 时，插件行只会静默退化为包名文本和默认占位图，不会在运行时报错。

## 常见问题

- **0.2.2 之前：Web GUI 启动失败，页面显示 `Failed to load plugins`。** `0.2.0` 与 `0.2.1` 把客户端 bundle 注册成了短名 `dsh-notify`，而 Harness 按**包名**（`@linbin-mk/dsh-notify`）索引客户端模块表，两者不一致会让浏览器侧整个 GUI 起不来——Host 半侧与菜单栏此时仍然正常，所以 `--dump-config` 看起来没问题。已在 `0.2.2` 修复；升级即可，或先移除插件。
- **0.5.0 之前：升级 Harness 后装不上，`dsh plugin add` 被拒并报 `incompatible-version`（已装的旧版本则静默消失）。** Harness `0.2.0` 起新增了 peer 版本门禁：`dsh plugin add` 会逐个校验 manifest 里的 `@deepseek-ai/dsh-*` peer 范围，与当前 Harness 版本不符时直接拒绝安装；已经在 profile 里的旧版本改为在启动时被跳过（启动日志里是一条 skipped bundle，插件不加载，`--dump-config` 里也看不到 `notify-menubar`）。`0.5.0` 已把 peer 范围对齐到 `0.2.1-alpha.2`；升级插件即可，或者按报错提示用 `dsh plugin allow-version` 为旧版本单独放行。
- **刚发版后 `dsh plugin add` 报 404。** 全新版本在 registry 读路径上需要几分钟才可见；tarball、`dist-tags` 和搜索索引通常会先可用。稍后重试即可。
- **通过镜像安装报 `ERR_PNPM_FETCH_404`。** npmmirror 等镜像同步新版本有自己的节奏。给这条命令加上 `--registry=https://registry.npmjs.org`，或等镜像同步。
- **pnpm 拒绝或询问刚发布的版本。** 这是 pnpm 的 `minimumReleaseAge` 延迟保护。放行该包（pnpm 会记录到 `minimumReleaseAgeExclude`）或等过这个时间窗口。
- **点击状态项没有切到 Chrome。** 辅助程序只会切换到**已打开**此 Harness 源的标签页，且绝不会新建标签页；stderr 出现 `no open Chrome tab matches the Harness Web client` 说明没有匹配的标签页。此外 macOS 对控制其他应用有“自动化”权限限制，权限被拒时计数仍正常，只是点击静默无效。
- **状态项根本不出现。** 先确认安装后插件行还在（这条只覆盖 Host 半侧；客户端半侧的失败只在浏览器控制台里暴露）：

  ```sh
  dsh --profile web-notify --dump-config | grep -A 2 notify-menubar
  ```

## 生命周期与隐私

停用状态项后，插件会关闭原生辅助程序并等待其退出；关闭某项订阅只会从状态项移除对应字母与计数；关闭扫光会保留所有已订阅字母。启用状态项后，插件会启动新的辅助程序，并立即发送当前设置和计数。插件只监听 `agent/status`、`agent/disposed`、`user-questions/request` 和 `approval/request`。它只通过标准输入向原生辅助程序发送非负汇总会话数、已订阅事件数、标记字母和扫光设置，不会发送会话 ID、提示词、模型输出、凭据或文件路径。卸载插件时，它会移除全部监听器，要求辅助程序退出并等待进程结束；只有在正常关闭停滞时才会终止进程。

## 许可证

MIT —— 详见 `LICENSE`。

`native/whale.svg` 中的鲸鱼轮廓复制自采用 MIT 许可证的 DeepSeek Harness `FishLogo` 资源，未作修改；上游版权与许可证文本见 `NOTICE`。它作为 macOS 模板图像时，在浅色菜单栏中显示为黑色，并在深色外观下自动调整对比度。插件清单图标 `icon.png` 是本插件专用的原创图形（白底圆角方块上的鲸鱼与铃铛通知徽标），其中的鲸鱼形象取自 DeepSeek 鲸鱼标识；`NOTICE` 中的 MIT 归属覆盖 `native/whale.svg` 与图标中的鲸鱼形象。
