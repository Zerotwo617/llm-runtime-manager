use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use sysinfo::System;

const NVIDIA_SMI_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub backend: String,
    pub total_vram_mb: u64,
    pub free_vram_mb: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
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
    let output = command_output_with_timeout(
        Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total,memory.free",
            "--format=csv,noheader,nounits",
        ]),
        NVIDIA_SMI_TIMEOUT,
    )?;

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

fn command_output_with_timeout(command: &mut Command, timeout: Duration) -> Result<std::process::Output, String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let started_at = Instant::now();

    loop {
        if child.try_wait().map_err(|error| error.to_string())?.is_some() {
            return child.wait_with_output().map_err(|error| error.to_string());
        }

        if started_at.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err("nvidia-smi 检测超时。".to_string());
        }

        thread::sleep(Duration::from_millis(50));
    }
}
