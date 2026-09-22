import AppKit
import Foundation

private struct HelperCommand: Decodable {
    let type: String
    let count: Int?
    let markers: String?
    let sweep: Bool?
    let url: String?
}

private struct MenuBarPresentation {
    let title: String
    let description: String

    init(count: Int, markers: String) {
        title = markers.isEmpty
            ? (count == 0 ? "" : String(count))
            : "\(count)-\(markers)"
        description = markers.isEmpty
            ? "DeepSeek Harness，进行中会话数：\(count)"
            : "DeepSeek Harness，进行中会话数：\(count)，等待处理：\(markers)"
    }
}

private func appleScriptString(_ value: String) -> String {
    value.replacing("\\", with: "\\\\").replacing("\"", with: "\\\"")
}

private func chromeFocusScript(origin: String) -> String {
    """
    tell application \"Google Chrome\"
        set targetOrigin to \"\(appleScriptString(origin))\"
        repeat with candidateWindow in windows
            set candidateIndex to 1
            repeat with candidateTab in tabs of candidateWindow
                if (URL of candidateTab) starts with targetOrigin then
                    set active tab index of candidateWindow to candidateIndex
                    set index of candidateWindow to 1
                    activate
                    return true
                end if
                set candidateIndex to candidateIndex + 1
            end repeat
        end repeat
        return false
    end tell
    """
}

private final class MenuBarDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var count = 0
    private var markers = ""
    private var sweepEnabled = true
    private var scanLayer: CAGradientLayer?
    private var webClientOrigin: String?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        guard let button = item.button else {
            fputs("status item has no button\n", stderr)
            NSApp.terminate(nil)
            return
        }

        guard let image = NSImage(contentsOf: Self.iconURL) else {
            fputs("could not load whale.svg\n", stderr)
            NSApp.terminate(nil)
            return
        }
        image.isTemplate = true
        image.size = NSSize(width: 21, height: 15.45)
        button.image = image
        button.imagePosition = .imageLeading
        button.wantsLayer = true
        button.target = self
        button.action = #selector(focusHarnessChromeTab)
        button.sendAction(on: [.leftMouseUp])
        button.font = NSFont.monospacedDigitSystemFont(
            ofSize: NSFont.systemFontSize,
            weight: .regular
        )
        statusItem = item
        updatePresentation()
        startInputReader()
    }

    private static var iconURL: URL {
        URL(fileURLWithPath: CommandLine.arguments[0])
            .standardizedFileURL
            .deletingLastPathComponent()
            .appendingPathComponent("whale.svg")
    }

    private func startInputReader() {
        DispatchQueue.global(qos: .utility).async {
            while let line = readLine() {
                guard let data = line.data(using: .utf8) else { continue }
                do {
                    let command = try JSONDecoder().decode(HelperCommand.self, from: data)
                    DispatchQueue.main.async { [weak self] in self?.handle(command) }
                } catch {
                    fputs("invalid command: \(error)\n", stderr)
                }
            }
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }

    private func handle(_ command: HelperCommand) {
        switch command.type {
        case "count":
            guard let count = command.count, count >= 0 else {
                fputs("count command requires a non-negative integer\n", stderr)
                return
            }
            self.count = count
            updatePresentation()
        case "markers":
            guard let markers = command.markers,
                  markers.allSatisfy({ $0 == "Q" || $0 == "S" }) else {
                fputs("markers command requires Q and S letters only\n", stderr)
                return
            }
            self.markers = markers
            updatePresentation()
        case "sweep":
            guard let sweep = command.sweep else {
                fputs("sweep command requires a boolean\n", stderr)
                return
            }
            sweepEnabled = sweep
            updatePresentation()
        case "url":
            guard let url = command.url,
                  let target = URL(string: url),
                  let scheme = target.scheme?.lowercased(),
                  scheme == "http" || scheme == "https" else {
                fputs("url command requires an HTTP or HTTPS URL\n", stderr)
                return
            }
            webClientOrigin = target.absoluteString
        case "quit":
            NSApp.terminate(nil)
        default:
            fputs("unknown command type: \(command.type)\n", stderr)
        }
    }

    private func updatePresentation() {
        guard let button = statusItem?.button else { return }
        let presentation = MenuBarPresentation(count: count, markers: markers)
        button.title = presentation.title
        button.toolTip = presentation.description
        button.setAccessibilityLabel(presentation.description)
        updateScan(button)
    }

    private func updateScan(_ button: NSStatusBarButton) {
        scanLayer?.removeFromSuperlayer()
        scanLayer = nil
        guard !markers.isEmpty, sweepEnabled, let host = button.layer else { return }
        host.layoutIfNeeded()
        let width: CGFloat = 26
        let scan = CAGradientLayer()
        scan.frame = CGRect(x: -width, y: 0, width: width, height: host.bounds.height)
        scan.colors = [
            NSColor.clear.cgColor,
            NSColor.white.withAlphaComponent(0.82).cgColor,
            NSColor.clear.cgColor,
        ]
        scan.startPoint = CGPoint(x: 0, y: 0.5)
        scan.endPoint = CGPoint(x: 1, y: 0.5)
        host.addSublayer(scan)
        let sweep = CABasicAnimation(keyPath: "transform.translation.x")
        sweep.fromValue = 0
        sweep.toValue = host.bounds.width + width * 2
        sweep.duration = 1.6
        sweep.repeatCount = .infinity
        sweep.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        scan.add(sweep, forKey: "dsh-notify-scan")
        scanLayer = scan
    }

    deinit {
        scanLayer?.removeAllAnimations()
        scanLayer?.removeFromSuperlayer()
    }

    @objc private func focusHarnessChromeTab() {
        guard let webClientOrigin else {
            fputs("menu bar helper has no Harness Web client origin\n", stderr)
            return
        }
        let source = chromeFocusScript(origin: webClientOrigin)
        var error: NSDictionary?
        guard let result = NSAppleScript(source: source)?.executeAndReturnError(&error) else {
            let message = error?[NSAppleScript.errorMessage] as? String ?? "unknown AppleScript error"
            fputs("could not focus Harness Chrome tab: \(message)\n", stderr)
            return
        }
        if !result.booleanValue {
            fputs("no open Chrome tab matches the Harness Web client\n", stderr)
        }
    }

}

@main
private struct DshNotifyMenuBar {
    static func main() {
        if CommandLine.arguments.dropFirst().first == "--probe" {
            let iconURL = URL(fileURLWithPath: CommandLine.arguments[0])
                .standardizedFileURL
                .deletingLastPathComponent()
                .appendingPathComponent("whale.svg")
            let markerWireValue = try! JSONDecoder().decode(
                HelperCommand.self,
                from: Data(#"{"type":"markers","markers":"QS"}"#.utf8)
            ).markers!
            let sweepWireValue = try! JSONDecoder().decode(
                HelperCommand.self,
                from: Data(#"{"type":"sweep","sweep":false}"#.utf8)
            ).sweep!
            let result: [String: Any] = [
                "activeTitle": MenuBarPresentation(count: 2, markers: "").title,
                "markerCommand": "markers",
                "markerTitle": MenuBarPresentation(count: 2, markers: "QSS").title,
                "markerWireValue": markerWireValue,
                "sweepWireValue": sweepWireValue,
                "chromeFocusScriptValid": NSAppleScript(
                    source: chromeFocusScript(origin: "http://127.0.0.1:3080")
                ) != nil,
                "iconLoaded": NSImage(contentsOf: iconURL) != nil,
                "protocol": 1,
                "zeroTitle": MenuBarPresentation(count: 0, markers: "").title,
            ]
            let data = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
            print(String(decoding: data, as: UTF8.self))
            return
        }

        let application = NSApplication.shared
        let delegate = MenuBarDelegate()
        application.setActivationPolicy(.accessory)
        application.delegate = delegate
        application.run()
        withExtendedLifetime(delegate) {}
    }
}
