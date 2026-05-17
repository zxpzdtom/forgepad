<p align="center">
  <img src="./src/renderer/public/app-icons/graphite.png" alt="ForgePad icon" width="96" height="96">
</p>

<h1 align="center">ForgePad</h1>

<p align="center">
  面向 AI 编程的原生质感桌面工作区，把终端、文件、Diff、上下文和 Agent 会话放在一个地方。
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

## 功能亮点

- **原生 host shell**：macOS 通过 Swift/AppKit host + WKWebView 运行，React 只负责共享 UI。
- **Rust core**：PTY、Git、文件扫描、上下文生成和高频文件系统工作放在 `crates/forgepad-core`。
- **AI 编程工作区**：在一个界面里管理项目、worktree、普通终端和 AI coding tool 终端。
- **Files 与 Changes**：文件树和 Git 变更都通过 `@pierre/trees` 渲染，统一选择、展开和面板体验。
- **Typed host contract**：Renderer API 统一收口在 `src/shared/host-bridge.ts`。

## 环境要求

- Node.js 22 或更新版本。
- pnpm。
- Rust toolchain。
- 用于 macOS 原生 host 的 Xcode command line tools。

## 安装

```bash
pnpm install
```

## 开发

运行完整本地 app：Vite renderer 加 Swift/AppKit host。

```bash
pnpm dev
```

## 构建

构建原生 macOS app bundle：

```bash
pnpm build
```

产物位置：

```text
dist/native-mac/ForgePad.app
```

## 常用脚本

| Command | 说明 |
| --- | --- |
| `pnpm dev` | 运行用于本地开发的 Vite renderer 和 Swift/AppKit host |
| `pnpm build` | 类型检查、运行 Rust core 测试并构建原生 macOS 包 |
| `pnpm typecheck` | 检查 renderer 和 shared TypeScript 类型 |
| `pnpm lint` | 使用 Biome 检查源码 |
| `pnpm format` | 使用 Biome 格式化源码 |

## 项目结构

```text
native/macos/    Swift/AppKit host shell
crates/          Rust core services
src/renderer/    React renderer app
src/shared/      共享 TypeScript 类型和 host contract
schema/          Host bridge schema
build/           App icons and packaging resources
dist/            Build output
```

## 开发备注

ForgePad 是私有应用代码。除非是明确的发布产物，否则不要提交生成的构建输出、本地 worktree、机器相关配置或临时文件。
