// swift-tools-version:5.3

import PackageDescription

let package = Package(
  name: "tauri-plugin-photo-inbox",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v14),
  ],
  products: [
    .library(
      name: "tauri-plugin-photo-inbox",
      type: .static,
      targets: ["tauri-plugin-photo-inbox"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-photo-inbox",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
