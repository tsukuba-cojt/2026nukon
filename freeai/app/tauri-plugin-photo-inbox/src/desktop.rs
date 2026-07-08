//! Desktop fallback: polls a local folder for new image files so the whole
//! Metaglass flow can be exercised without a phone. Drop a JPEG into the
//! watched folder (default `~/Pictures/metaglass-inbox`, override with
//! `STUDY_GLASS_INBOX_DIR`) to simulate a glasses capture.

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::Engine;
use serde::de::DeserializeOwned;
use tauri::{ipc::Channel, plugin::PluginApi, AppHandle, Runtime};

use crate::models::NewPhotoEvent;

const POLL_INTERVAL: Duration = Duration::from_millis(700);
// Skip files modified very recently so partially written files are not read.
const SETTLE_TIME: Duration = Duration::from_millis(1200);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<PhotoInbox<R>> {
    Ok(PhotoInbox {
        _marker: std::marker::PhantomData,
        generation: Arc::new(AtomicU64::new(0)),
    })
}

/// Access to the photo inbox APIs on desktop (folder watcher fallback).
pub struct PhotoInbox<R: Runtime> {
    _marker: std::marker::PhantomData<fn() -> R>,
    generation: Arc<AtomicU64>,
}

fn inbox_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("STUDY_GLASS_INBOX_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    Path::new(&home).join("Pictures").join("metaglass-inbox")
}

fn is_image_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp")
    )
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        _ => "image/jpeg",
    }
}

fn list_image_files(dir: &Path) -> Vec<PathBuf> {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .map(|entry| entry.path())
                .filter(|path| path.is_file() && is_image_file(path))
                .collect()
        })
        .unwrap_or_default()
}

fn has_settled(path: &Path) -> bool {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map(|modified| {
            SystemTime::now()
                .duration_since(modified)
                .map(|age| age >= SETTLE_TIME)
                .unwrap_or(false)
        })
        .unwrap_or(false)
}

fn event_for(path: &Path) -> Option<NewPhotoEvent> {
    let bytes = fs::read(path).ok()?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let taken_at = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|since_epoch| since_epoch.as_millis() as u64);

    Some(NewPhotoEvent {
        image_data_url: format!("data:{};base64,{encoded}", mime_for(path)),
        taken_at,
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned()),
        source: "desktop_folder".into(),
    })
}

impl<R: Runtime> PhotoInbox<R> {
    pub fn start_watching(&self, channel: Channel<NewPhotoEvent>) -> crate::Result<()> {
        let dir = inbox_dir();
        fs::create_dir_all(&dir)?;

        // Bumping the generation stops any previously spawned watcher loop.
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let generation_ref = self.generation.clone();

        thread::spawn(move || {
            let mut seen: HashSet<PathBuf> = list_image_files(&dir).into_iter().collect();

            while generation_ref.load(Ordering::SeqCst) == generation {
                for path in list_image_files(&dir) {
                    if seen.contains(&path) || !has_settled(&path) {
                        continue;
                    }
                    seen.insert(path.clone());
                    if let Some(event) = event_for(&path) {
                        if channel.send(event).is_err() {
                            return;
                        }
                    }
                }
                thread::sleep(POLL_INTERVAL);
            }
        });

        Ok(())
    }

    pub fn stop_watching(&self) -> crate::Result<()> {
        self.generation.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }
}
