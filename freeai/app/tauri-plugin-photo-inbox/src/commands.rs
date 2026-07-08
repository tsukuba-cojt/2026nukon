use tauri::{command, ipc::Channel, AppHandle, Runtime};

use crate::{NewPhotoEvent, PhotoInboxExt, Result};

#[command]
pub(crate) async fn start_watching<R: Runtime>(
    app: AppHandle<R>,
    channel: Channel<NewPhotoEvent>,
) -> Result<()> {
    app.photo_inbox().start_watching(channel)
}

#[command]
pub(crate) async fn stop_watching<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.photo_inbox().stop_watching()
}
