# 四个参考项目调研笔记

日期：2026-04-25

## constellagent

路径：`/Users/zxpzdtom/code/constellagent`

定位：Mac app for running multiple AI agents in parallel。

技术栈：

- Electron
- React 19
- Zustand
- Monaco
- xterm / node-pty
- `@pierre/diffs`
- `@pierre/trees`

关键文件：

- `desktop/src/renderer/App.tsx`
- `desktop/src/renderer/store/app-store.ts`
- `desktop/src/renderer/store/types.ts`
- `desktop/src/renderer/components/RightPanel/FileTree.tsx`
- `desktop/src/renderer/components/RightPanel/ChangedFiles.tsx`
- `desktop/src/renderer/components/Editor/DiffEditor.tsx`
- `desktop/src/renderer/components/Terminal/TerminalPanel.tsx`
- `desktop/src/main/git-service.ts`
- `desktop/src/main/file-service.ts`
- `desktop/src/main/pty-manager.ts`
- `desktop/src/main/ipc.ts`

结论：

- 这是最接近目标形态的项目。
- 它已经把中间 terminal、右侧 file tree / changes、左侧 project/workspace 跑通。
- `@pierre/trees` 的使用很直接：renderer flatten tree，传 paths/gitStatus 给 `useFileTree`。
- `@pierre/diffs` 当前使用 `PatchDiff`，适合 MVP，但评论能力需要升级到 `FileDiff` + annotations。

## open-warden

路径：`/Users/zxpzdtom/code/open-warden`

定位：Source control / review 类桌面应用。

技术栈：

- Electron
- React
- Redux Toolkit
- `@pierre/diffs`

关键文件：

- `apps/desktop/src/provider/DiffWorkerProvider.tsx`
- `apps/desktop/src/features/source-control/types.ts`
- `apps/desktop/src/features/source-control/sourceControlSlice.ts`
- `apps/desktop/src/features/source-control/actions.ts`
- `apps/desktop/src/features/source-control/components/ChangesTab.tsx`
- `apps/desktop/src/features/source-control/components/FileSection.tsx`
- `apps/desktop/src/features/diff-view/components/DiffViewer.tsx`
- `apps/desktop/src/features/diff-view/hooks/useDiffCommentAnnotations.tsx`
- `apps/desktop/src/features/comments/actions.ts`
- `apps/desktop/src/features/comments/commentsSlice.ts`
- `apps/desktop/src/features/command-palette/AppCommandPalette.tsx`

结论：

- 多选文件、范围选择、评论 annotation、复制评论这几个能力非常值得借鉴。
- `SelectedFile = { bucket, path }` 这个模型适合我们的 Git context 选择。
- `CommentItem` 的字段也适合作为我们的 `DiffComment` 起点。
- 它的 command palette 中已经有“对选中/当前文件执行操作”的模式，可以迁移到“发送上下文”。

## orca

路径：`/Users/zxpzdtom/code/orca`

定位：更偏 relay/runtime 的 AI coding workspace 工具。

关键文件：

- `src/relay/fs-handler.ts`
- `src/relay/git-handler.ts`
- `src/relay/git-handler-utils.ts`
- `src/relay/context.ts`
- `src/preload/index.ts`

结论：

- 最值得借鉴的是安全边界。
- 文件和 Git 操作都要先绑定 workspace root。
- symlink、路径穿越、大文件、二进制、rm/restore 这类风险要一开始就处理。
- Git status 推荐用 porcelain v2，比 constellagent 的 porcelain v1 更稳。

## superset

路径：`/Users/zxpzdtom/code/superset`

定位：更完整的多 workspace / agent / cloud 架构。

关键文件：

- `apps/desktop/src/shared/context/types.ts`
- `apps/desktop/src/shared/context/composer.ts`
- `apps/desktop/src/shared/context/buildLaunchSpec.ts`
- `apps/desktop/src/renderer/lib/pending-attachment-store.ts`
- `packages/host-service/src/runtime/filesystem/filesystem.ts`
- `packages/host-service/src/events/event-bus.ts`
- `packages/workspace-client/src/lib/eventBus.ts`

结论：

- 上下文组合的抽象最成熟。
- `LaunchSource -> ContextSection -> LaunchContext -> AgentLaunchSpec` 这条链适合长期演进。
- MVP 不需要完整 host-service，但 context composer 的思想应保留。
- 附件、任务、issue、PR、用户 prompt 都应该被看成不同的 source。

## 对 ForgePad 的综合建议

1. 架构骨架采用 constellagent。
2. Diff 高级交互采用 open-warden。
3. 文件/Git 安全采用 orca。
4. AI 上下文组合采用 superset。
5. 初版不要做云同步和 PR review 写回，先把“终端 + 文件树 + diff + 多文件/多评论上下文发送”打磨顺。

