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

/// Visual setup shared by the live status item and the render probe.
private func configureStatusButton(_ button: NSStatusBarButton, icon: NSImage) {
    icon.isTemplate = true
    icon.size = NSSize(width: 21, height: 15.45)
    button.image = icon
    button.imagePosition = .imageLeading
    button.font = NSFont.monospacedDigitSystemFont(ofSize: NSFont.systemFontSize, weight: .regular)
}

/// Sweeping attention highlight, clipped to whatever the status item draws.
private enum Sweep {
    static let bandWidth: CGFloat = 26
    static let bandName = "dsh-notify-scan"
    static let duration: CFTimeInterval = 1.6

    /// Highlight colour, in the menu bar's own tone: on a light menu bar the
    /// dark glyphs brighten as the band passes, on a dark one they darken — a
    /// white band over white glyphs would not be visible at all.
    static func glint(for appearance: NSAppearance) -> NSColor {
        let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        return (isDark ? NSColor.black : NSColor.white).withAlphaComponent(0.82)
    }

    /// What the status item actually draws — the whale mark and the title
    /// glyphs — as an alpha silhouette that clips the sweep.
    static func contentMask(for button: NSStatusBarButton) -> CGImage? {
        let bounds = button.bounds
        guard bounds.width > 0, bounds.height > 0,
              let rep = button.bitmapImageRepForCachingDisplay(in: bounds) else { return nil }
        button.cacheDisplay(in: bounds, to: rep)
        return rep.cgImage
    }

    /// A band of `glint` travelling across `size`, visible only where `content`
    /// is opaque, so the highlight stays on the whale mark and the numbers
    /// instead of covering the whole status item.
    static func layer(size: CGSize, content: CGImage, glint: NSColor, scale: CGFloat) -> CALayer {
        let container = CALayer()
        container.frame = CGRect(origin: .zero, size: size)

        let mask = CALayer()
        mask.frame = container.bounds
        mask.contents = content
        mask.contentsGravity = .resize
        mask.contentsScale = scale
        container.mask = mask

        let band = CAGradientLayer()
        band.name = bandName
        band.frame = CGRect(x: -bandWidth, y: 0, width: bandWidth, height: size.height)
        band.colors = [
            NSColor.clear.cgColor,
            glint.cgColor,
            NSColor.clear.cgColor,
        ]
        band.startPoint = CGPoint(x: 0, y: 0.5)
        band.endPoint = CGPoint(x: 1, y: 0.5)
        container.addSublayer(band)

        let travel = CABasicAnimation(keyPath: "transform.translation.x")
        travel.fromValue = 0
        travel.toValue = size.width + bandWidth * 2
        travel.duration = duration
        travel.repeatCount = .infinity
        travel.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        band.add(travel, forKey: bandName)
        return container
    }

    /// Headless guard for the clipping above: with an opaque silhouette as the
    /// mask, the band may only brighten the pixels that silhouette covers.
    static func clipsToContent() -> Bool {
        let size = CGSize(width: 64, height: 22)
        guard let silhouette = silhouette(size: size) else { return false }

        let host = CALayer()
        host.frame = CGRect(origin: .zero, size: size)
        host.isGeometryFlipped = true
        let content = CALayer()
        content.frame = host.bounds
        content.contents = silhouette
        content.contentsGravity = .resize
        host.addSublayer(content)

        let width = Int(size.width)
        let height = Int(size.height)
        let info = CGImageAlphaInfo.premultipliedLast.rawValue
        func render() -> [UInt8] {
            let context = CGContext(
                data: nil, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: info
            )!
            host.render(in: context)
            let buffer = context.data!.assumingMemoryBound(to: UInt8.self)
            return Array(UnsafeBufferPointer(start: buffer, count: width * height * 4))
        }

        let plain = render()
        // A flat white band across the whole silhouette lights every glyph pixel,
        // so the check covers both stray light and an over-tight mask.
        let band = layer(size: size, content: silhouette, glint: .white, scale: 1)
        if let gradient = band.sublayers?.first as? CAGradientLayer {
            gradient.removeAllAnimations()
            gradient.frame = band.bounds
            gradient.colors = [NSColor.white.cgColor, NSColor.white.cgColor, NSColor.white.cgColor]
        }
        host.addSublayer(band)
        let swept = render()

        var glyphs = 0
        var lit = 0
        var stray = 0
        for pixel in 0..<(width * height) {
            let index = pixel * 4
            let wasGlyph = plain[index + 3] >= 128
            let brightened = Int(swept[index]) - Int(plain[index]) > 40
            if wasGlyph { glyphs += 1 }
            if brightened {
                lit += 1
                if !wasGlyph { stray += 1 }
            }
        }
        return glyphs > 0 && stray == 0 && lit * 10 >= glyphs * 9
    }

    /// An opaque band across the top of an otherwise transparent image, used
    /// only as the probe's stand-in for a status item's rendering.
    private static func silhouette(size: CGSize) -> CGImage? {
        guard let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: Int(size.width), pixelsHigh: Int(size.height),
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
        ) else { return nil }
        rep.size = size
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSColor.black.setFill()
        NSBezierPath(rect: NSRect(
            x: 0, y: size.height * 0.6, width: size.width, height: size.height * 0.4
        )).fill()
        NSGraphicsContext.restoreGraphicsState()
        return rep.cgImage
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
    private var scanContainer: CALayer?
    private var appearanceObservation: NSKeyValueObservation?
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
        configureStatusButton(button, icon: image)
        button.wantsLayer = true
        button.target = self
        button.action = #selector(focusHarnessChromeTab)
        button.sendAction(on: [.leftMouseUp])
        statusItem = item
        updatePresentation()
        startInputReader()
        // The glint follows the menu bar's tone, so a light/dark switch while an
        // event is pending must repaint the sweep.
        appearanceObservation = NSApp.observe(\.effectiveAppearance) { [weak self] _, _ in
            DispatchQueue.main.async { self?.updatePresentation() }
        }
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
        scanContainer?.removeFromSuperlayer()
        scanContainer = nil
        guard !markers.isEmpty, sweepEnabled, let host = button.layer else { return }
        host.layoutIfNeeded()
        let bounds = host.bounds
        guard bounds.width > 0, bounds.height > 0,
              let content = Sweep.contentMask(for: button) else { return }
        let scan = Sweep.layer(
            size: bounds.size,
            content: content,
            glint: Sweep.glint(for: button.effectiveAppearance),
            scale: host.contentsScale
        )
        host.addSublayer(scan)
        scanContainer = scan
    }

    deinit {
        scanContainer?.removeAllAnimations()
        scanContainer?.removeFromSuperlayer()
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
    private static var iconURL: URL {
        URL(fileURLWithPath: CommandLine.arguments[0])
            .standardizedFileURL
            .deletingLastPathComponent()
            .appendingPathComponent("whale.svg")
    }

    /// Photographs a real status item running the shipping sweep, one frame per
    /// phase, so the masked highlight can be eyeballed without a running Harness.
    private static func renderSweep(to path: String) -> Bool {
        guard let icon = NSImage(contentsOf: iconURL) else { return false }
        let application = NSApplication.shared
        application.setActivationPolicy(.accessory)
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        defer { NSStatusBar.system.removeStatusItem(item) }
        guard let button = item.button else { return false }
        button.wantsLayer = true
        configureStatusButton(button, icon: icon)
        button.title = MenuBarPresentation(count: 1, markers: "Q").title
        RunLoop.current.run(until: Date().addingTimeInterval(0.3))

        guard let host = button.layer, let content = Sweep.contentMask(for: button) else { return false }
        let size = host.bounds.size
        let scale = host.contentsScale
        let glint = Sweep.glint(for: button.effectiveAppearance)
        let dark = button.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        let phases: [CGFloat] = [0.18, 0.42, 0.66, 0.9]
        let slot = Int(size.width * scale) + 8
        guard let context = CGContext(
            data: nil, width: slot * phases.count, height: Int(size.height * scale),
            bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return false }
        context.interpolationQuality = .high
        // Status item layers are flipped vertically, so flip the CTM too, or the
        // preview comes out upside down.
        context.scaleBy(x: scale, y: scale)
        context.translateBy(x: 0, y: size.height)
        context.scaleBy(x: 1, y: -1)
        context.setFillColor(
            (dark ? NSColor(calibratedWhite: 0.15, alpha: 1) : NSColor(calibratedWhite: 0.85, alpha: 1)).cgColor
        )

        for (index, phase) in phases.enumerated() {
            let scan = Sweep.layer(size: size, content: content, glint: glint, scale: scale)
            if let band = scan.sublayers?.first(where: { $0.name == Sweep.bandName }) {
                band.removeAllAnimations()
                band.setAffineTransform(
                    CGAffineTransform(translationX: phase * (size.width + Sweep.bandWidth * 2), y: 0)
                )
            }
            host.addSublayer(scan)
            context.saveGState()
            context.translateBy(x: CGFloat(index * slot) / scale, y: 0)
            context.fill(CGRect(origin: .zero, size: size))
            host.render(in: context)
            context.restoreGState()
            scan.removeFromSuperlayer()
        }

        guard let image = context.makeImage(),
              let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
            return false
        }
        return (try? data.write(to: URL(fileURLWithPath: path))) != nil
    }

    static func main() {
        let arguments = Array(CommandLine.arguments.dropFirst())
        if arguments.first == "--probe" {
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
                "sweepClippedToContent": Sweep.clipsToContent(),
                "sweepWireValue": sweepWireValue,
                "chromeFocusScriptValid": NSAppleScript(
                    source: chromeFocusScript(origin: "http://127.0.0.1:3080")
                ) != nil,
                "iconLoaded": NSImage(contentsOf: Self.iconURL) != nil,
                "protocol": 1,
                "zeroTitle": MenuBarPresentation(count: 0, markers: "").title,
            ]
            let data = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
            print(String(decoding: data, as: UTF8.self))
            if let flag = arguments.firstIndex(of: "--render-sweep"),
               arguments.indices.contains(flag + 1),
               !renderSweep(to: arguments[flag + 1]) {
                fputs("could not render the sweep preview\n", stderr)
            }
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
