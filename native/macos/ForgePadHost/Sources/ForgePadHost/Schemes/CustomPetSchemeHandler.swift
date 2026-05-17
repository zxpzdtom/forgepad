import Foundation
import WebKit

final class CustomPetSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL

    override init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser
        root = base.appendingPathComponent("ForgePad/custom-pets", isDirectory: true)
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            fail(urlSchemeTask)
            return
        }
        let parts = url.path.split(separator: "/").map(String.init)
        guard !parts.isEmpty, parts.allSatisfy(isSafeSegment) else {
            fail(urlSchemeTask, code: 403)
            return
        }
        let fileURL = parts.reduce(root) { url, part in
            url.appendingPathComponent(part)
        }.standardizedFileURL
        let rootPath = root.standardizedFileURL.path
        guard fileURL.path.hasPrefix(rootPath + "/") else {
            fail(urlSchemeTask, code: 403)
            return
        }
        do {
            let data = try Data(contentsOf: fileURL)
            urlSchemeTask.didReceive(URLResponse(
                url: url,
                mimeType: fileURL.pathExtension == "webp" ? "image/webp" : "application/octet-stream",
                expectedContentLength: data.count,
                textEncodingName: nil
            ))
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            fail(urlSchemeTask)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func isSafeSegment(_ value: String) -> Bool {
        value.range(of: #"^[A-Za-z0-9_.-]+$"#, options: .regularExpression) != nil &&
            value != "." &&
            value != ".."
    }

    private func fail(_ task: WKURLSchemeTask, code: Int = 404) {
        task.didFailWithError(NSError(domain: "ForgePadCustomPet", code: code))
    }
}
