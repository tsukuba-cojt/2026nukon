// swift-tools-version:5.3

import PackageDescription

let package = Package(
  name: "tauri-plugin-media-remote",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v14),
  ],
  products: [
    .library(
      name: "tauri-plugin-media-remote",
      type: .static,
      targets: ["tauri-plugin-media-remote"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-media-remote",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
