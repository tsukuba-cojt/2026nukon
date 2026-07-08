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
pub use desktop::PhotoInbox;
#[cfg(mobile)]
pub use mobile::PhotoInbox;

/// Extension trait to access the photo inbox APIs from any Tauri manager type.
pub trait PhotoInboxExt<R: Runtime> {
    fn photo_inbox(&self) -> &PhotoInbox<R>;
}

impl<R: Runtime, T: Manager<R>> PhotoInboxExt<R> for T {
    fn photo_inbox(&self) -> &PhotoInbox<R> {
        self.state::<PhotoInbox<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("photo-inbox")
        .invoke_handler(tauri::generate_handler![
            commands::start_watching,
            commands::stop_watching
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let photo_inbox = mobile::init(app, api)?;
            #[cfg(desktop)]
            let photo_inbox = desktop::init(app, api)?;
            app.manage(photo_inbox);
            Ok(())
        })
        .build()
}
