use serde::{Deserialize, Serialize};

/// A new photo detected in the device photo library while watching.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPhotoEvent {
    /// JPEG data URL, downscaled to at most 1600px on the long edge.
    pub image_data_url: String,
    /// Milliseconds since the Unix epoch, when available.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub taken_at: Option<u64>,
    /// File or asset name, when available.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Which watcher produced the event.
    pub source: String,
}
