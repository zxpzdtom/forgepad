import AppKit
import WebKit

final class ForgePadWebView: WKWebView {
    override func willOpenMenu(_ menu: NSMenu, with event: NSEvent) {
        if #available(macOS 13.3, *), isInspectable {
            super.willOpenMenu(menu, with: event)
            return
        }
        menu.removeAllItems()
    }
}

final class MainWindowController: NSWindowController, WKNavigationDelegate {
    private let bridge: HostBridge
    private var webView: WKWebView!
    private var bootView: NSView?
    private(set) var hasLoadedRenderer = false
    private var didRevealWindow = false

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
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(red: 0.031, green: 0.035, blue: 0.039, alpha: 1.0)
        let occlusionSelector = Selector(("setWindowOcclusionDetectionEnabled:"))
        if window.responds(to: occlusionSelector) {
            window.perform(occlusionSelector, with: NSNumber(value: false))
        }
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

        webView = makeWebView()
        webView.navigationDelegate = self
        webView.alphaValue = 0

        installNativeShell(in: window)
        loadRenderer(rendererURL: rendererURL)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            guard let self, !self.didRevealWindow else { return }
            self.didRevealWindow = true
            self.webView.alphaValue = 1
        }
    }

    private func makeWebView() -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        let idleSelector = Selector(("_setBoolValue:forKey:"))
        if config.preferences.responds(to: idleSelector) {
            config.preferences.perform(
                idleSelector,
                with: NSNumber(value: true),
                with: "RequestIdleCallbackEnabled" as NSString
            )
        }
        config.suppressesIncrementalRendering = false
        config.setURLSchemeHandler(RendererSchemeHandler(), forURLScheme: "forgepad")
        config.setURLSchemeHandler(CustomPetSchemeHandler(), forURLScheme: "custom-pet")

        let userContent = WKUserContentController()
        userContent.add(bridge, name: "forgepadHost")
        userContent.addUserScript(WKUserScript(
            source: HostBridgeBootstrap.script,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        ))
        config.userContentController = userContent

        let view = ForgePadWebView(frame: .zero, configuration: config)
        if #available(macOS 13.3, *) {
            view.isInspectable = true
        }
        view.translatesAutoresizingMaskIntoConstraints = false
        view.setValue(false, forKey: "drawsBackground")
        view.layer?.backgroundColor = NSColor.clear.cgColor
        return view
    }

    private func installNativeShell(in window: NSWindow) {
        let root = NSVisualEffectView()
        root.translatesAutoresizingMaskIntoConstraints = false
        root.material = .hudWindow
        root.blendingMode = .behindWindow
        root.state = .active
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor(red: 0.031, green: 0.035, blue: 0.039, alpha: 1.0).cgColor

        let boot = makeBootView()
        root.addSubview(boot)
        root.addSubview(webView)
        bootView = boot

        window.contentView = root

        NSLayoutConstraint.activate([
            boot.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            boot.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            boot.topAnchor.constraint(equalTo: root.topAnchor),
            boot.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            webView.topAnchor.constraint(equalTo: root.topAnchor),
            webView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
        ])
    }

    private func makeBootView() -> NSView {
        let view = NSView()
        view.translatesAutoresizingMaskIntoConstraints = false
        view.wantsLayer = true
        view.layer?.backgroundColor = NSColor(red: 0.031, green: 0.035, blue: 0.039, alpha: 1.0).cgColor

        let label = NSTextField(labelWithString: "ForgePad")
        label.translatesAutoresizingMaskIntoConstraints = false
        label.font = NSFont.systemFont(ofSize: 22, weight: .semibold)
        label.textColor = NSColor(calibratedWhite: 0.94, alpha: 1)
        label.alignment = .center

        let subtitle = NSTextField(labelWithString: "Warming workspace")
        subtitle.translatesAutoresizingMaskIntoConstraints = false
        subtitle.font = NSFont.systemFont(ofSize: 12, weight: .regular)
        subtitle.textColor = NSColor(calibratedWhite: 0.58, alpha: 1)
        subtitle.alignment = .center

        let progress = NSProgressIndicator()
        progress.translatesAutoresizingMaskIntoConstraints = false
        progress.style = .spinning
        progress.controlSize = .small
        progress.isIndeterminate = true
        progress.startAnimation(nil)

        let stack = NSStackView(views: [label, subtitle, progress])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 9
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -12),
        ])

        return view
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
        revealWindowAfterFirstPaint()
    }

    private func revealWindowAfterFirstPaint() {
        guard !didRevealWindow else {
            fadeInWebView()
            return
        }
        didRevealWindow = true
        let reveal: @convention(block) () -> Void = { [weak self] in
            guard let self else { return }
            self.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            self.fadeInWebView()
        }

        let selector = Selector(("_doAfterNextPresentationUpdate:"))
        if webView.responds(to: selector) {
            webView.perform(selector, with: reveal)
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: reveal)
        }
    }

    private func fadeInWebView() {
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.08
            webView.animator().alphaValue = 1
            bootView?.animator().alphaValue = 0
        } completionHandler: { [weak self] in
            self?.bootView?.removeFromSuperview()
            self?.bootView = nil
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("[ForgePad native] renderer did fail \(error.localizedDescription)")
        showLoadFailure(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("[ForgePad native] renderer did fail provisional \(error.localizedDescription)")
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
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
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
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
        let showInspector = Selector(("_showInspector"))
        let showInspectorWithSender = Selector(("_showInspector:"))
        if webView.responds(to: showInspector) {
            webView.perform(showInspector)
            return
        }
        if webView.responds(to: showInspectorWithSender) {
            webView.perform(showInspectorWithSender, with: self)
            return
        }
        let alert = NSAlert()
        alert.messageText = "ForgePad WebView is inspectable"
        alert.informativeText = "Open Safari's Develop menu, then choose this Mac and ForgePad. The WebView is marked inspectable; this avoids the private inspector selector that can crash WKWebView."
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    private func emit(name: String, payload: Any) {
        emit(to: webView, name: name, payload: payload)
    }

    private func emit(to target: WKWebView?, name: String, payload: Any) {
        guard JSONSerialization.isValidJSONObject(["name": name, "payload": payload]),
              let data = try? JSONSerialization.data(withJSONObject: ["name": name, "payload": payload]),
              let json = String(data: data, encoding: .utf8)
        else { return }
        target?.evaluateJavaScript("window.__forgepadNativeEmit && window.__forgepadNativeEmit(\(json));")
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
