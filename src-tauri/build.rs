fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut resource = winresource::WindowsResource::new();
        resource.set_icon("icons/icon.ico");
        resource.compile().expect("failed to embed Windows icon");
    }

    tauri_build::build();
}
