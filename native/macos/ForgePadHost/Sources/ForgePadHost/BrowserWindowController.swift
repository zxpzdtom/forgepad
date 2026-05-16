import AppKit
import WebKit

final class BrowserWindowController: NSWindowController, WKNavigationDelegate {
    private var webView: WKWebView!

    convenience init(url: URL, title: String?) {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = title ?? "ForgePad Browser"
        window.minSize = NSSize(width: 600, height: 400)
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.center()
        self.init(window: window)
        load(url: url)
    }

    private func load(url: URL) {
        guard let window else { return }
        let config = WKWebViewConfiguration()
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        webView = WKWebView(frame: window.contentView?.bounds ?? .zero, configuration: config)
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
        webView.navigationDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.alphaValue = 0
        window.contentView = webView
        webView.load(URLRequest(url: url))
    }

    func show() {
        window?.makeKeyAndOrderFront(nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.08
            webView.animator().alphaValue = 1
        }
    }
}
