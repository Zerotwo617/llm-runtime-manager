use crate::device::DeviceProfile;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedModel {
    pub path: String,
    pub name: String,
    pub size_mb: u64,
    pub is_mmproj: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationRequest {
    pub server_path: String,
    pub model: SelectedModel,
    pub mmproj_path: Option<String>,
    pub profile: LaunchProfile,
    pub host: String,
    pub port: u16,
    pub extra_args: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LaunchProfile {
    ModelLimit,
    Balanced,
    Conservative,
    Custom,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchParameters {
    pub server_path: String,
    pub model_path: String,
    pub mmproj_path: Option<String>,
    pub image_min_tokens: Option<u32>,
    pub gpu_layers: i32,
    pub cpu_moe: Option<u32>,
    pub flash_attn: bool,
    pub jinja: bool,
    pub context_size: u32,
    pub threads: u32,
    pub threads_batch: u32,
    pub batch_size: u32,
    pub ubatch_size: u32,
    pub cache_type_k: Option<String>,
    pub cache_type_v: Option<String>,
    pub no_mmap: bool,
    pub mlock: bool,
    pub parallel: u32,
    pub host: String,
    pub port: u16,
    pub extra_args: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRecommendation {
    pub parameters: LaunchParameters,
    pub command_preview: String,
    pub explanations: Vec<String>,
}

pub fn recommend_launch(
    device: &DeviceProfile,
    request: RecommendationRequest,
) -> LaunchRecommendation {
    let primary_gpu = device.gpus.first();
    let total_vram_mb = primary_gpu.map(|gpu| gpu.total_vram_mb).unwrap_or(0);
    let total_ram_mb = device.total_ram_mb;
    let logical_threads = device.cpu_logical_threads.max(1) as u32;
    let model_size_mb = request.model.size_mb;

    let mut explanations = Vec::new();
    let has_nvidia = primary_gpu
        .map(|gpu| gpu.backend == "nvidia" && gpu.total_vram_mb > 0)
        .unwrap_or(false);

    let gpu_layers = if has_nvidia { 999 } else { 0 };
    if has_nvidia {
        explanations.push("检测到 NVIDIA GPU，使用 -ngl 999 让 llama.cpp 自动按模型层数封顶。".to_string());
    } else {
        explanations.push("未检测到 NVIDIA GPU，推荐 CPU fallback，gpu layers 设为 0。".to_string());
    }

    let context_size = choose_context_size(
        &request.profile,
        total_vram_mb,
        total_ram_mb,
        model_size_mb,
        request.mmproj_path.is_some(),
    );
    explanations.push(format!(
        "上下文根据模式、显存、内存和模型大小估算为 {} tokens。",
        context_size
    ));

    let (batch_size, ubatch_size) = choose_batch_sizes(&request.profile, total_vram_mb, has_nvidia);
    explanations.push(format!(
        "batch/ubatch 设置为 {batch_size}/{ubatch_size}，用于控制吞吐和显存压力。"
    ));

    let threads = logical_threads.saturating_sub(2).max(4);
    let threads_batch = logical_threads.max(threads);
    explanations.push(format!(
        "CPU 线程使用 {}，批处理线程使用 {}，为系统保留少量余量。",
        threads, threads_batch
    ));

    let use_quantized_kv = context_size >= 32_768 || request.profile == LaunchProfile::ModelLimit;
    if use_quantized_kv {
        explanations.push("大上下文模式启用 q4_0 KV cache，优先降低显存/内存占用。".to_string());
    }

    let parameters = LaunchParameters {
        server_path: request.server_path,
        model_path: request.model.path,
        mmproj_path: request.mmproj_path,
        image_min_tokens: if request.profile == LaunchProfile::Conservative {
            None
        } else {
            Some(1024)
        },
        gpu_layers,
        cpu_moe: if has_nvidia { Some(16) } else { None },
        flash_attn: has_nvidia && request.profile != LaunchProfile::Conservative,
        jinja: true,
        context_size,
        threads,
        threads_batch,
        batch_size,
        ubatch_size,
        cache_type_k: if use_quantized_kv {
            Some("q4_0".to_string())
        } else {
            None
        },
        cache_type_v: if use_quantized_kv {
            Some("q4_0".to_string())
        } else {
            None
        },
        no_mmap: request.profile == LaunchProfile::ModelLimit,
        mlock: request.profile == LaunchProfile::ModelLimit && total_ram_mb >= 32 * 1024,
        parallel: 1,
        host: request.host,
        port: request.port,
        extra_args: request.extra_args,
    };

    let command_preview = build_command_preview(&parameters);

    LaunchRecommendation {
        parameters,
        command_preview,
        explanations,
    }
}

pub fn build_command_preview(parameters: &LaunchParameters) -> String {
    build_command_parts(parameters)
        .into_iter()
        .map(|part| quote_if_needed(&part))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn build_command_parts(parameters: &LaunchParameters) -> Vec<String> {
    let mut args = vec![
        parameters.server_path.clone(),
        "-m".to_string(),
        parameters.model_path.clone(),
    ];

    if let Some(mmproj_path) = &parameters.mmproj_path {
        if !mmproj_path.trim().is_empty() {
            args.push("--mmproj".to_string());
            args.push(mmproj_path.clone());
        }
    }

    if parameters.mmproj_path.is_some() {
        if let Some(image_min_tokens) = parameters.image_min_tokens {
            args.push("--image-min-tokens".to_string());
            args.push(image_min_tokens.to_string());
        }
    }

    args.extend([
        "-ngl".to_string(),
        parameters.gpu_layers.to_string(),
    ]);

    if let Some(cpu_moe) = parameters.cpu_moe {
        args.push("--n-cpu-moe".to_string());
        args.push(cpu_moe.to_string());
    }

    if parameters.flash_attn {
        args.push("--flash-attn".to_string());
        args.push("on".to_string());
    }

    if parameters.jinja {
        args.push("--jinja".to_string());
    }

    args.extend([
        "-c".to_string(),
        parameters.context_size.to_string(),
        "-t".to_string(),
        parameters.threads.to_string(),
        "-tb".to_string(),
        parameters.threads_batch.to_string(),
        "-b".to_string(),
        parameters.batch_size.to_string(),
        "-ub".to_string(),
        parameters.ubatch_size.to_string(),
    ]);

    if let Some(cache_type_k) = &parameters.cache_type_k {
        args.push("--cache-type-k".to_string());
        args.push(cache_type_k.clone());
    }

    if let Some(cache_type_v) = &parameters.cache_type_v {
        args.push("--cache-type-v".to_string());
        args.push(cache_type_v.clone());
    }

    if parameters.no_mmap {
        args.push("--no-mmap".to_string());
    }

    if parameters.mlock {
        args.push("--mlock".to_string());
    }

    args.extend([
        "-np".to_string(),
        parameters.parallel.to_string(),
        "--host".to_string(),
        parameters.host.clone(),
        "--port".to_string(),
        parameters.port.to_string(),
    ]);

    args.extend(parameters.extra_args.split_whitespace().map(str::to_string));
    args
}

fn choose_context_size(
    profile: &LaunchProfile,
    total_vram_mb: u64,
    total_ram_mb: u64,
    model_size_mb: u64,
    has_mmproj: bool,
) -> u32 {
    let mut context = match profile {
        LaunchProfile::ModelLimit => {
            if total_vram_mb >= 22 * 1024 && total_ram_mb >= 48 * 1024 {
                128_000
            } else if total_vram_mb >= 16 * 1024 && total_ram_mb >= 32 * 1024 {
                128_000
            } else if total_vram_mb >= 12 * 1024 && total_ram_mb >= 24 * 1024 {
                65_536
            } else if total_vram_mb >= 8 * 1024 && total_ram_mb >= 16 * 1024 {
                32_768
            } else {
                8_192
            }
        }
        LaunchProfile::Balanced => {
            if total_vram_mb >= 16 * 1024 && total_ram_mb >= 32 * 1024 {
                65_536
            } else if total_vram_mb >= 8 * 1024 && total_ram_mb >= 16 * 1024 {
                32_768
            } else {
                8_192
            }
        }
        LaunchProfile::Conservative => {
            if total_ram_mb >= 16 * 1024 {
                8_192
            } else {
                4_096
            }
        }
        LaunchProfile::Custom => 32_768,
    };

    if model_size_mb >= 14 * 1024 && total_vram_mb < 16 * 1024 {
        context = context.min(32_768);
    }

    if has_mmproj && total_vram_mb < 12 * 1024 {
        context = context.min(16_384);
    }

    context
}

fn choose_batch_sizes(profile: &LaunchProfile, total_vram_mb: u64, has_nvidia: bool) -> (u32, u32) {
    if !has_nvidia {
        return (512, 128);
    }

    match profile {
        LaunchProfile::ModelLimit => {
            if total_vram_mb >= 16 * 1024 {
                (4096, 1024)
            } else if total_vram_mb >= 8 * 1024 {
                (2048, 512)
            } else {
                (512, 128)
            }
        }
        LaunchProfile::Balanced => {
            if total_vram_mb >= 16 * 1024 {
                (2048, 512)
            } else {
                (1024, 256)
            }
        }
        LaunchProfile::Conservative => (512, 128),
        LaunchProfile::Custom => (1024, 256),
    }
}

fn quote_if_needed(value: &str) -> String {
    if value.contains(' ') || value.contains('\\') {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        value.to_string()
    }
}
