import Foundation

enum HostBridgeBootstrap {
    static let script = """
    (() => {
      if (window.forgepad) return;

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
          setIcon: (_variant) => noopVoidPromise()
        },
        state: {
          load: () => invoke("state.load"),
          save: (state) => invoke("state.save", { state })
        },
        git: {
          getCurrentBranch: (worktreePath) => invoke("git.currentBranch", { worktreePath }),
          getBranchStats: (worktreePath) => invoke("git.branchStats", { worktreePath }),
          getStatus: (worktreePath) => invoke("git.status", { worktreePath }),
          getFileDiff: (worktreePath, relPath, bucket, status, oldPath) => invoke("git.fileDiff", { worktreePath, relPath, bucket, status, oldPath }),
          stage: (worktreePath, paths) => invoke("git.stage", { worktreePath, paths }),
          unstage: (worktreePath, paths) => invoke("git.unstage", { worktreePath, paths }),
          discard: (worktreePath, entries) => invoke("git.discard", { worktreePath, entries }),
          commit: (worktreePath, message) => invoke("git.commit", { worktreePath, message }),
          push: (worktreePath) => invoke("git.push", { worktreePath }),
          pull: (worktreePath) => invoke("git.pull", { worktreePath }),
          generateCommitMessage: (worktreePath, promptTemplate) => invoke("git.generateCommitMessage", { worktreePath, promptTemplate }),
          addWorktree: (repoPath, branch, trackRemote, worktreeBaseDir) => invoke("git.worktreeAdd", { repoPath, branch, trackRemote, worktreeBaseDir }),
          removeWorktree: (repoPath, worktreePath, branch) => invoke("git.worktreeRemove", { repoPath, worktreePath, branch }),
          fetch: (repoPath) => invoke("git.fetch", { repoPath }),
          listRemoteBranches: (repoPath) => invoke("git.remoteBranches", { repoPath }),
          getPrInfo: () => Promise.resolve(null),
          scanWorktrees: (baseDir) => invoke("git.scanWorktrees", { baseDir })
        },
        fs: {
          getTreeWithStatus: (worktreePath) => invoke("fs.treeWithStatus", { worktreePath }),
          listFiles: (worktreePath) => invoke("fs.listFiles", { worktreePath }),
          readFile: (worktreePath, relPath) => invoke("fs.readFile", { worktreePath, relPath }),
          readFileAsDataUrl: (worktreePath, relPath) => invoke("fs.readFileDataUrl", { worktreePath, relPath }),
          readAbsFile: () => Promise.resolve(""),
          readAbsFileAsDataUrl: () => Promise.resolve(""),
          writeFile: (worktreePath, relPath, content) => invoke("fs.writeFile", { worktreePath, relPath, content }),
          watchWorkspace: () => Promise.resolve("native-watch-unimplemented"),
          unwatchWorkspace: noopVoid,
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
          openInIde: noopVoidPromise,
          openInTerminal: noopVoidPromise,
          showItemInFolder: (fullPath) => invoke("shell.showItemInFolder", { fullPath }),
          detectIdes: () => Promise.resolve([]),
          openWithIde: noopVoidPromise,
          detectTerminals: () => Promise.resolve([]),
          openWithTerminal: noopVoidPromise
        },
        notification: {
          pickAudio: () => Promise.resolve(null),
          deleteAudio: noopVoidPromise
        },
        app2: {
          isFocused: () => invoke("app.isFocused"),
          focusWindow: () => { invoke("app.focusWindow"); }
        },
        nativeFiles: { getPath: (file) => file.name },
        browser: {
          captureScreenshot: () => Promise.resolve(""),
          setTouchEmulation: noopVoidPromise,
          enableConsole: noopVoidPromise,
          disableConsole: noopVoidPromise,
          openDevTools: noopVoidPromise,
          openWindow: (url, title) => invoke("browser.openWindow", { url, title }),
          popout: (url, title) => invoke("browser.openWindow", { url, title }),
          onConsoleEvent: () => noopUnsubscribe
        },
        lsp: { getDefinition: (worktreePath, token) => invoke("lsp.getDefinition", { worktreePath, token }) },
        extension: {
          list: () => Promise.resolve([]),
          install: () => Promise.resolve(null),
          uninstall: noopVoidPromise,
          openPopup: noopVoidPromise,
          onTabCreate: () => noopUnsubscribe,
          sendTabCreated: noopVoid
        },
        pet: {
          sendSettings: noopVoid,
          command: noopVoid,
          play: noopVoid,
          stop: noopVoid,
          importPet: () => Promise.resolve({ success: false, error: "unsupported" }),
          deletePet: () => Promise.resolve({ success: true }),
          listPets: () => Promise.resolve([])
        }
      };
    })();
    """
}
