#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod device;
mod models;
mod process;
mod recommend;
mod settings;

use device::DeviceProfile;
use models::ModelFile;
use process::{ProcessState, ProcessStatus};
use recommend::{LaunchParameters, LaunchRecommendation, RecommendationRequest};
use settings::AppSettings;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};

#[tauri::command]
fn load_settings() -> Result<AppSettings, String> {
    settings::load_settings()
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<AppSettings, String> {
    settings::save_settings(settings)
}

#[tauri::command]
fn detect_device() -> Result<DeviceProfile, String> {
    Ok(device::detect_device_profile())
}

#[tauri::command]
fn scan_models(directories: Vec<String>) -> Result<Vec<ModelFile>, String> {
    models::scan_model_directories(directories)
}

#[tauri::command]
fn inspect_model_file(path: String) -> Result<ModelFile, String> {
    models::inspect_model_file(path)
}

#[tauri::command]
fn recommend_launch(request: RecommendationRequest) -> Result<LaunchRecommendation, String> {
    let device = device::detect_device_profile();
    Ok(recommend::recommend_launch(&device, request))
}

#[tauri::command]
fn build_command(parameters: LaunchParameters) -> Result<String, String> {
    Ok(recommend::build_command_preview(&parameters))
}

#[tauri::command]
fn start_server(
    parameters: LaunchParameters,
    process_state: State<ProcessState>,
) -> Result<ProcessStatus, String> {
    process_state.start(parameters)
}

#[tauri::command]
fn stop_server(process_state: State<ProcessState>) -> Result<ProcessStatus, String> {
    process_state.stop()
}

#[tauri::command]
fn process_status(process_state: State<ProcessState>) -> Result<ProcessStatus, String> {
    process_state.status()
}

#[tauri::command]
fn get_logs(process_state: State<ProcessState>) -> Result<Vec<String>, String> {
    process_state.logs()
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show_menu_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit_menu_item = MenuItem::with_id(app, "quit", "退出软件", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_menu_item, &quit_menu_item])?;
    let Some(icon) = app.default_window_icon().cloned() else {
        return Ok(());
    };

    TrayIconBuilder::new()
        .tooltip("LlamaCPP Launcher")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ProcessState::default())
        .setup(|app| {
            build_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            detect_device,
            scan_models,
            inspect_model_file,
            recommend_launch,
            build_command,
            start_server,
            stop_server,
            process_status,
            get_logs
        ])
        .run(tauri::generate_context!())
        .expect("failed to run LLM Runtime Manager");
}
