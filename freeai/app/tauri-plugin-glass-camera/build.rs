const COMMANDS: &[&str] = &[
    "start_glass",
    "stop_glass",
    "capture_photo",
    "start_registration",
    "registration_state",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();

    // The vendored MWDAT dynamic frameworks must be visible when the Rust
    // library is linked; the app's Xcode project embeds them into the bundle.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        println!("cargo:rustc-link-search=framework={manifest_dir}/ios/Frameworks");
        println!("cargo:rustc-link-lib=framework=MWDATCore");
        println!("cargo:rustc-link-lib=framework=MWDATCamera");
    }
}
