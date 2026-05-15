import AppKit
import WebKit

final class MainWindowController: NSWindowController, WKNavigationDelegate {
    private let bridge: HostBridge
    private let rendererSchemeHandler = RendererSchemeHandler()
    private var webView: WKWebView!
    private(set) var hasLoadedRenderer = false

    convenience init(
        coreSupervisor: CoreSupervisor,
        openBrowserWindow: @escaping (URL, String?) -> Void
    ) {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1420, height: 920),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "ForgePad"
        window.minSize = NSSize(width: 980, height: 640)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isReleasedWhenClosed = false
        window.backgroundColor = NSColor(red: 0.06, green: 0.07, blue: 0.09, alpha: 1.0)
        window.center()
        self.init(
            window: window,
            coreSupervisor: coreSupervisor,
            openBrowserWindow: openBrowserWindow
        )
    }

    init(
        window: NSWindow,
        coreSupervisor: CoreSupervisor,
        openBrowserWindow: @escaping (URL, String?) -> Void
    ) {
        self.bridge = HostBridge(
            coreSupervisor: coreSupervisor,
            openBrowserWindow: openBrowserWindow
        )
        super.init(window: window)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func windowDidLoad() {
        super.windowDidLoad()
    }

    func load(rendererURL: URL? = nil) {
        guard !hasLoadedRenderer else {
            if let rendererURL {
                webView.load(URLRequest(url: rendererURL))
            }
            return
        }
        hasLoadedRenderer = true
        guard let window else { return }

        let config = WKWebViewConfiguration()
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.suppressesIncrementalRendering = false
        config.setURLSchemeHandler(rendererSchemeHandler, forURLScheme: "forgepad")

        let userContent = WKUserContentController()
        userContent.add(bridge, name: "forgepadHost")
        userContent.addUserScript(WKUserScript(
            source: HostBridgeBootstrap.script,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        ))
        config.userContentController = userContent

        webView = WKWebView(frame: window.contentView?.bounds ?? .zero, configuration: config)
        webView.navigationDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.alphaValue = 0

        window.contentView = webView
        loadRenderer(rendererURL: rendererURL)
        window.makeKeyAndOrderFront(nil)
    }

    private func loadRenderer(rendererURL: URL?) {
        if let rendererURL {
            webView.load(URLRequest(url: rendererURL))
            return
        }

        if let url = ProcessInfo.processInfo.environment["FORGEPAD_WEB_URL"], let parsed = URL(string: url) {
            webView.load(URLRequest(url: parsed))
            return
        }

        webView.load(URLRequest(url: URL(string: "forgepad://renderer/index.html")!))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.08
            webView.animator().alphaValue = 1
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadFailure(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLoadFailure(error)
    }

    private func showLoadFailure(_ error: Error) {
        let message = """
        <html><body style="margin:0;background:#0f1115;color:#f5f7fb;font:13px -apple-system;padding:24px">
        <h1 style="font-size:16px;margin:0 0 12px">ForgePad failed to load</h1>
        <pre style="white-space:pre-wrap;color:#f0a0a0">\(Self.escapeHTML(error.localizedDescription))</pre>
        </body></html>
        """
        webView.loadHTMLString(message, baseURL: nil)
        webView.alphaValue = 1
    }

    private static func escapeHTML(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    @objc func openProjectFromMenu() {
        bridge.openProject { [weak self] result in
            guard let self, let result else { return }
            self.emitMenuResult(name: "native:open-project-result", payload: result)
        }
    }

    @objc func openSettingsFromMenu() {
        emit(name: "menu.openSettings", payload: NSNull())
    }

    @objc func reloadFromMenu() {
        webView.reload()
    }

    @objc func toggleDevToolsFromMenu() {
        webView.perform(Selector(("_showInspector:")), with: nil)
    }

    private func emit(name: String, payload: Any) {
        guard JSONSerialization.isValidJSONObject(["name": name, "payload": payload]),
              let data = try? JSONSerialization.data(withJSONObject: ["name": name, "payload": payload]),
              let json = String(data: data, encoding: .utf8)
        else { return }
        webView.evaluateJavaScript("window.__forgepadNativeEmit && window.__forgepadNativeEmit(\(json));")
    }

    private func emitMenuResult(name: String, payload: [String: Any]) {
        emit(name: name, payload: payload)
    }

    func handleCoreEvent(_ event: [String: Any]) {
        guard let type = event["type"] as? String else { return }
        if type == "pty.data", let payload = event["payload"] as? [String: Any], let id = payload["id"] as? String {
            emit(name: "pty.data:\(id)", payload: payload["data"] ?? "")
            return
        }
        if type == "pty.exit", let payload = event["payload"] as? [String: Any], let id = payload["id"] as? String {
            emit(name: "pty.exit:\(id)", payload: payload)
            return
        }
        emit(name: type, payload: event["payload"] ?? NSNull())
    }
}
