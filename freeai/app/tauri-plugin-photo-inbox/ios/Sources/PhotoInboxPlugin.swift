import Photos
import Tauri
import UIKit
import WebKit

class StartWatchingArgs: Decodable {
  let channel: Channel
}

class PhotoInboxPlugin: Plugin, PHPhotoLibraryChangeObserver {
  private let maxEdgePixels: CGFloat = 1600
  private let jpegQuality: CGFloat = 0.8

  private var channel: Channel?
  private var fetchResult: PHFetchResult<PHAsset>?
  private var isRegistered = false

  private func requestPhotoAuthorization(_ completion: @escaping (Bool) -> Void) {
    if #available(iOS 14, *) {
      PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
        completion(status == .authorized || status == .limited)
      }
    } else {
      PHPhotoLibrary.requestAuthorization { status in
        completion(status == .authorized)
      }
    }
  }

  @objc public func startWatching(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StartWatchingArgs.self)

    requestPhotoAuthorization { granted in
      guard granted else {
        invoke.reject("Photo library permission was denied.")
        return
      }

      DispatchQueue.main.async {
        self.channel = args.channel

        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        self.fetchResult = PHAsset.fetchAssets(with: .image, options: options)

        if !self.isRegistered {
          PHPhotoLibrary.shared().register(self)
          self.isRegistered = true
        }

        invoke.resolve()
      }
    }
  }

  @objc public func stopWatching(_ invoke: Invoke) throws {
    channel = nil
    fetchResult = nil
    invoke.resolve()
  }

  public func photoLibraryDidChange(_ changeInstance: PHChange) {
    guard let fetchResult = self.fetchResult,
      let details = changeInstance.changeDetails(for: fetchResult)
    else { return }

    self.fetchResult = details.fetchResultAfterChanges

    guard let channel = self.channel else { return }

    for asset in details.insertedObjects {
      emit(asset: asset, to: channel)
    }
  }

  private func emit(asset: PHAsset, to channel: Channel) {
    let options = PHImageRequestOptions()
    options.deliveryMode = .highQualityFormat
    options.isNetworkAccessAllowed = true
    options.resizeMode = .exact

    let width = CGFloat(asset.pixelWidth)
    let height = CGFloat(asset.pixelHeight)
    let scale = min(1, maxEdgePixels / max(width, height, 1))
    let targetSize = CGSize(width: width * scale, height: height * scale)

    PHImageManager.default().requestImage(
      for: asset,
      targetSize: targetSize,
      contentMode: .aspectFit,
      options: options
    ) { image, _ in
      guard let image = image,
        let data = image.jpegData(compressionQuality: self.jpegQuality)
      else { return }

      var event: JsonObject = [
        "imageDataUrl": "data:image/jpeg;base64," + data.base64EncodedString(),
        "source": "ios_photo_library",
      ]
      if let creationDate = asset.creationDate {
        event["takenAt"] = Int(creationDate.timeIntervalSince1970 * 1000)
      }

      channel.send(event)
    }
  }
}

@_cdecl("init_plugin_photo_inbox")
func initPlugin() -> Plugin {
  return PhotoInboxPlugin()
}
