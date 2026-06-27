pub fn build_command(model_path: &str, ctx: i32, gpu_layers: i32) -> String {
    format!(
        "llama-server -m {} --ctx-size {} --gpu-layers {}",
        model_path, ctx, gpu_layers
    )
}
