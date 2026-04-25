# AI 编码工具实现 TODO

日期：2026-04-25  
目标：基于 `@pierre/diffs` + `@pierre/trees` 实现一个终端优先的 AI 编码桌面软件。

## Phase 0：项目初始化

- [ ] 确定产品名、包名、bundle id。
- [ ] 使用 Electron + electron-vite + React + TypeScript 初始化桌面项目。
- [ ] 安装核心依赖：
  - [ ] `@pierre/diffs`
  - [ ] `@pierre/trees`
  - [ ] `@xterm/xterm`
  - [ ] `@xterm/addon-fit`
  - [ ] `@xterm/addon-serialize`
  - [ ] `@xterm/addon-web-links`
  - [ ] `node-pty`
  - [ ] `monaco-editor`
  - [ ] `@monaco-editor/react`
  - [ ] `zustand`
  - [ ] `allotment` 或 `react-resizable-panels`
  - [ ] `lucide-react`
- [ ] 配置 Electron main / preload / renderer 三进程 TypeScript alias。
- [ ] 配置 native dependency rebuild，确保 `node-pty` 可在 Electron 中运行。
- [ ] 建立目录结构：

```text
src/
  main/
    services/
      git-service.ts
      file-service.ts
      pty-service.ts
      context-service.ts
      state-service.ts
    ipc/
      channels.ts
      register-handlers.ts
  preload/
    index.ts
    api-types.ts
  renderer/
    app/
    components/
    features/
      projects/
      workspaces/
      terminal/
      files/
      changes/
      diff/
      context/
      tasks/
    store/
    styles/
  shared/
    types/
    path.ts
    context.ts
```

验收：

- [ ] `pnpm dev` 或 `bun dev` 能启动 Electron。
- [ ] renderer 能调用一个 preload 暴露的 ping API。
- [ ] CI 或本地能跑 typecheck。

## Phase 1：领域模型与持久化

- [ ] 定义 `Project`、`Workspace`、`Tab`、`Task`、`AgentRun`、`ContextItem`、`ContextBundle` 类型。
- [ ] 建立 Zustand store。
- [ ] 实现 app state schema version。
- [ ] 实现 `StateService.load()` 和 `StateService.save()`。
- [ ] 使用 debounce 保存状态，默认 500ms。
- [ ] 保存路径：`app.getPath("userData")/forgepad-state.json`。
- [ ] 支持恢复：
  - [ ] projects
  - [ ] workspaces
  - [ ] tabs
  - [ ] activeWorkspaceId
  - [ ] activeTabId
  - [ ] settings
  - [ ] context basket
- [ ] 恢复时清理不存在的项目路径和 workspace 路径。

验收：

- [ ] 新增项目后重启应用仍存在。
- [ ] 删除磁盘上的 workspace 后重启不会崩溃。
- [ ] schema version 不匹配时能安全 fallback。

## Phase 2：Main Process IPC

### 2.1 IPC 基础

- [ ] 建立 `IPC` 常量表。
- [ ] preload 只暴露 typed `window.api`。
- [ ] 禁止 renderer 直接访问 Node API。
- [ ] 所有 IPC handler 捕获错误并返回可读 message。

### 2.2 GitService

- [ ] `getTopLevel(path)`：获取 repo root。
- [ ] `isGitRepo(path)`：判断 Git repo。
- [ ] `getCurrentBranch(worktreePath)`。
- [ ] `getStatus(worktreePath)`：
  - [ ] 使用 `git status --porcelain=v2 --untracked-files=all`。
  - [ ] 解析 staged / unstaged / untracked。
  - [ ] 支持 renamed oldPath。
  - [ ] 支持 conflict 状态。
- [ ] `getFileDiff(worktreePath, relPath, bucket)`：
  - [ ] staged diff。
  - [ ] unstaged diff。
  - [ ] untracked synthetic diff。
  - [ ] deleted synthetic diff。
  - [ ] binary detection。
- [ ] `stage(worktreePath, paths[])`。
- [ ] `unstage(worktreePath, paths[])`。
- [ ] `discard(worktreePath, entries[])`。
- [ ] `commit(worktreePath, message)`。
- [ ] `listWorktrees(repoPath)`。
- [ ] `createWorktree(repoPath, name, branch, baseBranch)`。
- [ ] `removeWorktree(repoPath, worktreePath)`。
- [ ] 批量 stage/unstage 每 100 个文件 chunk。
- [ ] 所有 Git path 参数放在 `--` 后。

### 2.3 FileService

- [ ] `readFile(workspaceId, relPath)`。
- [ ] `writeFile(workspaceId, relPath, content)`。
- [ ] `getTree(workspaceId)`。
- [ ] `getTreeWithStatus(workspaceId)`。
- [ ] `listFiles(workspaceId)`。
- [ ] `search(workspaceId, query, options)`。
- [ ] `watchWorkspace(workspaceId)`。
- [ ] `unwatchWorkspace(workspaceId)`。
- [ ] 文件大小限制。
- [ ] 二进制文件检测。
- [ ] symlink realpath 校验。
- [ ] `.gitignore` respect：优先 `git ls-files --others --cached --exclude-standard`。
- [ ] fallback：`rg --files`，再 fallback 到 readdir。

### 2.4 PtyService

- [ ] `create({ workspaceId, shell, command?, initialWrite? })`。
- [ ] `write(ptyId, data)`。
- [ ] `resize(ptyId, cols, rows)`。
- [ ] `destroy(ptyId)`。
- [ ] `list()`。
- [ ] `reattach(ptyId, sinceSeq?)`。
- [ ] 保存 replay buffer，默认上限 8MB。
- [ ] 终端退出事件推送 renderer。
- [ ] 设置环境变量：
  - [ ] `FORGEPAD_WORKSPACE_ID`
  - [ ] `FORGEPAD_PTY_ID`
  - [ ] `FORGEPAD_CONTEXT_DIR`

验收：

- [ ] renderer 可创建终端并输入命令。
- [ ] resize 正常。
- [ ] 切换 tab 不丢 TUI 状态。
- [ ] 关闭 terminal tab 能销毁 PTY。

## Phase 3：三栏 UI 骨架

- [ ] 实现全屏 app shell。
- [ ] 使用 resizable panes：
  - [ ] 左侧 220px，最小 160px。
  - [ ] 中间自适应。
  - [ ] 右侧 320px，最小 220px。
- [ ] 左侧 Sidebar：
  - [ ] Project switcher。
  - [ ] Workspace list。
  - [ ] Task list placeholder。
  - [ ] Agent runs placeholder。
- [ ] 中间 Center：
  - [ ] TabBar。
  - [ ] Content area。
  - [ ] Empty state。
- [ ] 右侧 RightPanel：
  - [ ] Files tab。
  - [ ] Changes tab。
  - [ ] Context tab。
- [ ] 实现基础快捷键：
  - [ ] Cmd/Ctrl+T 新建终端。
  - [ ] Cmd/Ctrl+W 关闭 tab。
  - [ ] Cmd/Ctrl+J 聚焦或创建终端。
  - [ ] Shift+Cmd/Ctrl+E 切 Files。
  - [ ] Shift+Cmd/Ctrl+G 切 Changes。
  - [ ] Shift+Cmd/Ctrl+C 切 Context。

验收：

- [ ] 窗口缩放时布局不溢出。
- [ ] 终端、文件、diff tab 可以切换。
- [ ] 左右栏可折叠。

## Phase 4：项目和 Workspace

- [ ] Open Folder dialog。
- [ ] 打开 folder 后解析 repo root。
- [ ] 创建 Project。
- [ ] 自动创建 Root Workspace。
- [ ] 自动创建 Terminal tab。
- [ ] Workspace list 按项目分组。
- [ ] 新建 worktree dialog：
  - [ ] workspace name。
  - [ ] branch name。
  - [ ] base branch。
  - [ ] create new branch toggle。
- [ ] 删除 workspace：
  - [ ] root workspace 禁止单独删除。
  - [ ] dirty worktree 阻止删除，除非 force。
  - [ ] 删除前销毁 PTY。
- [ ] 删除 project：
  - [ ] 确认。
  - [ ] 销毁项目下所有 PTY。
  - [ ] 可选择是否删除 worktree。

验收：

- [ ] 可打开 `/Users/zxpzdtom/code/constellagent` 这类本地 repo。
- [ ] 可新建 worktree。
- [ ] 切换 workspace 后 terminal cwd 正确。

## Phase 5：`@pierre/trees` 文件树

- [ ] main process 实现 `getTreeWithStatus`。
- [ ] renderer 实现 `FilesPanel`。
- [ ] 把 FileNode flatten 为：
  - [ ] `paths: string[]`
  - [ ] `filePaths: Set<string>`
  - [ ] `gitStatus: GitStatusEntry[]`
- [ ] 接入 `useFileTree`：
  - [ ] `id = workspace-files-${workspaceId}`
  - [ ] `initialExpansion = 1`
  - [ ] `search = true`
  - [ ] `flattenEmptyDirectories = true`
  - [ ] `itemHeight = 26`
- [ ] 接入 `FileTree` 组件。
- [ ] 单击文件打开 File tab。
- [ ] Cmd/Ctrl 点击文件 toggle 到 context。
- [ ] Shift 点击文件范围选择。
- [ ] 目录右键 Add Directory to Context。
- [ ] 文件右键 Add to Context / Remove from Context。
- [ ] 文件树 watch workspace 自动刷新。
- [ ] Git 操作后手动触发刷新。

验收：

- [ ] 文件树显示 Git 状态。
- [ ] 搜索文件仍能打开。
- [ ] 多文件选择在 Context tab 中同步显示。
- [ ] 大 repo 不明显卡顿。

## Phase 6：Changes 和 `@pierre/diffs`

### 6.1 Changes Panel

- [ ] 获取 git snapshot。
- [ ] 分 staged / changes / untracked 显示。
- [ ] 每个 row 显示 status badge。
- [ ] 单击 row 打开 Diff tab 并定位文件。
- [ ] Cmd/Ctrl 多选变更。
- [ ] Shift 范围选择变更。
- [ ] Stage selected。
- [ ] Unstage selected。
- [ ] Discard selected。
- [ ] Stage all。
- [ ] Commit staged。
- [ ] Add selected changes to Context。

### 6.2 Diff Tab MVP

- [ ] 获取 changed files。
- [ ] 对每个文件获取 patch。
- [ ] 使用 `PatchDiff` 渲染。
- [ ] 文件 header 可点击打开文件。
- [ ] split / unified toggle。
- [ ] 文件跳转 strip。
- [ ] 二进制提示。
- [ ] 大文件提示。

### 6.3 Diff Tab 高级版

- [ ] 建立 diff parse worker。
- [ ] 使用 `parseDiffFromFile`。
- [ ] 建立 parsed diff LRU cache。
- [ ] 使用 `FileDiff`。
- [ ] 使用 `Virtualizer`。
- [ ] 支持 `selectedLines`。
- [ ] 支持 `lineAnnotations`。
- [ ] 支持 sticky header。
- [ ] 支持 render annotation。
- [ ] 支持当前行 focus。

验收：

- [ ] 修改文件后 Changes 自动刷新。
- [ ] staged/unstaged 同一路径可区分。
- [ ] untracked 文件有 synthetic diff。
- [ ] diff 行能选中。

## Phase 7：Context Basket

- [ ] 建立 `contextSlice`：
  - [ ] `items: ContextItem[]`
  - [ ] `activeBundleId`
  - [ ] `composerText`
  - [ ] `sendBehavior`
- [ ] 实现添加文件上下文：
  - [ ] 单文件。
  - [ ] 多文件。
  - [ ] 目录递归。
  - [ ] 去重。
- [ ] 实现添加 diff 上下文：
  - [ ] 单个变更。
  - [ ] 多个变更。
  - [ ] staged/unstaged 区分。
- [ ] 实现 context item note：
  - [ ] 每个文件可写一句说明。
  - [ ] 每个 diff 可写一句说明。
- [ ] Context tab UI：
  - [ ] Prompt composer。
  - [ ] Files group。
  - [ ] Diffs group。
  - [ ] Comments group。
  - [ ] Task group。
  - [ ] token/字符估算。
  - [ ] remove item。
  - [ ] clear all。
- [ ] Context preview tab：
  - [ ] 展示最终 markdown。
  - [ ] 标记截断。
  - [ ] 标记失败项。
- [ ] ContextService：
  - [ ] resolve items。
  - [ ] read file content。
  - [ ] read diff content。
  - [ ] render markdown。
  - [ ] write `.forgepad/context/<runId>.md`。
  - [ ] 返回 bundle metadata。

验收：

- [ ] 多个文件和多个 diff 可以一起出现在 Context tab。
- [ ] 文件 note 能进入最终 markdown。
- [ ] 超大文件被截断并提示。
- [ ] 二进制文件只引用路径。

## Phase 8：Diff 评论

- [ ] 定义 `DiffComment` 类型。
- [ ] 建立 `commentsSlice`。
- [ ] 在 `@pierre/diffs` 中接入 line selection：
  - [ ] `onLineSelected`
  - [ ] `onLineSelectionEnd`
  - [ ] `selectedLines`
- [ ] 实现 Comment Composer annotation。
- [ ] 评论字段：
  - [ ] workspaceId
  - [ ] relPath
  - [ ] bucket
  - [ ] side
  - [ ] startLine
  - [ ] endLine
  - [ ] endSide
  - [ ] text
  - [ ] previousPath
- [ ] 在 diff 行下渲染已保存评论。
- [ ] 在 Changes row / Files row 显示评论数量。
- [ ] Context tab 自动显示评论分组。
- [ ] 支持发送：
  - [ ] 当前文件评论。
  - [ ] 当前 workspace 全部评论。
  - [ ] 选中文件相关评论。
- [ ] 支持发送后：
  - [ ] 保留评论。
  - [ ] 清空已发送评论。
- [ ] 支持编辑/删除评论。

验收：

- [ ] 可以跨多个文件添加评论。
- [ ] 评论能随 Context Bundle 发送。
- [ ] split/unified 切换后评论仍显示。
- [ ] 同一路径 staged/unstaged 评论不串。

## Phase 9：发送到 AI Terminal

- [ ] 定义 Agent Preset：

```ts
type AgentPreset = {
  id: string;
  name: string;
  command: string;
  args?: string[];
  promptMode: "context-file" | "stdin" | "argument";
  startupDelayMs?: number;
};
```

- [ ] 内置 presets：
  - [ ] Codex
  - [ ] Claude Code
  - [ ] Gemini CLI
  - [ ] Custom shell
- [ ] 实现 Send to Active Terminal。
- [ ] 实现 Send to New Agent Terminal。
- [ ] context-file 模式：
  - [ ] 生成 context markdown。
  - [ ] 写入 `.forgepad/context/`。
  - [ ] terminal 输入简短指令。
- [ ] stdin 模式：
  - [ ] bracketed paste。
  - [ ] 自动 Enter。
- [ ] argument 模式：
  - [ ] 用 command template 渲染 prompt。
- [ ] 发送记录：
  - [ ] bundleId
  - [ ] terminalId
  - [ ] agentPresetId
  - [ ] sentAt
- [ ] Agent status：
  - [ ] running
  - [ ] awaiting_user
  - [ ] done
  - [ ] failed
- [ ] 初版可通过 terminal lifecycle 和用户手动状态标记实现。
- [ ] 后续接 agent hooks。

验收：

- [ ] 选择多个文件和评论后能发给当前终端。
- [ ] 终端中出现让 AI 阅读 context 文件的 prompt。
- [ ] Context bundle 文件真实存在且内容正确。
- [ ] 可以一键打开最近一次 bundle。

## Phase 10：Tasks

- [ ] 定义 Task：

```ts
type Task = {
  id: string;
  projectId: string;
  workspaceId?: string;
  title: string;
  description: string;
  status: "backlog" | "ready" | "running" | "review" | "done";
  createdAt: number;
  updatedAt: number;
};
```

- [ ] 左侧 Task list。
- [ ] 新建 task dialog。
- [ ] 任务详情 panel。
- [ ] Task 可加入 Context。
- [ ] Task 可创建 worktree。
- [ ] Task 可启动 AI terminal。
- [ ] Task 状态随 AgentRun 更新。

验收：

- [ ] 从 task 创建 workspace。
- [ ] task 描述进入 AI 上下文。
- [ ] task 能显示关联 workspace 和 branch。

## Phase 11：编辑器和文件操作

- [ ] File tab 接入 Monaco。
- [ ] 文件保存。
- [ ] unsaved indicator。
- [ ] Cmd/Ctrl+S 保存。
- [ ] 关闭未保存文件确认。
- [ ] Auto save on blur 设置。
- [ ] 文件树右键：
  - [ ] New File。
  - [ ] New Folder。
  - [ ] Rename。
  - [ ] Delete。
- [ ] 所有写操作路径校验。

验收：

- [ ] 编辑保存后 Git status 刷新。
- [ ] 文件重命名后 tab 更新或关闭。
- [ ] 删除打开中的文件有提示。

## Phase 12：Command Palette 和快捷操作

- [ ] Cmd/Ctrl+K 打开 command palette。
- [ ] 命令：
  - [ ] Open Folder。
  - [ ] Switch Project。
  - [ ] Switch Workspace。
  - [ ] New Terminal。
  - [ ] Open Diff。
  - [ ] Add Selected Files to Context。
  - [ ] Send Context to Terminal。
  - [ ] Clear Context。
  - [ ] Stage Selected。
  - [ ] Discard Selected。
  - [ ] Toggle Right Panel。
- [ ] 文件搜索结果。
- [ ] 最近 context bundle。

验收：

- [ ] 键盘可完成主要流程。
- [ ] command disabled 状态准确。

## Phase 13：测试

### Unit Tests

- [ ] Git status parser。
- [ ] Worktree parser。
- [ ] Path validation。
- [ ] Context renderer。
- [ ] File tree flatten。
- [ ] Diff synthetic patch。
- [ ] Selection reducer：
  - [ ] single select
  - [ ] multi select
  - [ ] range select
  - [ ] dedupe
- [ ] Comments reducer。

### E2E Tests

- [ ] 打开项目。
- [ ] 创建 terminal。
- [ ] 文件树显示。
- [ ] 修改文件后 changes 刷新。
- [ ] 打开 diff。
- [ ] 多选文件加入 context。
- [ ] 添加 diff 评论。
- [ ] 发送 context 到 terminal。
- [ ] 重启恢复状态。

### Visual Tests

- [ ] 初始空态。
- [ ] 三栏布局。
- [ ] 文件树。
- [ ] changes。
- [ ] diff split。
- [ ] diff unified。
- [ ] context basket。
- [ ] terminal 多 tab。

## Phase 14：打包发布

- [ ] electron-builder 配置。
- [ ] macOS app icon。
- [ ] app id。
- [ ] code signing 占位。
- [ ] auto update 暂缓。
- [ ] crash log 暂缓。
- [ ] README。
- [ ] 开发命令文档。
- [ ] 用户数据路径文档。

验收：

- [ ] 本机能打包 `.dmg`。
- [ ] 安装后能打开。
- [ ] node-pty 在打包后可用。

## 推荐实现顺序

1. 先做 Electron + PTY + 三栏布局。
2. 再做 Project/Workspace 持久化。
3. 接入 `@pierre/trees` 文件树。
4. 接入 Git status 和 Changes。
5. 接入 `@pierre/diffs` diff tab。
6. 做 Context Basket 的多文件选择。
7. 做 diff 评论。
8. 做 Context Bundle 发送到 terminal。
9. 再做 tasks 和 worktree。

## 第一周可交付版本

- [ ] 可打开本地 repo。
- [ ] 中间有可用 terminal。
- [ ] 右侧能显示文件树。
- [ ] 右侧能显示 Git changes。
- [ ] 点击变更能打开 diff。
- [ ] 可选择多个文件加入 Context。
- [ ] Context 可以生成 markdown 文件。
- [ ] 可以把 context 文件路径 prompt 发送到 terminal。

## 第二周可交付版本

- [ ] Diff 行评论。
- [ ] 多评论一起发送。
- [ ] Worktree 创建。
- [ ] Agent preset。
- [ ] 状态恢复增强。
- [ ] E2E 覆盖主流程。

