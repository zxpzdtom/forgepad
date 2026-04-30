/**
 * Returns a self-contained IIFE string to be injected into a WebContentsView via
 * executeJavaScript(). The script:
 *  - Creates a transparent overlay that intercepts all mouse events
 *  - Highlights the underlying element with a blue border on hover
 *  - On click, extracts selector / outerHTML / boundingRect and sends them to
 *    the main process via console.log with a known prefix
 *  - ESC key cancels the selection and removes the overlay
 */
export function getElementSelectionScript(): string {
  // Serialize the inner function as a string and wrap in IIFE
  return `(${selectionIIFE.toString()})();`;
}

function selectionIIFE(): void {
  // Guard against double-injection
  if ((window as unknown as Record<string, unknown>).__forgepadSelectActive__) return;
  (window as unknown as Record<string, unknown>).__forgepadSelectActive__ = true;

  // ── Overlay container (intercepts pointer events) ──────────────────────────
  const overlay = document.createElement('div');
  overlay.id = '__forgepad_select_overlay__';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;pointer-events:auto;background:transparent;';
  document.body.appendChild(overlay);

  // ── Highlight box ──────────────────────────────────────────────────────────
  const highlight = document.createElement('div');
  highlight.style.cssText = [
    'position:fixed',
    'border:2px solid #2563eb',
    'background:rgba(37,99,235,0.08)',
    'pointer-events:none',
    'z-index:2147483647',
    'display:none',
    'box-sizing:border-box',
    'transition:top 40ms,left 40ms,width 40ms,height 40ms',
  ].join(';');
  document.body.appendChild(highlight);

  // ── Tooltip ────────────────────────────────────────────────────────────────
  const tooltip = document.createElement('div');
  tooltip.style.cssText = [
    'position:fixed',
    'background:#1e293b',
    'color:#e2e8f0',
    'font:12px/1.4 monospace',
    'padding:2px 7px',
    'border-radius:3px',
    'pointer-events:none',
    'z-index:2147483647',
    'max-width:320px',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'white-space:nowrap',
    'display:none',
  ].join(';');
  document.body.appendChild(tooltip);

  let currentElement: Element | null = null;

  // ── Utilities ──────────────────────────────────────────────────────────────

  function getElementUnder(x: number, y: number): Element | null {
    overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x, y);
    overlay.style.pointerEvents = 'auto';
    return el;
  }

  function buildSelector(el: Element): string {
    if (el.id) return `#${CSS.escape(el.id)}`;

    const parts: string[] = [];
    let cur: Element | null = el;

    while (cur && cur !== document.body && cur !== document.documentElement) {
      let seg = cur.tagName.toLowerCase();

      if (cur.id) {
        seg = `#${CSS.escape(cur.id)}`;
        parts.unshift(seg);
        break;
      }

      const classes = Array.from(cur.classList)
        .filter((c) => !c.startsWith('__forgepad'))
        .slice(0, 2);
      if (classes.length > 0) {
        seg += classes.map((c) => `.${CSS.escape(c)}`).join('');
      }

      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((s) => s.tagName === cur!.tagName);
        if (siblings.length > 1) {
          seg += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
        }
      }

      parts.unshift(seg);
      cur = cur.parentElement;
    }

    return parts.join(' > ');
  }

  function truncate(s: string, max: number): string {
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  function cleanup(): void {
    overlay.remove();
    highlight.remove();
    tooltip.remove();
    document.removeEventListener('keydown', onKeyDown, true);
    (window as unknown as Record<string, unknown>).__forgepadSelectActive__ = false;
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  overlay.addEventListener('mousemove', (e: MouseEvent) => {
    const el = getElementUnder(e.clientX, e.clientY);
    if (!el || el === overlay || el === highlight || el === tooltip) {
      highlight.style.display = 'none';
      tooltip.style.display = 'none';
      currentElement = null;
      return;
    }

    currentElement = el;
    const rect = el.getBoundingClientRect();

    highlight.style.display = 'block';
    highlight.style.left = `${rect.x}px`;
    highlight.style.top = `${rect.y}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;

    const tag = el.tagName.toLowerCase();
    const cls =
      el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    tooltip.textContent = truncate(`${tag}${cls}`, 60);
    tooltip.style.display = 'block';
    const tooltipY = rect.top > 30 ? rect.top - 26 : rect.bottom + 4;
    tooltip.style.left = `${Math.max(4, rect.x)}px`;
    tooltip.style.top = `${tooltipY}px`;
  });

  overlay.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (!currentElement) return;

    const rect = currentElement.getBoundingClientRect();

    const data = {
      selector: buildSelector(currentElement),
      tagName: currentElement.tagName,
      outerHTML: truncate(currentElement.outerHTML, 500),
      boundingRect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      pageUrl: window.location.href,
      pageTitle: document.title,
    };

    // Communicate to main process via console protocol
    console.log(`__FORGEPAD_SELECT__:${JSON.stringify(data)}`);

    cleanup();
  });

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      cleanup();
    }
  }
  document.addEventListener('keydown', onKeyDown, true);
}
