import type { AgentStatusUpdate } from '@shared/agent-lifecycle';
import type {
  ContextBundleResult,
  CreateBundleInput,
  CustomPetMeta,
  DeletePetResult,
  ExtensionInfo,
  FileNode,
  FileStatus,
  GitBucket,
  GitStatusKind,
  ImportPetResult,
  LspLocation,
  OpenProjectResult,
  AgentCompletionData,
  AgentUserPromptData,
  PendingPermission,
  PersistedAppState,
  PetCommand,
  PetPlayAction,
  PetSettings,
  WorkspaceChangeEvent,
} from '@shared/types';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const noopUnlisten = () => {};
const isTauri = '__TAURI_INTERNALS__' in window;

function onEvent<T>(event: string, callback: (payload: T) => void) {
  let active = true;
  let unlisten: (() => void) | undefined;
  listen<T>(event, (evt) => {
    if (active) callback(evt.payload);
  }).then((fn) => {
    if (active) unlisten = fn;
    else fn();
  }).catch(() => {});
  return () => {
    active = false;
    unlisten?.();
  };
}

export const tauriForgepadApi = {
  app: {
    openProject: () => invoke<OpenProjectResult | null>('app_open_project'),
    openProjectFromPath: (selectedPath: string) => invoke<OpenProjectResult | null>('app_open_project_from_path', { selectedPath }),
    showEmojiPanel: () => invoke<void>('app_show_emoji_panel'),
    pickDirectory: (title?: string) => invoke<string | null>('app_pick_directory', { title }),
    setIcon: (variant: string) => invoke<void>('app_set_icon', { variant }),
  },
  state: {
    load: () => invoke<Partial<PersistedAppState> | null>('state_load'),
    save: (state: PersistedAppState) => invoke<void>('state_save', { state }),
  },
  git: {
    getCurrentBranch: (worktreePath: string) => invoke<string>('git_current_branch', { worktreePath }),
    getBranchStats: (worktreePath: string) => invoke<{ ahead: number; behind: number; additions: number; deletions: number }>('git_branch_stats', { worktreePath }),
    getStatus: (worktreePath: string) => invoke<FileStatus[]>('git_status', { worktreePath }),
    getFileDiff: (worktreePath: string, relPath: string, bucket: GitBucket, status: GitStatusKind, oldPath?: string) =>
      invoke('git_file_diff', { worktreePath, relPath, bucket, status, oldPath }),
    stage: (worktreePath: string, paths: string[]) => invoke<void>('git_stage', { worktreePath, paths }),
    unstage: (worktreePath: string, paths: string[]) => invoke<void>('git_unstage', { worktreePath, paths }),
    discard: (worktreePath: string, entries: Array<{ path: string; bucket: GitBucket }>) => invoke<void>('git_discard', { worktreePath, entries }),
    commit: (worktreePath: string, message: string) => invoke<void>('git_commit', { worktreePath, message }),
    push: (worktreePath: string) => invoke<void>('git_push', { worktreePath }),
    pull: (worktreePath: string) => invoke<void>('git_pull', { worktreePath }),
    generateCommitMessage: (worktreePath: string, promptTemplate: string) => invoke<string>('git_generate_commit_msg', { worktreePath, promptTemplate }),
    addWorktree: (repoPath: string, branch: string, trackRemote?: boolean, worktreeBaseDir?: string) =>
      invoke<{ worktreePath: string; branch: string }>('git_worktree_add', { repoPath, branch, trackRemote, worktreeBaseDir }),
    removeWorktree: (repoPath: string, worktreePath: string, branch: string) => invoke<void>('git_worktree_remove', { repoPath, worktreePath, branch }),
    fetch: (repoPath: string) => invoke<void>('git_fetch', { repoPath }),
    listRemoteBranches: (repoPath: string) => invoke<string[]>('git_remote_branches', { repoPath }),
    getPrInfo: (worktreePath: string) => invoke<{ number: number; url: string; merged: boolean } | null>('git_pr_number', { worktreePath }),
    scanWorktrees: (baseDir: string) => invoke<Array<{ repoName: string; repoPath: string; branch: string; worktreePath: string }>>('git_scan_worktrees', { baseDir }),
  },
  fs: {
    getTreeWithStatus: (worktreePath: string) => invoke<FileNode[]>('fs_tree_with_status', { worktreePath }),
    listFiles: (worktreePath: string) => invoke<string[]>('fs_list_files', { worktreePath }),
    readFile: (worktreePath: string, relPath: string) => invoke<string>('fs_read_file', { worktreePath, relPath }),
    readFileAsDataUrl: (worktreePath: string, relPath: string) => invoke<string>('fs_read_file_data_url', { worktreePath, relPath }),
    readAbsFile: (absPath: string) => invoke<string>('fs_read_abs_file', { absPath }),
    readAbsFileAsDataUrl: (absPath: string) => invoke<string>('fs_read_abs_file_data_url', { absPath }),
    writeFile: (worktreePath: string, relPath: string, content: string) => invoke<void>('fs_write_file', { worktreePath, relPath, content }),
    watchWorkspace: (worktreePath: string) => invoke<string>('fs_watch', { worktreePath }),
    unwatchWorkspace: (watchId: string) => { void invoke('fs_unwatch', { watchId }); },
    onChanged: (_watchId: string, _callback: (event: WorkspaceChangeEvent) => void) => noopUnlisten,
  },
  pty: {
    create: (worktreePath: string, shell?: string, command?: string, extraEnv?: Record<string, string>) => invoke<string>('pty_create', { worktreePath, shell, command, extraEnv }),
    write: (id: string, data: string) => { void invoke('pty_write', { id, data }); },
    resize: (id: string, cols: number, rows: number) => { void invoke('pty_resize', { id, cols, rows }); },
    destroy: (id: string) => { void invoke('pty_destroy', { id }); },
    reattach: (id: string) => invoke<{ replay: string; alive: boolean }>('pty_reattach', { id }),
    onData: (id: string, callback: (data: string) => void) => onEvent<string>(`pty:data:${id}`, callback),
    onExit: (id: string, callback: (exitCode: number, signal?: number) => void) =>
      onEvent<{ exitCode: number; signal?: number }>(`pty:exit:${id}`, (data) => callback(data.exitCode, data.signal)),
  },
  context: {
    createBundle: (input: CreateBundleInput) => invoke<ContextBundleResult>('context_create_bundle', { input }),
  },
  agent: {
    onStatusUpdate: (callback: (update: AgentStatusUpdate) => void) => onEvent<AgentStatusUpdate>('agent:status-update', callback),
    onFocusTab: (callback: (ptyId: string) => void) => onEvent<string>('agent:focus-tab', callback),
    onRenameTab: (callback: (data: { ptyId: string; title: string }) => void) => onEvent<{ ptyId: string; title: string }>('agent:rename-tab', callback),
    onPermissionRequest: (callback: (data: PendingPermission) => void) => onEvent<PendingPermission>('agent:permission-request', callback),
    sendPermissionDecision: (_ptyId: string, _decision: 'allow' | 'deny' | 'allowAlways' | 'answer', _answers?: Record<string, string>) => {},
    onUserPrompt: (callback: (data: AgentUserPromptData) => void) => onEvent<AgentUserPromptData>('agent:user-prompt', callback),
    onCompletion: (callback: (data: AgentCompletionData) => void) => onEvent<AgentCompletionData>('agent:completion', callback),
  },
  menu: { onOpenSettings: (_callback: () => void) => noopUnlisten },
  shell: {
    openPath: (fullPath: string) => invoke<void>('shell_open_path', { fullPath }),
    openExternal: (url: string) => invoke<void>('shell_open_external', { url }),
    openInIde: (fullPath: string) => invoke<void>('shell_open_in_ide', { fullPath }),
    openInTerminal: (fullPath: string) => invoke<void>('shell_open_in_terminal', { fullPath }),
    showItemInFolder: (fullPath: string) => invoke<void>('shell_show_item_in_folder', { fullPath }),
    detectIdes: () => invoke<Array<{ id: string; label: string; command: string; appName?: string }>>('shell_detect_ides'),
    openWithIde: (fullPath: string, ideId: string) => invoke<void>('shell_open_with_ide', { fullPath, ideId }),
    detectTerminals: () => invoke<Array<{ id: string; label: string; appName: string }>>('shell_detect_terminals'),
    openWithTerminal: (fullPath: string, terminalId: string) => invoke<void>('shell_open_with_terminal', { fullPath, terminalId }),
  },
  notification: {
    pickAudio: () => invoke<{ fileName: string; assetPath: string; dataUrl: string } | null>('notification_pick_audio'),
    deleteAudio: (assetPath: string) => invoke<void>('notification_delete_audio', { assetPath }),
  },
  app2: {
    isFocused: () => invoke<boolean>('app_is_focused'),
    focusWindow: () => { void invoke('app_focus_window'); },
    toggleMaximize: () => { void invoke('app_toggle_maximize'); },
  },
  nativeFiles: { getPath: (file: File): string => (file as File & { path?: string }).path ?? file.name },
  browser: {
    captureScreenshot: (_webContentsId: number, _rect: { x: number; y: number; width: number; height: number }) => invoke<string>('browser_capture_screenshot'),
    setTouchEmulation: (_webContentsId: number, _enabled: boolean) => invoke<void>('browser_noop'),
    enableConsole: (_webContentsId: number) => invoke<void>('browser_noop'),
    disableConsole: (_webContentsId: number) => invoke<void>('browser_noop'),
    openDevTools: (_webContentsId: number) => invoke<void>('browser_noop'),
    openWindow: (url: string, title?: string) => invoke<void>('browser_open_window', { url, title }),
    popout: (url: string, title?: string) => invoke<void>('browser_open_window', { url, title }),
    onConsoleEvent: (_callback: (raw: unknown) => void) => noopUnlisten,
  },
  lsp: {
    getDefinition: (worktreePath: string, token: string) => invoke<LspLocation[]>('lsp_get_definition', { worktreePath, token }),
  },
  extension: {
    list: () => invoke<ExtensionInfo[]>('extension_list'),
    install: () => invoke<ExtensionInfo | null>('extension_install'),
    uninstall: (id: string) => invoke<void>('extension_uninstall', { id }),
    openPopup: (_extId: string, _popupPath: string, _x: number, _y: number, _activeTabId: number, _activeTabUrl?: string) => invoke<void>('extension_open_popup'),
    onTabCreate: (_callback: (data: { requestId: string; url: string; active: boolean }) => void) => noopUnlisten,
    sendTabCreated: (_requestId: string, _webContentsId: number) => {},
  },
  pet: {
    sendSettings: (settings: PetSettings) => { void invoke('pet_send_settings', { settings }); },
    command: (command: PetCommand) => { void invoke('pet_command', { command }); },
    play: (action?: PetPlayAction | 'random') => { void invoke('pet_command', { command: { type: 'play', action } }); },
    stop: () => { void invoke('pet_command', { command: { type: 'stop' } }); },
    importPet: () => invoke<ImportPetResult>('pet_import'),
    deletePet: (petId: string) => invoke<DeletePetResult>('pet_delete', { petId }),
    listPets: () => invoke<CustomPetMeta[]>('pet_list'),
  },
};

if (isTauri && !window.forgepad) {
  window.forgepad = tauriForgepadApi;
}

export type ForgePadApi = typeof tauriForgepadApi;
