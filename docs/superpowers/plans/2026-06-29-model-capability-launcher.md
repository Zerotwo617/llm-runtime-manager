# Model Capability Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable Windows desktop version of LLM Runtime Manager as a Tauri launcher for `llama-server.exe`.

**Architecture:** The React UI calls Rust Tauri commands. Rust owns filesystem scanning, hardware detection, parameter recommendation, command construction, settings persistence, and `llama-server` process control. The first version favors clear boundaries and editable output over perfect hardware tuning.

**Tech Stack:** Rust, Tauri 2, React, TypeScript, Vite, CSS, GitHub Actions on `windows-latest`.

---

## File Structure

- `package.json`: workspace-level scripts that run the Tauri app from the repo root.
- `ui/package.json`: frontend dependencies and Vite scripts.
- `ui/index.html`: Vite entry HTML.
- `ui/src/main.tsx`: React mount.
- `ui/src/App.tsx`: first-version launcher interface.
- `ui/src/styles.css`: desktop tool styling.
- `ui/src/types.ts`: frontend command/result types.
- `src-tauri/Cargo.toml`: Tauri and Rust dependencies.
- `src-tauri/tauri.conf.json`: Tauri app config.
- `src-tauri/build.rs`: Tauri build hook.
- `src-tauri/src/main.rs`: Tauri command registration and app entry.
- `src-tauri/src/device.rs`: CPU/RAM/NVIDIA detection.
- `src-tauri/src/models.rs`: model directory scanning and file metadata.
- `src-tauri/src/recommend.rs`: launch profile and parameter recommendation.
- `src-tauri/src/process.rs`: command construction and server process lifecycle.
- `src-tauri/src/settings.rs`: persisted local settings.
- `.github/workflows/build.yml`: Windows CI build.

## Task 1: Complete Project Scaffold

**Files:**
- Create: `package.json`
- Modify: `ui/package.json`
- Create: `ui/index.html`
- Modify: `ui/src/main.tsx`
- Create: `ui/src/App.tsx`
- Create: `ui/src/styles.css`
- Create: `ui/src/types.ts`
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/build.rs`

- [ ] Add workspace scripts so `npm install` and `npm run tauri dev` work from the root.
- [ ] Add Vite, React, TypeScript, and Tauri frontend dependencies.
- [ ] Add Tauri Rust dependencies and build script.
- [ ] Verify `npm install` can resolve dependencies.

## Task 2: Backend Data Model and Settings

**Files:**
- Modify: `src-tauri/src/main.rs`
- Create: `src-tauri/src/settings.rs`

- [ ] Define serializable settings for server path, model directories, last selections, and profile.
- [ ] Expose Tauri commands to load and save settings.
- [ ] Store settings in the Tauri app data directory.
- [ ] Return typed error strings to the frontend instead of panicking.

## Task 3: Hardware Detection

**Files:**
- Create: `src-tauri/src/device.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] Detect logical CPU count and total RAM with `sysinfo`.
- [ ] Try `nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits`.
- [ ] Return CPU/RAM info even when NVIDIA detection fails.
- [ ] Mark GPU backend as `nvidia`, `unknown`, or `cpu`.

## Task 4: Model Scanning

**Files:**
- Create: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] Scan user-selected directories recursively for `.gguf`.
- [ ] Return path, filename, parent directory, and file size.
- [ ] Classify files containing `mmproj` in the name as projector candidates.
- [ ] Keep scanning bounded to user-added directories.

## Task 5: Recommendation Engine

**Files:**
- Create: `src-tauri/src/recommend.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] Define `LaunchProfile` values: `model_limit`, `balanced`, `conservative`, and `custom`.
- [ ] Generate launch parameters from hardware, model file size, profile, and optional mmproj.
- [ ] Prefer model capability while reducing context and batch by memory class.
- [ ] Produce explanation strings that say why each major value was selected.

## Task 6: Process Control

**Files:**
- Create: `src-tauri/src/process.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] Build a quoted `llama-server.exe` command from launch parameters.
- [ ] Start the process with stdout/stderr piped.
- [ ] Stop the current process.
- [ ] Report running status.
- [ ] Prevent launching a second process while one is running.

## Task 7: UI

**Files:**
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/styles.css`
- Modify: `ui/src/types.ts`

- [ ] Build a single-screen desktop launcher with sections for setup, hardware, models, parameters, command preview, and logs.
- [ ] Support adding model directories through Tauri file dialogs.
- [ ] Support selecting `llama-server.exe`, a model file, and optional mmproj.
- [ ] Show profile selector and editable parameter fields.
- [ ] Show generated explanations and final command.
- [ ] Add start/stop controls.

## Task 8: CI Build

**Files:**
- Create: `.github/workflows/build.yml`

- [ ] Add Windows build workflow.
- [ ] Install Node 22 and Rust stable.
- [ ] Run `npm install`.
- [ ] Run frontend build.
- [ ] Run Rust check.
- [ ] Upload Tauri artifacts when packaging succeeds.

## Verification

- [ ] `npm install`
- [ ] `npm run build`
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml`
- [ ] `git status --short`
- [ ] Push to GitHub and inspect Actions result.

## Self-Review

- The plan covers project scaffold, settings, hardware detection, model scanning, recommendation, process control, UI, and CI.
- The first version deliberately excludes automatic dependency installation and live runtime tuning.
- The plan keeps NVIDIA support first and preserves CPU fallback.
