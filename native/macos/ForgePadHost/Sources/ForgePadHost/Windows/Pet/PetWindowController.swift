import AppKit
import WebKit

final class PetWindowController: NSWindowController, WKNavigationDelegate, WKScriptMessageHandler {
    private var webView: WKWebView!
    private var isLoaded = false
    private var pendingEvents: [(String, Any)] = []
    private let sendPermissionDecision: (String, String, [String: String]?) -> Void
    private let focusAgent: (String?) -> Void

    init(
        sendPermissionDecision: @escaping (String, String, [String: String]?) -> Void,
        focusAgent: @escaping (String?) -> Void
    ) {
        self.sendPermissionDecision = sendPermissionDecision
        self.focusAgent = focusAgent

        let panel = NSPanel(
            contentRect: NSRect(x: 80, y: 80, width: 180, height: 180),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.title = "ForgePad Pet"
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = false
        panel.canHide = false
        panel.ignoresMouseEvents = false
        super.init(window: panel)
        installWebView(in: panel)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "forgepadPetHost")
        webView?.navigationDelegate = nil
    }

    func show() {
        loadIfNeeded()
        window?.orderFrontRegardless()
    }

    func hide() {
        window?.orderOut(nil)
    }

    func sendSettings(_ settings: Any) {
        guard let dict = settings as? [String: Any],
              (dict["enabled"] as? Bool) == true
        else {
            emit(name: "settings", payload: settings)
            hide()
            return
        }
        show()
        emit(name: "settings", payload: settings)
    }

    func sendCommand(_ command: Any) {
        show()
        emit(name: "command", payload: command)
    }

    func handleCoreEvent(_ event: [String: Any]) {
        guard let type = event["type"] as? String else { return }
        let payload = event["payload"] ?? NSNull()
        switch type {
        case "agent.statusUpdate":
            emit(name: "agentStatusUpdate", payload: payload)
        case "agent.permissionRequest":
            emit(name: "permissionRequest", payload: payload)
        case "agent.userPrompt":
            emit(name: "userPrompt", payload: payload)
        case "agent.completion":
            emit(name: "completion", payload: payload)
        default:
            break
        }
    }

    private func installWebView(in window: NSWindow) {
        let config = WKWebViewConfiguration()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.suppressesIncrementalRendering = false
        config.setURLSchemeHandler(RendererSchemeHandler(), forURLScheme: "forgepad")
        config.setURLSchemeHandler(CustomPetSchemeHandler(), forURLScheme: "custom-pet")

        let userContent = WKUserContentController()
        userContent.add(self, name: "forgepadPetHost")
        userContent.addUserScript(WKUserScript(
            source: Self.bootstrapScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        config.userContentController = userContent

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        webView.layer?.backgroundColor = NSColor.clear.cgColor
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }

        let content = NSView()
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor.clear.cgColor
        content.layer?.isOpaque = false
        content.addSubview(webView)
        window.contentView = content

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            webView.topAnchor.constraint(equalTo: content.topAnchor),
            webView.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])
    }

    private func loadIfNeeded() {
        guard !isLoaded, webView.url == nil else { return }
        if let raw = ProcessInfo.processInfo.environment["FORGEPAD_WEB_URL"],
           let base = URL(string: raw),
           let url = URL(string: "pet.html", relativeTo: base) {
            webView.load(URLRequest(url: url.absoluteURL))
            return
        }
        webView.load(URLRequest(url: URL(string: "forgepad://renderer/pet.html")!))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoaded = true
        let events = pendingEvents
        pendingEvents.removeAll()
        for (name, payload) in events {
            emit(name: name, payload: payload)
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let command = body["command"] as? String
        else { return }

        switch command {
        case "moveWindow":
            guard let x = body["x"] as? Double, let y = body["y"] as? Double else { return }
            moveWindowToBrowserTopLeft(x: x, y: y)
        case "resizeWindow":
            guard let width = body["width"] as? Double, let height = body["height"] as? Double else { return }
            if let window {
                let frame = window.frame
                let nextFrame = clampedFrame(
                    NSRect(x: frame.minX, y: frame.maxY - height, width: width, height: height),
                    on: window.screen ?? NSScreen.main
                )
                window.setFrame(nextFrame, display: true)
            }
        case "getStage":
            resolve(id: body["id"] as? String, value: stageSnapshot())
        case "focusAgent":
            focusAgent(body["ptyId"] as? String)
        case "sendPermissionDecision":
            guard let ptyId = body["ptyId"] as? String,
                  let decision = body["decision"] as? String
            else { return }
            sendPermissionDecision(ptyId, decision, body["answers"] as? [String: String])
        default:
            break
        }
    }

    private func stageSnapshot() -> [String: Any] {
        let screens = NSScreen.screens
        let mainFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let displays = screens.map { browserRectPayload($0.visibleFrame, on: $0) }
        let windows = NSApp.windows.compactMap { window -> [String: Any]? in
            guard window !== self.window, window.isVisible else { return nil }
            var payload = browserRectPayload(window.frame)
            payload["id"] = "\(window.windowNumber)"
            payload["appName"] = "ForgePad"
            payload["title"] = window.title
            payload["source"] = "native"
            return payload
        }
        return [
            "capturedAt": Int(Date().timeIntervalSince1970 * 1000),
            "workArea": browserRectPayload(mainFrame, on: NSScreen.main),
            "displays": displays,
            "windows": windows,
        ]
    }

    private func moveWindowToBrowserTopLeft(x: Double, y: Double) {
        guard let window else { return }
        let screen = screenForBrowserPoint(x: x, y: y) ?? window.screen ?? NSScreen.main
        let desktopTop = virtualDesktopFrame().maxY
        let appKitY = desktopTop - y - window.frame.height
        let nextFrame = clampedFrame(
            NSRect(x: x, y: appKitY, width: window.frame.width, height: window.frame.height),
            on: screen
        )
        window.setFrame(nextFrame, display: true)
    }

    private func clampedFrame(_ frame: NSRect, on screen: NSScreen?) -> NSRect {
        let visible = screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? frame
        let minX = visible.minX
        let maxX = max(visible.minX, visible.maxX - frame.width)
        let minY = visible.minY
        let maxY = max(visible.minY, visible.maxY - frame.height)
        return NSRect(
            x: min(max(frame.minX, minX), maxX),
            y: min(max(frame.minY, minY), maxY),
            width: frame.width,
            height: frame.height
        )
    }

    private func screenForBrowserPoint(x: Double, y: Double) -> NSScreen? {
        NSScreen.screens.first { screen in
            let rect = browserRect(screen.visibleFrame, on: screen)
            return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY
        } ?? NSScreen.screens.first { screen in
            x >= screen.frame.minX && x <= screen.frame.maxX
        }
    }

    private func browserRectPayload(_ rect: NSRect, on screen: NSScreen? = nil) -> [String: Any] {
        rectPayload(browserRect(rect, on: screen ?? screenForAppKitRect(rect)))
    }

    private func browserRect(_ rect: NSRect, on screen: NSScreen?) -> NSRect {
        guard screen != nil else { return rect }
        return NSRect(
            x: rect.origin.x,
            y: virtualDesktopFrame().maxY - rect.maxY,
            width: rect.width,
            height: rect.height
        )
    }

    private func virtualDesktopFrame() -> NSRect {
        NSScreen.screens.reduce(NSRect.null) { partial, screen in
            partial.union(screen.frame)
        }
    }

    private func screenForAppKitRect(_ rect: NSRect) -> NSScreen? {
        let center = NSPoint(x: rect.midX, y: rect.midY)
        return NSScreen.screens.first { screen in
            screen.frame.contains(center)
        } ?? NSScreen.main
    }

    private func rectPayload(_ rect: NSRect) -> [String: Any] {
        [
            "x": rect.origin.x,
            "y": rect.origin.y,
            "width": rect.width,
            "height": rect.height,
        ]
    }

    private func emit(name: String, payload: Any) {
        guard isLoaded else {
            pendingEvents.append((name, payload))
            return
        }
        guard JSONSerialization.isValidJSONObject(["name": name, "payload": payload]),
              let data = try? JSONSerialization.data(withJSONObject: ["name": name, "payload": payload]),
              let json = String(data: data, encoding: .utf8)
        else { return }
        webView.evaluateJavaScript("window.__forgepadPetEmit && window.__forgepadPetEmit(\(json));")
    }

    private func resolve(id: String?, value: Any) {
        guard let id,
              JSONSerialization.isValidJSONObject(["id": id, "value": value]),
              let data = try? JSONSerialization.data(withJSONObject: ["id": id, "value": value]),
              let json = String(data: data, encoding: .utf8)
        else { return }
        webView.evaluateJavaScript("window.__forgepadPetResolve && window.__forgepadPetResolve(\(json));")
    }

    private static let bootstrapScript = """
    (() => {
      if (window.forgepadPet) return;
      let nextId = 1;
      const pending = new Map();
      const listeners = new Map();
      function post(message) {
        window.webkit.messageHandlers.forgepadPetHost.postMessage(message);
      }
      function request(command, params = {}) {
        const id = String(nextId++);
        return new Promise((resolve) => {
          pending.set(id, resolve);
          post({ id, command, ...params });
        });
      }
      function on(name, callback) {
        const callbacks = listeners.get(name) || new Set();
        callbacks.add(callback);
        listeners.set(name, callbacks);
        return () => callbacks.delete(callback);
      }
      window.__forgepadPetResolve = (message) => {
        const resolve = pending.get(message.id);
        if (!resolve) return;
        pending.delete(message.id);
        resolve(message.value);
      };
      window.__forgepadPetEmit = (event) => {
        const callbacks = listeners.get(event.name);
        if (!callbacks) return;
        for (const callback of callbacks) callback(event.payload);
      };
      window.forgepadPet = {
        moveWindow: (x, y) => post({ command: "moveWindow", x, y }),
        resizeWindow: (width, height) => post({ command: "resizeWindow", width, height }),
        getStage: () => request("getStage"),
        focusAgent: (ptyId) => post({ command: "focusAgent", ptyId }),
        sendPermissionDecision: (ptyId, decision, answers) => post({ command: "sendPermissionDecision", ptyId, decision, answers }),
        onSettingsChanged: (callback) => on("settings", callback),
        onCommand: (callback) => on("command", callback),
        onAgentStatusUpdate: (callback) => on("agentStatusUpdate", callback),
        onPermissionRequest: (callback) => on("permissionRequest", callback),
        onUserPrompt: (callback) => on("userPrompt", callback),
        onCompletion: (callback) => on("completion", callback)
      };
    })();
    """
}
