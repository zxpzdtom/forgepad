import Foundation
import WebKit

final class RendererSchemeHandler: NSObject, WKURLSchemeHandler {
    private let rendererRoot: URL?

    override init() {
        rendererRoot = Bundle.main.resourceURL?.appendingPathComponent("renderer")
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              let rendererRoot else {
            fail(urlSchemeTask)
            return
        }

        let requestPath = url.path == "/" || url.path.isEmpty ? "index.html" : String(url.path.dropFirst())
        let candidate = rendererRoot.appendingPathComponent(requestPath).standardizedFileURL
        let rootPath = rendererRoot.standardizedFileURL.path
        let resolvedPath = candidate.path
        let fileURL = (resolvedPath == rootPath || resolvedPath.hasPrefix(rootPath + "/"))
            ? candidate
            : rendererRoot.appendingPathComponent("index.html")

        do {
            let data = try Data(contentsOf: fileURL)
            let response = URLResponse(
                url: url,
                mimeType: Self.mimeType(for: fileURL),
                expectedContentLength: data.count,
                textEncodingName: fileURL.pathExtension == "html" || fileURL.pathExtension == "js" || fileURL.pathExtension == "css" ? "utf-8" : nil
            )
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            fail(urlSchemeTask)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func fail(_ task: WKURLSchemeTask) {
        task.didFailWithError(NSError(domain: "ForgePadRenderer", code: 404))
    }

    private static func mimeType(for url: URL) -> String {
        switch url.pathExtension {
        case "html":
            return "text/html"
        case "js":
            return "text/javascript"
        case "css":
            return "text/css"
        case "json":
            return "application/json"
        case "png":
            return "image/png"
        case "svg":
            return "image/svg+xml"
        case "woff2":
            return "font/woff2"
        default:
            return "application/octet-stream"
        }
    }
}
