import AVFoundation
import MediaPlayer
import Tauri
import UIKit
import WebKit

class StartRemoteArgs: Decodable {
  let channel: Channel
}

class MediaRemotePlugin: Plugin {
  private var player: AVAudioPlayer?
  private var channel: Channel?
  private var commandsRegistered = false
  private var observersInstalled = false
  private var keepAliveTimer: Timer?
  private var volumeObservation: NSKeyValueObservation?
  private var lastVolume: Float = -1

  @objc public func startRemote(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StartRemoteArgs.self)

    DispatchQueue.main.async {
      do {
        let session = AVAudioSession.sharedInstance()
        // mixWithOthers: DATのオーディオ/ストリーム処理と排他にならないようにする。
        // 再生/一時停止のNow Playing取得は諦め、トリガーは音量スワイプに任せる。
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try session.setActive(true)

        // 重要: 無音でもA2DP再生があるとグラスがカメラストリーミングを
        // 開始できないため、音は一切再生しない。セッションをアクティブに
        // 保つだけで音量スワイプ（outputVolume KVO）は検知できる。
        self.channel = args.channel
        self.installObservers()
        self.startVolumeWatch()
        invoke.resolve()
      } catch {
        invoke.reject("オーディオセッションを開始できませんでした: \(error.localizedDescription)")
      }
    }
  }

  @objc public func stopRemote(_ invoke: Invoke) throws {
    DispatchQueue.main.async {
      self.channel = nil
      self.keepAliveTimer?.invalidate()
      self.keepAliveTimer = nil
      self.volumeObservation = nil
      self.player?.stop()
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      invoke.resolve()
    }
  }

  // MARK: - Keep the silent loop (and Now Playing status) alive

  private func installObservers() {
    guard !observersInstalled else { return }
    observersInstalled = true

    NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
    ) { [weak self] notification in
      let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
      let interruptionType = rawType.flatMap(AVAudioSession.InterruptionType.init)
      if interruptionType == .ended {
        self?.resumeSilence()
      }
    }

    NotificationCenter.default.addObserver(
      forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.resumeSilence()
    }
  }

  private func startKeepAlive() {
    keepAliveTimer?.invalidate()
    keepAliveTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
      guard let self = self, self.channel != nil else { return }
      self.resumeSilence()
    }
  }

  // Volume swipes on the glasses touchpad arrive as system volume changes
  // even when play/pause taps are consumed elsewhere; use them as a trigger.
  private func startVolumeWatch() {
    lastVolume = AVAudioSession.sharedInstance().outputVolume
    volumeObservation = AVAudioSession.sharedInstance().observe(\.outputVolume, options: [.new]) {
      [weak self] _, change in
      guard let self = self, let newVolume = change.newValue else { return }
      DispatchQueue.main.async {
        if abs(newVolume - self.lastVolume) > 0.001 {
          self.lastVolume = newVolume
          self.emit(action: "volume")
        }
      }
    }
  }

  private func resumeSilence() {
    guard channel != nil else { return }
    try? AVAudioSession.sharedInstance().setCategory(
      .playback, mode: .default, options: [.mixWithOthers])
    try? AVAudioSession.sharedInstance().setActive(true)
  }

  private func registerCommands() {
    guard !commandsRegistered else { return }
    commandsRegistered = true

    let center = MPRemoteCommandCenter.shared()
    let triggers: [(MPRemoteCommand, String)] = [
      (center.playCommand, "play"),
      (center.pauseCommand, "pause"),
      (center.togglePlayPauseCommand, "toggle"),
      (center.nextTrackCommand, "next"),
      (center.previousTrackCommand, "previous"),
    ]

    for (command, action) in triggers {
      command.isEnabled = true
      command.addTarget { [weak self] _ in
        guard let self = self else { return .commandFailed }
        self.emit(action: action)
        // Keep the silent loop rolling so this app stays the Now Playing target
        // even after a "pause" tap.
        self.player?.play()
        self.updateNowPlaying()
        return .success
      }
    }
  }

  private func emit(action: String) {
    guard let channel = self.channel else { return }
    let event: JsonObject = [
      "action": action,
      "at": Int(Date().timeIntervalSince1970 * 1000),
    ]
    channel.send(event)
  }

  private func updateNowPlaying() {
    MPNowPlayingInfoCenter.default().nowPlayingInfo = [
      MPMediaItemPropertyTitle: "Study Glass 待機中",
      MPMediaItemPropertyArtist: "グラスをタップすると撮影します",
      MPNowPlayingInfoPropertyPlaybackRate: 1.0,
      MPMediaItemPropertyPlaybackDuration: player?.duration ?? 1.0,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: player?.currentTime ?? 0.0,
    ]
  }

  // 1 second of 16-bit mono 8 kHz silence as an in-memory WAV file.
  private static func silentWavData() -> Data {
    let sampleRate = 8000
    let dataSize = sampleRate * 2
    var data = Data()

    func appendUInt32(_ value: UInt32) {
      withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
    }
    func appendUInt16(_ value: UInt16) {
      withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
    }

    data.append(contentsOf: Array("RIFF".utf8))
    appendUInt32(UInt32(36 + dataSize))
    data.append(contentsOf: Array("WAVE".utf8))
    data.append(contentsOf: Array("fmt ".utf8))
    appendUInt32(16)
    appendUInt16(1)
    appendUInt16(1)
    appendUInt32(UInt32(sampleRate))
    appendUInt32(UInt32(sampleRate * 2))
    appendUInt16(2)
    appendUInt16(16)
    data.append(contentsOf: Array("data".utf8))
    appendUInt32(UInt32(dataSize))
    data.append(Data(count: dataSize))

    return data
  }
}

@_cdecl("init_plugin_media_remote")
func initPlugin() -> Plugin {
  return MediaRemotePlugin()
}
