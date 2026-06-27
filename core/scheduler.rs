use crate::core::device::DeviceInfo;

pub struct LaunchConfig {
    pub gpu_layers: i32,
    pub ctx: i32,
    pub batch: i32,
}

pub fn generate_config(d: &DeviceInfo) -> LaunchConfig {
    let gpu_layers = if d.vram_gb >= 16 {
        80
    } else if d.vram_gb >= 8 {
        30
    } else {
        0
    };

    let ctx = if d.ram_gb >= 32 {
        8192
    } else if d.ram_gb >= 16 {
        4096
    } else {
        2048
    };

    LaunchConfig {
        gpu_layers,
        ctx,
        batch: 256,
    }
}
