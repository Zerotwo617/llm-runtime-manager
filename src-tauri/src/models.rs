use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize)]
pub struct ModelFile {
    pub path: String,
    pub name: String,
    pub directory: String,
    pub size_mb: u64,
    pub is_mmproj: bool,
}

pub fn scan_model_directories(directories: Vec<String>) -> Result<Vec<ModelFile>, String> {
    let mut models = Vec::new();

    for directory in directories {
        let root = PathBuf::from(&directory);
        if !root.exists() {
            continue;
        }
        if !root.is_dir() {
            continue;
        }

        for entry in WalkDir::new(&root)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let path = entry.path();
            if !is_gguf(path) {
                continue;
            }

            let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown.gguf")
                .to_string();
            let directory = path
                .parent()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_string();
            let is_mmproj = name.to_lowercase().contains("mmproj");

            models.push(ModelFile {
                path: path.to_string_lossy().to_string(),
                name,
                directory,
                size_mb: metadata.len() / 1024 / 1024,
                is_mmproj,
            });
        }
    }

    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(models)
}

fn is_gguf(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("gguf"))
        .unwrap_or(false)
}
