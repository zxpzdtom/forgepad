import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PatchDiff } from '@pierre/diffs/react';
import { useAppStore } from '@renderer/store/app-store';
import type { AgentStatus } from '@shared/agent-lifecycle';
import type { AgentPlanItem, AgentTokenUsage, AgentTranscriptMessage, FileStatus, PendingPermission, Tab, Workspace } from '@shared/types';
import { code as streamdownCode } from '@streamdown/code';
import clsx from 'clsx';
import {
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Circle,
  Code2,
  FilePenLine,
  FileText,
  GitBranch,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  ShieldQuestion,
  Square,
  TerminalSquare,
  Undo2,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { Streamdown, type StreamdownProps } from 'streamdown';

import { FileIcon } from './FileIcon';
import { markdownCodeBlockRenderer } from './MarkdownCodeBlock';

type AgentTab = Extract<Tab, { type: 'terminal' }>;

type AgentChatPanelProps = {
  tab: AgentTab;
  workspace: Workspace;
  active: boolean;
};

const EMPTY_TRANSCRIPT: AgentTranscriptMessage[] = [];
const MAX_CHANGE_ROWS = 6;

type AgentTurnEvent = {
  runId?: string;
  ptyId?: string;
  data?: {
    delta?: string;
    text?: string;
    finalMessage?: string;
    threadId?: string;
    message?: string;
    tokenUsage?: AgentTokenUsage;
  };
};

type AgentItemEvent = AgentTurnEvent & {
  data?: AgentTurnEvent['data'] & {
    method?: string;
    params?: Record<string, unknown>;
    turnId?: string;
  };
};

type AgentActivityKind = 'search' | 'command' | 'edit' | 'reasoning' | 'tool' | 'hook' | 'plan' | 'collab' | 'system';

type AgentActivity = {
  id: string;
  kind: AgentActivityKind;
  title: string;
  detail?: string;
  startedAt?: number;
  completedAt?: number;
  status: 'running' | 'done';
  /** Command output accumulated from outputDelta events */
  output?: string;
  /** Patch content for file edits */
  patch?: string;
  /** Plan items for plan activities */
  planItems?: AgentPlanItem[];
  /** MCP tool call arguments */
  toolArgs?: string;
  /** Auto-approval details */
  approvedTools?: string[];
};

type ComposerAttachment = {
  id: string;
  name: string;
  kind: 'image' | 'file';
  dataUrl?: string;
  textContent?: string;
};

// ─── Streamdown plugins (lazy-loaded mermaid + math) ───────────────────────────

type StreamdownPlugins = NonNullable<React.ComponentProps<typeof Streamdown>['plugins']>;
const basePlugins: StreamdownPlugins = { code: streamdownCode, renderers: [markdownCodeBlockRenderer] };
const markdownControls = { table: false, code: false } satisfies StreamdownProps['controls'];

let cachedMermaidPlugin: StreamdownPlugins['mermaid'] | null = null;
let cachedMathPlugin: StreamdownPlugins['math'] | null = null;

function useStreamdownPlugins(text: string): StreamdownPlugins {
  const [mermaidPlugin, setMermaidPlugin] = useState<StreamdownPlugins['mermaid'] | null>(cachedMermaidPlugin);
  const [mathPlugin, setMathPlugin] = useState<StreamdownPlugins['math'] | null>(cachedMathPlugin);

  const needsMermaid = /^```mermaid\b/im.test(text);
  const needsMath = /\$[\s\S]+?\$/.test(text);

  useEffect(() => {
    if (needsMermaid && !cachedMermaidPlugin) {
      import('@streamdown/mermaid')
        .then((mod) => {
          cachedMermaidPlugin = mod.mermaid ?? mod.default;
          setMermaidPlugin(cachedMermaidPlugin);
        })
        .catch(() => {});
    }
  }, [needsMermaid]);

  useEffect(() => {
    if (needsMath && !cachedMathPlugin) {
      import('@streamdown/math')
        .then((mod) => {
          cachedMathPlugin = mod.math ?? mod.default;
          setMathPlugin(cachedMathPlugin);
        })
        .catch(() => {});
    }
  }, [needsMath]);

  return useMemo(() => {
    const plugins: StreamdownPlugins = { ...basePlugins };
    if (mermaidPlugin) plugins.mermaid = mermaidPlugin;
    if (mathPlugin) plugins.math = mathPlugin;
    return plugins;
  }, [mermaidPlugin, mathPlugin]);
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function asTurnEvent(value: unknown): AgentTurnEvent | null {
  if (!value || typeof value !== 'object') return null;
  return value as AgentTurnEvent;
}

function asItemEvent(value: unknown): AgentItemEvent | null {
  if (!value || typeof value !== 'object') return null;
  return value as AgentItemEvent;
}

function statusLabel(status: AgentStatus | undefined, exited: boolean): string {
  if (exited) return 'Exited';
  if (status === 'working') return 'Working';
  if (status === 'permission') return 'Needs input';
  if (status === 'review') return 'Ready';
  return 'Idle';
}

function statusText(status: AgentStatus | undefined, exited: boolean): string {
  if (exited) return '已退出';
  if (status === 'working') return '正在处理';
  if (status === 'permission') return '等待输入';
  if (status === 'review') return '已就绪';
  return '空闲';
}

function StatusIcon({ status, exited }: { status: AgentStatus | undefined; exited: boolean }) {
  if (exited) return <Circle size={13} />;
  if (status === 'working') return <Loader2 className="animate-spin" size={13} />;
  if (status === 'permission') return <ShieldQuestion size={13} />;
  if (status === 'review') return <CheckCircle2 size={13} />;
  return <Circle size={13} />;
}

function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function changeStats(files: FileStatus[]): { additions: number; deletions: number } {
  return files.reduce(
    (stats, file) => ({
      additions: stats.additions + (file.additions ?? 0),
      deletions: stats.deletions + (file.deletions ?? 0),
    }),
    { additions: 0, deletions: 0 },
  );
}

function fileLabel(file: FileStatus): string {
  return file.oldPath && file.status === 'renamed' ? `${file.oldPath} -> ${file.path}` : file.path;
}

function valueAt(input: unknown, path: string[]): unknown {
  let current = input;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function stringAt(input: unknown, path: string[]): string | undefined {
  const value = valueAt(input, path);
  return typeof value === 'string' ? value : undefined;
}

function itemIdFromParams(params: Record<string, unknown> | undefined): string {
  return (
    stringAt(params, ['itemId']) ??
    stringAt(params, ['item', 'id']) ??
    stringAt(params, ['run', 'id']) ??
    stringAt(params, ['turn', 'id']) ??
    crypto.randomUUID()
  );
}

function itemTypeFromParams(params: Record<string, unknown> | undefined): string {
  return stringAt(params, ['item', 'type']) ?? stringAt(params, ['type']) ?? '';
}

function firstChangePath(params: Record<string, unknown> | undefined): string | undefined {
  const candidates = [valueAt(params, ['changes']), valueAt(params, ['item', 'changes']), valueAt(params, ['patch', 'changes'])];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const change of candidate) {
      if (!change || typeof change !== 'object') continue;
      const path =
        stringAt(change, ['path']) ??
        stringAt(change, ['filePath']) ??
        stringAt(change, ['newPath']) ??
        stringAt(change, ['oldPath']);
      if (path) return path;
    }
  }
  return undefined;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function extractPlanItems(params: Record<string, unknown> | undefined): AgentPlanItem[] | undefined {
  const rawItems =
    (valueAt(params, ['plan', 'items']) as unknown[]) ??
    (valueAt(params, ['items']) as unknown[]) ??
    (valueAt(params, ['item', 'items']) as unknown[]);
  if (!Array.isArray(rawItems)) return undefined;
  return rawItems
    .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
    .map((item, index) => ({
      id: stringAt(item, ['id']) ?? `plan-${index}`,
      title: stringAt(item, ['title']) ?? stringAt(item, ['text']) ?? stringAt(item, ['description']) ?? '',
      status: (stringAt(item, ['status']) as AgentPlanItem['status']) ?? 'pending',
    }))
    .filter((item) => item.title.length > 0);
}

function extractPatchContent(params: Record<string, unknown> | undefined): string | undefined {
  const patch = stringAt(params, ['patch']) ?? stringAt(params, ['item', 'patch']) ?? stringAt(params, ['diff']);
  return patch;
}

// ─── Activity processing ────────────────────────────────────────────────────────

function activityFromItem(method: string, params: Record<string, unknown> | undefined, done: boolean): AgentActivity | null {
  const itemType = itemTypeFromParams(params);
  const id = itemIdFromParams(params);
  const command = stringAt(params, ['item', 'command']) ?? stringAt(params, ['command']);
  const path = stringAt(params, ['item', 'path']) ?? stringAt(params, ['path']) ?? firstChangePath(params);

  if (method === 'hook/started' || method === 'hook/completed') {
    return {
      id,
      kind: 'hook',
      title: done ? 'Hook 完成' : '正在运行 Hook',
      detail: stringAt(params, ['run', 'command']) ?? stringAt(params, ['run', 'name']),
      status: done ? 'done' : 'running',
    };
  }
  if (method === 'turn/plan/updated' || method === 'item/plan/delta' || itemType === 'todo-list' || itemType === 'plan') {
    const planItems = extractPlanItems(params);
    return { id, kind: 'plan', title: done ? '计划已更新' : '正在规划', status: done ? 'done' : 'running', planItems };
  }
  if (method === 'item/autoApprovalReview/started' || method === 'item/autoApprovalReview/completed') {
    const approved = valueAt(params, ['approved']) as string[] | undefined;
    return {
      id,
      kind: 'tool',
      title: done ? '自动审批检查完成' : '正在检查审批',
      status: done ? 'done' : 'running',
      approvedTools: Array.isArray(approved) ? approved : undefined,
    };
  }
  if (itemType === 'commandExecution' || itemType === 'exec' || command) {
    return { id, kind: 'command', title: done ? '运行命令' : '正在运行命令', detail: command, status: done ? 'done' : 'running' };
  }
  if (
    itemType === 'fileChange' ||
    itemType === 'patch' ||
    method === 'item/fileChange/patchUpdated' ||
    method === 'item/fileChange/outputDelta'
  ) {
    const patch = extractPatchContent(params);
    return {
      id,
      kind: 'edit',
      title: done ? '编辑完成' : path ? '正在编辑' : '正在编辑文件',
      detail: path,
      status: done ? 'done' : 'running',
      patch,
    };
  }
  if (itemType === 'webSearch' || itemType === 'search') {
    return {
      id,
      kind: 'search',
      title: done ? '搜索完成' : '正在搜索',
      detail: stringAt(params, ['item', 'query']),
      status: done ? 'done' : 'running',
    };
  }
  if (itemType === 'reasoning' || method.includes('reasoning')) {
    return { id, kind: 'reasoning', title: done ? '思考完成' : '正在思考', status: done ? 'done' : 'running' };
  }
  if (itemType === 'mcpToolCall' || itemType === 'dynamicToolCall') {
    const toolName = stringAt(params, ['item', 'name']) ?? stringAt(params, ['item', 'toolName']);
    const args = valueAt(params, ['item', 'arguments']) ?? valueAt(params, ['arguments']);
    return {
      id,
      kind: 'tool',
      title: done ? '工具调用完成' : '正在调用工具',
      detail: toolName,
      status: done ? 'done' : 'running',
      toolArgs: args ? JSON.stringify(args, null, 2).slice(0, 500) : undefined,
    };
  }
  // Thread lifecycle events
  if (method === 'thread/compacted') {
    return { id, kind: 'system', title: '上下文已压缩', status: 'done' };
  }
  if (method === 'thread/archived' || method === 'thread/closed') {
    return { id, kind: 'system', title: method === 'thread/archived' ? '会话已归档' : '会话已关闭', status: 'done' };
  }
  // Undo events
  if (method === 'codex/event/undo_started') {
    return { id, kind: 'system', title: '正在撤销变更', status: 'running' };
  }
  if (method === 'codex/event/undo_completed') {
    return { id, kind: 'system', title: '撤销完成', status: 'done' };
  }
  // Collaborative agent events
  if (method.includes('collab_agent_spawn')) {
    const agentName = stringAt(params, ['name']) ?? stringAt(params, ['agentName']) ?? '子 Agent';
    return {
      id,
      kind: 'collab',
      title: done ? `子 Agent 已启动: ${agentName}` : `正在启动子 Agent: ${agentName}`,
      status: done ? 'done' : 'running',
    };
  }
  if (method.includes('collab_agent_interaction')) {
    return { id, kind: 'collab', title: done ? '子 Agent 交互完成' : '子 Agent 正在交互', status: done ? 'done' : 'running' };
  }
  if (method.includes('collab_waiting')) {
    return { id, kind: 'collab', title: done ? '等待子 Agent 完成' : '正在等待子 Agent', status: done ? 'done' : 'running' };
  }
  if (method.includes('collab_close')) {
    return { id, kind: 'collab', title: '子 Agent 已关闭', status: 'done' };
  }
  if (method.includes('collab_resume')) {
    return { id, kind: 'collab', title: done ? '恢复完成' : '正在恢复子 Agent', status: done ? 'done' : 'running' };
  }
  return null;
}

function activityIcon(kind: AgentActivityKind, running: boolean) {
  if (running) return <Loader2 className="animate-spin" size={14} />;
  if (kind === 'command') return <Code2 size={14} />;
  if (kind === 'edit') return <FilePenLine size={14} />;
  if (kind === 'search') return <Search size={14} />;
  if (kind === 'tool') return <Wrench size={14} />;
  if (kind === 'plan') return <CheckCircle2 size={14} />;
  if (kind === 'collab') return <Users size={14} />;
  if (kind === 'system') return <Zap size={14} />;
  return <Circle size={14} />;
}

function activitySummary(activities: AgentActivity[]): string {
  const editFiles = new Set(
    activities.filter((activity) => activity.kind === 'edit' && activity.detail).map((activity) => activity.detail),
  );
  const counts = activities.reduce(
    (summary, activity) => {
      summary[activity.kind] += 1;
      return summary;
    },
    {
      command: 0,
      edit: 0,
      hook: 0,
      plan: 0,
      reasoning: 0,
      search: 0,
      tool: 0,
      collab: 0,
      system: 0,
    } satisfies Record<AgentActivityKind, number>,
  );
  const parts: string[] = [];
  if (counts.search > 0) parts.push(`搜索 ${counts.search} 次`);
  const editCount = editFiles.size || counts.edit;
  if (editCount > 0) parts.push(`编辑 ${editCount} 个文件`);
  if (counts.command > 0) parts.push(`运行 ${counts.command} 个命令`);
  if (counts.hook > 0) parts.push(`运行 ${counts.hook} 个 Hook`);
  if (counts.tool > 0) parts.push(`调用 ${counts.tool} 个工具`);
  if (counts.plan > 0) parts.push(`更新 ${counts.plan} 次计划`);
  if (counts.collab > 0) parts.push(`${counts.collab} 个子 Agent`);
  if (parts.length > 0) return parts.join('，');
  return `${activities.length} 条活动`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function PlanCard({ items }: { items: AgentPlanItem[] }) {
  return (
    <div className="agent-chat-plan-card">
      {items.map((item) => (
        <div className={clsx('agent-chat-plan-item', item.status)} key={item.id}>
          <span className="agent-chat-plan-check">
            {item.status === 'completed' ? <CheckCircle2 size={14} /> : item.status === 'in_progress' ? <Loader2 className="animate-spin" size={14} /> : <Circle size={14} />}
          </span>
          <span className="agent-chat-plan-text">{item.title}</span>
        </div>
      ))}
    </div>
  );
}

function CommandOutputBlock({ output }: { output: string }) {
  const scrollRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [output]);
  return (
    <pre ref={scrollRef} className="agent-chat-command-output">
      <code>{output}</code>
    </pre>
  );
}

function InlineDiffCard({ patch, filePath }: { patch: string; filePath?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!patch) return null;
  return (
    <div className="agent-chat-inline-diff">
      <button className="agent-chat-inline-diff-header" type="button" onClick={() => setExpanded((v) => !v)}>
        {filePath && <FileIcon filePath={filePath} size={14} />}
        <span>{filePath ?? 'Diff'}</span>
        <ChevronDown size={14} className={clsx(expanded && 'rotated')} />
      </button>
      {expanded && (
        <div className="agent-chat-inline-diff-body">
          <PatchDiff patch={patch} />
        </div>
      )}
    </div>
  );
}

function ToolDetailBlock({ toolArgs, approvedTools }: { toolArgs?: string; approvedTools?: string[] }) {
  if (!toolArgs && !approvedTools) return null;
  return (
    <div className="agent-chat-tool-detail">
      {approvedTools && approvedTools.length > 0 && (
        <div className="agent-chat-tool-approved">
          <ShieldCheck size={13} />
          <span>自动批准: {approvedTools.join(', ')}</span>
        </div>
      )}
      {toolArgs && (
        <pre className="agent-chat-tool-args">
          <code>{toolArgs}</code>
        </pre>
      )}
    </div>
  );
}

function AgentActivityList({ activities, autoCollapse }: { activities: AgentActivity[]; autoCollapse: boolean }) {
  const [expanded, setExpanded] = useState(!autoCollapse);
  const [userToggled, setUserToggled] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const hasRunning = activities.some((activity) => activity.status === 'running');
  const canCollapse = activities.length > 1;
  const collapsed = canCollapse && !expanded;

  useEffect(() => {
    if (!canCollapse) {
      setExpanded(true);
      return;
    }
    if (userToggled) return;
    setExpanded(!(autoCollapse && !hasRunning));
  }, [autoCollapse, canCollapse, hasRunning, userToggled]);

  const toggleItemExpand = (id: string) => {
    setExpandedItems((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (activities.length === 0) return null;
  const visible = expanded ? activities.slice(-18) : [];
  const hiddenCount = Math.max(0, activities.length - visible.length);

  // When collapsed, show a single-line summary button (matching Codex extension's tool-activity summary)
  if (collapsed) {
    return (
      <div className="agent-chat-activity-collapsed">
        <button
          className="agent-chat-activity-toggle"
          type="button"
          aria-expanded={false}
          onClick={() => { setUserToggled(true); setExpanded(true); }}
        >
          {hasRunning ? <Loader2 className="animate-spin" size={13} /> : <TerminalSquare size={13} />}
          <span className="agent-chat-activity-toggle-text">{activitySummary(activities)}</span>
          <ChevronDown size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="agent-chat-activity-list" role="status" aria-label="Agent activity">
      {canCollapse && (
        <button
          className="agent-chat-activity-toggle open"
          type="button"
          aria-expanded={true}
          onClick={() => { setUserToggled(true); setExpanded(false); }}
        >
          {hasRunning ? <Loader2 className="animate-spin" size={13} /> : <TerminalSquare size={13} />}
          <span className="agent-chat-activity-toggle-text">{activitySummary(activities)}</span>
          <ChevronDown size={12} className="rotated" />
        </button>
      )}
      <div className="agent-chat-activity-items">
        {visible.map((activity) => {
          const hasExpandable = Boolean(activity.output || activity.patch || activity.planItems || activity.toolArgs || activity.approvedTools);
          const isItemExpanded = expandedItems.has(activity.id);
          return (
            <div key={activity.id} className="agent-chat-activity-item-group">
              <div
                className={clsx('agent-chat-activity-row', activity.status === 'running' && 'running', hasExpandable && 'expandable')}
                onClick={hasExpandable ? () => toggleItemExpand(activity.id) : undefined}
                role={hasExpandable ? 'button' : undefined}
              >
                <span className="agent-chat-activity-icon">{activityIcon(activity.kind, activity.status === 'running')}</span>
                <span className="agent-chat-activity-title">{activity.title}</span>
                {activity.detail && <span className="agent-chat-activity-detail">{activity.detail}</span>}
                {hasExpandable && <ChevronDown size={11} className={clsx('agent-chat-activity-chevron', isItemExpanded && 'rotated')} />}
              </div>
              {isItemExpanded && activity.planItems && <PlanCard items={activity.planItems} />}
              {isItemExpanded && activity.output && <CommandOutputBlock output={activity.output} />}
              {isItemExpanded && activity.patch && <InlineDiffCard patch={activity.patch} filePath={activity.detail} />}
              {isItemExpanded && (activity.toolArgs || activity.approvedTools) && (
                <ToolDetailBlock toolArgs={activity.toolArgs} approvedTools={activity.approvedTools} />
              )}
            </div>
          );
        })}
      </div>
      {hiddenCount > 0 && <div className="agent-chat-activity-more">还有 {hiddenCount} 条活动</div>}
    </div>
  );
}

// ─── File target resolution ─────────────────────────────────────────────────────

function fileTargetFromHref(href: string, worktreePath: string): { relPath: string; lineNumber?: number } | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  const cleaned = href.split(/[?#]/)[0]?.replace(/^\.\//, '') ?? '';
  if (!cleaned) return null;
  const lineMatch = cleaned.match(/:(\d+)(?::\d+)?$/);
  const lineNumber = lineMatch?.[1] ? Number.parseInt(lineMatch[1], 10) : undefined;
  const pathOnly = lineMatch ? cleaned.slice(0, lineMatch.index) : cleaned;
  const normalizedWorktree = worktreePath.replace(/\/$/, '');
  const relPath = pathOnly.startsWith(`${normalizedWorktree}/`) ? pathOnly.slice(normalizedWorktree.length + 1) : pathOnly;
  if (!relPath || relPath.startsWith('/')) return null;
  return { relPath, lineNumber };
}

function statusKey(file: FileStatus): string {
  return `${file.bucket}:${file.path}:${file.oldPath ?? ''}`;
}

function statusSignature(file: FileStatus): string {
  return [file.status, file.additions ?? 0, file.deletions ?? 0, file.staged ? 'staged' : 'unstaged'].join(':');
}

function changedSinceBaseline(before: FileStatus[], after: FileStatus[]): FileStatus[] {
  const beforeMap = new Map(before.map((file) => [statusKey(file), statusSignature(file)]));
  return after.filter((file) => beforeMap.get(statusKey(file)) !== statusSignature(file));
}

// ─── Token Usage Badge ──────────────────────────────────────────────────────────

function TokenBadge({ usage }: { usage: AgentTokenUsage | undefined }) {
  if (!usage || usage.totalTokens === 0) return null;
  return (
    <div className="agent-chat-token-badge" title={`输入: ${usage.inputTokens}${usage.cachedInputTokens ? ` (缓存: ${usage.cachedInputTokens})` : ''}\n输出: ${usage.outputTokens}${usage.reasoningOutputTokens ? `\n推理: ${usage.reasoningOutputTokens}` : ''}\n合计: ${usage.totalTokens}`}>
      <Zap size={12} />
      <span>{formatTokenCount(usage.totalTokens)}</span>
    </div>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  activities,
  components,
  message,
  plugins,
  streaming,
}: {
  activities?: AgentActivity[];
  components?: StreamdownProps['components'];
  message: AgentTranscriptMessage;
  plugins?: StreamdownPlugins;
  streaming?: boolean;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="agent-chat-system-notice">
        <Zap size={12} />
        <span>{message.text}</span>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="agent-chat-user-turn">
        <p className="agent-chat-user-text">{message.text}</p>
      </div>
    );
  }

  return (
    <div className="agent-chat-assistant-turn">
      {activities && activities.length > 0 && (
        <AgentActivityList activities={activities} autoCollapse={message.text.trim().length > 0} />
      )}
      <div className="agent-chat-agent-body">
        {message.text ? (
          <Streamdown components={components} controls={markdownControls} plugins={plugins}>
            {message.text}
          </Streamdown>
        ) : streaming ? (
          <span className="agent-chat-shimmer">正在思考...</span>
        ) : null}
        {streaming && <span className="agent-chat-caret" />}
      </div>
    </div>
  );
}

// ─── Change Summary Card ────────────────────────────────────────────────────────

function ChangeSummaryCard({
  files,
  onOpenDiff,
  onUndo,
  undoAvailable,
}: {
  files: FileStatus[];
  onOpenDiff: (file: FileStatus) => void;
  onUndo?: () => void;
  undoAvailable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => changeStats(files), [files]);
  const visibleFiles = expanded ? files : files.slice(0, MAX_CHANGE_ROWS);
  const hiddenCount = Math.max(0, files.length - visibleFiles.length);

  if (files.length === 0) return null;

  return (
    <section className="agent-chat-diff-card" aria-label="Completed turn changes">
      <button className="agent-chat-diff-header" type="button" onClick={() => setExpanded((value) => !value)}>
        <div className="agent-chat-diff-icon-box">
          <GitBranch size={20} />
        </div>
        <div className="agent-chat-diff-header-text">
          <span className="agent-chat-diff-title">{files.length} 个文件已更改</span>
          <span className="agent-chat-diff-subtitle">
            <span className="agent-chat-diff-stat-add">+{stats.additions}</span>
            <span className="agent-chat-diff-stat-del">-{stats.deletions}</span>
          </span>
        </div>
        <div className="agent-chat-diff-actions">
          {undoAvailable && onUndo && (
            <button
              className="agent-chat-undo-btn"
              type="button"
              title="撤销本次变更"
              onClick={(e) => { e.stopPropagation(); onUndo(); }}
            >
              <Undo2 size={13} />
            </button>
          )}
          <ChevronDown size={14} className={clsx('agent-chat-diff-chevron', expanded && 'expanded')} />
        </div>
      </button>
      {expanded && (
        <div className="agent-chat-diff-list">
          {visibleFiles.map((file) => (
            <button
              className="agent-chat-diff-row"
              key={`${file.bucket}:${file.path}:${file.oldPath ?? ''}`}
              type="button"
              onClick={() => onOpenDiff(file)}
            >
              <FileIcon filePath={file.path} size={15} />
              <span className="agent-chat-diff-path">{fileLabel(file)}</span>
              <span className="agent-chat-diff-stat-add">+{file.additions ?? 0}</span>
              <span className="agent-chat-diff-stat-del">-{file.deletions ?? 0}</span>
            </button>
          ))}
          {hiddenCount > 0 && <div className="agent-chat-diff-more">还有 {hiddenCount} 个文件</div>}
        </div>
      )}
    </section>
  );
}

// ─── Permission Card ────────────────────────────────────────────────────────────

function permissionSummary(permission: PendingPermission): string {
  const command = permission.toolInput?.command ?? permission.toolInput?.cmd;
  if (typeof command === 'string' && command.trim()) return command.trim();
  const filePath = permission.toolInput?.file_path ?? permission.toolInput?.filePath ?? permission.toolInput?.path;
  if (typeof filePath === 'string' && filePath.trim()) return filePath.trim();
  return permission.toolName || '需要确认';
}

function PermissionCard({
  onAllow,
  onAnswer,
  onDeny,
  permission,
}: {
  onAllow: () => void;
  onAnswer: (answers: Record<string, string>) => void;
  onDeny: () => void;
  permission: PendingPermission;
}) {
  const [answer, setAnswer] = useState('');
  const question = permission.questions?.[0];
  const isQuestion = Boolean(question);
  return (
    <section className="agent-chat-permission-card" data-codex-approval-surface aria-label="Agent approval request">
      <div className="agent-chat-permission-icon">
        <ShieldQuestion size={16} />
      </div>
      <div className="agent-chat-permission-copy">
        <div className="agent-chat-permission-title">{isQuestion ? question?.header || '需要你继续输入' : '需要你确认'}</div>
        <div className="agent-chat-permission-detail">{question?.question ?? permissionSummary(permission)}</div>
        {isQuestion && (
          <input
            className="agent-chat-permission-input"
            value={answer}
            placeholder="输入回复"
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onAnswer({ answer });
              }
            }}
          />
        )}
      </div>
      <div className="agent-chat-permission-actions">
        <button className="agent-chat-permission-deny" type="button" onClick={onDeny} title="Deny">
          <X size={15} />
        </button>
        <button
          className="agent-chat-permission-allow"
          type="button"
          onClick={() => {
            if (isQuestion) onAnswer({ answer });
            else onAllow();
          }}
        >
          {isQuestion ? '提交' : '允许'}
        </button>
      </div>
    </section>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function AgentChatPanel({ tab, workspace, active }: AgentChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [activityMessageId, setActivityMessageId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [completedStatuses, setCompletedStatuses] = useState<FileStatus[] | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeRunRef = useRef<{ runId: string; messageId: string } | null>(null);
  const turnBaselineRef = useRef<FileStatus[]>([]);
  const transcript = useAppStore((state) => state.agentTranscripts[tab.ptyId] ?? EMPTY_TRANSCRIPT);
  const status = useAppStore((state) => state.agentStatuses[tab.ptyId]);
  const exited = useAppStore((state) => state.exitedPtyIds.has(tab.ptyId));
  const tokenUsage = useAppStore((state) => state.agentTokenUsage[tab.ptyId]);
  const appendAgentTranscriptMessage = useAppStore((state) => state.appendAgentTranscriptMessage);
  const updateAgentTranscriptMessage = useAppStore((state) => state.updateAgentTranscriptMessage);
  const touchAgentSessionHistory = useAppStore((state) => state.touchAgentSessionHistory);
  const handleAgentStatusUpdate = useAppStore((state) => state.handleAgentStatusUpdate);
  const updateTerminalSessionId = useAppStore((state) => state.updateTerminalSessionId);
  const updateAgentTokenUsage = useAppStore((state) => state.updateAgentTokenUsage);
  const openFileTab = useAppStore((state) => state.openFileTab);
  const openDiffTab = useAppStore((state) => state.openDiffTab);
  const pendingPermission = useAppStore((state) =>
    state.pendingPermission?.ptyId === tab.ptyId ? state.pendingPermission : null,
  );
  const setPendingPermission = useAppStore((state) => state.setPendingPermission);

  const orderedTranscript = useMemo(() => transcript.slice().sort((a, b) => a.timestamp - b.timestamp), [transcript]);
  const visibleTranscript = useMemo(
    () =>
      orderedTranscript.filter(
        (message) =>
          message.role !== 'assistant' ||
          message.text.trim().length > 0 ||
          (status === 'working' && message.id === activeRunRef.current?.messageId),
      ),
    [orderedTranscript, status],
  );
  const messageCount = visibleTranscript.length;
  const activePtyId = active ? tab.ptyId : null;
  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !exited && status !== 'working';

  // Compute streamdown plugins based on last assistant message
  const lastAssistantText = useMemo(() => {
    for (let i = orderedTranscript.length - 1; i >= 0; i--) {
      if (orderedTranscript[i].role === 'assistant') return orderedTranscript[i].text;
    }
    return '';
  }, [orderedTranscript]);
  const streamdownPlugins = useStreamdownPlugins(lastAssistantText);

  const markdownComponents = useMemo(
    () => ({
      a: ({ href, children, ...props }: { href?: string; children?: ReactNode }) => {
        const rawHref = href ?? '';
        return (
          <a
            {...props}
            href={rawHref}
            onClick={(event) => {
              if (!rawHref || rawHref.startsWith('#')) return;
              event.preventDefault();
              const target = fileTargetFromHref(rawHref, workspace.worktreePath);
              if (target) {
                openFileTab(workspace.id, target.relPath, target.lineNumber);
              } else {
                void window.forgepad.shell.openExternal(rawHref);
              }
            }}
          >
            {children}
          </a>
        );
      },
      inlineCode: ({ children, className, ...props }: { children?: ReactNode; className?: string }) => {
        const text = String(children ?? '').trim();
        // Only convert to clickable file mention when text starts with @ (explicit citation)
        if (!text.startsWith('@')) {
          return <code className={className} {...props}>{children}</code>;
        }
        const target = fileTargetFromHref(text.slice(1), workspace.worktreePath);
        if (!target) return <code className={className} {...props}>{children}</code>;
        return (
          <button
            className="agent-chat-inline-mention"
            type="button"
            onClick={() => openFileTab(workspace.id, target.relPath, target.lineNumber)}
          >
            {target.relPath}
          </button>
        );
      },
    }),
    [openFileTab, workspace.id, workspace.worktreePath],
  );

  const refreshCompletedTurnStatus = useCallback(() => {
    if (!active) return;
    window.forgepad.git
      .getStatus(workspace.worktreePath)
      .then((nextStatuses) => {
        const turnChanges = changedSinceBaseline(turnBaselineRef.current, nextStatuses);
        setCompletedStatuses(turnChanges.length > 0 ? turnChanges : null);
        setStatusError(null);
      })
      .catch((error) => {
        setStatusError(error instanceof Error ? error.message : 'Unable to read git status.');
      });
  }, [active, workspace.worktreePath]);

  useEffect(() => {
    if (!active) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (messageCount === 0) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'auto' });
  }, [active, messageCount]);

  useEffect(() => {
    if (!activePtyId) return;
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }, [activePtyId]);

  useEffect(() => {
    const isCurrentEvent = (event: AgentTurnEvent | null) =>
      Boolean(event?.ptyId === tab.ptyId && event.runId && activeRunRef.current?.runId === event.runId);
    const mergeActivity = (activity: AgentActivity) => {
      setActivities((current) => {
        const now = Date.now();
        const index = current.findIndex((item) => item.id === activity.id);
        if (index === -1) {
          return [
            ...current,
            {
              ...activity,
              startedAt: now,
              completedAt: activity.status === 'done' ? now : undefined,
            },
          ];
        }
        const next = current.slice();
        const existing = next[index];
        next[index] = {
          ...existing,
          ...activity,
          completedAt:
            activity.status === 'done' && existing.status !== 'done' ? now : (existing.completedAt ?? activity.completedAt),
          detail: activity.detail ?? existing.detail,
          startedAt: existing.startedAt ?? activity.startedAt ?? now,
          // Merge accumulated fields
          output: activity.output ?? existing.output,
          patch: activity.patch ?? existing.patch,
          planItems: activity.planItems ?? existing.planItems,
          toolArgs: activity.toolArgs ?? existing.toolArgs,
          approvedTools: activity.approvedTools ?? existing.approvedTools,
        };
        return next;
      });
    };

    const unsubscribers = [
      window.forgepad.agent.onTurnStarted?.((raw) => {
        const event = asTurnEvent(raw);
        if (!isCurrentEvent(event)) return;
        const threadId = event?.data?.threadId;
        if (threadId && !tab.sessionId) updateTerminalSessionId(tab.id, threadId);
      }),
      window.forgepad.agent.onTurnItem?.((raw) => {
        const event = asItemEvent(raw);
        if (!isCurrentEvent(event)) return;
        const method = event?.data?.method ?? '';
        const params = event?.data?.params;
        const done = method.includes('completed') || method.endsWith('/completed');
        const activity = activityFromItem(method, params, done);
        if (activity) mergeActivity(activity);

        // Accumulate command output
        if (method === 'item/commandExecution/outputDelta' || method === 'item/commandExecution/terminalInteraction') {
          const itemId = itemIdFromParams(params);
          const delta = stringAt(params, ['delta']) ?? stringAt(params, ['output']) ?? stringAt(params, ['data']) ?? '';
          if (delta) {
            setActivities((current) => {
              const index = current.findIndex((a) => a.id === itemId);
              if (index === -1) return current;
              const next = current.slice();
              next[index] = { ...next[index], output: (next[index].output ?? '') + delta };
              return next;
            });
          }
        }

        // Accumulate MCP tool call progress
        if (method === 'item/mcpToolCall/progress') {
          const itemId = itemIdFromParams(params);
          const delta = stringAt(params, ['delta']) ?? stringAt(params, ['output']) ?? '';
          if (delta) {
            setActivities((current) => {
              const index = current.findIndex((a) => a.id === itemId);
              if (index === -1) return current;
              const next = current.slice();
              next[index] = { ...next[index], output: (next[index].output ?? '') + delta };
              return next;
            });
          }
        }
      }),
      window.forgepad.agent.onTurnDelta?.((raw) => {
        const event = asTurnEvent(raw);
        if (!isCurrentEvent(event)) return;
        const delta = event?.data?.delta ?? '';
        if (!delta) return;
        const activeRun = activeRunRef.current;
        if (!activeRun) return;
        updateAgentTranscriptMessage(tab.ptyId, activeRun.messageId, (message) => ({
          ...message,
          text: `${message.text}${delta}`,
        }));
      }),
      window.forgepad.agent.onTurnMessage?.((raw) => {
        const event = asTurnEvent(raw);
        if (!isCurrentEvent(event)) return;
        const text = event?.data?.text ?? '';
        const activeRun = activeRunRef.current;
        if (!activeRun || !text) return;
        updateAgentTranscriptMessage(tab.ptyId, activeRun.messageId, (message) => ({
          ...message,
          text,
        }));
      }),
      window.forgepad.agent.onTurnCompleted?.((raw) => {
        const event = asTurnEvent(raw);
        if (!isCurrentEvent(event)) return;
        const activeRun = activeRunRef.current;
        const finalMessage = event?.data?.finalMessage;
        if (activeRun && finalMessage) {
          updateAgentTranscriptMessage(tab.ptyId, activeRun.messageId, (message) => ({
            ...message,
            text: message.text || finalMessage,
          }));
        }
        activeRunRef.current = null;
        setActivities((current) => current.map((activity) => ({ ...activity, status: 'done' })));
        handleAgentStatusUpdate(tab.ptyId, 'review');
        refreshCompletedTurnStatus();
      }),
      window.forgepad.agent.onTurnFailed?.((raw) => {
        const event = asTurnEvent(raw);
        if (!isCurrentEvent(event)) return;
        activeRunRef.current = null;
        setActivities((current) => current.map((activity) => ({ ...activity, status: 'done' })));
        appendAgentTranscriptMessage(tab.ptyId, {
          role: 'system',
          text: event?.data?.message ?? 'Agent turn failed.',
          source: 'cli',
        });
        handleAgentStatusUpdate(tab.ptyId, 'idle');
      }),
      window.forgepad.agent.onTokenUsage?.((raw) => {
        const event = asTurnEvent(raw);
        if (event?.ptyId !== tab.ptyId) return;
        const usage = event?.data?.tokenUsage;
        if (usage) updateAgentTokenUsage(tab.ptyId, usage);
      }),
    ].filter(Boolean);

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe?.();
    };
  }, [
    appendAgentTranscriptMessage,
    handleAgentStatusUpdate,
    refreshCompletedTurnStatus,
    tab.id,
    tab.ptyId,
    tab.sessionId,
    updateAgentTokenUsage,
    updateAgentTranscriptMessage,
    updateTerminalSessionId,
  ]);

  const addFiles = async (files: FileList | File[]) => {
    const next: ComposerAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(reader.error ?? new Error('Unable to read image.'));
          reader.readAsDataURL(file);
        });
        next.push({ id: crypto.randomUUID(), name: file.name || 'image', kind: 'image', dataUrl });
      } else {
        const textContent = await file.text().catch(() => '');
        next.push({ id: crypto.randomUUID(), name: file.name || 'file', kind: 'file', textContent });
      }
    }
    if (next.length > 0) setAttachments((current) => [...current, ...next]);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    let prompt = draft.trim();
    if ((!prompt && attachments.length === 0) || exited || status === 'working') return;
    if (!prompt) prompt = '请根据附件继续。';
    const fileContexts = attachments.filter((attachment) => attachment.kind === 'file' && attachment.textContent);
    if (fileContexts.length > 0) {
      prompt = [
        prompt,
        '',
        '## Attached files',
        ...fileContexts.map((attachment) =>
          [`### ${attachment.name}`, '```', attachment.textContent?.slice(0, 80_000) ?? '', '```'].join('\n'),
        ),
      ].join('\n');
    }

    const visiblePrompt =
      attachments.length > 0
        ? `${draft.trim() || '请根据附件继续。'}\n\n${attachments.map((attachment) => `@${attachment.name}`).join(' ')}`
        : draft.trim();
    appendAgentTranscriptMessage(tab.ptyId, {
      role: 'user',
      text: visiblePrompt,
      source: 'gui',
    });
    touchAgentSessionHistory(tab.ptyId);
    const assistantMessageId = crypto.randomUUID();
    appendAgentTranscriptMessage(tab.ptyId, {
      id: assistantMessageId,
      role: 'assistant',
      text: '',
      source: 'cli',
    });
    const runId = `run-${crypto.randomUUID()}`;
    activeRunRef.current = { runId, messageId: assistantMessageId };
    setActivityMessageId(assistantMessageId);
    setActivities([]);
    setCompletedStatuses(null);
    setDraft('');
    const imageDataUrls = attachments
      .filter((attachment) => attachment.kind === 'image' && attachment.dataUrl)
      .map((attachment) => attachment.dataUrl as string);
    setAttachments([]);
    handleAgentStatusUpdate(tab.ptyId, 'working');

    try {
      turnBaselineRef.current = await window.forgepad.git.getStatus(workspace.worktreePath).catch(() => []);
      const runTurn = window.forgepad.agent.runTurn;
      if (!runTurn) {
        throw new Error('ForgePad host bridge is missing agent.runTurn. Restart the native host after rebuilding.');
      }
      const result = await runTurn({
        runId,
        ptyId: tab.ptyId,
        worktreePath: workspace.worktreePath,
        agentCommand: tab.agentCommand ?? 'codex',
        prompt,
        sessionId: tab.sessionId,
        imageDataUrls,
      });
      activeRunRef.current = { runId: result.runId, messageId: assistantMessageId };
    } catch (error) {
      activeRunRef.current = null;
      appendAgentTranscriptMessage(tab.ptyId, {
        role: 'system',
        text: error instanceof Error ? error.message : 'Agent turn failed.',
        source: 'cli',
      });
      handleAgentStatusUpdate(tab.ptyId, 'idle');
    }
  };

  const stopTurn = () => {
    const activeRun = activeRunRef.current;
    if (!activeRun) return;
    window.forgepad.agent.cancelTurn?.(activeRun.runId).catch(() => {});
    activeRunRef.current = null;
    setActivities((current) => current.map((activity) => ({ ...activity, status: 'done' })));
    appendAgentTranscriptMessage(tab.ptyId, {
      role: 'system',
      text: '已停止当前 turn。',
      source: 'cli',
    });
    handleAgentStatusUpdate(tab.ptyId, 'idle');
  };

  const undoLastTurn = () => {
    const activeRun = activeRunRef.current;
    const runId = activeRun?.runId ?? `run-${tab.ptyId}`;
    window.forgepad.agent.undoTurn?.(runId).then((ok) => {
      if (ok) {
        appendAgentTranscriptMessage(tab.ptyId, { role: 'system', text: '正在撤销上一次变更...', source: 'cli' });
      }
    }).catch(() => {});
  };

  const resolvePermission = (decision: 'allow' | 'deny' | 'answer', answers?: Record<string, string>) => {
    if (!pendingPermission) return;
    window.forgepad.agent.sendPermissionDecision(pendingPermission.ptyId, decision, answers);
    setPendingPermission(null);
    if (decision === 'deny') {
      handleAgentStatusUpdate(tab.ptyId, 'idle');
    } else {
      handleAgentStatusUpdate(tab.ptyId, 'working');
    }
  };

  if (!active) return null;

  return (
    <section className="agent-chat-panel">
      <header className="agent-chat-topbar">
        <div className="agent-chat-title-group">
          <div className="agent-chat-title">{tab.title}</div>
          <div className="agent-chat-subtitle">
            <GitBranch size={13} />
            <span>{workspace.branch}</span>
            <span>·</span>
            <span>{workspace.name}</span>
          </div>
        </div>
        <div className="agent-chat-topbar-right">
          <TokenBadge usage={tokenUsage} />
          <div className={clsx('agent-chat-status', status === 'permission' && 'permission', status === 'working' && 'working')}>
            <StatusIcon status={status} exited={exited} />
            <span>{statusLabel(status, exited)}</span>
          </div>
        </div>
      </header>

      <div ref={scrollerRef} className="agent-chat-scroll scrollbar-thin">
        <div className="agent-chat-thread">
          {visibleTranscript.length === 0 ? (
            <div className="agent-chat-empty">
              <TerminalSquare size={24} />
              <div>开始对话</div>
            </div>
          ) : (
            visibleTranscript.map((message) => (
              <MessageBubble
                activities={message.id === activityMessageId ? activities : undefined}
                key={message.id}
                components={markdownComponents}
                plugins={streamdownPlugins}
                message={message}
                streaming={message.id === activeRunRef.current?.messageId && status === 'working'}
              />
            ))
          )}

          {completedStatuses && (
            <ChangeSummaryCard
              files={completedStatuses}
              onOpenDiff={(file) => openDiffTab(workspace.id, file.path, file.bucket, file.status, file.oldPath)}
              onUndo={undoLastTurn}
              undoAvailable={status !== 'working'}
            />
          )}
          {pendingPermission && (
            <PermissionCard
              permission={pendingPermission}
              onAllow={() => resolvePermission('allow')}
              onAnswer={(answers) => resolvePermission('answer', answers)}
              onDeny={() => resolvePermission('deny')}
            />
          )}
          {statusError && <div className="agent-chat-system-notice">{statusError}</div>}
        </div>
      </div>

      <form className="agent-chat-composer" onSubmit={submit}>
        <div
          className="agent-chat-composer-shell"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files);
          }}
        >
          {attachments.length > 0 && (
            <div className="agent-chat-attachment-tray">
              {attachments.map((attachment) => (
                <div className="agent-chat-attachment-chip" key={attachment.id}>
                  {attachment.kind === 'image' && attachment.dataUrl ? (
                    <img alt="" src={attachment.dataUrl} />
                  ) : (
                    <FileIcon filePath={attachment.name} size={14} />
                  )}
                  <span>{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                    aria-label="Remove attachment"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={composerRef}
            className="agent-chat-input"
            value={draft}
            placeholder="要求后续变更"
            rows={1}
            disabled={exited}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              const files = event.clipboardData.files;
              if (files.length > 0) void addFiles(files);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="agent-chat-composer-bar">
            <div className="agent-chat-left-tools">
              <input
                ref={fileInputRef}
                className="agent-chat-hidden-file-input"
                type="file"
                multiple
                onChange={(event) => {
                  if (event.currentTarget.files) void addFiles(event.currentTarget.files);
                  event.currentTarget.value = '';
                }}
              />
              <button
                className="agent-chat-icon-button"
                type="button"
                title="Add context"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={17} />
              </button>
              <div className="agent-chat-mode-pill">
                <FileText size={13} />
                <span>CLI 下发</span>
              </div>
            </div>
            <div className="agent-chat-right-tools">
              <div className="agent-chat-compact-status">
                <StatusIcon status={status} exited={exited} />
                <span>{statusText(status, exited)}</span>
              </div>
              {status === 'working' ? (
                <button className="agent-chat-stop-button" type="button" title="Stop" onClick={stopTurn}>
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button className="agent-chat-send" type="submit" title="Send" disabled={!canSend}>
                  <ArrowUp size={17} />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
