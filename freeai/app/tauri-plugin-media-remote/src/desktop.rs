//! Desktop stub: media-key hijacking targets the phone + glasses pairing, so
//! on desktop `start_remote` succeeds but never emits events. Use the app's
//! keyboard fallback (Space) to exercise the capture pipeline in development.

use serde::de::DeserializeOwned;
use tauri::{ipc::Channel, plugin::PluginApi, AppHandle, Runtime};

use crate::models::RemoteTapEvent;

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<MediaRemote<R>> {
    Ok(MediaRemote {
        _marker: std::marker::PhantomData,
    })
}

/// Access to the media remote APIs on desktop (no-op).
pub struct MediaRemote<R: Runtime> {
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> MediaRemote<R> {
    pub fn start_remote(&self, _channel: Channel<RemoteTapEvent>) -> crate::Result<()> {
        Ok(())
    }

    pub fn stop_remote(&self) -> crate::Result<()> {
        Ok(())
    }
}
