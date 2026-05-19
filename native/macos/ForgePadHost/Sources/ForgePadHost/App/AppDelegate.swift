import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let appDisplayName = "ForgePad"
    private var windowController: MainWindowController?
    private var petWindowController: PetWindowController?
    private let coreSupervisor = CoreSupervisor()

    func applicationDidFinishLaunching(_ notification: Notification) {
        coreSupervisor.startIfConfigured()
        buildMenu()

        let controller = MainWindowController(
            coreSupervisor: coreSupervisor,
            sendPetSettings: { [weak self] settings in
                self?.petWindow().sendSettings(settings)
            },
            sendPetCommand: { [weak self] command in
                self?.petWindow().sendCommand(command)
            }
        )
        windowController = controller
        coreSupervisor.onEvent = { [weak self, weak controller] event in
            controller?.handleCoreEvent(event)
            self?.petWindowController?.handleCoreEvent(event)
        }
        controller.load()
        restorePetWindowFromPersistedState()

        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationWillTerminate(_ notification: Notification) {
        coreSupervisor.stop()
    }

    private func petWindow() -> PetWindowController {
        if let petWindowController {
            return petWindowController
        }
        let controller = PetWindowController(
            sendPermissionDecision: { [weak self] ptyId, decision, answers in
                Task { @MainActor in
                    _ = try? await self?.coreSupervisor.request(
                        command: "agent.permissionDecision",
                        params: ["ptyId": ptyId, "decision": decision, "answers": answers ?? [:]]
                    )
                }
            },
            focusAgent: { [weak self] ptyId in
                self?.windowController?.focusAgentFromPet(ptyId)
            }
        )
        petWindowController = controller
        return controller
    }

    private func restorePetWindowFromPersistedState() {
        Task { @MainActor in
            guard let state = try? await coreSupervisor.request(command: "state.load", params: [:]) as? [String: Any],
                  let settings = state["settings"] as? [String: Any],
                  let pets = settings["pets"] as? [String: Any],
                  pets["enabled"] as? Bool == true
            else { return }
            petWindow().sendSettings(pets)
        }
    }

    private func buildMenu() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        appItem.title = appDisplayName
        let appMenu = NSMenu(title: appDisplayName)
        appMenu.addItem(NSMenuItem(title: "About \(appDisplayName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: ""))
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "Settings...", action: #selector(MainWindowController.openSettingsFromMenu), keyEquivalent: ","))
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "Hide \(appDisplayName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"))
        appMenu.addItem(NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h"))
        appMenu.addItem(NSMenuItem(title: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: ""))
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "Quit \(appDisplayName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appItem.submenu = appMenu
        mainMenu.addItem(appItem)

        let fileItem = NSMenuItem()
        let fileMenu = NSMenu(title: "File")
        fileMenu.addItem(NSMenuItem(title: "Open Project...", action: #selector(MainWindowController.openProjectFromMenu), keyEquivalent: "o"))
        fileMenu.addItem(.separator())
        fileMenu.addItem(NSMenuItem(title: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w"))
        fileItem.submenu = fileMenu
        mainMenu.addItem(fileItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(NSMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"))
        editMenu.addItem(NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z"))
        editMenu.addItem(.separator())
        editMenu.addItem(NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(NSMenuItem(title: "Reload", action: #selector(MainWindowController.reloadFromMenu), keyEquivalent: "r"))
        viewMenu.addItem(NSMenuItem(title: "Toggle Developer Tools", action: #selector(MainWindowController.toggleDevToolsFromMenu), keyEquivalent: "i"))
        viewMenu.addItem(.separator())
        viewMenu.addItem(NSMenuItem(title: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f"))
        viewItem.submenu = viewMenu
        mainMenu.addItem(viewItem)

        NSApplication.shared.mainMenu = mainMenu
    }
}
