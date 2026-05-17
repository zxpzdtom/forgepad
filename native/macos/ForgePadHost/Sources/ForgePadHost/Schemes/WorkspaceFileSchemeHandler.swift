import Foundation
import WebKit

final class WorkspaceFileSchemeHandler: NSObject, WKURLSchemeHandler {
    private let lock = NSLock()
    private var tokensByPath: [String: String] = [:]
    private var pathsByToken: [String: URL] = [:]

    func registerWorkspaceFile(worktreePath: String, relPath: String) throws -> String {
        let root = URL(fileURLWithPath: worktreePath).standardizedFileURL
        let rel = relPath.replacingOccurrences(of: "\\", with: "/")
        guard !rel.hasPrefix("/"),
              rel != "..",
              !rel.hasPrefix("../"),
              !rel.contains("/../")
        else {
            throw WorkspaceFileSchemeError.invalidPath(relPath)
        }

        let fileURL = root.appendingPathComponent(rel).standardizedFileURL
        guard fileURL.path == root.path || fileURL.path.hasPrefix(root.path + "/") else {
            throw WorkspaceFileSchemeError.invalidPath(relPath)
        }
        return register(fileURL: fileURL)
    }

    func registerAbsoluteFile(absPath: String) throws -> String {
        let fileURL = URL(fileURLWithPath: absPath).standardizedFileURL
        return register(fileURL: fileURL)
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              let token = url.host,
              let fileURL = fileURL(for: token)
        else {
            fail(urlSchemeTask, code: 404)
            return
        }

        do {
            let values = try fileURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
            guard values.isRegularFile == true else {
                fail(urlSchemeTask, code: 404)
                return
            }

            let fileSize = values.fileSize ?? 0
            let range = byteRange(from: urlSchemeTask.request, fileSize: fileSize)
            let response = HTTPURLResponse(
                url: url,
                statusCode: range == nil ? 200 : 206,
                httpVersion: "HTTP/1.1",
                headerFields: responseHeaders(for: fileURL, fileSize: fileSize, range: range)
            ) ?? URLResponse(
                url: url,
                mimeType: Self.mimeType(for: fileURL),
                expectedContentLength: range?.count ?? fileSize,
                textEncodingName: nil
            )
            urlSchemeTask.didReceive(response)
            try stream(fileURL: fileURL, range: range, to: urlSchemeTask)
            urlSchemeTask.didFinish()
        } catch {
            fail(urlSchemeTask, code: 500)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func register(fileURL: URL) -> String {
        let key = fileURL.path
        lock.lock()
        defer { lock.unlock() }

        if let existing = tokensByPath[key] {
            return urlString(for: existing, fileURL: fileURL)
        }

        let token = UUID().uuidString.lowercased()
        tokensByPath[key] = token
        pathsByToken[token] = fileURL
        return urlString(for: token, fileURL: fileURL)
    }

    private func fileURL(for token: String) -> URL? {
        lock.lock()
        defer { lock.unlock() }
        return pathsByToken[token]
    }

    private func urlString(for token: String, fileURL: URL) -> String {
        let fileName = fileURL.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "file"
        return "forgepad-file://\(token)/\(fileName)"
    }

    private func stream(fileURL: URL, range: ByteRange?, to task: WKURLSchemeTask) throws {
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }

        if let range {
            try handle.seek(toOffset: UInt64(range.start))
        }

        var remaining = range?.count ?? Int.max
        let chunkSize = 256 * 1024
        while remaining > 0 {
            autoreleasepool {
                let size = min(chunkSize, remaining)
                let data = handle.readData(ofLength: size)
                if !data.isEmpty {
                    task.didReceive(data)
                    remaining -= data.count
                } else {
                    remaining = 0
                }
            }
        }
    }

    private func byteRange(from request: URLRequest, fileSize: Int) -> ByteRange? {
        guard let header = request.value(forHTTPHeaderField: "Range"),
              header.hasPrefix("bytes="),
              fileSize > 0
        else { return nil }

        let value = String(header.dropFirst("bytes=".count))
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }

        if parts[0].isEmpty, let suffix = Int(parts[1]), suffix > 0 {
            let start = max(0, fileSize - suffix)
            return ByteRange(start: start, end: fileSize - 1)
        }

        guard let start = Int(parts[0]), start < fileSize else { return nil }
        let end = parts[1].isEmpty ? fileSize - 1 : min(Int(parts[1]) ?? fileSize - 1, fileSize - 1)
        guard end >= start else { return nil }
        return ByteRange(start: start, end: end)
    }

    private func responseHeaders(for fileURL: URL, fileSize: Int, range: ByteRange?) -> [String: String] {
        var headers = [
            "Content-Type": Self.mimeType(for: fileURL),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
        ]
        if let range {
            headers["Content-Length"] = "\(range.count)"
            headers["Content-Range"] = "bytes \(range.start)-\(range.end)/\(fileSize)"
        } else {
            headers["Content-Length"] = "\(fileSize)"
        }
        return headers
    }

    private func fail(_ task: WKURLSchemeTask, code: Int) {
        task.didFailWithError(NSError(domain: "ForgePadWorkspaceFile", code: code))
    }

    private static func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "png":
            return "image/png"
        case "jpg", "jpeg":
            return "image/jpeg"
        case "gif":
            return "image/gif"
        case "webp":
            return "image/webp"
        case "svg":
            return "image/svg+xml"
        case "avif":
            return "image/avif"
        case "bmp":
            return "image/bmp"
        case "ico":
            return "image/x-icon"
        case "mp3":
            return "audio/mpeg"
        case "wav":
            return "audio/wav"
        case "ogg":
            return "audio/ogg"
        case "flac":
            return "audio/flac"
        case "aac":
            return "audio/aac"
        case "m4a":
            return "audio/mp4"
        case "wma":
            return "audio/x-ms-wma"
        case "mp4":
            return "video/mp4"
        case "webm":
            return "video/webm"
        case "mov":
            return "video/quicktime"
        case "avi":
            return "video/x-msvideo"
        case "mkv":
            return "video/x-matroska"
        case "pdf":
            return "application/pdf"
        default:
            return "application/octet-stream"
        }
    }
}

private struct ByteRange {
    let start: Int
    let end: Int

    var count: Int {
        end - start + 1
    }
}

enum WorkspaceFileSchemeError: Error {
    case invalidPath(String)
}
