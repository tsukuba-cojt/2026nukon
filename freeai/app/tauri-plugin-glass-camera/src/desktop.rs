//! Desktop stub: the Meta Wearables Device Access Toolkit is mobile-only.
//! Commands fail with a clear message so the frontend can fall back.

use serde::de::DeserializeOwned;
use tauri::{ipc::Channel, plugin::PluginApi, AppHandle, Runtime};

use crate::models::{CapturePhotoResponse, GlassEvent, RegistrationStateResponse};
use crate::Error;

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<GlassCamera<R>> {
    Ok(GlassCamera {
        _marker: std::marker::PhantomData,
    })
}

/// Access to the glass camera APIs on desktop (unsupported).
pub struct GlassCamera<R: Runtime> {
    _marker: std::marker::PhantomData<fn() -> R>,
}

const UNSUPPORTED: &str = "グラスカメラはiOS/Androidアプリでのみ利用できます。";

impl<R: Runtime> GlassCamera<R> {
    pub fn start_glass(&self, _channel: Channel<GlassEvent>) -> crate::Result<()> {
        Err(Error::Glass(UNSUPPORTED.into()))
    }

    pub fn stop_glass(&self) -> crate::Result<()> {
        Ok(())
    }

    pub fn capture_photo(&self) -> crate::Result<CapturePhotoResponse> {
        Err(Error::Glass(UNSUPPORTED.into()))
    }

    pub fn start_registration(&self) -> crate::Result<()> {
        Err(Error::Glass(UNSUPPORTED.into()))
    }

    pub fn registration_state(&self) -> crate::Result<RegistrationStateResponse> {
        Ok(RegistrationStateResponse {
            state: "unsupported".into(),
        })
    }

    pub fn handle_url(&self, _url: String) -> crate::Result<()> {
        Ok(())
    }
}
