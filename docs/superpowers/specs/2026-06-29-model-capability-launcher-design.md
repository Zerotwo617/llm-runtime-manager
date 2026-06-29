# Model Capability Launcher Design

## Goal

Build the first working version of LLM Runtime Manager as a Windows desktop launcher for `llama-server.exe`. The app should help a user choose local GGUF models, detect the current computer, recommend launch parameters that try to approach the model's own capability, and start or stop the server.

## Product Position

The first version is a **Model Capability Launcher**, not a full Runtime Tuner. It runs before startup: it reads the selected model and computer profile, generates launch parameters, lets the user override them, then launches `llama-server.exe`.

Runtime observation, live retuning, dependency installation, driver repair, and automatic CUDA remediation are later-stage features.

## Target Platform

- Windows desktop.
- Tauri shell with a React and TypeScript UI.
- Rust backend for filesystem access, process control, hardware detection, model scanning, command generation, and log streaming.
- `llama-server.exe` is provided by the user; the app does not download llama.cpp in the first version.
- NVIDIA CUDA is the first GPU target. CPU fallback is supported when no NVIDIA GPU is detected.

## User Pain Points

- Existing `.bat` launch commands are hard to move between computers.
- Users do not know whether a model can run at its maximum context length on the current machine.
- Parameters such as context length, GPU layers, batch size, KV cache type, Flash Attention, memory mapping, and CPU threads interact with each other.
- A failed launch currently gives little guidance.
- Users need both automatic recommendations and full manual control.

## First-Version Workflow

1. User selects the `llama-server.exe` path.
2. User adds one or more model directories.
3. App scans those directories for `.gguf` files.
4. User selects a model, or directly picks one `.gguf` file.
5. User optionally selects an `mmproj` GGUF file for multimodal models.
6. App detects CPU, RAM, and NVIDIA GPU/VRAM when available.
7. App analyzes available model facts from path, file size, and parsed metadata when possible.
8. App generates launch profiles:
   - Model Limit: prioritize the model's maximum known context.
   - Balanced: trade context, speed, and safety.
   - Conservative: lower memory pressure and higher launch reliability.
   - Custom: user can override every generated parameter.
9. App displays the final `llama-server` command before launch.
10. App starts `llama-server`, shows logs, and allows stop/restart.

## Parameter Recommendation Strategy

The recommendation engine is model-first and hardware-constrained:

```text
model capability upper bound
  constrained by current RAM/VRAM and safety margin
  constrained by selected runtime features
  becomes launch parameters
```

The first version should not claim to prove the true maximum stable context. It should produce an explainable recommendation and expose the assumptions behind it.

### Inputs

- CPU logical thread count.
- Total RAM and estimated free RAM.
- NVIDIA GPU name, total VRAM, and free VRAM when `nvidia-smi` is available.
- Model file path and size.
- GGUF metadata when parser support is available.
- Whether an `mmproj` file is selected.
- User-selected profile.

### Outputs

- Model path.
- Optional `mmproj` path.
- Context size (`-c`).
- GPU layers (`-ngl`).
- CPU threads (`-t`).
- Batch size (`-b`).
- Micro-batch size (`-ub`).
- KV cache type.
- Flash Attention setting.
- mmap/mlock settings.
- Host and port.
- Extra custom arguments.

## MVP Parameter Defaults

When exact GGUF metadata is unavailable, the app uses explainable fallbacks:

- `-ngl 999` for NVIDIA GPUs in Model Limit and Balanced modes, letting llama.cpp cap to model layer count.
- CPU mode uses `-ngl 0`.
- `-t` defaults to logical CPU threads minus two, with a minimum of four.
- `-tb` defaults to the full logical thread count.
- Context starts from model metadata when available. If unavailable, profile defaults are 128K for Model Limit, 32K for Balanced, and 8K for Conservative, then reduced by memory class.
- KV cache uses `q4_0` in Model Limit for large contexts, `f16` or omitted in Conservative when memory is sufficient.
- Batch and micro-batch scale by VRAM class, with smaller values for CPU fallback.

These defaults are deliberately conservative enough to launch on common machines while keeping the command editable.

## UI Structure

The first UI uses a functional desktop-tool layout:

- Sidebar: Dashboard, Models, Launch, Logs, Settings.
- Dashboard: hardware summary and current runtime status.
- Models: model directories, scan button, discovered model list, direct file picker.
- Launch: selected model, optional mmproj, profile selector, generated parameters, custom override fields, final command preview.
- Logs: stdout/stderr output from `llama-server`, launch status, stop button.
- Settings: `llama-server.exe` path and saved defaults.

The interface should be dense and work-focused, not a marketing page.

## Persistence

The app stores local settings in an app data file:

- `llama-server.exe` path.
- Model directories.
- Last selected model.
- Last selected profile.
- Per-model successful launch parameters.

## Error Handling

The app should distinguish these failures:

- `llama-server.exe` path missing.
- Model path missing.
- Port already in use.
- Process exits immediately.
- NVIDIA detection unavailable.
- Unsupported or unreadable GGUF metadata.

For the first version, failed launch analysis can be based on process exit code and log text matching.

## Non-Goals

- Downloading llama.cpp.
- Installing CUDA or GPU drivers.
- AMD/Intel GPU optimization.
- Live runtime retuning.
- Proving a true maximum stable context through repeated stress tests.
- Managing multiple simultaneous server processes.

## Success Criteria

- A user can build or run the desktop app.
- A user can select `llama-server.exe`.
- A user can add model directories and see `.gguf` files.
- A user can select a model and optional `mmproj`.
- The app detects basic CPU/RAM and NVIDIA GPU information when available.
- The app generates an editable command.
- The app can start and stop `llama-server`.
- GitHub Actions can build the project on Windows.
