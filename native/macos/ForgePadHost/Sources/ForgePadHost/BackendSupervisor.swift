import Foundation

final class BackendSupervisor {
    private var process: Process?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?
    private var stdinPipe: Pipe?
    private var buffer = ""
    private(set) var rendererURL: URL?
    var onEvent: (([String: Any]) -> Void)?

    func startIfConfigured() {
        guard process == nil else { return }

        let shell = Process()
        if let command = ProcessInfo.processInfo.environment["FORGEPAD_BACKEND_COMMAND"], !command.isEmpty {
            shell.executableURL = URL(fileURLWithPath: "/bin/zsh")
            shell.arguments = ["-lc", command]
            NSLog("[ForgePad backend] command: %@", command)
        } else if let backend = bundledBackendPath() {
            let node = bundledNodePath()
            shell.executableURL = URL(fileURLWithPath: node ?? "/usr/bin/env")
            shell.arguments = node == nil ? ["node", backend] : [backend]
            var environment = ProcessInfo.processInfo.environment
            if let renderer = Bundle.main.resourceURL?.appendingPathComponent("renderer").path {
                environment["FORGEPAD_RENDERER_DIR"] = renderer
            }
            shell.environment = environment
            NSLog("[ForgePad backend] command: %@ %@", node ?? "/usr/bin/env node", backend)
        } else {
            return
        }

        let stdout = Pipe()
        let stderr = Pipe()
        let stdin = Pipe()
        shell.standardOutput = stdout
        shell.standardError = stderr
        shell.standardInput = stdin

        stdout.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            self.consumeStdout(text)
        }

        stderr.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            for line in text.split(separator: "\n") {
                NSLog("[ForgePad backend stderr] %@", String(line))
            }
        }

        shell.terminationHandler = { [weak self] process in
            NSLog("[ForgePad backend] exited with status %d", process.terminationStatus)
            self?.process = nil
            self?.stdoutPipe = nil
            self?.stderrPipe = nil
            self?.stdinPipe = nil
        }

        do {
            try shell.run()
            process = shell
            stdoutPipe = stdout
            stderrPipe = stderr
            stdinPipe = stdin
            NSLog("[ForgePad backend] started")
        } catch {
            NSLog("[ForgePad backend] failed to start: %@", String(describing: error))
        }
    }

    private func bundledBackendPath() -> String? {
        Bundle.main.path(forResource: "backend/index", ofType: "js")
    }

    private func bundledNodePath() -> String? {
        Bundle.main.path(forResource: "node", ofType: nil)
    }

    func stop() {
        send(["type": "backend.shutdown"])
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        stderrPipe?.fileHandleForReading.readabilityHandler = nil
        if let process, process.isRunning {
            process.terminate()
        }
        process = nil
        stdoutPipe = nil
        stderrPipe = nil
        stdinPipe = nil
    }

    func send(_ command: [String: Any]) {
        guard let stdinPipe, JSONSerialization.isValidJSONObject(command) else { return }
        do {
            let data = try JSONSerialization.data(withJSONObject: command)
            stdinPipe.fileHandleForWriting.write(data)
            stdinPipe.fileHandleForWriting.write(Data("\n".utf8))
        } catch {
            NSLog("[ForgePad backend] failed to send command: %@", String(describing: error))
        }
    }

    private func consumeStdout(_ text: String) {
        buffer += text
        while let newline = buffer.firstIndex(of: "\n") {
            let line = String(buffer[..<newline])
            buffer.removeSubrange(...newline)
            consumeLine(line)
        }
    }

    private func consumeLine(_ line: String) {
        guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        NSLog("[ForgePad backend] %@", line)
        guard let data = line.data(using: .utf8),
              let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }

        if message["type"] as? String == "backend.ready",
           let rawURL = message["rendererUrl"] as? String {
            rendererURL = URL(string: rawURL)
        }

        DispatchQueue.main.async { [weak self] in
            self?.onEvent?(message)
        }
    }
}
