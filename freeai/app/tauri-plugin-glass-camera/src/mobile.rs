use serde::{de::DeserializeOwned, Serialize};
use tauri::{
    ipc::Channel,
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::{CapturePhotoResponse, GlassEvent, RegistrationStateResponse};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.nukon.glasscamera";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_glass_camera);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<GlassCamera<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "GlassCameraPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_glass_camera)?;
    Ok(GlassCamera(handle))
}

/// Access to the glass camera APIs on mobile.
pub struct GlassCamera<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct StartGlassPayload {
    channel: Channel<GlassEvent>,
}

#[derive(Serialize)]
struct HandleUrlPayload {
    url: String,
}

impl<R: Runtime> GlassCamera<R> {
    pub fn start_glass(&self, channel: Channel<GlassEvent>) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("startGlass", StartGlassPayload { channel })
            .map_err(Into::into)
    }

    pub fn stop_glass(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("stopGlass", ())
            .map_err(Into::into)
    }

    pub fn capture_photo(&self) -> crate::Result<CapturePhotoResponse> {
        self.0
            .run_mobile_plugin("capturePhoto", ())
            .map_err(Into::into)
    }

    pub fn start_registration(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("startRegistration", ())
            .map_err(Into::into)
    }

    pub fn registration_state(&self) -> crate::Result<RegistrationStateResponse> {
        self.0
            .run_mobile_plugin("registrationState", ())
            .map_err(Into::into)
    }

    pub fn handle_url(&self, url: String) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("handleUrl", HandleUrlPayload { url })
            .map_err(Into::into)
    }
}
