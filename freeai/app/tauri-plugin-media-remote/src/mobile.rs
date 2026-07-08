use serde::{de::DeserializeOwned, Serialize};
use tauri::{
    ipc::Channel,
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::RemoteTapEvent;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.nukon.mediaremote";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_media_remote);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<MediaRemote<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "MediaRemotePlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_media_remote)?;
    Ok(MediaRemote(handle))
}

/// Access to the media remote APIs on mobile.
pub struct MediaRemote<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct StartRemotePayload {
    channel: Channel<RemoteTapEvent>,
}

impl<R: Runtime> MediaRemote<R> {
    pub fn start_remote(&self, channel: Channel<RemoteTapEvent>) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("startRemote", StartRemotePayload { channel })
            .map_err(Into::into)
    }

    pub fn stop_remote(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("stopRemote", ())
            .map_err(Into::into)
    }
}
