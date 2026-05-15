import Foundation

final class CoreSupervisor {
    private var process: Process?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?
    private var stdinPipe: Pipe?
    private var buffer = ""
    private var pending: [String: (Result<Any, Error>) -> Void] = [:]
    private let lock = NSLock()
    var onEvent: (([String: Any]) -> Void)?

    func startIfConfigured() {
        guard process == nil else { return }
        let command = ProcessInfo.processInfo.environment["FORGEPAD_CORE_COMMAND"]
            ?? bundledCoreCommand()

        let shell = Process()
        shell.executableURL = URL(fileURLWithPath: "/bin/zsh")
        shell.arguments = ["-lc", command]

        let stdout = Pipe()
        let stderr = Pipe()
        let stdin = Pipe()
        shell.standardOutput = stdout
        shell.standardError = stderr
        shell.standardInput = stdin

        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            self?.consumeStdout(text)
        }

        stderr.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            for line in text.split(separator: "\n") {
                NSLog("[ForgePad core stderr] %@", String(line))
            }
        }

        shell.terminationHandler = { [weak self] process in
            NSLog("[ForgePad core] exited with status %d", process.terminationStatus)
            self?.failAllPending(CoreError.processExited)
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
            NSLog("[ForgePad core] started")
        } catch {
            NSLog("[ForgePad core] failed to start: %@", String(describing: error))
        }
    }

    private func bundledCoreCommand() -> String {
        if let bundled = Bundle.main.path(forResource: "forgepad-core-daemon", ofType: nil) {
            return "'\(bundled.replacingOccurrences(of: "'", with: "'\\''"))'"
        }
        return "cargo run --manifest-path ../../../crates/forgepad-core/Cargo.toml --bin forgepad-core-daemon"
    }

    func stop() {
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        stderrPipe?.fileHandleForReading.readabilityHandler = nil
        if let process, process.isRunning {
            process.terminate()
        }
        failAllPending(CoreError.processExited)
        process = nil
        stdoutPipe = nil
        stderrPipe = nil
        stdinPipe = nil
    }

    func request(command: String, params: [String: Any]) async throws -> Any {
        guard let stdinPipe else { throw CoreError.notRunning }
        let id = UUID().uuidString
        let payload: [String: Any] = [
            "id": id,
            "command": command,
            "params": params
        ]
        let data = try JSONSerialization.data(withJSONObject: payload)

        return try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            pending[id] = { result in
                continuation.resume(with: result)
            }
            lock.unlock()

            stdinPipe.fileHandleForWriting.write(data)
            stdinPipe.fileHandleForWriting.write(Data("\n".utf8))
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
        guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let data = line.data(using: .utf8),
              let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }

        if let id = message["id"] as? String {
            let callback: ((Result<Any, Error>) -> Void)?
            lock.lock()
            callback = pending.removeValue(forKey: id)
            lock.unlock()

            if let error = message["error"] as? String {
                callback?(.failure(CoreError.requestFailed(error)))
            } else {
                callback?(.success(message["value"] ?? NSNull()))
            }
            return
        }

        DispatchQueue.main.async { [weak self] in
            self?.onEvent?(message)
        }
    }

    private func failAllPending(_ error: Error) {
        lock.lock()
        let callbacks = Array(pending.values)
        pending.removeAll()
        lock.unlock()
        for callback in callbacks {
            callback(.failure(error))
        }
    }
}

enum CoreError: Error, CustomStringConvertible {
    case notRunning
    case processExited
    case requestFailed(String)

    var description: String {
        switch self {
        case .notRunning:
            return "Core daemon is not running."
        case .processExited:
            return "Core daemon exited."
        case .requestFailed(let message):
            return message
        }
    }
}
