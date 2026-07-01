use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::State;

const API_TIMEOUT_SECONDS: u64 = 25;
const DEFAULT_API_URL: &str = "http://127.0.0.1:8787";

struct AppState {
    http: reqwest::Client,
    api_url: String,
    client_token: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AskRequest {
    prompt: String,
    reference_text: String,
    reference_images: Vec<ReferenceImage>,
    image_data_url: String,
    trigger: CaptureTrigger,
    model: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReferenceImage {
    name: String,
    image_data_url: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
enum CaptureTrigger {
    MetaglassButton,
    AppButton,
    Keyboard,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AskResponse {
    answer: String,
    model: String,
    captured_at: String,
    trigger: CaptureTrigger,
    used_fallback: bool,
}

#[derive(Debug, Deserialize)]
struct ApiError {
    error: String,
}

#[tauri::command]
async fn ask_llm_about_capture(
    request: AskRequest,
    state: State<'_, AppState>,
) -> Result<AskResponse, String> {
    let endpoint = format!("{}/v1/ask", state.api_url.trim_end_matches('/'));
    let mut builder = state.http.post(endpoint).json(&request);

    if let Some(token) = &state.client_token {
        builder = builder.bearer_auth(token);
    }

    let response = builder
        .send()
        .await
        .map_err(|error| format!("API request failed: {error}"))?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|error| format!("API response read failed: {error}"))?;

    if !status.is_success() {
        let message = serde_json::from_str::<ApiError>(&response_text)
            .map(|body| body.error)
            .unwrap_or(response_text);
        return Err(format!("API returned {status}: {message}"));
    }

    serde_json::from_str::<AskResponse>(&response_text)
        .map_err(|error| format!("API response parse failed: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(API_TIMEOUT_SECONDS))
        .build()
        .expect("failed to build HTTP client");

    let api_url = std::env::var("STUDY_GLASS_API_URL")
        .ok()
        .or_else(|| option_env!("STUDY_GLASS_API_URL").map(ToOwned::to_owned))
        .unwrap_or_else(|| DEFAULT_API_URL.into());
    let client_token = std::env::var("STUDY_GLASS_CLIENT_TOKEN")
        .ok()
        .or_else(|| option_env!("STUDY_GLASS_CLIENT_TOKEN").map(ToOwned::to_owned))
        .filter(|value| !value.trim().is_empty());

    tauri::Builder::default()
        .manage(AppState {
            http,
            api_url,
            client_token,
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![ask_llm_about_capture])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
