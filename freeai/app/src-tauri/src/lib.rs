use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::State;

// Generous because the Codex agent backend can take tens of seconds per answer.
const API_TIMEOUT_SECONDS: u64 = 100;
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
    // Runtime override from the app settings; build-time env baking does not
    // survive the Xcode script phase reliably.
    #[serde(default)]
    api_url: Option<String>,
    #[serde(default)]
    client_token: Option<String>,
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

fn read_config_value(name: &str, build_value: Option<&str>) -> Option<String> {
    std::env::var(name)
        .ok()
        .or_else(|| build_value.map(ToOwned::to_owned))
        .filter(|value| !value.trim().is_empty())
}

fn validate_runtime_config(api_url: &str, client_token: &Option<String>) {
    let is_local_api = api_url.contains("127.0.0.1") || api_url.contains("localhost");

    if cfg!(all(mobile, not(debug_assertions))) && is_local_api {
        panic!(
            "STUDY_GLASS_API_URL must point to an HTTPS production API for release mobile builds."
        );
    }

    if cfg!(all(mobile, not(debug_assertions))) && client_token.is_none() {
        panic!("STUDY_GLASS_CLIENT_TOKEN must be embedded for release mobile builds.");
    }
}

#[tauri::command]
async fn ask_llm_about_capture(
    request: AskRequest,
    state: State<'_, AppState>,
) -> Result<AskResponse, String> {
    let api_url = request
        .api_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&state.api_url);
    let endpoint = format!("{}/v1/ask", api_url.trim_end_matches('/'));

    let token = request
        .client_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| state.client_token.clone());

    let mut builder = state.http.post(endpoint).json(&request);

    if let Some(token) = token {
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

    let api_url = read_config_value("STUDY_GLASS_API_URL", option_env!("STUDY_GLASS_API_URL"))
        .unwrap_or_else(|| DEFAULT_API_URL.into());
    let client_token = read_config_value(
        "STUDY_GLASS_CLIENT_TOKEN",
        option_env!("STUDY_GLASS_CLIENT_TOKEN"),
    );

    validate_runtime_config(&api_url, &client_token);

    tauri::Builder::default()
        .manage(AppState {
            http,
            api_url,
            client_token,
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_photo_inbox::init())
        .plugin(tauri_plugin_media_remote::init())
        .plugin(tauri_plugin_glass_camera::init())
        .invoke_handler(tauri::generate_handler![ask_llm_about_capture])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
