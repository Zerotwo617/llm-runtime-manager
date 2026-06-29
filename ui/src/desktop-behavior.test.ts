import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("desktop shell behavior", () => {
  test("uses responsive layout rules instead of a fixed desktop-only width", () => {
    const css = readRepoFile("ui/src/styles.css");

    expect(css).not.toMatch(/body\s*{[^}]*min-width:\s*1080px/s);
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain(".sidebar");
  });

  test("prevents Windows console windows for the app and launched server", () => {
    const main = readRepoFile("src-tauri/src/main.rs");
    const process = readRepoFile("src-tauri/src/process.rs");

    expect(main).toContain('windows_subsystem = "windows"');
    expect(process).toContain("CREATE_NO_WINDOW");
    expect(process).toContain(".creation_flags(CREATE_NO_WINDOW)");
  });

  test("embeds the logo as the Windows executable icon", () => {
    const config = readRepoFile("src-tauri/tauri.conf.json");
    const cargo = readRepoFile("src-tauri/Cargo.toml");
    const build = readRepoFile("src-tauri/build.rs");

    expect(config).toContain('"icons/32x32.png"');
    expect(config).toContain('"icons/128x128.png"');
    expect(config).toContain('"icons/128x128@2x.png"');
    expect(config).toContain('"icons/icon.ico"');
    expect(cargo).toContain("winresource");
    expect(build).toContain("WindowsResource");
    expect(build).toContain(".set_icon(\"icons/icon.ico\")");
    expect(existsSync(resolve(repoRoot, "src-tauri/icons/16x16.png"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "src-tauri/icons/48x48.png"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "src-tauri/icons/icon.ico"))).toBe(true);
  });

  test("supports tray restore and native first-close hide-or-quit choice", () => {
    const main = readRepoFile("src-tauri/src/main.rs");
    const app = readRepoFile("ui/src/App.tsx");
    const types = readRepoFile("ui/src/types.ts");
    const settings = readRepoFile("src-tauri/src/settings.rs");

    expect(main).toContain("TrayIconBuilder");
    expect(main).toContain("show_menu_item");
    expect(main).toContain("quit_menu_item");
    expect(app).toContain("onCloseRequested");
    expect(app).toContain("dialogMessage(");
    expect(app).toContain("隐藏到右下角");
    expect(app).toContain("关闭软件");
    expect(app).toContain("取消");
    expect(app).toContain("handleCloseRequest");
    expect(app).toContain(".hide()");
    expect(types).toContain("closeAction");
    expect(settings).toContain("close_action");
  });

  test("keeps expensive model scanning out of startup", () => {
    const app = readRepoFile("ui/src/App.tsx");
    const bootBody = app.match(/async function boot\(\) \{(?<body>[\s\S]*?)\n  \}/)?.groups?.body ?? "";

    expect(bootBody).toContain("load_settings");
    expect(bootBody).not.toContain("scanModels");
    expect(app).toContain("scanStatus");
    expect(app).toContain("isScanning");
  });

  test("uses searchable capped model pickers instead of rendering every model option", () => {
    const app = readRepoFile("ui/src/App.tsx");

    expect(app).toContain("modelQuery");
    expect(app).toContain("visibleLaunchableModels");
    expect(app).toContain("MODEL_PICKER_LIMIT");
    expect(app).not.toContain("launchableModels.map((model)");
  });

  test("polls logs incrementally while the server is running", () => {
    const app = readRepoFile("ui/src/App.tsx");
    const main = readRepoFile("src-tauri/src/main.rs");
    const process = readRepoFile("src-tauri/src/process.rs");

    expect(app).toContain("logCursorRef");
    expect(app).toContain("get_logs_since");
    expect(main).toContain("fn get_logs_since");
    expect(process).toContain("logs_since");
  });

  test("runs expensive backend commands without blocking the Tauri command handler", () => {
    const main = readRepoFile("src-tauri/src/main.rs");

    expect(main).toContain("async fn detect_device");
    expect(main).toContain("async fn scan_models");
    expect(main).toContain("tauri::async_runtime::spawn_blocking");
  });

  test("bounds nvidia-smi hardware probing with a timeout", () => {
    const device = readRepoFile("src-tauri/src/device.rs");

    expect(device).toContain("NVIDIA_SMI_TIMEOUT");
    expect(device).toContain("try_wait");
    expect(device).toContain("nvidia-smi 检测超时");
  });

  test("reuses the detected device profile when generating recommendations", () => {
    const app = readRepoFile("ui/src/App.tsx");
    const recommend = readRepoFile("src-tauri/src/recommend.rs");
    const main = readRepoFile("src-tauri/src/main.rs");

    expect(app).toContain("deviceProfile: device ?? null");
    expect(recommend).toContain("pub device_profile: Option<DeviceProfile>");
    expect(main).toContain(".device_profile");
    expect(main).toContain(".clone()");
  });
});
