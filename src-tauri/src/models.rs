use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
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

            models.push(model_file_from_path(path)?);
        }
    }

    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(models)
}

pub fn inspect_model_file(path: String) -> Result<ModelFile, String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("模型文件不存在。".to_string());
    }
    if !path.is_file() {
        return Err("选择的路径不是文件。".to_string());
    }
    if !is_gguf(&path) {
        return Err("请选择 .gguf 文件。".to_string());
    }

    model_file_from_path(&path)
}

fn model_file_from_path(path: &Path) -> Result<ModelFile, String> {
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

    Ok(ModelFile {
        path: path.to_string_lossy().to_string(),
        name,
        directory,
        size_mb: metadata.len() / 1024 / 1024,
        is_mmproj,
    })
}

fn is_gguf(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("gguf"))
        .unwrap_or(false)
}
