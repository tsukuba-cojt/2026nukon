use serde::{Deserialize, Serialize};

/// A media-key press received while the silent keep-alive track is playing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteTapEvent {
    /// Which command arrived: "play", "pause", "toggle", or "next".
    pub action: String,
    /// Milliseconds since the Unix epoch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<u64>,
}
