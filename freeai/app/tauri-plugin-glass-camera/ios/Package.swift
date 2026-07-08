// swift-tools-version:5.9

// The Meta Wearables DAT SDK ships as binary xcframeworks, which `swift build`
// (used by tauri's swift-rs linker) cannot consume as SPM binary targets.
// Instead the device-slice frameworks are vendored under `Frameworks/` and
// referenced with -F; the app's Xcode project links and embeds them.

import PackageDescription

let package = Package(
  name: "tauri-plugin-glass-camera",
  platforms: [
    .iOS("15.2")
  ],
  products: [
    .library(
      name: "tauri-plugin-glass-camera",
      type: .static,
      targets: ["tauri-plugin-glass-camera"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-glass-camera",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources",
      swiftSettings: [
        .unsafeFlags(["-F", "Frameworks"])
      ],
      linkerSettings: [
        .unsafeFlags(["-F", "Frameworks"])
      ])
  ]
)
