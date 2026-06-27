pub struct DeviceInfo {
    pub cpu_cores: usize,
    pub ram_gb: usize,
    pub vram_gb: usize,
}

pub fn detect_device() -> DeviceInfo {
    DeviceInfo {
        cpu_cores: 8,
        ram_gb: 16,
        vram_gb: 8,
    }
}
