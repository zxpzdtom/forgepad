import AppKit
import WebKit

final class HostBridge: NSObject, WKScriptMessageHandler {
    private let coreSupervisor: CoreSupervisor
    private let openBrowserWindow: (URL, String?) -> Void
    private let stateURL: URL

    init(
        coreSupervisor: CoreSupervisor,
        openBrowserWindow: @escaping (URL, String?) -> Void
    ) {
        self.coreSupervisor = coreSupervisor
        self.openBrowserWindow = openBrowserWindow
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser
        stateURL = base.appendingPathComponent("ForgePad/forgepad-state.json")
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }

        if body["kind"] as? String == "console" {
            let level = body["level"] as? String ?? "log"
            let values = body["values"] as? [Any] ?? []
            let text = values.map { String(describing: $0) }.joined(separator: " ")
            NSLog("[ForgePad WebView \(level)] \(text)")
            return
        }

        guard let id = body["id"] as? String,
              let command = body["command"] as? String
        else { return }

        let params = body["params"] as? [String: Any] ?? [:]

        Task { @MainActor in
            do {
                let value = try await handle(command: command, params: params)
                resolve(id: id, value: value, error: nil, webView: message.webView)
            } catch {
                resolve(id: id, value: NSNull(), error: String(describing: error), webView: message.webView)
            }
        }
    }

    @MainActor
    private func handle(command: String, params: [String: Any]) async throws -> Any {
        switch command {
        case "state.load":
            return try await coreSupervisor.request(command: command, params: params)
        case "state.save":
            return try await coreSupervisor.request(command: command, params: params)
        case "app.openProject":
            return await withCheckedContinuation { continuation in
                openProject { result in continuation.resume(returning: (result ?? NSNull()) as Any) }
            }
        case "app.openProjectFromPath":
            guard let selectedPath = params["selectedPath"] as? String else { return NSNull() }
            return projectResult(for: selectedPath) ?? NSNull()
        case "app.pickDirectory":
            return await withCheckedContinuation { continuation in
                pickDirectory(title: params["title"] as? String) { result in continuation.resume(returning: (result ?? NSNull()) as Any) }
            }
        case "app.showEmojiPanel":
            NSApp.orderFrontCharacterPalette(nil)
            return NSNull()
        case "app.isFocused":
            return NSApp.isActive
        case "app.focusWindow":
            NSApp.activate(ignoringOtherApps: true)
            NSApp.keyWindow?.makeKeyAndOrderFront(nil)
            return NSNull()
        case "shell.openExternal":
            if let url = params["url"] as? String, let parsed = URL(string: url) {
                NSWorkspace.shared.open(parsed)
            }
            return NSNull()
        case "shell.openPath":
            if let fullPath = params["fullPath"] as? String {
                NSWorkspace.shared.open(URL(fileURLWithPath: fullPath))
            }
            return NSNull()
        case "shell.showItemInFolder":
            if let fullPath = params["fullPath"] as? String {
                NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: fullPath)])
            }
            return NSNull()
        case "agent.permissionDecision":
            return try await coreSupervisor.request(command: command, params: params)
        case "browser.openWindow":
            if let rawURL = params["url"] as? String, let url = URL(string: rawURL) {
                openBrowserWindow(url, params["title"] as? String)
            }
            return NSNull()
        default:
            if isCoreCommand(command) {
                return try await coreSupervisor.request(command: command, params: params)
            }
            return defaultValue(for: command)
        }
    }

    func openProject(completion: @escaping ([String: Any]?) -> Void) {
        pickDirectory(title: "Open Project") { [weak self] path in
            guard let self, let path else {
                completion(nil)
                return
            }
            completion(self.projectResult(for: path))
        }
    }

    private func pickDirectory(title: String?, completion: @escaping (String?) -> Void) {
        let panel = NSOpenPanel()
        panel.title = title ?? "Choose Folder"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.begin { response in
            completion(response == .OK ? panel.url?.path : nil)
        }
    }

    private func projectResult(for path: String) -> [String: Any]? {
        let url = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let name = url.lastPathComponent.isEmpty ? "Project" : url.lastPathComponent
        return [
            "name": name,
            "repoPath": url.path,
            "branch": currentBranch(at: url) ?? "main",
            "isGitRepo": isGitRepo(url)
        ]
    }

    private func isGitRepo(_ url: URL) -> Bool {
        runGit(["rev-parse", "--is-inside-work-tree"], cwd: url) == "true"
    }

    private func currentBranch(at url: URL) -> String? {
        runGit(["branch", "--show-current"], cwd: url)
    }

    private func runGit(_ args: [String], cwd: URL) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["git"] + args
        process.currentDirectoryURL = cwd
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()
        do {
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { return nil }
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        } catch {
            return nil
        }
    }

    private func isCoreCommand(_ command: String) -> Bool {
        command.hasPrefix("git.") ||
            command.hasPrefix("fs.") ||
            command.hasPrefix("pty.") ||
            command.hasPrefix("context.") ||
            command.hasPrefix("lsp.") ||
            command.hasPrefix("agent.")
    }

    private func defaultValue(for command: String) -> Any {
        if command.hasPrefix("git.") || command.hasPrefix("fs.") || command.hasPrefix("pty.") {
            return NSNull()
        }
        if command.hasPrefix("extension.") || command.hasPrefix("browser.") || command.hasPrefix("lsp.") {
            return NSNull()
        }
        if command.contains("list") || command.contains("detect") || command.contains("scan") || command.contains("status") {
            return []
        }
        return NSNull()
    }

    private func resolve(id: String, value: Any, error: String?, webView: WKWebView?) {
        var payload: [String: Any] = ["id": id, "value": value]
        if let error {
            payload["error"] = error
        }
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8)
        else { return }
        webView?.evaluateJavaScript("window.__forgepadNativeResolve && window.__forgepadNativeResolve(\(json));")
    }
}
