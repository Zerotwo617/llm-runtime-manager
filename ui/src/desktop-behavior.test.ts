import { readFileSync } from "node:fs";
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
    const cargo = readRepoFile("src-tauri/Cargo.toml");
    const build = readRepoFile("src-tauri/build.rs");
    const resource = readRepoFile("src-tauri/app-icon.rc");

    expect(cargo).toContain("embed-resource");
    expect(build).toContain('embed_resource::compile("app-icon.rc"');
    expect(resource).toContain('IDI_ICON1 ICON "icons/icon.ico"');
  });

  test("supports tray restore and first-close hide-or-quit choice", () => {
    const main = readRepoFile("src-tauri/src/main.rs");
    const app = readRepoFile("ui/src/App.tsx");
    const types = readRepoFile("ui/src/types.ts");
    const settings = readRepoFile("src-tauri/src/settings.rs");

    expect(main).toContain("TrayIconBuilder");
    expect(main).toContain("show_menu_item");
    expect(main).toContain("quit_menu_item");
    expect(app).toContain("onCloseRequested");
    expect(app).toContain("closePromptOpen");
    expect(app).toContain(".hide()");
    expect(types).toContain("closeAction");
    expect(settings).toContain("close_action");
  });
});
