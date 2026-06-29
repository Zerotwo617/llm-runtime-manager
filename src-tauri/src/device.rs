use serde::Serialize;
use std::process::Command;
use sysinfo::System;

#[derive(Debug, Clone, Serialize)]
pub struct GpuInfo {
    pub name: String,
    pub backend: String,
    pub total_vram_mb: u64,
    pub free_vram_mb: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceProfile {
    pub cpu_logical_threads: usize,
    pub total_ram_mb: u64,
    pub available_ram_mb: u64,
    pub gpus: Vec<GpuInfo>,
    pub notes: Vec<String>,
}

pub fn detect_device_profile() -> DeviceProfile {
    let mut system = System::new_all();
    system.refresh_all();

    let mut notes = Vec::new();
    let gpus = match detect_nvidia_gpus() {
        Ok(gpus) if !gpus.is_empty() => gpus,
        Ok(_) => {
            notes.push("未检测到 NVIDIA GPU，将使用 CPU fallback 或手动参数。".to_string());
            Vec::new()
        }
        Err(error) => {
            notes.push(format!("nvidia-smi 不可用或检测失败：{error}"));
            Vec::new()
        }
    };

    DeviceProfile {
        cpu_logical_threads: system.cpus().len(),
        total_ram_mb: system.total_memory() / 1024 / 1024,
        available_ram_mb: system.available_memory() / 1024 / 1024,
        gpus,
        notes,
    }
}

fn detect_nvidia_gpus() -> Result<Vec<GpuInfo>, String> {
    let output = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total,memory.free",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let gpus = stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<_> = line.split(',').map(str::trim).collect();
            if parts.len() < 3 {
                return None;
            }

            let total_vram_mb = parts[1].parse::<u64>().ok()?;
            let free_vram_mb = parts[2].parse::<u64>().ok();

            Some(GpuInfo {
                name: parts[0].to_string(),
                backend: "nvidia".to_string(),
                total_vram_mb,
                free_vram_mb,
            })
        })
        .collect();

    Ok(gpus)
}
