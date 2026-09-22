[English](README.md) | [简体中文](README.zh.md)

# dsh-notify

`dsh-notify` 是一个适用于 macOS 的纯第三方 DeepSeek Harness 插件。它在系统菜单栏中添加一个状态项：Harness 鲸鱼标志及当前状态为 `running` 的 Agent 数量。计数为零时，菜单栏只显示鲸鱼。当已订阅事件等待用户处理时，数字改为这些事件的总数，字母用于标识事件类型：`Q` 表示提问，`S` 表示审批；因此 `2-QS` 表示各有一个提问和审批等待处理。两类订阅及扫光强化提示默认开启。点击状态项会切换到此 Harness 进程已打开的 Google Chrome 标签页，绝不会新建标签页。它的 Web Client 端会在内置设置面板中添加“通知”页面，用户无需重启 Harness 即可管理状态项及事件订阅。

状态项统计 Agent 的完整活动区间，包括连续排队的轮次和最终检查点。它不会根据未关闭的轮次或单条消息推断活动状态。插件加载时会扫描已有的活跃 Agent，因此配置实时重载不会将活动数重置为零。

## 要求

- Apple 芯片或 Intel 处理器的 macOS 13 或更高版本
- Node.js `^22.19` 或 `>=24`
- DeepSeek Harness `0.1.5-rc.1` 或兼容的 `0.1.5` 预发布版本，以及提供 `ctx.agents`、`ctx.settings` 和 `ctx.webServer` 的 Web profile
- 从本检出目录构建时需要 Xcode Command Line Tools；打包产物已包含通用原生辅助程序

## 构建与验证

```sh
npm test
file native/dsh-notify-menubar
```

构建过程会分别为 `arm64` 和 `x86_64` 编译 AppKit 辅助程序，再将两个架构合并为一个通用可执行文件。测试覆盖 Agent 计数、运行期间的启用和停用行为、Client 插件的设置注册与开关行为，以及加载随包提供的鲸鱼 SVG 且不创建状态项的 AppKit 探测。

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
dsh plugin --profile web-notify add ./linbin-mk-dsh-notify-0.2.0.tgz
```

两种产物都已包含通用原生辅助程序，无需安装 Xcode。如果改为从 Git 检出安装，则需要 Xcode Command Line Tools：pnpm 会运行包的 `prepare` 脚本编译该辅助程序并阻止执行，直到你把 pnpm 打印的那个键加入 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds`。

从同一个 profile 移除插件：

```sh
dsh plugin --profile web-notify remove @linbin-mk/dsh-notify
```

## 生命周期与隐私

Host 插件会注册 `dsh-notify` 设置命名空间，其中包含实时生效的 `enabled`、`questionMarkers`、`approvalMarkers` 和 `sweep` 布尔值，默认均为 `true`。Web Client 通过 Harness 带修订保护的设置传输写入这些字段。停用状态项后，插件会关闭原生辅助程序并等待其退出；关闭某项订阅只会从状态项移除对应字母与计数；关闭扫光会保留所有已订阅字母。启用状态项后，插件会启动新的辅助程序，并立即发送当前设置和计数。插件只监听 `agent/status`、`agent/disposed`、`user-questions/request` 和 `approval/request`。它只通过标准输入向原生辅助程序发送非负汇总会话数、已订阅事件数、标记字母和扫光设置，不会发送会话 ID、提示词、模型输出、凭据或文件路径。卸载插件时，它会移除全部监听器，要求辅助程序退出并等待进程结束；只有在正常关闭停滞时才会终止进程。

鲸鱼轮廓复制自采用 MIT 许可证的 DeepSeek Harness `FishLogo` 资源，上游版权与许可证文本见 `NOTICE`。它作为 macOS 模板图像时，在浅色菜单栏中显示为黑色，并在深色外观下自动调整对比度。
