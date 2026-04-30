# ForgePad 实现方案：Console 脚本执行 + URL 历史记录

---

## 前置修复：Tab 类型补全

当前 `src/shared/types.ts` 的 `Tab` 联合类型**缺少 `browser` 变体**。代码中已大量使用 `tab.type === 'browser'`，但类型定义中没有对应的分支。需要先补全。

---

## 一、数据模型（新增的类型/接口）

### 1.1 ConsoleEntry 扩展（`src/renderer/src/components/console-utils.ts`）

```ts
// 在现有 ConsoleEntry 类型中新增 source 字段，区分"页面日志"和"用户输入/结果"
export type ConsoleEntry = {
  id: number;
  level: 'log' | 'warn' | 'error' | 'debug';
  args: ConsoleArg[];
  timestamp: number;
  /** 标识此条目的来源 */
  source?: 'page' | 'user-input' | 'user-result' | 'user-error';
};
```

**设计理由**：
- `source: 'page'` — 默认值（省略时即为 page），兼容已有逻辑
- `source: 'user-input'` — 用户输入的命令，显示带 `>` 前缀
- `source: 'user-result'` — 执行返回值，显示带 `<` 前缀
- `source: 'user-error'` — 执行抛出的错误

### 1.2 URL 历史记录类型（`src/shared/types.ts`）

```ts
/** 浏览器 URL 历史记录条目 */
export type BrowserHistoryEntry = {
  /** URL */
  url: string;
  /** 页面标题 */
  title: string;
  /** 最后访问时间 */
  lastVisitedAt: number;
  /** 访问次数（用于排序权重） */
  visitCount: number;
};
```

### 1.3 Tab 类型补全（`src/shared/types.ts`）

在 `Tab` 联合类型中添加 `browser` 变体：

```ts
export type Tab =
  | { /* terminal - 现有 */ }
  | { /* file - 现有 */ }
  | { /* diff - 现有 */ }
  | { /* context-preview - 现有 */ }
  | {
      id: string;
      workspaceId: string;
      type: 'browser';
      url: string;
      title: string;
      isLoading: boolean;
      canGoBack: boolean;
      canGoForward: boolean;
    };
```

### 1.4 PersistedAppState 扩展（`src/shared/types.ts`）

```ts
export type PersistedAppState = {
  // ... 现有字段 ...
  /** 浏览器 URL 访问历史 */
  browserHistory?: BrowserHistoryEntry[];
};
```

---

## 二、Store 变更（`src/renderer/src/store/app-store.ts`）

### 2.1 新增 State 字段

```ts
type AppState = {
  // ... 现有字段 ...

  /** 全局浏览器 URL 历史记录（所有 workspace 共享） */
  browserHistory: BrowserHistoryEntry[];
};
```

### 2.2 新增 Actions

```ts
type AppState = {
  // ... 现有 actions ...

  /** 添加/更新一条 URL 历史记录 */
  addBrowserHistoryEntry: (url: string, title: string) => void;

  /** 清空全部历史记录 */
  clearBrowserHistory: () => void;
};
```

### 2.3 Action 实现细节

#### `addBrowserHistoryEntry`

```ts
addBrowserHistoryEntry: (url, title) => {
  // 过滤 about:blank 等内部 URL
  if (!url || url === 'about:blank' || url.startsWith('devtools://')) return;

  set((state) => {
    const existing = state.browserHistory.findIndex((h) => h.url === url);
    if (existing !== -1) {
      // 更新已有记录
      const updated = [...state.browserHistory];
      updated[existing] = {
        ...updated[existing],
        title: title || updated[existing].title,
        lastVisitedAt: Date.now(),
        visitCount: updated[existing].visitCount + 1,
      };
      return { browserHistory: updated };
    }
    // 添加新记录，限制最多 500 条
    const entry: BrowserHistoryEntry = {
      url,
      title: title || url,
      lastVisitedAt: Date.now(),
      visitCount: 1,
    };
    const next = [entry, ...state.browserHistory];
    if (next.length > 500) next.length = 500;
    return { browserHistory: next };
  });
},
```

#### `clearBrowserHistory`

```ts
clearBrowserHistory: () => set({ browserHistory: [] }),
```

### 2.4 持久化修改

**`serializeForSave`** 函数中加入：

```ts
function serializeForSave(state: AppState): PersistedAppState {
  return {
    // ... 现有字段 ...
    browserHistory: state.browserHistory,
  };
}
```

**`hydrate`** 函数中恢复：

```ts
hydrate: (state) => {
  // ... 现有逻辑 ...
  const browserHistory = state?.browserHistory ?? [];
  set({
    // ... 现有字段 ...
    browserHistory,
  });
},
```

### 2.5 `updateBrowserNavState` 修改

在现有的 `updateBrowserNavState` 中，当导航完成（`isLoading: false`）时自动添加历史记录：

```ts
updateBrowserNavState: (navState) => {
  set((state) => ({
    tabs: state.tabs.map((tab) =>
      tab.id === navState.tabId && tab.type === 'browser'
        ? { /* 现有更新逻辑 */ }
        : tab,
    ),
  }));

  // 导航完成时记录历史
  if (!navState.isLoading && navState.url && navState.url !== 'about:blank') {
    get().addBrowserHistoryEntry(navState.url, navState.title);
  }
},
```

---

## 三、组件变更

### 3.1 功能一：Console 脚本执行

#### 3.1.1 新增子组件：`ConsoleInput`（写在 `BrowserConsolePanel.tsx` 内部）

**建议**：直接写在 `BrowserConsolePanel.tsx` 内部，因为它与 panel 紧耦合。

```tsx
// ── Console 命令输入框 ──

type ConsoleInputProps = {
  onExecute: (script: string) => void;
};

function ConsoleInput({ onExecute }: ConsoleInputProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);      // 命令历史
  const [historyIndex, setHistoryIndex] = useState(-1);       // -1 = 当前输入
  const [savedInput, setSavedInput] = useState('');            // 暂存当前输入
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const script = input.trim();
      if (!script) return;

      // 添加到历史（去重，最新在前）
      setHistory((prev) => {
        const filtered = prev.filter((h) => h !== script);
        return [script, ...filtered].slice(0, 100);  // 最多 100 条
      });
      setHistoryIndex(-1);
      setSavedInput('');
      setInput('');
      onExecute(script);
    }

    // 上箭头：翻看历史
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) return;
      if (historyIndex === -1) setSavedInput(input);  // 首次上翻时保存当前输入
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
    }

    // 下箭头：翻回
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setInput(savedInput);
        return;
      }
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
    }
  };

  return (
    <div className="flex h-8 shrink-0 items-center border-border border-t bg-panel px-2 gap-1.5">
      {/* 提示符 > */}
      <span className="text-accent font-mono text-[12px] font-bold select-none">›</span>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setHistoryIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Execute JavaScript..."
        spellCheck={false}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-text
                   placeholder:text-subtle focus:outline-none"
      />
    </div>
  );
}
```

#### 3.1.2 修改 `BrowserConsolePanel` 的 Props

```tsx
type Props = {
  entries: ConsoleEntry[];
  onClear: () => void;
  onSendToAgent: (entries: ConsoleEntry[]) => void;
  /** 新增：执行脚本的回调 */
  onExecuteScript: (script: string) => void;
};
```

在 `BrowserConsolePanel` 组件的 JSX 中，在 log entries 滚动区域**下方**添加 `<ConsoleInput>`：

```tsx
return (
  <section className="flex size-full min-h-0 flex-col bg-panel">
    {/* Toolbar（现有） */}
    <div className="surface-toolbar ..."> ... </div>

    {/* Log entries（现有） */}
    <div ref={listRef} className="min-h-0 flex-1 overflow-auto scrollbar-thin">
      {/* ... 现有渲染逻辑 ... */}
    </div>

    {/* 新增：命令输入框 */}
    <ConsoleInput onExecute={onExecuteScript} />
  </section>
);
```

#### 3.1.3 修改 log entry 渲染

在 `filteredEntries.map(...)` 中，根据 `entry.source` 增加视觉区分：

- `source === 'user-input'`：左边显示蓝色 `>` 符号代替 Level badge，文字颜色用 accent
- `source === 'user-result'`：左边显示灰色 `<` 符号，文字正常
- `source === 'user-error'`：左边显示红色 `<` 符号，和 error 级别样式一致

```tsx
// 在渲染 entry 时
const isUserInput = entry.source === 'user-input';
const isUserResult = entry.source === 'user-result';
const isUserError = entry.source === 'user-error';

// Level badge 区域替换为条件渲染：
{isUserInput ? (
  <span className="inline-flex w-[28px] shrink-0 justify-center font-mono text-[12px] font-bold text-accent">›</span>
) : isUserResult || isUserError ? (
  <span className={`inline-flex w-[28px] shrink-0 justify-center font-mono text-[12px] ${isUserError ? 'text-danger' : 'text-subtle'}`}>‹</span>
) : (
  <LevelBadge level={entry.level} />
)}
```

#### 3.1.4 修改 `BrowserTab.tsx` — 添加脚本执行逻辑

在 `BrowserTab` 组件中新增 `handleExecuteScript`：

```tsx
const handleExecuteScript = useCallback(
  async (script: string) => {
    const wv = webviewRef.current;
    if (!wv || !domReadyRef.current) {
      addToast('error', 'Webview not ready');
      return;
    }

    // 1. 记录用户输入到 console entries
    const inputEntry: ConsoleEntry = {
      id: ++consoleIdRef.current,
      level: 'log',
      args: [{ type: 'string', value: script }],
      timestamp: Date.now(),
      source: 'user-input',
    };
    setConsoleEntries((prev) => [...prev, inputEntry]);

    // 2. 执行脚本
    try {
      const result = await wv.executeJavaScript(script);

      // 3. 序列化结果并添加到 entries
      const resultEntry: ConsoleEntry = {
        id: ++consoleIdRef.current,
        level: 'log',
        args: [serializeExecutionResult(result)],
        timestamp: Date.now(),
        source: 'user-result',
      };
      setConsoleEntries((prev) => [...prev, resultEntry]);
    } catch (err) {
      // 4. 错误也添加到 entries
      const errorEntry: ConsoleEntry = {
        id: ++consoleIdRef.current,
        level: 'error',
        args: [{ type: 'string', value: err instanceof Error ? err.message : String(err) }],
        timestamp: Date.now(),
        source: 'user-error',
      };
      setConsoleEntries((prev) => [...prev, errorEntry]);
    }
  },
  [addToast],
);
```

**序列化辅助函数**（放在 `console-utils.ts`）：

```ts
/** 将 executeJavaScript 的返回值转为 ConsoleArg */
export function serializeExecutionResult(value: unknown): ConsoleArg {
  if (value === null) return { type: 'object', subtype: 'null' };
  if (value === undefined) return { type: 'undefined' };

  const t = typeof value;

  if (t === 'string') return { type: 'string', value };
  if (t === 'number') return { type: 'number', value };
  if (t === 'boolean') return { type: 'boolean', value };
  if (t === 'bigint') return { type: 'bigint', description: `${value}n` };
  if (t === 'symbol') return { type: 'symbol', description: String(value) };
  if (t === 'function') return { type: 'function', description: String(value) };

  // Object / Array
  if (Array.isArray(value)) {
    return {
      type: 'object',
      subtype: 'array',
      description: `Array(${value.length})`,
      className: 'Array',
      preview: {
        type: 'object',
        subtype: 'array',
        description: `Array(${value.length})`,
        properties: value.slice(0, 10).map((item, i) => ({
          name: String(i),
          type: typeof item,
          value: String(item)?.slice(0, 100),
        })),
      },
    };
  }

  if (value instanceof Error) {
    return { type: 'object', subtype: 'error', description: value.stack || value.message };
  }

  if (value instanceof Date) {
    return { type: 'object', subtype: 'date', description: value.toString() };
  }

  if (value instanceof RegExp) {
    return { type: 'object', subtype: 'regexp', description: value.toString() };
  }

  // Plain object
  try {
    const keys = Object.keys(value as Record<string, unknown>);
    return {
      type: 'object',
      className: (value as object).constructor?.name || 'Object',
      preview: {
        type: 'object',
        description: 'Object',
        properties: keys.slice(0, 10).map((key) => ({
          name: key,
          type: typeof (value as Record<string, unknown>)[key],
          value: String((value as Record<string, unknown>)[key])?.slice(0, 100),
        })),
      },
    };
  } catch {
    return { type: 'object', description: String(value) };
  }
}
```

#### 3.1.5 修改 `BrowserConsolePanel` 的调用处（`BrowserTab.tsx`）

```tsx
<BrowserConsolePanel
  entries={consoleEntries}
  onClear={handleConsoleClear}
  onSendToAgent={handleSendToAgent}
  onExecuteScript={handleExecuteScript}  // 新增
/>
```

---

### 3.2 功能二：URL 地址栏历史记录 + 模糊匹配下拉

#### 3.2.1 新增组件：`UrlBar`（`src/renderer/src/components/UrlBar.tsx`）

**设计核心**：
- 基于 `<input>` + 绝对定位的下拉面板
- 输入时实时模糊搜索历史
- 点击下拉箭头展示全部历史
- 键盘支持：上下选择、Enter 导航、Escape 关闭

```tsx
// src/renderer/src/components/UrlBar.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/app-store';
import type { BrowserHistoryEntry } from '@shared/types';

type UrlBarProps = {
  value: string;
  onChange: (value: string) => void;
  onNavigate: (url: string) => void;
};

/** 简单模糊匹配：query 中的每个字符按顺序出现在 text 中 */
function fuzzyMatch(query: string, text: string): boolean {
  const lq = query.toLowerCase();
  const lt = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < lt.length && qi < lq.length; ti++) {
    if (lt[ti] === lq[qi]) qi++;
  }
  return qi === lq.length;
}

/** 按相关性排序：访问次数 × 时间衰减 */
function scoreEntry(entry: BrowserHistoryEntry, query: string): number {
  const lq = query.toLowerCase();
  const urlMatch = entry.url.toLowerCase().includes(lq);
  const titleMatch = entry.title.toLowerCase().includes(lq);
  const exactBonus = urlMatch ? 10 : titleMatch ? 5 : 0;
  const recency = Math.max(0, 1 - (Date.now() - entry.lastVisitedAt) / (30 * 24 * 60 * 60 * 1000));
  return entry.visitCount * 0.3 + recency * 5 + exactBonus;
}

function getHost(url: string): string {
  try { return new URL(url).hostname; }
  catch { return ''; }
}

export function UrlBar({ value, onChange, onNavigate }: UrlBarProps) {
  const browserHistory = useAppStore((s) => s.browserHistory);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const query = value.trim();
    if (!query) {
      return [...browserHistory]
        .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
        .slice(0, 20);
    }
    return browserHistory
      .filter((h) => fuzzyMatch(query, h.url) || fuzzyMatch(query, h.title))
      .sort((a, b) => scoreEntry(b, query) - scoreEntry(a, query))
      .slice(0, 20);
  }, [value, browserHistory]);

  useEffect(() => {
    if (selectedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-suggestion]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) &&
          !inputRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback((url: string) => {
    onChange(url);
    setOpen(false);
    onNavigate(url);
  }, [onChange, onNavigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        e.preventDefault();
        setOpen(true);
        setSelectedIndex(0);
      }
      return; // 让 form 的 onSubmit 处理 Enter
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault(); // 阻止 form submit
      handleSelect(suggestions[selectedIndex].url);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setSelectedIndex(-1);
    }
  }, [open, suggestions, selectedIndex, handleSelect]);

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={(e) => {
            e.currentTarget.select();
            if (browserHistory.length > 0) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL..."
          className="h-7 w-full rounded border border-border bg-panel-2 px-2.5 pr-7
                     text-text text-xs transition-colors placeholder:text-subtle
                     focus:border-accent focus:outline-none focus:ring-accent/30 focus:ring-1"
        />
        {browserHistory.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => { setOpen((v) => !v); inputRef.current?.focus(); }}
            className="absolute right-1 flex size-5 items-center justify-center
                       rounded text-subtle hover:text-muted transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[320px] overflow-auto
                     rounded-md border border-border bg-panel shadow-lg scrollbar-thin"
        >
          {suggestions.map((entry, i) => {
            const host = getHost(entry.url);
            const isSelected = i === selectedIndex;
            return (
              <div
                key={entry.url}
                data-suggestion
                onClick={() => handleSelect(entry.url)}
                className={[
                  'flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs transition-colors',
                  isSelected ? 'bg-accent/10 text-text' : 'hover:bg-white/[0.04] text-muted',
                ].join(' ')}
              >
                <img
                  src={`https://www.google.com/s2/favicons?sz=16&domain=${host}`}
                  alt="" width={14} height={14}
                  className="shrink-0 rounded-sm"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-text text-[12px]">{entry.title}</div>
                  <div className="truncate text-[11px] text-subtle">{entry.url}</div>
                </div>
                {entry.visitCount > 1 && (
                  <span className="shrink-0 text-[10px] text-subtle">{entry.visitCount}×</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

#### 3.2.2 修改 `BrowserTab.tsx` — 替换现有 URL 输入框

**之前**（第 646-655 行）：

```tsx
<form onSubmit={handleNavigate} className="min-w-0 flex-1">
  <input type="text" value={urlInput} onChange={...} ... />
</form>
```

**之后**：

```tsx
<form onSubmit={handleNavigate} className="min-w-0 flex-1">
  <UrlBar
    value={urlInput}
    onChange={setUrlInput}
    onNavigate={(url) => {
      const normalized = normalizeUrl(url);
      setLoadError(null);
      webviewRef.current?.loadURL(normalized);
    }}
  />
</form>
```

**注意**：`UrlBar` 内部的 input 不再是 form 的直接子元素，但 `handleNavigate` 仍然由 form 的 `onSubmit` 触发（用户按 Enter 且未选中下拉项时）。对于选中下拉项的 Enter，`UrlBar` 内部会 `e.preventDefault()` 阻止 form 提交，直接调用 `onNavigate`。

---

## 四、IPC 变更

**不需要新增 IPC 通道。**

理由：
1. Console 脚本执行使用 webview 的 `executeJavaScript()` API，这是渲染进程 webview tag 的内置方法，不需要 IPC。
2. URL 历史记录存储在 Zustand store 中，通过现有的 `state:save`/`state:load` 机制持久化，不需要新的 IPC。

---

## 五、具体的文件修改清单

### 文件 1：`src/shared/types.ts`

| 改动 | 描述 |
|------|------|
| 新增 `BrowserHistoryEntry` 类型 | URL 历史记录条目 |
| `Tab` 联合类型新增 `browser` 变体 | 补全缺失的类型定义 |
| `PersistedAppState` 新增 `browserHistory?` 字段 | 持久化历史记录 |

### 文件 2：`src/renderer/src/components/console-utils.ts`

| 改动 | 描述 |
|------|------|
| `ConsoleEntry` 新增 `source?` 字段 | 区分页面日志和用户输入/结果 |
| 新增 `serializeExecutionResult()` 函数 | 将 `executeJavaScript` 返回值转为 `ConsoleArg` |

### 文件 3：`src/renderer/src/components/BrowserConsolePanel.tsx`

| 改动 | 描述 |
|------|------|
| `Props` 类型新增 `onExecuteScript` | 执行脚本回调 |
| 新增 `ConsoleInput` 组件 | 命令输入框（含历史翻看） |
| 修改 entry 渲染逻辑 | 为 user-input/result/error 条目增加视觉区分（`›`/`‹` 前缀） |
| 在 JSX 底部添加 `<ConsoleInput>` | 输入框置于日志列表下方 |

### 文件 4：`src/renderer/src/components/BrowserTab.tsx`

| 改动 | 描述 |
|------|------|
| 新增 `handleExecuteScript` 回调 | 调用 `webview.executeJavaScript()` 并将结果写入 entries |
| 修改 `<BrowserConsolePanel>` 调用 | 传入 `onExecuteScript` prop |
| 引入 `UrlBar` 组件 | 替换现有的 `<input>` URL 输入框 |
| 删除内联 URL input | 被 `UrlBar` 组件替代 |

### 文件 5（新增）：`src/renderer/src/components/UrlBar.tsx`

| 改动 | 描述 |
|------|------|
| 整个文件为新增 | URL 地址栏组件，含模糊搜索下拉、favicon、键盘导航 |

### 文件 6：`src/renderer/src/store/app-store.ts`

| 改动 | 描述 |
|------|------|
| `AppState` 新增 `browserHistory` 字段 | 初始值 `[]` |
| 新增 `addBrowserHistoryEntry` action | 添加/更新历史记录 |
| 新增 `clearBrowserHistory` action | 清空历史 |
| 修改 `serializeForSave` | 序列化 `browserHistory` |
| 修改 `hydrate` | 恢复 `browserHistory` |
| 修改 `updateBrowserNavState` | 导航完成时自动记录历史 |

---

## 六、实现顺序建议

### Phase 1：类型基础（~15 分钟）

1. **`src/shared/types.ts`** — 添加 `BrowserHistoryEntry` 类型、补全 `Tab` 的 `browser` 变体、扩展 `PersistedAppState`
2. **`src/renderer/src/components/console-utils.ts`** — 扩展 `ConsoleEntry` 类型（加 `source`）、添加 `serializeExecutionResult`

### Phase 2：功能一 — Console 脚本执行（~30 分钟）

3. **`src/renderer/src/components/BrowserConsolePanel.tsx`**
   - 扩展 `Props`
   - 新增 `ConsoleInput` 组件
   - 修改 entry 渲染以区分 user entries
4. **`src/renderer/src/components/BrowserTab.tsx`**
   - 新增 `handleExecuteScript`
   - 传递新 prop 给 `BrowserConsolePanel`

### Phase 3：功能二 — URL 历史记录（~45 分钟）

5. **`src/renderer/src/store/app-store.ts`**
   - 新增 `browserHistory` state + actions
   - 修改 `serializeForSave`、`hydrate`
   - 修改 `updateBrowserNavState` 自动记录
6. **`src/renderer/src/components/UrlBar.tsx`** — 新建完整组件
7. **`src/renderer/src/components/BrowserTab.tsx`**
   - 引入 `UrlBar`
   - 替换现有 URL 输入框

### Phase 4：测试验证（~15 分钟）

8. 启动应用测试：
   - Console 输入 `1+1` → 显示 `2`
   - Console 输入 `document.title` → 显示标题
   - Console 输入 `throw new Error('test')` → 显示红色错误
   - 上下箭头翻看命令历史
   - 浏览几个网页后检查 URL 下拉是否显示历史
   - 输入部分 URL 检查模糊搜索
   - 关闭并重新打开应用，检查历史是否持久化
   - 点击下拉箭头查看全部历史

---

## 七、边界情况处理

### Console 脚本执行

| 场景 | 处理方式 |
|------|---------|
| webview 未加载（`about:blank`） | `executeJavaScript` 仍可执行（全局作用域） |
| 脚本返回 Promise | `executeJavaScript` 自动 await，结果显示 resolved value |
| 脚本返回 DOM 元素 | 序列化时 fallback 为 `String(value)`，显示 `[object HTMLElement]` |
| 脚本抛出 SyntaxError | catch 捕获，显示为 user-error |
| 导航导致 entries 清空 | 现有 `handleDidStartLoading` 已清空 entries，命令历史保留在 `ConsoleInput` state 中 |

### URL 历史记录

| 场景 | 处理方式 |
|------|---------|
| 同一 URL 多次访问 | 更新 `visitCount` 和 `lastVisitedAt`，不重复添加 |
| 历史超过 500 条 | 超出部分裁剪（FIFO） |
| `about:blank`/`devtools://` | 不记录 |
| favicon 加载失败 | `onError` 隐藏 img，不影响布局 |
| 下拉面板与 form submit 冲突 | 选中下拉项时 `e.preventDefault()` 阻止 form 提交 |

---

## 八、架构决策总结

| 决策 | 选择 | 理由 |
|------|------|------|
| Console 输入历史存储位置 | `ConsoleInput` 的 React state | 命令历史不需要跨 session 持久化，简单直接 |
| URL 历史存储位置 | Zustand store + PersistedAppState | 需要跨 session 持久化，复用现有 save/load 机制 |
| 模糊搜索实现 | 自建简单 fuzzy match | 不引入新包（fuse.js 未安装），历史最多 500 条，简单匹配足够 |
| favicon 方案 | Google favicon API | 简单可靠，无需 IPC 或主进程介入 |
| ConsoleInput 位置 | BrowserConsolePanel 内部 | 紧耦合，不值得单独文件 |
| UrlBar 位置 | 独立文件 | 逻辑复杂度足够独立，且可能被复用 |
| 是否需要新 IPC | 不需要 | executeJavaScript 是 webview API；历史复用现有持久化 |
