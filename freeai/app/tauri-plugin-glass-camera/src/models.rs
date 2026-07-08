use serde::{Deserialize, Serialize};

/// An event emitted by the glasses camera session.
///
/// `type` is one of:
/// - `"state"`: stream state changed, `value` = connecting/waiting/streaming/stopped
/// - `"registration"`: registration state changed, `value` = registered/registering/available
/// - `"photo"`: a captured photo arrived, `imageDataUrl` is set
/// - `"error"`: a stream error occurred, `message` is set
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlassEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_data_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationStateResponse {
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePhotoResponse {
    pub accepted: bool,
}
