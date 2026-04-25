# AI 编码工具实现 TODO

日期：2026-04-25  
目标：基于 `@pierre/diffs` + `@pierre/trees` 实现一个终端优先的 AI 编码桌面软件。

## Phase 0：项目初始化

- [ ] 确定产品名、包名、bundle id。
- [x] 使用 Electron + electron-vite + React + TypeScript 初始化桌面项目。
- [x] 安装核心依赖：
  - [x] `@pierre/diffs`
  - [x] `@pierre/trees`
  - [x] `@xterm/xterm`
  - [x] `@xterm/addon-fit`
  - [x] `@xterm/addon-serialize`
  - [x] `@xterm/addon-web-links`
  - [x] `node-pty`
  - [x] `monaco-editor`
  - [x] `@monaco-editor/react`
  - [x] `zustand`
  - [x] `allotment` 或 `react-resizable-panels`
  - [x] `lucide-react`
- [x] 配置 Electron main / preload / renderer 三进程 TypeScript alias。
- [x] 配置 native dependency rebuild，确保 `node-pty` 可在 Electron 中运行。
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

- [x] `pnpm dev` 或 `bun dev` 能启动 Electron。
- [ ] renderer 能调用一个 preload 暴露的 ping API。
- [x] CI 或本地能跑 typecheck。

## Phase 1：领域模型与持久化

- [ ] 定义 `Project`、`Workspace`、`Tab`、`Task`、`AgentRun`、`ContextItem`、`ContextBundle` 类型。
- [x] 建立 Zustand store。
- [x] 实现 app state schema version。
- [x] 实现 `StateService.load()` 和 `StateService.save()`。
- [x] 使用 debounce 保存状态，默认 500ms。
- [x] 保存路径：`app.getPath("userData")/forgepad-state.json`。
- [x] 支持恢复：
  - [x] projects
  - [x] workspaces
  - [x] tabs
  - [x] activeWorkspaceId
  - [x] activeTabId
  - [x] settings
  - [x] context basket
- [x] 恢复时清理不存在的项目路径和 workspace 路径。

验收：

- [x] 新增项目后重启应用仍存在。
- [x] 删除磁盘上的 workspace 后重启不会崩溃。
- [x] schema version 不匹配时能安全 fallback。

## Phase 2：Main Process IPC

### 2.1 IPC 基础

- [x] 建立 `IPC` 常量表。
- [x] preload 只暴露 typed `window.api`。
- [x] 禁止 renderer 直接访问 Node API。
- [ ] 所有 IPC handler 捕获错误并返回可读 message。

### 2.2 GitService

- [x] `getTopLevel(path)`：获取 repo root。
- [x] `isGitRepo(path)`：判断 Git repo。
- [x] `getCurrentBranch(worktreePath)`。
- [x] `getStatus(worktreePath)`：
  - [x] 使用 `git status --porcelain=v2 --untracked-files=all`。
  - [x] 解析 staged / unstaged / untracked。
  - [x] 支持 renamed oldPath。
  - [x] 支持 conflict 状态。
- [x] `getFileDiff(worktreePath, relPath, bucket)`：
  - [x] staged diff。
  - [x] unstaged diff。
  - [x] untracked synthetic diff。
  - [ ] deleted synthetic diff。
  - [x] binary detection。
- [x] `stage(worktreePath, paths[])`。
- [x] `unstage(worktreePath, paths[])`。
- [x] `discard(worktreePath, entries[])`。
- [x] `commit(worktreePath, message)`。
- [ ] `listWorktrees(repoPath)`。
- [ ] `createWorktree(repoPath, name, branch, baseBranch)`。
- [ ] `removeWorktree(repoPath, worktreePath)`。
- [x] 批量 stage/unstage 每 100 个文件 chunk。
- [x] 所有 Git path 参数放在 `--` 后。

### 2.3 FileService

- [x] `readFile(workspaceId, relPath)`。
- [x] `writeFile(workspaceId, relPath, content)`。
- [x] `getTree(workspaceId)`。
- [x] `getTreeWithStatus(workspaceId)`。
- [ ] `listFiles(workspaceId)`。
- [ ] `search(workspaceId, query, options)`。
- [ ] `watchWorkspace(workspaceId)`。
- [ ] `unwatchWorkspace(workspaceId)`。
- [x] 文件大小限制。
- [x] 二进制文件检测。
- [x] symlink realpath 校验。
- [x] `.gitignore` respect：优先 `git ls-files --others --cached --exclude-standard`。
- [ ] fallback：`rg --files`，再 fallback 到 readdir。

### 2.4 PtyService

- [x] `create({ workspaceId, shell, command?, initialWrite? })`。
- [x] `write(ptyId, data)`。
- [x] `resize(ptyId, cols, rows)`。
- [x] `destroy(ptyId)`。
- [ ] `list()`。
- [x] `reattach(ptyId, sinceSeq?)`。
- [x] 保存 replay buffer，默认上限 8MB。
- [x] 终端退出事件推送 renderer。
- [x] 设置环境变量：
  - [x] `FORGEPAD_WORKSPACE_ID`
  - [x] `FORGEPAD_PTY_ID`
  - [x] `FORGEPAD_CONTEXT_DIR`

验收：

- [x] renderer 可创建终端并输入命令。
- [x] resize 正常。
- [x] 切换 tab 不丢 TUI 状态。
- [x] 关闭 terminal tab 能销毁 PTY。

## Phase 3：三栏 UI 骨架

- [x] 实现全屏 app shell。
- [x] 使用 resizable panes：
  - [x] 左侧 220px，最小 160px。
  - [x] 中间自适应。
  - [x] 右侧 320px，最小 220px。
- [x] 左侧 Sidebar：
  - [x] Project switcher。
  - [x] Workspace list。
  - [x] Task list placeholder。
  - [ ] Agent runs placeholder。
- [x] 中间 Center：
  - [x] TabBar。
  - [x] Content area。
  - [x] Empty state。
- [x] 右侧 RightPanel：
  - [x] Files tab。
  - [x] Changes tab。
  - [x] Context tab。
- [x] 实现基础快捷键：
  - [x] Cmd/Ctrl+T 新建终端。
  - [x] Cmd/Ctrl+W 关闭 tab。
  - [x] Cmd/Ctrl+J 聚焦或创建终端。
  - [x] Shift+Cmd/Ctrl+E 切 Files。
  - [x] Shift+Cmd/Ctrl+G 切 Changes。
  - [x] Shift+Cmd/Ctrl+C 切 Context。

验收：

- [x] 窗口缩放时布局不溢出。
- [x] 终端、文件、diff tab 可以切换。
- [ ] 左右栏可折叠。

## Phase 4：项目和 Workspace

- [x] Open Folder dialog。
- [x] 打开 folder 后解析 repo root。
- [x] 创建 Project。
- [x] 自动创建 Root Workspace。
- [x] 自动创建 Terminal tab。
- [x] Workspace list 按项目分组。
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

- [x] main process 实现 `getTreeWithStatus`。
- [x] renderer 实现 `FilesPanel`。
- [x] 把 FileNode flatten 为：
  - [x] `paths: string[]`
  - [x] `filePaths: Set<string>`
  - [x] `gitStatus: GitStatusEntry[]`
- [x] 接入 `useFileTree`：
  - [x] `id = workspace-files-${workspaceId}`
  - [x] `initialExpansion = 1`
  - [x] `search = true`
  - [x] `flattenEmptyDirectories = true`
  - [x] `itemHeight = 26`
- [x] 接入 `FileTree` 组件。
- [x] 单击文件打开 File tab。
- [ ] Cmd/Ctrl 点击文件 toggle 到 context。
- [ ] Shift 点击文件范围选择。
- [ ] 目录右键 Add Directory to Context。
- [ ] 文件右键 Add to Context / Remove from Context。
- [ ] 文件树 watch workspace 自动刷新。
- [x] Git 操作后手动触发刷新。

验收：

- [x] 文件树显示 Git 状态。
- [x] 搜索文件仍能打开。
- [x] 多文件选择在 Context tab 中同步显示。
- [ ] 大 repo 不明显卡顿。

## Phase 6：Changes 和 `@pierre/diffs`

### 6.1 Changes Panel

- [x] 获取 git snapshot。
- [x] 分 staged / changes / untracked 显示。
- [x] 每个 row 显示 status badge。
- [x] 单击 row 打开 Diff tab 并定位文件。
- [ ] Cmd/Ctrl 多选变更。
- [ ] Shift 范围选择变更。
- [x] Stage selected。
- [x] Unstage selected。
- [x] Discard selected。
- [ ] Stage all。
- [x] Commit staged。
- [x] Add selected changes to Context。

### 6.2 Diff Tab MVP

- [x] 获取 changed files。
- [x] 对每个文件获取 patch。
- [x] 使用 `PatchDiff` 渲染。
- [ ] 文件 header 可点击打开文件。
- [x] split / unified toggle。
- [ ] 文件跳转 strip。
- [x] 二进制提示。
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
- [x] diff 行能选中。

## Phase 7：Context Basket

- [x] 建立 `contextSlice`：
  - [x] `items: ContextItem[]`
  - [ ] `activeBundleId`
  - [x] `composerText`
  - [x] `sendBehavior`
- [x] 实现添加文件上下文：
  - [x] 单文件。
  - [x] 多文件。
  - [ ] 目录递归。
  - [x] 去重。
- [x] 实现添加 diff 上下文：
  - [x] 单个变更。
  - [x] 多个变更。
  - [x] staged/unstaged 区分。
- [x] 实现 context item note：
  - [x] 每个文件可写一句说明。
  - [x] 每个 diff 可写一句说明。
- [x] Context tab UI：
  - [x] Prompt composer。
  - [x] Files group。
  - [x] Diffs group。
  - [x] Comments group。
  - [x] Task group。
  - [x] token/字符估算。
  - [x] remove item。
  - [x] clear all。
- [x] Context preview tab：
  - [x] 展示最终 markdown。
  - [x] 标记截断。
  - [x] 标记失败项。
- [x] ContextService：
  - [x] resolve items。
  - [x] read file content。
  - [x] read diff content。
  - [x] render markdown。
  - [x] write `.forgepad/context/<runId>.md`。
  - [x] 返回 bundle metadata。

验收：

- [x] 多个文件和多个 diff 可以一起出现在 Context tab。
- [x] 文件 note 能进入最终 markdown。
- [x] 超大文件被截断并提示。
- [x] 二进制文件只引用路径。

## Phase 8：Diff 评论

- [x] 定义 `DiffComment` 类型。
- [x] 建立 `commentsSlice`。
- [x] 在 `@pierre/diffs` 中接入 line selection：
  - [ ] `onLineSelected`
  - [x] `onLineSelectionEnd`
  - [ ] `selectedLines`
- [x] 实现 Comment Composer annotation。
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
- [x] 在 diff 行下渲染已保存评论。
- [ ] 在 Changes row / Files row 显示评论数量。
- [x] Context tab 自动显示评论分组。
- [ ] 支持发送：
  - [ ] 当前文件评论。
  - [x] 当前 workspace 全部评论。
  - [ ] 选中文件相关评论。
- [ ] 支持发送后：
  - [x] 保留评论。
  - [x] 清空已发送评论。
- [ ] 支持编辑/删除评论。

验收：

- [x] 可以跨多个文件添加评论。
- [x] 评论能随 Context Bundle 发送。
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
- [x] 实现 Send to Active Terminal。
- [ ] 实现 Send to New Agent Terminal。
- [x] context-file 模式：
  - [x] 生成 context markdown。
  - [x] 写入 `.forgepad/context/`。
  - [x] terminal 输入简短指令。
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

- [x] 选择多个文件和评论后能发给当前终端。
- [x] 终端中出现让 AI 阅读 context 文件的 prompt。
- [x] Context bundle 文件真实存在且内容正确。
- [x] 可以一键打开最近一次 bundle。

## Phase 10：Tasks

- [x] 定义 Task：

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

- [x] 左侧 Task list。
- [x] 新建 task dialog。
- [ ] 任务详情 panel。
- [x] Task 可加入 Context。
- [ ] Task 可创建 worktree。
- [ ] Task 可启动 AI terminal。
- [ ] Task 状态随 AgentRun 更新。

验收：

- [ ] 从 task 创建 workspace。
- [x] task 描述进入 AI 上下文。
- [ ] task 能显示关联 workspace 和 branch。

## Phase 11：编辑器和文件操作

- [x] File tab 接入 Monaco。
- [x] 文件保存。
- [x] unsaved indicator。
- [x] Cmd/Ctrl+S 保存。
- [ ] 关闭未保存文件确认。
- [ ] Auto save on blur 设置。
- [ ] 文件树右键：
  - [ ] New File。
  - [ ] New Folder。
  - [ ] Rename。
  - [ ] Delete。
- [ ] 所有写操作路径校验。

验收：

- [x] 编辑保存后 Git status 刷新。
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

- [x] 可打开本地 repo。
- [x] 中间有可用 terminal。
- [x] 右侧能显示文件树。
- [x] 右侧能显示 Git changes。
- [x] 点击变更能打开 diff。
- [x] 可选择多个文件加入 Context。
- [x] Context 可以生成 markdown 文件。
- [x] 可以把 context 文件路径 prompt 发送到 terminal。

## 第二周可交付版本

- [x] Diff 行评论。
- [x] 多评论一起发送。
- [ ] Worktree 创建。
- [ ] Agent preset。
- [x] 状态恢复增强。
- [ ] E2E 覆盖主流程。

