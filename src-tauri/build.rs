fn main() {
    #[cfg(windows)]
    let _ = embed_resource::compile("app-icon.rc", embed_resource::NONE);

    tauri_build::build();
}
