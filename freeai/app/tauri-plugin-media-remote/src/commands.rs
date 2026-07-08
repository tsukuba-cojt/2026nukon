use tauri::{command, ipc::Channel, AppHandle, Runtime};

use crate::{MediaRemoteExt, RemoteTapEvent, Result};

#[command]
pub(crate) async fn start_remote<R: Runtime>(
    app: AppHandle<R>,
    channel: Channel<RemoteTapEvent>,
) -> Result<()> {
    app.media_remote().start_remote(channel)
}

#[command]
pub(crate) async fn stop_remote<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.media_remote().stop_remote()
}
