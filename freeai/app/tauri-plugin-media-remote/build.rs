const COMMANDS: &[&str] = &["start_remote", "stop_remote"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
