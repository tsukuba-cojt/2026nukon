use tauri::{command, ipc::Channel, AppHandle, Runtime};

use crate::{CapturePhotoResponse, GlassCameraExt, GlassEvent, RegistrationStateResponse, Result};

#[command]
pub(crate) async fn start_glass<R: Runtime>(
    app: AppHandle<R>,
    channel: Channel<GlassEvent>,
) -> Result<()> {
    app.glass_camera().start_glass(channel)
}

#[command]
pub(crate) async fn stop_glass<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.glass_camera().stop_glass()
}

#[command]
pub(crate) async fn capture_photo<R: Runtime>(app: AppHandle<R>) -> Result<CapturePhotoResponse> {
    app.glass_camera().capture_photo()
}

#[command]
pub(crate) async fn start_registration<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.glass_camera().start_registration()
}

#[command]
pub(crate) async fn registration_state<R: Runtime>(
    app: AppHandle<R>,
) -> Result<RegistrationStateResponse> {
    app.glass_camera().registration_state()
}
