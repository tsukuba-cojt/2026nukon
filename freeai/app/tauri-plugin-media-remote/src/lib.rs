use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
pub use desktop::MediaRemote;
#[cfg(mobile)]
pub use mobile::MediaRemote;

/// Extension trait to access the media remote APIs from any Tauri manager type.
pub trait MediaRemoteExt<R: Runtime> {
    fn media_remote(&self) -> &MediaRemote<R>;
}

impl<R: Runtime, T: Manager<R>> MediaRemoteExt<R> for T {
    fn media_remote(&self) -> &MediaRemote<R> {
        self.state::<MediaRemote<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("media-remote")
        .invoke_handler(tauri::generate_handler![
            commands::start_remote,
            commands::stop_remote
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let media_remote = mobile::init(app, api)?;
            #[cfg(desktop)]
            let media_remote = desktop::init(app, api)?;
            app.manage(media_remote);
            Ok(())
        })
        .build()
}
