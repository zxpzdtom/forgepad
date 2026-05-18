import Foundation

enum HostBridgeBootstrap {
    static let script = """
    (() => {
      if (window.forgepad) return;

      const shouldKeepWarm = window.top === window && !/\\/pet\\.html(?:$|[?#])/.test(window.location.pathname);
      if (shouldKeepWarm && !window.__forgepadKeepWarm) {
        window.__forgepadKeepWarm = true;
        const keepWarm = () => window.requestAnimationFrame(keepWarm);
        window.requestAnimationFrame(keepWarm);
      }

      document.addEventListener("DOMContentLoaded", () => {
        const prewarm = document.createElement("span");
        prewarm.textContent = "ForgePad";
        prewarm.style.cssText = "position:fixed;left:-9999px;top:-9999px;font:13px -apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;opacity:0;pointer-events:none;";
        document.documentElement.appendChild(prewarm);
        window.requestAnimationFrame(() => prewarm.remove());
      }, { once: true });

      function nativeLog(level, args) {
        try {
          window.webkit.messageHandlers.forgepadHost.postMessage({
            kind: "console",
            level,
            values: Array.from(args).map((value) => {
              if (value instanceof Error) return value.stack || value.message;
              if (typeof value === "string") return value;
              try { return JSON.stringify(value); } catch (_) { return String(value); }
            })
          });
        } catch (_) {}
      }

      nativeLog("log", ["ForgePad bridge bootstrap", window.location.href]);

      for (const level of ["log", "warn", "error"]) {
        const original = console[level].bind(console);
        console[level] = (...args) => {
          nativeLog(level, args);
          original(...args);
        };
      }

      window.addEventListener("error", (event) => {
        nativeLog("error", [event.message, event.filename, event.lineno, event.colno, event.error]);
      });
      window.addEventListener("unhandledrejection", (event) => {
        nativeLog("error", ["Unhandled promise rejection", event.reason]);
      });

      let nextId = 1;
      const pending = new Map();
      const listeners = new Map();
      const nativeDropPaths = [];
      const noopUnsubscribe = () => {};
      const noopPromise = () => Promise.resolve(null);
      const noopVoidPromise = () => Promise.resolve();
      const noopVoid = () => {};

      function invoke(command, params = {}) {
        const id = String(nextId++);
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          window.webkit.messageHandlers.forgepadHost.postMessage({ id, command, params });
        });
      }

      window.__forgepadNativeResolve = (message) => {
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error));
        else entry.resolve(message.value === null ? undefined : message.value);
      };

      window.__forgepadNativeEmit = (event) => {
        const callbacks = listeners.get(event.name);
        if (!callbacks) return;
        for (const callback of callbacks) callback(event.payload);
      };

      window.__forgepadSetNativeFileDropPaths = (paths) => {
        nativeDropPaths.splice(0, nativeDropPaths.length, ...((Array.isArray(paths) ? paths : []).filter((path) => typeof path === "string" && path.length > 0)));
      };

      function getNativeDroppedPath(file) {
        const name = file?.name;
        if (!name) return "";
        const index = nativeDropPaths.findIndex((path) => path.split(/[\\\\/]/).pop() === name);
        if (index < 0) return "";
        return nativeDropPaths.splice(index, 1)[0] || "";
      }

      function on(name, callback) {
        const callbacks = listeners.get(name) || new Set();
        callbacks.add(callback);
        listeners.set(name, callbacks);
        return () => callbacks.delete(callback);
      }

      window.forgepad = {
        app: {
          openProject: () => invoke("app.openProject"),
          openProjectFromPath: (selectedPath) => invoke("app.openProjectFromPath", { selectedPath }),
          showEmojiPanel: () => invoke("app.showEmojiPanel"),
          pickDirectory: (title) => invoke("app.pickDirectory", { title }),
          setIcon: (variant) => invoke("app.setIcon", { variant })
        },
        state: {
          load: () => invoke("state.load"),
          save: (state) => invoke("state.save", { state })
        },
        git: {
          getCurrentBranch: (worktreePath) => invoke("git.currentBranch", { worktreePath }),
          getBranchStats: (worktreePath) => invoke("git.branchStats", { worktreePath }),
          getStatus: (worktreePath) => invoke("git.status", { worktreePath }),
          getCommitHistory: (worktreePath, limit) => invoke("git.commitHistory", { worktreePath, limit }),
          getFileDiff: (worktreePath, relPath, bucket, status, oldPath) => invoke("git.fileDiff", { worktreePath, relPath, bucket, status, oldPath }),
          getCommitFileDiff: (worktreePath, commitHash, relPath, status, oldPath) => invoke("git.commitFileDiff", { worktreePath, commitHash, relPath, status, oldPath }),
          stage: (worktreePath, paths) => invoke("git.stage", { worktreePath, paths }),
          unstage: (worktreePath, paths) => invoke("git.unstage", { worktreePath, paths }),
          discard: (worktreePath, entries) => invoke("git.discard", { worktreePath, entries }),
          commit: (worktreePath, message) => invoke("git.commit", { worktreePath, message }),
          push: (worktreePath) => invoke("git.push", { worktreePath }),
          pull: (worktreePath) => invoke("git.pull", { worktreePath }),
          generateCommitMessage: (worktreePath, promptTemplate, agentCommand) => invoke("git.generateCommitMessage", { worktreePath, promptTemplate, agentCommand }),
          addWorktree: (repoPath, branch, trackRemote, worktreeBaseDir) => invoke("git.worktreeAdd", { repoPath, branch, trackRemote, worktreeBaseDir }),
          removeWorktree: (repoPath, worktreePath, branch) => invoke("git.worktreeRemove", { repoPath, worktreePath, branch }),
          fetch: (repoPath) => invoke("git.fetch", { repoPath }),
          listRemoteBranches: (repoPath) => invoke("git.remoteBranches", { repoPath }),
          getPrInfo: (worktreePath) => invoke("git.prInfo", { worktreePath }),
          scanWorktrees: (baseDir) => invoke("git.scanWorktrees", { baseDir })
        },
        fs: {
          getTreeWithStatus: (worktreePath) => invoke("fs.treeWithStatus", { worktreePath }),
          listFiles: (worktreePath) => invoke("fs.listFiles", { worktreePath }),
          readFile: (worktreePath, relPath) => invoke("fs.readFile", { worktreePath, relPath }),
          readFilePreview: (worktreePath, relPath, maxBytes) => invoke("fs.readFilePreview", { worktreePath, relPath, maxBytes }),
          fileUrl: (worktreePath, relPath) => invoke("fs.fileUrl", { worktreePath, relPath }),
          absFileUrl: (absPath) => invoke("fs.fileUrl", { absPath }),
          readAbsFile: (absPath) => invoke("fs.readAbsFile", { absPath }),
          readAbsFilePreview: (absPath, maxBytes) => invoke("fs.readAbsFilePreview", { absPath, maxBytes }),
          writeFile: (worktreePath, relPath, content) => invoke("fs.writeFile", { worktreePath, relPath, content }),
          watchWorkspace: (worktreePath) => invoke("fs.watchWorkspace", { worktreePath }),
          unwatchWorkspace: (watchId) => { invoke("fs.unwatchWorkspace", { watchId }); },
          onChanged: (_watchId, callback) => on("fs.changed", callback)
        },
        pty: {
          create: (worktreePath, shell, command, extraEnv) => invoke("pty.create", { worktreePath, shell, command, extraEnv }),
          write: (id, data) => { invoke("pty.write", { id, data }); },
          resize: (id, cols, rows) => { invoke("pty.resize", { id, cols, rows }); },
          destroy: (id) => { invoke("pty.destroy", { id }); },
          reattach: (id) => invoke("pty.reattach", { id }),
          onData: (id, callback) => on(`pty.data:${id}`, callback),
          onExit: (id, callback) => on(`pty.exit:${id}`, (payload) => callback(payload.exitCode, payload.signal))
        },
        context: { createBundle: (input) => invoke("context.createBundle", { input }) },
        agent: {
          externalSessions: (workspaceId, worktreePath) => invoke("agent.externalSessions", { workspaceId, worktreePath }),
          updateSettings: (settings) => invoke("agent.settingsUpdate", { settings }),
          onStatusUpdate: (callback) => on("agent:status-update", callback),
          onFocusTab: (callback) => on("agent:focus-tab", callback),
          onRenameTab: (callback) => on("agent:rename-tab", callback),
          onPermissionRequest: (callback) => on("agent:permission-request", callback),
          sendPermissionDecision: (ptyId, decision, answers) => { invoke("agent.permissionDecision", { ptyId, decision, answers }); },
          onUserPrompt: (callback) => on("agent:user-prompt", callback),
          onCompletion: (callback) => on("agent:completion", callback)
        },
        menu: { onOpenSettings: (callback) => on("menu.openSettings", callback) },
        shell: {
          openPath: (fullPath) => invoke("shell.openPath", { fullPath }),
          openExternal: (url) => invoke("shell.openExternal", { url }),
          saveFile: (request) => invoke("shell.saveFile", request || {}),
          openInIde: (fullPath) => invoke("shell.openInIde", { fullPath }),
          openInTerminal: (fullPath) => invoke("shell.openInTerminal", { fullPath }),
          showItemInFolder: (fullPath) => invoke("shell.showItemInFolder", { fullPath }),
          detectIdes: () => invoke("shell.detectIdes"),
          openWithIde: (fullPath, ideId, lineNumber, projectPath) => invoke("shell.openWithIde", { fullPath, ideId, lineNumber, projectPath }),
          detectTerminals: () => invoke("shell.detectTerminals"),
          openWithTerminal: (fullPath, terminalId) => invoke("shell.openWithTerminal", { fullPath, terminalId })
        },
        dialog: {
          confirm: (options) => invoke("dialog.confirm", options || {})
        },
        notification: {
          pickAudio: () => invoke("notification.pickAudio"),
          deleteAudio: (assetPath) => invoke("notification.deleteAudio", { assetPath })
        },
        app2: {
          isFocused: () => invoke("app.isFocused"),
          focusWindow: () => { invoke("app.focusWindow"); },
          toggleMaximize: () => { invoke("app.toggleMaximize"); },
          startWindowDrag: () => { invoke("app.startWindowDrag"); }
        },
        native: {},
        nativeFiles: { getPath: (file) => getNativeDroppedPath(file) || file.name },
        browser: {
          openWindow: (url, title) => invoke("browser.openWindow", { url, title })
        },
        lsp: { getDefinition: (worktreePath, token) => invoke("lsp.getDefinition", { worktreePath, token }) },
        extension: {
          list: () => Promise.resolve([]),
          install: () => Promise.resolve(null),
          uninstall: noopVoidPromise,
          openPopup: noopVoidPromise,
          onTabCreate: () => noopUnsubscribe
        },
        pet: {
          sendSettings: (settings) => { invoke("pet.sendSettings", { settings }); },
          command: (command) => { invoke("pet.command", { command }); },
          play: (action) => { invoke("pet.play", { action }); },
          stop: () => { invoke("pet.stop"); },
          importPet: () => invoke("pet.importPet"),
          deletePet: (petId) => invoke("pet.deletePet", { petId }),
          listPets: () => invoke("pet.listPets")
        }
      };
    })();
    """
}
