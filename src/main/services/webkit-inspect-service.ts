/**
 * WebKit Inspector Service
 *
 * Uses `inspect-webkit` (bundled with serve-sim) to provide a CDP bridge
 * for inspecting Safari / WKWebView content running in iOS Simulators.
 *
 * Architecture:
 *   1. Activate webinspectord (socket-activated by launchd)
 *   2. Start a CDP server via inspect-webkit
 *   3. Connect to individual targets via WebSocket (CDP JSON-RPC)
 *   4. Expose DOM inspection methods (getDocument, highlight, getNodeInfo)
 */

import { execFileSync } from 'node:child_process';
import * as net from 'node:net';
import type { DOMNode, InspectTarget, NodeInfo } from '@shared/types';

// ── Types ─────────────────────────────────────────────────────────────────

type CdpServer = {
  stop(): void;
  getTargets(): CdpTargetEntry[];
};

type CdpTargetEntry = {
  targetId: string;
  appName: string;
  bundleId?: string;
  title: string;
  url: string;
  type: string;
  source?: { kind: string; id: string };
};

/** A live CDP WebSocket session to a single target. */
type CdpSession = {
  ws: WebSocket;
  nextId: number;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
};

// ── Service ───────────────────────────────────────────────────────────────

class WebKitInspectServiceImpl {
  private cdpServer: CdpServer | null = null;
  private cdpPort = 9222;
  private sessions = new Map<string, CdpSession>();

  // ── Socket Activation ──────────────────────────────────────────────────

  /**
   * macOS launches webinspectord on-demand via launchd socket activation.
   * inspect-webkit's lsof parser only sees the process when it's already running.
   * We poke the sockets to force launchd to start webinspectord, keep them alive
   * briefly, then release.
   */
  private async activateWebInspectord(): Promise<void> {
    let socketPaths: string[];
    try {
      const out = execFileSync('find', ['/private/tmp', '-name', 'com.apple.webinspectord_sim.socket', '-type', 's'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      socketPaths = out.trim().split('\n').filter(Boolean);
    } catch {
      console.log('[webkit-inspect] No webinspectord sockets found');
      return;
    }

    console.log('[webkit-inspect] Found webinspectord sockets:', socketPaths);
    if (socketPaths.length === 0) return;

    // Connect to each socket to trigger activation, keep alive briefly
    const keepAlive: net.Socket[] = [];
    await Promise.all(
      socketPaths.map(
        (path) =>
          new Promise<void>((resolve) => {
            const s = net.createConnection({ path });
            s.on('connect', () => {
              keepAlive.push(s);
              resolve();
            });
            s.on('error', () => resolve());
            setTimeout(resolve, 2000);
          }),
      ),
    );

    // Give webinspectord a moment to initialize
    await new Promise((r) => setTimeout(r, 500));

    // Release after a delay (CDP server should have lsof'd by then)
    setTimeout(() => {
      for (const s of keepAlive) s.destroy();
    }, 3000);
  }

  // ── CDP Bridge Lifecycle ───────────────────────────────────────────────

  /** Start the CDP bridge (lazy singleton). */
  async startBridge(): Promise<{ port: number }> {
    if (this.cdpServer) {
      return { port: this.cdpPort };
    }

    // Activate webinspectord before inspect-webkit tries to find it
    await this.activateWebInspectord();

    // Dynamically import inspect-webkit (it's an ESM module)
    const { startCdpServer } = await import('inspect-webkit');

    // Find a free port starting from 9222
    for (let port = 9222; port < 9272; port++) {
      try {
        const server = await (startCdpServer as (opts: { port: number; host?: string }) => Promise<CdpServer>)({
          port,
          host: 'localhost',
        });
        this.cdpServer = server;
        this.cdpPort = port;
        console.log('[webkit-inspect] CDP bridge started on port', port);
        return { port };
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('EADDRINUSE')) continue;
        throw err;
      }
    }

    throw new Error('Could not find a free port for CDP bridge (9222-9271)');
  }

  /** List inspectable targets, optionally filtered by simulator UDID.
   *  Retries a few times because target discovery can take a moment after bridge startup. */
  async listTargets(udid?: string): Promise<InspectTarget[]> {
    if (!this.cdpServer) {
      await this.startBridge();
    }

    // Retry up to 5 times with increasing delays — targets may not appear immediately
    let entries: CdpTargetEntry[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      entries = this.cdpServer!.getTargets();
      console.log(`[webkit-inspect] getTargets() attempt ${attempt + 1}: ${entries.length} entries`);
      if (entries.length > 0) break;
      // Wait before retrying: 500ms, 1000ms, 1500ms, 2000ms
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }

    for (const e of entries) {
      console.log('[webkit-inspect]  target:', {
        targetId: e.targetId,
        appName: e.appName,
        title: e.title,
        url: e.url,
        sourceKind: e.source?.kind,
        sourceId: e.source?.id,
      });
    }

    return entries
      .filter((e) => {
        // If no UDID filter, include all targets
        if (!udid) return true;
        // If target has simulator source info, match by UDID
        if (e.source?.kind === 'simulator' && e.source.id) {
          return e.source.id.includes(udid) || udid.includes(e.source.id);
        }
        // Include targets without source info (they might still be from this simulator)
        return true;
      })
      .map((e) => ({
        id: e.targetId,
        title: e.title || e.appName || 'Untitled',
        url: /^https?:/i.test(e.url) ? e.url : 'about:blank',
        appName: e.appName || 'Unknown',
        bundleId: e.bundleId,
      }));
  }

  // ── CDP Session Management ─────────────────────────────────────────────

  /** Get or create a CDP WebSocket session to a target. */
  private async getSession(targetId: string): Promise<CdpSession> {
    const existing = this.sessions.get(targetId);
    if (existing && existing.ws.readyState === 1 /* OPEN */) {
      return existing;
    }

    // Clean up dead session
    if (existing) {
      existing.ws.close();
      this.sessions.delete(targetId);
    }

    const wsUrl = `ws://localhost:${this.cdpPort}/devtools/page/${encodeURIComponent(targetId)}`;

    return new Promise<CdpSession>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const session: CdpSession = {
        ws,
        nextId: 1,
        pending: new Map(),
      };

      ws.addEventListener('open', () => {
        this.sessions.set(targetId, session);
        resolve(session);
      });

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
          if (msg.id != null) {
            const handler = session.pending.get(msg.id);
            if (handler) {
              session.pending.delete(msg.id);
              if (msg.error) {
                handler.reject(new Error(msg.error.message));
              } else {
                handler.resolve(msg.result);
              }
            }
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.addEventListener('error', () => {
        reject(new Error('CDP WebSocket error'));
        for (const [, handler] of session.pending) {
          handler.reject(new Error('WebSocket error'));
        }
        session.pending.clear();
      });

      ws.addEventListener('close', () => {
        this.sessions.delete(targetId);
        for (const [, handler] of session.pending) {
          handler.reject(new Error('WebSocket closed'));
        }
        session.pending.clear();
      });

      setTimeout(() => reject(new Error('CDP WebSocket connect timeout')), 5000);
    });
  }

  /** Send a CDP command and wait for the response. */
  private async cdpSend(targetId: string, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const session = await this.getSession(targetId);
    const id = session.nextId++;

    return new Promise((resolve, reject) => {
      session.pending.set(id, { resolve, reject });
      session.ws.send(JSON.stringify({ id, method, params: params ?? {} }));
      setTimeout(() => {
        if (session.pending.has(id)) {
          session.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 10_000);
    });
  }

  // ── DOM Inspection ─────────────────────────────────────────────────────

  /** Enable required CDP domains for a target. */
  private async enableDomains(targetId: string): Promise<void> {
    await Promise.all([
      this.cdpSend(targetId, 'DOM.enable'),
      this.cdpSend(targetId, 'CSS.enable'),
      this.cdpSend(targetId, 'Overlay.enable'),
    ]);
  }

  /** Get the DOM document tree for a target. */
  async getDocument(targetId: string): Promise<DOMNode> {
    await this.enableDomains(targetId);
    const result = (await this.cdpSend(targetId, 'DOM.getDocument', { depth: -1, pierce: true })) as { root: DOMNode };
    console.log('[webkit-inspect] getDocument result:', {
      nodeType: result.root?.nodeType,
      nodeName: result.root?.nodeName,
      childCount: result.root?.children?.length ?? result.root?.childNodeCount,
    });
    return result.root;
  }

  /** Highlight a DOM node in the simulator. */
  async highlightNode(targetId: string, backendNodeId: number): Promise<void> {
    await this.cdpSend(targetId, 'Overlay.highlightNode', {
      highlightConfig: {
        showInfo: true,
        contentColor: { r: 111, g: 168, b: 220, a: 0.66 },
        paddingColor: { r: 147, g: 196, b: 125, a: 0.55 },
        borderColor: { r: 255, g: 229, b: 153, a: 0.66 },
        marginColor: { r: 246, g: 178, b: 107, a: 0.66 },
      },
      backendNodeId,
    });
  }

  /** Hide the current highlight overlay. */
  async hideHighlight(targetId: string): Promise<void> {
    await this.cdpSend(targetId, 'Overlay.hideHighlight');
  }

  /** Get detailed info about a DOM node. */
  async getNodeInfo(targetId: string, backendNodeId: number): Promise<NodeInfo> {
    // Resolve to a proper nodeId
    const resolved = (await this.cdpSend(targetId, 'DOM.describeNode', { backendNodeId, depth: 0 })) as {
      node: { nodeId: number; nodeName: string; localName: string; attributes?: string[] };
    };

    // Get nodeId via resolveNode + requestNode
    const resolveResult = (await this.cdpSend(targetId, 'DOM.resolveNode', { backendNodeId })) as {
      object: { objectId: string };
    };
    const requestResult = (await this.cdpSend(targetId, 'DOM.requestNode', {
      objectId: resolveResult.object.objectId,
    })) as { nodeId: number };
    const nodeId = requestResult.nodeId;

    // Get outerHTML
    const htmlResult = (await this.cdpSend(targetId, 'DOM.getOuterHTML', { nodeId })) as { outerHTML: string };
    const outerHTML = htmlResult.outerHTML.length > 500 ? `${htmlResult.outerHTML.slice(0, 500)}…` : htmlResult.outerHTML;

    // Get box model for bounding rect
    let boundingRect = { x: 0, y: 0, width: 0, height: 0 };
    try {
      const boxResult = (await this.cdpSend(targetId, 'DOM.getBoxModel', { nodeId })) as {
        model: { content: number[]; width: number; height: number };
      };
      const c = boxResult.model.content; // [x1,y1, x2,y2, x3,y3, x4,y4]
      if (c && c.length >= 4) {
        boundingRect = {
          x: Math.round(c[0]),
          y: Math.round(c[1]),
          width: Math.round(boxResult.model.width),
          height: Math.round(boxResult.model.height),
        };
      }
    } catch {
      // Some nodes don't have a box model
    }

    // Build CSS selector via Runtime.evaluate
    let selector = resolved.node.localName || resolved.node.nodeName.toLowerCase();
    try {
      const selectorResult = (await this.cdpSend(targetId, 'Runtime.callFunctionOn', {
        objectId: resolveResult.object.objectId,
        functionDeclaration: `function() {
          function buildSelector(el) {
            if (!el || el === document.documentElement) return 'html';
            if (el.id) return '#' + CSS.escape(el.id);
            let path = el.localName || el.nodeName.toLowerCase();
            if (el.className && typeof el.className === 'string') {
              path += '.' + el.className.trim().split(/\\s+/).map(c => CSS.escape(c)).join('.');
            }
            const parent = el.parentElement;
            if (!parent) return path;
            const siblings = Array.from(parent.children).filter(c => c.localName === el.localName);
            if (siblings.length > 1) {
              path += ':nth-child(' + (Array.from(parent.children).indexOf(el) + 1) + ')';
            }
            return buildSelector(parent) + ' > ' + path;
          }
          return buildSelector(this);
        }`,
        returnByValue: true,
      })) as { result: { value: string } };
      selector = selectorResult.result.value || selector;
    } catch {
      // Fallback selector is fine
    }

    // Get key computed styles
    let computedStyle: Record<string, string> = {};
    try {
      const styleResult = (await this.cdpSend(targetId, 'CSS.getComputedStyleForNode', { nodeId })) as {
        computedStyle: Array<{ name: string; value: string }>;
      };
      const interestingProps = new Set([
        'display',
        'position',
        'width',
        'height',
        'margin',
        'padding',
        'color',
        'background-color',
        'font-family',
        'font-size',
        'font-weight',
        'border',
        'opacity',
        'z-index',
        'overflow',
        'flex-direction',
        'align-items',
        'justify-content',
        'gap',
      ]);
      computedStyle = Object.fromEntries(
        styleResult.computedStyle.filter((s) => interestingProps.has(s.name)).map((s) => [s.name, s.value]),
      );
    } catch {
      // CSS domain might not be available
    }

    return {
      selector,
      tagName: (resolved.node.localName || resolved.node.nodeName).toUpperCase(),
      outerHTML,
      boundingRect,
      computedStyle,
    };
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  /** Close a specific target session. */
  closeSession(targetId: string): void {
    const session = this.sessions.get(targetId);
    if (session) {
      session.ws.close();
      this.sessions.delete(targetId);
    }
  }

  /** Stop the CDP bridge and all sessions. */
  async stopBridge(): Promise<void> {
    for (const [, session] of this.sessions) {
      session.ws.close();
    }
    this.sessions.clear();

    if (this.cdpServer) {
      this.cdpServer.stop();
      this.cdpServer = null;
    }
  }
}

/** Singleton instance. */
export const webkitInspectService = new WebKitInspectServiceImpl();
