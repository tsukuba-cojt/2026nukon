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
pub use desktop::GlassCamera;
#[cfg(mobile)]
pub use mobile::GlassCamera;

/// Extension trait to access the glass camera APIs from any Tauri manager type.
pub trait GlassCameraExt<R: Runtime> {
    fn glass_camera(&self) -> &GlassCamera<R>;
}

impl<R: Runtime, T: Manager<R>> GlassCameraExt<R> for T {
    fn glass_camera(&self) -> &GlassCamera<R> {
        self.state::<GlassCamera<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("glass-camera")
        .invoke_handler(tauri::generate_handler![
            commands::start_glass,
            commands::stop_glass,
            commands::capture_photo,
            commands::start_registration,
            commands::registration_state
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let glass_camera = mobile::init(app, api)?;
            #[cfg(desktop)]
            let glass_camera = desktop::init(app, api)?;
            app.manage(glass_camera);
            Ok(())
        })
        .on_event(|_app, _event| {
            // The Meta AI app calls back into this app with a custom-scheme URL
            // after the registration flow; forward it to the DAT SDK.
            #[cfg(target_os = "ios")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let glass_camera = _app.state::<GlassCamera<R>>();
                for url in urls {
                    if let Err(error) = glass_camera.handle_url(url.to_string()) {
                        eprintln!("glass-camera: failed to handle url: {error}");
                    }
                }
            }
        })
        .build()
}
