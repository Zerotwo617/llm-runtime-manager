use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub server_path: String,
    pub model_directories: Vec<String>,
    pub last_model_path: Option<String>,
    pub last_mmproj_path: Option<String>,
    pub profile: String,
    pub host: String,
    pub port: u16,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            server_path: String::new(),
            model_directories: Vec::new(),
            last_model_path: None,
            last_mmproj_path: None,
            profile: "model_limit".to_string(),
            host: "0.0.0.0".to_string(),
            port: 8080,
        }
    }
}

pub fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

pub fn save_settings(settings: AppSettings) -> Result<AppSettings, String> {
    let path = settings_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let content = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())?;
    Ok(settings)
}

fn settings_path() -> Result<PathBuf, String> {
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .or_else(|_| std::env::current_dir())
        .map_err(|error| error.to_string())?;

    Ok(base
        .join("LLM Runtime Manager")
        .join("settings.json"))
}
