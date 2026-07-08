import Foundation
import MWDATCamera
import MWDATCore
import Tauri
import UIKit
import WebKit

class StartGlassArgs: Decodable {
  let channel: Channel
}

class HandleUrlArgs: Decodable {
  let url: String
}

class GlassCameraPlugin: Plugin {
  private var channel: Channel?
  private var session: DeviceSession?
  private var stream: MWDATCamera.Stream?
  private var deviceSelector: AutoDeviceSelector?

  private var stateListenerToken: AnyListenerToken?
  private var errorListenerToken: AnyListenerToken?
  private var photoDataListenerToken: AnyListenerToken?
  private var videoFrameListenerToken: AnyListenerToken?
  private var registrationTask: Task<Void, Never>?
  private var lastPreviewSentAt: TimeInterval = 0

  private static var isConfigured = false

  private static func ensureConfigured() {
    guard !isConfigured else { return }
    do {
      try Wearables.configure()
      isConfigured = true
    } catch {
      Logger.error("glass-camera: failed to configure Wearables SDK: \(error)")
    }
  }

  public override func load(webview: WKWebView) {
    super.load(webview: webview)
    GlassCameraPlugin.ensureConfigured()
  }

  // MARK: - Commands

  @objc public func registrationState(_ invoke: Invoke) throws {
    GlassCameraPlugin.ensureConfigured()
    let state = String(describing: Wearables.shared.registrationState)
    invoke.resolve(["state": state])
  }

  @objc public func startRegistration(_ invoke: Invoke) throws {
    GlassCameraPlugin.ensureConfigured()
    Task { @MainActor in
      do {
        try await Wearables.shared.startRegistration()
        invoke.resolve()
      } catch {
        invoke.reject("グラスの登録を開始できませんでした: \(error.localizedDescription)")
      }
    }
  }

  @objc public func handleUrl(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(HandleUrlArgs.self)
    guard let url = URL(string: args.url) else {
      invoke.resolve()
      return
    }
    invoke.resolve()
    Task { @MainActor in
      do {
        _ = try await Wearables.shared.handleUrl(url)
        self.emit(type: "registration", value: String(describing: Wearables.shared.registrationState))
      } catch {
        self.emit(type: "error", message: "登録コールバックの処理に失敗しました: \(error.localizedDescription)")
      }
    }
  }

  @objc public func startGlass(_ invoke: Invoke) throws {
    GlassCameraPlugin.ensureConfigured()
    let args = try invoke.parseArgs(StartGlassArgs.self)
    self.channel = args.channel

    Task { @MainActor in
      await self.startGlassSession(invoke)
    }
  }

  @objc public func capturePhoto(_ invoke: Invoke) throws {
    Task { @MainActor in
      let accepted = self.stream?.capturePhoto(format: .jpeg) ?? false
      invoke.resolve(["accepted": accepted])
    }
  }

  @objc public func stopGlass(_ invoke: Invoke) throws {
    Task { @MainActor in
      self.teardown()
      invoke.resolve()
    }
  }

  // MARK: - Session

  @MainActor
  private func startGlassSession(_ invoke: Invoke) async {
    let wearables = Wearables.shared

    watchRegistrationState()

    guard wearables.registrationState == .registered else {
      emit(type: "registration", value: String(describing: wearables.registrationState))
      invoke.reject("REGISTRATION_REQUIRED")
      return
    }

    do {
      var status = try await wearables.checkPermissionStatus(.camera)
      if status != .granted {
        status = try await wearables.requestPermission(.camera)
      }
      guard status == .granted else {
        invoke.reject("グラスのカメラ権限が許可されませんでした。")
        return
      }
    } catch {
      invoke.reject("グラスのカメラ権限を確認できませんでした: \(error.localizedDescription)")
      return
    }

    emit(type: "state", value: "connecting")

    let selector = self.deviceSelector ?? AutoDeviceSelector(wearables: wearables)
    self.deviceSelector = selector

    // Session creation races Bluetooth device discovery right after launch;
    // wait for the selector to surface an active device first.
    let deviceAvailable = await withTaskGroup(of: Bool.self) { group in
      group.addTask {
        for await device in selector.activeDeviceStream() {
          if device != nil {
            return true
          }
        }
        return false
      }
      group.addTask {
        try? await Task.sleep(nanoseconds: 12_000_000_000)
        return false
      }
      let first = await group.next() ?? false
      group.cancelAll()
      return first
    }

    guard deviceAvailable else {
      invoke.reject(
        "グラスが見つかりません。グラスの電源とBluetooth接続、Meta AIアプリでの接続状態を確認してください。")
      return
    }

    // The sample app surfaces device compatibility; without this check an
    // incompatible glasses build silently fails to stream.
    for deviceId in wearables.devices {
      guard let device = wearables.deviceForIdentifier(deviceId) else { continue }
      let compatibility = device.compatibility()
      switch compatibility {
      case .deviceUpdateRequired:
        invoke.reject(
          "グラス側のソフトウェア更新が必要です（\(device.nameOrId())）。Meta AIアプリで更新を確認してください。")
        return
      case .sdkUpdateRequired:
        invoke.reject("アプリ側のSDK更新が必要です（\(device.nameOrId())）。")
        return
      default:
        emit(type: "state", value: "compatibility:\(compatibility.displayString)")
      }
    }

    do {
      let session: DeviceSession
      if let existing = self.session, existing.state == .started {
        session = existing
      } else {
        // 前回の失敗セッションを確実に閉じてから作り直す（グラス側に
        // ゾンビセッションが残るとストリームがwaitingForDeviceで詰まる）。
        self.session?.stop()
        self.session = nil
        session = try wearables.createSession(deviceSelector: selector)
        self.session = session
        let stateStream = session.stateStream()
        try session.start()

        if session.state != .started {
          var started = false
          for await state in stateStream {
            if state == .started {
              started = true
              break
            }
            if state == .stopped {
              break
            }
          }
          guard started else {
            invoke.reject("グラスとのセッションを開始できませんでした。グラスの接続を確認してください。")
            self.session?.stop()
            self.session = nil
            return
          }
        }
      }

      // Surface session-level failures; without this watcher the stream can
      // die with no visible reason.
      let sessionErrors = session.errorStream()
      Task { @MainActor [weak self] in
        for await error in sessionErrors {
          self?.emit(
            type: "error",
            message: "セッション: \(error.localizedDescription) [\(String(describing: error))]")
        }
      }

      let config = StreamConfiguration(
        videoCodec: VideoCodec.raw,
        resolution: StreamingResolution.low,
        frameRate: 24
      )

      guard let stream = try session.addStream(config: config) else {
        invoke.reject("グラスカメラのストリームを作成できませんでした。")
        return
      }

      self.stream = stream
      setupStreamListeners(stream)
      stream.start()
      emit(type: "state", value: "waiting")
      invoke.resolve()
    } catch {
      invoke.reject(
        "グラスカメラの開始に失敗しました: \(error.localizedDescription) [\(String(describing: error))]")
    }
  }

  @MainActor
  private func setupStreamListeners(_ stream: MWDATCamera.Stream) {
    stateListenerToken = stream.statePublisher.listen { [weak self] state in
      Task { @MainActor in
        guard let self = self else { return }
        switch state {
        case .streaming:
          self.emit(type: "state", value: "streaming")
        case .stopped:
          self.emit(type: "state", value: "stopped")
          self.stream = nil
          self.stateListenerToken = nil
          self.errorListenerToken = nil
          self.photoDataListenerToken = nil
          self.videoFrameListenerToken = nil
        default:
          self.emit(type: "state", value: String(describing: state))
        }
      }
    }

    errorListenerToken = stream.errorPublisher.listen { [weak self] error in
      Task { @MainActor in
        self?.emit(type: "error", message: error.localizedDescription)
      }
    }

    photoDataListenerToken = stream.photoDataPublisher.listen { [weak self] photo in
      Task { @MainActor in
        guard let self = self else { return }
        let dataUrl = "data:image/jpeg;base64," + photo.data.base64EncodedString()
        self.emit(type: "photo", imageDataUrl: dataUrl)
      }
    }

    // The sample app always consumes video frames; without a frame listener
    // the stream never reaches (or does not stay in) the streaming state.
    // Also forward a throttled preview so the app can show a live view.
    videoFrameListenerToken = stream.videoFramePublisher.listen { [weak self] frame in
      Task { @MainActor in
        guard let self = self else { return }
        let now = Date().timeIntervalSince1970
        guard now - self.lastPreviewSentAt > 0.3 else { return }
        self.lastPreviewSentAt = now
        guard let image = frame.makeUIImage(),
          let data = image.jpegData(compressionQuality: 0.45)
        else { return }
        self.emit(
          type: "preview",
          imageDataUrl: "data:image/jpeg;base64," + data.base64EncodedString())
      }
    }
  }

  @MainActor
  private func watchRegistrationState() {
    guard registrationTask == nil else { return }
    registrationTask = Task { @MainActor in
      for await state in Wearables.shared.registrationStateStream() {
        self.emit(type: "registration", value: String(describing: state))
      }
    }
  }

  @MainActor
  private func teardown() {
    stream?.stop()
    stream = nil
    stateListenerToken = nil
    errorListenerToken = nil
    photoDataListenerToken = nil
    videoFrameListenerToken = nil
    session?.stop()
    session = nil
    channel = nil
  }

  private func emit(
    type: String, value: String? = nil, imageDataUrl: String? = nil, message: String? = nil
  ) {
    guard let channel = self.channel else { return }
    var event: JsonObject = ["type": type]
    if let value = value {
      event["value"] = value
    }
    if let imageDataUrl = imageDataUrl {
      event["imageDataUrl"] = imageDataUrl
    }
    if let message = message {
      event["message"] = message
    }
    channel.send(event)
  }
}

@_cdecl("init_plugin_glass_camera")
func initPlugin() -> Plugin {
  return GlassCameraPlugin()
}
