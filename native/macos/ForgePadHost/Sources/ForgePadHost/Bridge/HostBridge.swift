import AppKit
import UniformTypeIdentifiers
import WebKit

final class HostBridge: NSObject, WKScriptMessageHandler {
    private let coreSupervisor: CoreSupervisor
    private let workspaceFileSchemeHandler: WorkspaceFileSchemeHandler
    private let sendPetSettings: (Any) -> Void
    private let sendPetCommand: (Any) -> Void
    private let stateURL: URL

    init(
        coreSupervisor: CoreSupervisor,
        workspaceFileSchemeHandler: WorkspaceFileSchemeHandler,
        sendPetSettings: @escaping (Any) -> Void,
        sendPetCommand: @escaping (Any) -> Void
    ) {
        self.coreSupervisor = coreSupervisor
        self.workspaceFileSchemeHandler = workspaceFileSchemeHandler
        self.sendPetSettings = sendPetSettings
        self.sendPetCommand = sendPetCommand
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

        if command == "app.startWindowDrag" {
            startWindowDrag(from: message.webView)
            resolve(id: id, value: NSNull(), error: nil, webView: message.webView)
            return
        }

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
            return try await coreSupervisor.request(command: "app.projectFromPath", params: params)
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
        case "app.toggleMaximize":
            let window = NSApp.keyWindow ?? NSApp.mainWindow
            window?.performZoom(nil)
            return NSNull()
        case "app.setIcon":
            try setAppIcon(variant: requiredString(params, "variant"))
            return NSNull()
        case "dialog.confirm":
            return await confirm(
                title: params["title"] as? String,
                message: params["message"] as? String,
                confirmLabel: params["confirmLabel"] as? String,
                cancelLabel: params["cancelLabel"] as? String
            )
        case "notification.pickAudio":
            return await pickNotificationAudio() ?? NSNull()
        case "notification.deleteAudio":
            try deleteNotificationAudio(assetPath: requiredString(params, "assetPath"))
            return NSNull()
        case "fs.fileUrl":
            if let absPath = params["absPath"] as? String, !absPath.isEmpty {
                return try workspaceFileSchemeHandler.registerAbsoluteFile(absPath: absPath)
            }
            return try workspaceFileSchemeHandler.registerWorkspaceFile(
                worktreePath: requiredString(params, "worktreePath"),
                relPath: requiredString(params, "relPath")
            )
        case "pet.importPet":
            guard let sourcePath = await pickCustomPetDirectory() else {
                return ["success": false, "error": "cancelled"]
            }
            return try await coreSupervisor.request(command: "pet.importPet", params: ["sourcePath": sourcePath])
        case "pet.deletePet":
            return try await coreSupervisor.request(command: command, params: params)
        case "pet.listPets":
            return try await coreSupervisor.request(command: command, params: params)
        case "pet.sendSettings":
            sendPetSettings(params["settings"] ?? params)
            return NSNull()
        case "pet.command":
            sendPetCommand(params["command"] ?? params)
            return NSNull()
        case "pet.play":
            sendPetCommand(["type": "play", "action": params["action"] ?? "random"])
            return NSNull()
        case "pet.stop":
            sendPetCommand(["type": "stop"])
            return NSNull()
        case "shell.openExternal":
            if let url = params["url"] as? String, let parsed = URL(string: url) {
                NSWorkspace.shared.open(parsed)
            }
            return NSNull()
        case "shell.saveFile":
            try await saveFile(
                suggestedName: requiredString(params, "suggestedName"),
                contentBase64: requiredString(params, "contentBase64"),
                mimeType: params["mimeType"] as? String
            )
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
        case "shell.detectIdes":
            return detectIdes()
        case "shell.detectTerminals":
            return detectTerminals()
        case "shell.openWithIde":
            try openWithIde(
                path: requiredString(params, "fullPath"),
                ideId: requiredString(params, "ideId"),
                lineNumber: optionalPositiveInt(params, "lineNumber"),
                projectPath: optionalString(params, "projectPath")
            )
            return NSNull()
        case "shell.openWithTerminal":
            try openWithApp(
                path: requiredString(params, "fullPath"),
                appName: appName(forTerminal: requiredString(params, "terminalId"))
            )
            return NSNull()
        case "shell.openInIde":
            let ide = detectIdes().first?["id"] as? String ?? "vscode"
            try openWithIde(
                path: requiredString(params, "fullPath"),
                ideId: ide,
                lineNumber: optionalPositiveInt(params, "lineNumber"),
                projectPath: optionalString(params, "projectPath")
            )
            return NSNull()
        case "shell.openInTerminal":
            let terminal = detectTerminals().first?["id"] as? String ?? "terminal"
            try openWithApp(path: requiredString(params, "fullPath"), appName: appName(forTerminal: terminal))
            return NSNull()
        case "agent.permissionDecision":
            return try await coreSupervisor.request(command: command, params: params)
        default:
            if isCoreCommand(command) {
                return try await coreSupervisor.request(command: command, params: params)
            }
            throw HostBridgeError.unknownCommand(command)
        }
    }

    @MainActor
    private func setAppIcon(variant: String) throws {
        let allowedVariants = Set(["graphite", "aurora", "ember", "frost", "violet"])
        guard allowedVariants.contains(variant) else {
            throw NSError(
                domain: "ForgePadHost",
                code: 400,
                userInfo: [NSLocalizedDescriptionKey: "Unknown app icon variant: \(variant)"]
            )
        }

        guard let iconURL = appIconURL(for: variant),
              let image = NSImage(contentsOf: iconURL)
        else {
            throw NSError(
                domain: "ForgePadHost",
                code: 404,
                userInfo: [NSLocalizedDescriptionKey: "App icon asset not found: \(variant)"]
            )
        }

        NSApplication.shared.applicationIconImage = image
        NSApplication.shared.dockTile.display()
    }

    private func appIconURL(for variant: String) -> URL? {
        let relativePath = "app-icons/\(variant).png"
        var candidates: [URL] = []

        if let resourceURL = Bundle.main.resourceURL {
            candidates.append(resourceURL.appendingPathComponent("renderer").appendingPathComponent(relativePath))
        }

        candidates.append(
            URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
                .appendingPathComponent("../../../src/renderer/public")
                .appendingPathComponent(relativePath)
                .standardizedFileURL
        )

        let packageDirectory = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Bridge
            .deletingLastPathComponent() // ForgePadHost
            .deletingLastPathComponent() // Sources
            .deletingLastPathComponent() // ForgePadHost package
        candidates.append(
            packageDirectory
                .deletingLastPathComponent() // macos
                .deletingLastPathComponent() // native
                .deletingLastPathComponent() // repo root
                .appendingPathComponent("src/renderer/public")
                .appendingPathComponent(relativePath)
        )

        return candidates.first { FileManager.default.fileExists(atPath: $0.path) }
    }

    private func confirm(title: String?, message: String?, confirmLabel: String?, cancelLabel: String?) async -> Bool {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title?.isEmpty == false ? title! : "Confirm"
        alert.informativeText = message ?? ""
        alert.addButton(withTitle: confirmLabel ?? "OK")
        alert.addButton(withTitle: cancelLabel ?? "Cancel")
        let response = await withCheckedContinuation { continuation in
            if let window = NSApp.keyWindow {
                alert.beginSheetModal(for: window) { response in
                    continuation.resume(returning: response)
                }
            } else {
                continuation.resume(returning: alert.runModal())
            }
        }
        return response == .alertFirstButtonReturn
    }

    private func startWindowDrag(from webView: WKWebView?) {
        guard let window = webView?.window ?? NSApp.keyWindow ?? NSApp.mainWindow,
              let event = NSApp.currentEvent
        else { return }
        window.performDrag(with: event)
    }

    func openProject(completion: @escaping ([String: Any]?) -> Void) {
        pickDirectory(title: "Open Project") { [weak self] path in
            guard let self, let path else {
                completion(nil)
                return
            }
            Task { @MainActor in
                do {
                    let value = try await self.coreSupervisor.request(
                        command: "app.projectFromPath",
                        params: ["selectedPath": path]
                    )
                    completion(value as? [String: Any])
                } catch {
                    completion(nil)
                }
            }
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

    private func saveFile(suggestedName: String, contentBase64: String, mimeType: String?) async throws {
        guard let data = Data(base64Encoded: contentBase64) else {
            throw HostBridgeError.invalidInput("contentBase64")
        }

        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedName.isEmpty ? "download" : suggestedName
        if let mimeType,
           let type = UTType(mimeType: mimeType) {
            panel.allowedContentTypes = [type]
        }

        let destination = await withCheckedContinuation { continuation in
            panel.begin { response in
                continuation.resume(returning: response == .OK ? panel.url : nil)
            }
        }

        guard let destination else { return }
        try data.write(to: destination, options: .atomic)
    }

    private func pickNotificationAudio() async -> [String: Any]? {
        await withCheckedContinuation { continuation in
            let panel = NSOpenPanel()
            panel.title = "Select Audio File"
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            panel.allowsMultipleSelection = false
            panel.allowedContentTypes = ["mp3", "wav", "ogg"].compactMap { UTType(filenameExtension: $0) }
            panel.begin { [weak self] response in
                guard response == .OK, let source = panel.url, let self else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: try? self.copyNotificationAudio(from: source))
            }
        }
    }

    private func copyNotificationAudio(from source: URL) throws -> [String: Any] {
        let soundsDir = notificationSoundsDirectory()
        try FileManager.default.createDirectory(at: soundsDir, withIntermediateDirectories: true)
        let ext = source.pathExtension.lowercased()
        let baseName = source.deletingPathExtension().lastPathComponent
        let sanitized = sanitizeFileName(baseName)
        let fileName = "\(sanitized)_\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"
        let destination = soundsDir.appendingPathComponent(fileName)
        try FileManager.default.copyItem(at: source, to: destination)
        return [
            "fileName": fileName,
            "assetPath": destination.path,
        ]
    }

    private func deleteNotificationAudio(assetPath: String) throws {
        let soundsDir = notificationSoundsDirectory().standardizedFileURL
        let target = URL(fileURLWithPath: assetPath).standardizedFileURL
        guard target.path.hasPrefix(soundsDir.path) else {
            throw HostBridgeError.invalidPath(assetPath)
        }
        try? FileManager.default.removeItem(at: target)
    }

    private func notificationSoundsDirectory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser
        return base.appendingPathComponent("ForgePad/notification-sounds", isDirectory: true)
    }

    private func sanitizeFileName(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_-"))
        let scalars = value.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" }
        let sanitized = String(scalars).prefix(60)
        return sanitized.isEmpty ? "sound" : String(sanitized)
    }

    private func pickCustomPetDirectory() async -> String? {
        await withCheckedContinuation { continuation in
            let panel = NSOpenPanel()
            panel.title = "Import Custom Pet"
            panel.prompt = "Import"
            panel.canChooseFiles = false
            panel.canChooseDirectories = true
            panel.allowsMultipleSelection = false
            panel.begin { [weak self] response in
                _ = self
                continuation.resume(returning: response == .OK ? panel.url?.path : nil)
            }
        }
    }

    private func copyCustomPet(from source: URL) -> [String: Any] {
        do {
            let jsonURL = source.appendingPathComponent("pet.json")
            let spritesheetURL = source.appendingPathComponent("spritesheet.webp")
            guard FileManager.default.fileExists(atPath: jsonURL.path) else {
                return ["success": false, "error": "missing_pet_json"]
            }
            guard FileManager.default.fileExists(atPath: spritesheetURL.path) else {
                return ["success": false, "error": "missing_spritesheet"]
            }
            guard let raw = try JSONSerialization.jsonObject(with: Data(contentsOf: jsonURL)) as? [String: Any] else {
                return ["success": false, "error": "invalid_pet_json"]
            }
            guard let pet = validatePet(raw) else {
                return ["success": false, "error": "invalid_pet_schema"]
            }
            let spriteSize = (try? FileManager.default.attributesOfItem(atPath: spritesheetURL.path)[.size] as? NSNumber)?.intValue ?? 0
            guard spriteSize >= 10_000 else {
                return ["success": false, "error": "invalid_spritesheet"]
            }

            let customId = "custom-\(pet.id)"
            let target = customPetsDirectory().appendingPathComponent(customId, isDirectory: true)
            try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
            try? FileManager.default.removeItem(at: target.appendingPathComponent("pet.json"))
            try? FileManager.default.removeItem(at: target.appendingPathComponent("spritesheet.webp"))
            try FileManager.default.copyItem(at: jsonURL, to: target.appendingPathComponent("pet.json"))
            try FileManager.default.copyItem(at: spritesheetURL, to: target.appendingPathComponent("spritesheet.webp"))

            return [
                "success": true,
                "pet": [
                    "id": customId,
                    "displayName": pet.displayName,
                    "description": pet.description,
                    "kind": pet.kind,
                    "importedAt": ISO8601DateFormatter().string(from: Date()),
                ],
            ]
        } catch {
            return ["success": false, "error": "import_failed"]
        }
    }

    private func deleteCustomPet(petId: String) -> [String: Any] {
        guard petId.hasPrefix("custom-"), isSafePathSegment(petId) else {
            return ["success": false, "error": "invalid_pet_id"]
        }
        let root = customPetsDirectory().standardizedFileURL
        let target = root.appendingPathComponent(petId, isDirectory: true).standardizedFileURL
        guard target.path.hasPrefix(root.path) else {
            return ["success": false, "error": "invalid_pet_id"]
        }
        do {
            try? FileManager.default.removeItem(at: target)
            return ["success": true]
        }
    }

    private func listCustomPets() -> [[String: Any]] {
        let root = customPetsDirectory()
        guard let entries = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey]) else {
            return []
        }
        return entries.compactMap { entry in
            guard (try? entry.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true else {
                return nil
            }
            guard let raw = try? JSONSerialization.jsonObject(with: Data(contentsOf: entry.appendingPathComponent("pet.json"))) as? [String: Any],
                  let pet = validatePet(raw)
            else {
                return nil
            }
            return [
                "id": entry.lastPathComponent,
                "displayName": pet.displayName,
                "description": pet.description,
                "kind": pet.kind,
                "importedAt": "",
            ]
        }
    }

    private func customPetsDirectory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser
        return base.appendingPathComponent("ForgePad/custom-pets", isDirectory: true)
    }

    private func validatePet(_ raw: [String: Any]) -> (id: String, displayName: String, description: String, kind: String)? {
        guard let id = raw["id"] as? String,
              !id.isEmpty,
              isSafePathSegment(id),
              let displayName = raw["displayName"] as? String,
              !displayName.isEmpty,
              let description = raw["description"] as? String
        else {
            return nil
        }
        let kind = raw["kind"] as? String ?? "animal"
        guard ["person", "animal", "object"].contains(kind) else {
            return nil
        }
        return (id, displayName, description, kind)
    }

    private func isSafePathSegment(_ value: String) -> Bool {
        value.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil
    }

    private func isCoreCommand(_ command: String) -> Bool {
        command.hasPrefix("git.") ||
            command.hasPrefix("fs.") ||
            command.hasPrefix("pty.") ||
            command.hasPrefix("context.") ||
            command.hasPrefix("lsp.") ||
            command == "app.projectFromPath" ||
            command.hasPrefix("agent.")
    }

    private func detectIdes() -> [[String: Any]] {
        let candidates: [[String: String]] = [
            ["id": "cursor", "label": "Cursor", "command": "cursor", "appName": "Cursor", "bundleId": "com.todesktop.230313mzl4w4u92"],
            ["id": "vscode", "label": "VS Code", "command": "code", "appName": "Visual Studio Code", "bundleId": "com.microsoft.VSCode"],
            ["id": "zed", "label": "Zed", "command": "zed", "appName": "Zed", "bundleId": "dev.zed.Zed"],
            ["id": "windsurf", "label": "Windsurf", "command": "windsurf", "appName": "Windsurf", "bundleId": "com.exafunction.windsurf"],
            ["id": "intellij", "label": "IntelliJ IDEA", "command": "idea", "appName": "IntelliJ IDEA", "bundleId": "com.jetbrains.intellij"],
            ["id": "xcode", "label": "Xcode", "command": "xed", "appName": "Xcode", "bundleId": "com.apple.dt.Xcode"],
        ]
        return candidates.filter { candidate in
            applicationURL(bundleId: candidate["bundleId"], appName: candidate["appName"]) != nil ||
                commandExists(candidate["command"])
        }.map { candidate in
            [
                "id": candidate["id"] ?? "",
                "label": candidate["label"] ?? "",
                "command": candidate["command"] ?? "",
                "appName": candidate["appName"] ?? "",
            ]
        }
    }

    private func detectTerminals() -> [[String: Any]] {
        let candidates: [[String: String]] = [
            ["id": "terminal", "label": "Terminal", "appName": "Terminal", "bundleId": "com.apple.Terminal"],
            ["id": "iterm", "label": "iTerm2", "appName": "iTerm", "bundleId": "com.googlecode.iterm2"],
            ["id": "wezterm", "label": "WezTerm", "appName": "WezTerm", "bundleId": "com.github.wez.wezterm"],
            ["id": "ghostty", "label": "Ghostty", "appName": "Ghostty", "bundleId": "com.mitchellh.ghostty"],
        ]
        return candidates.filter { candidate in
            applicationURL(bundleId: candidate["bundleId"], appName: candidate["appName"]) != nil
        }.map { candidate in
            [
                "id": candidate["id"] ?? "",
                "label": candidate["label"] ?? "",
                "appName": candidate["appName"] ?? "",
            ]
        }
    }

    private func appName(forIde id: String) -> String {
        switch id {
        case "cursor":
            return "Cursor"
        case "zed":
            return "Zed"
        case "windsurf":
            return "Windsurf"
        case "intellij":
            return "IntelliJ IDEA"
        case "xcode":
            return "Xcode"
        default:
            return "Visual Studio Code"
        }
    }

    private func appName(forTerminal id: String) -> String {
        switch id {
        case "iterm":
            return "iTerm"
        case "wezterm":
            return "WezTerm"
        case "ghostty":
            return "Ghostty"
        default:
            return "Terminal"
        }
    }

    private func openWithIde(path: String, ideId: String, lineNumber: Int?, projectPath: String? = nil) throws {
        if ideId == "zed" {
            try openWithZed(path: path, lineNumber: lineNumber, projectPath: projectPath)
            return
        }

        let command = command(forIde: ideId)
        if let command, commandExists(command) {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            let args = ideArguments(forIde: ideId, path: path, lineNumber: lineNumber, projectPath: projectPath).map(shellQuote).joined(separator: " ")
            process.arguments = ["zsh", "-lc", "\(shellQuote(command)) \(args)"]
            try process.run()
            process.waitUntilExit()
            if process.terminationStatus == 0 {
                return
            }
        }
        let appName = appName(forIde: ideId)
        if let projectPath, projectPath != path {
            try openWithApp(path: projectPath, appName: appName)
        }
        try openWithApp(path: path, appName: appName)
    }

    private func openWithZed(path: String, lineNumber: Int?, projectPath: String?) throws {
        guard let command = zedCommand() else {
            let appName = appName(forIde: "zed")
            if let projectPath, projectPath != path {
                try openWithApp(path: projectPath, appName: appName)
            }
            try openWithApp(path: path, appName: appName)
            return
        }

        if let projectPath, projectPath != path {
            try runShellCommand(command, args: [projectPath])
            Thread.sleep(forTimeInterval: 0.2)
            try runShellCommand(command, args: ["-a", zedFileArgument(path: path, lineNumber: lineNumber)])
            return
        }

        try runShellCommand(command, args: [zedFileArgument(path: path, lineNumber: lineNumber)])
    }

    private func zedCommand() -> String? {
        if commandExists("zed") {
            return "zed"
        }
        if let appURL = applicationURL(bundleId: "dev.zed.Zed", appName: "Zed") {
            let cliPath = appURL.appendingPathComponent("Contents/MacOS/cli").path
            if FileManager.default.fileExists(atPath: cliPath) {
                return cliPath
            }
        }
        return nil
    }

    private func zedFileArgument(path: String, lineNumber: Int?) -> String {
        guard let lineNumber else { return path }
        return "\(path):\(lineNumber)"
    }

    private func runShellCommand(_ command: String, args: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        let quotedArgs = args.map(shellQuote).joined(separator: " ")
        process.arguments = ["zsh", "-lc", "\(shellQuote(command)) \(quotedArgs)"]
        try process.run()
        process.waitUntilExit()
    }

    private func command(forIde id: String) -> String? {
        switch id {
        case "cursor":
            return "cursor"
        case "zed":
            return "zed"
        case "windsurf":
            return "windsurf"
        case "intellij":
            return "idea"
        case "xcode":
            return "xed"
        default:
            return "code"
        }
    }

    private func ideArguments(forIde id: String, path: String, lineNumber: Int?, projectPath: String?) -> [String] {
        var args: [String] = []
        if let projectPath, projectPath != path {
            args.append(projectPath)
        }
        guard let lineNumber else { return args + [path] }
        switch id {
        case "cursor", "vscode", "windsurf":
            return args + ["-g", "\(path):\(lineNumber)"]
        case "intellij":
            return args + ["--line", "\(lineNumber)", path]
        case "xcode":
            return args + ["-l", "\(lineNumber)", path]
        default:
            return args + ["\(path):\(lineNumber)"]
        }
    }

    private func openWithApp(path: String, appName: String) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["-a", appName, path]
        try process.run()
    }

    private func commandExists(_ command: String?) -> Bool {
        guard let command, !command.isEmpty else { return false }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["zsh", "-lc", "command -v \(shellQuote(command)) >/dev/null"]
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }

    private func applicationURL(bundleId: String?, appName: String?) -> URL? {
        if let bundleId, let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) {
            return url
        }
        guard let appName else { return nil }
        return ["/Applications/\(appName).app", "\(FileManager.default.homeDirectoryForCurrentUser.path)/Applications/\(appName).app"]
            .map(URL.init(fileURLWithPath:))
            .first { FileManager.default.fileExists(atPath: $0.path) }
    }

    private func requiredString(_ params: [String: Any], _ key: String) throws -> String {
        guard let value = params[key] as? String else {
            throw HostBridgeError.missingParameter(key)
        }
        return value
    }

    private func optionalString(_ params: [String: Any], _ key: String) -> String? {
        guard let value = params[key] as? String, !value.isEmpty else { return nil }
        return value
    }

    private func optionalPositiveInt(_ params: [String: Any], _ key: String) -> Int? {
        if let value = params[key] as? Int, value > 0 {
            return value
        }
        if let value = params[key] as? Double, value > 0 {
            return Int(value)
        }
        return nil
    }

    private func shellQuote(_ value: String) -> String {
        "'\(value.replacingOccurrences(of: "'", with: "'\\''"))'"
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

private enum HostBridgeError: Error {
    case missingParameter(String)
    case invalidInput(String)
    case invalidPath(String)
    case unknownCommand(String)
}
