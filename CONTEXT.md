# LLM Runtime Manager

This context defines the product language for a local LLM tool that starts models today and can grow into runtime tuning later.

## Language

**Model Launcher**:
A user-facing tool for selecting a local model and adjusting launch parameters before starting it.
_Avoid_: simple launcher, bat replacement

**Model Capability Launcher**:
A first-version launcher that tries to run a selected local model as close as practical to the model's own capability while respecting the current computer's RAM, VRAM, CPU, and runtime constraints.
_Avoid_: generic launcher, universal optimizer

**Runtime Tuner**:
A later-stage tool that observes a running local model and adjusts runtime settings to improve stability or performance.
_Avoid_: optimizer, auto repair tool

**Launch Parameters**:
The llama-server settings chosen before startup, such as context size, GPU layers, and batch size.
_Avoid_: config, options
