<p align="center">
  <img src="./build/icon.png" alt="ForgePad icon" width="96" height="96">
</p>

<h1 align="center">ForgePad</h1>

<p align="center">
  面向 AI 编程的桌面工作区，把终端、文件、Diff、上下文和 Agent 会话放在一个地方。
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

## 功能亮点

- **AI 编程工作区**：在一个界面里管理项目、worktree、普通终端和 AI coding tool 终端。
- **文件与 Diff 预览**：浏览文件树、查看代码、检查 Git 变更，并直接选取上下文。
- **上下文篮子**：从文件、Diff、代码选区、评论和任务信息生成上下文包，再发送到当前终端流程。
- **工作区设置**：配置主题、pet overlay、Run Commands、终端行为和工作区偏好。
- **双壳支持**：Electron 是主要桌面壳，Tauri 支持保留在同一代码库中。

## 界面入口

ForgePad 的主界面围绕三个区域组织：

- **左侧工作区**：项目、worktree、任务、终端和应用设置入口。
- **中间编辑区**：终端标签、Agent 会话、文件预览、Markdown 预览和 Diff 视图。
- **右侧资源面板**：文件树、Git changes、上下文篮子和相关操作。

## 环境要求

- Node.js 22 或更新版本。
- pnpm。
- Rust toolchain，仅 Tauri 开发或打包需要。

## 安装

```bash
pnpm install
```

`node-pty` 会在 `postinstall` 阶段自动 rebuild。如果本机 native module 需要手动重建，可以运行：

```bash
pnpm rebuild
```

## 开发

运行 Electron 应用：

```bash
pnpm dev
```

只运行 Vite renderer：

```bash
pnpm vite:dev
```

运行 Tauri 应用：

```bash
pnpm tauri:dev
```

## 构建

类型检查：

```bash
pnpm typecheck
```

构建 Electron renderer 和 main process：

```bash
pnpm build
```

生成 macOS Electron DMG：

```bash
pnpm dist
```

生成未打包的 macOS Electron app 目录：

```bash
pnpm dist:dir
```

构建 Tauri 应用：

```bash
pnpm tauri:build
```

## 常用脚本

| Command | 说明 |
| --- | --- |
| `pnpm lint` | 使用 Biome 检查源码 |
| `pnpm format` | 使用 Biome 格式化源码 |
| `pnpm check` | 运行 Biome check |
| `pnpm check:write` | 自动应用可修复的 Biome 问题 |
| `pnpm vite:build` | 构建 renderer |

## 项目结构

```text
src/main/       Electron main process
src/preload/    Electron preload bridges
src/renderer/   React renderer app
src-tauri/      Tauri shell and Rust commands
build/          App icons and packaging resources
dist/           Build output
```

## 开发备注

ForgePad 是私有应用代码。除非是明确的发布产物，否则不要提交生成的构建输出、本地 worktree、机器相关配置或临时文件。
