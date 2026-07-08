use serde::{de::DeserializeOwned, Serialize};
use tauri::{
    ipc::Channel,
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::NewPhotoEvent;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.nukon.photoinbox";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_photo_inbox);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<PhotoInbox<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "PhotoInboxPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_photo_inbox)?;
    Ok(PhotoInbox(handle))
}

/// Access to the photo inbox APIs on mobile.
pub struct PhotoInbox<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct StartWatchingPayload {
    channel: Channel<NewPhotoEvent>,
}

impl<R: Runtime> PhotoInbox<R> {
    pub fn start_watching(&self, channel: Channel<NewPhotoEvent>) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("startWatching", StartWatchingPayload { channel })
            .map_err(Into::into)
    }

    pub fn stop_watching(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("stopWatching", ())
            .map_err(Into::into)
    }
}
