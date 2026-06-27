# LLM Runtime Manager

This context defines the product language for a local LLM tool that starts models today and can grow into runtime tuning later.

## Language

**Model Launcher**:
A user-facing tool for selecting a local model and adjusting launch parameters before starting it.
_Avoid_: simple launcher, bat replacement

**Runtime Tuner**:
A later-stage tool that observes a running local model and adjusts runtime settings to improve stability or performance.
_Avoid_: optimizer, auto repair tool

**Launch Parameters**:
The llama-server settings chosen before startup, such as context size, GPU layers, and batch size.
_Avoid_: config, options
