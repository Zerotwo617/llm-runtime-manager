# LLM Runtime Manager (Rust + Tauri + llama.cpp)

## 🎯 项目定位
这是一个本地 LLM 运行环境管理器，而不是简单 launcher。

核心目标：
- 替代 bat 启动方式
- 自动生成 llama.cpp 启动参数
- 适配不同电脑硬件
- 后期支持 CUDA/环境检测/自动修复
- 保持低资源占用

---

## 🧱 系统架构

UI层：
- Tauri (Web UI)

核心层：
- Rust Scheduler Engine
- Device Profiler
- Model Analyzer
- Process Manager

执行层：
- llama.cpp / llama-server

---

## 🚀 当前阶段（MVP）
- 设备检测（CPU / RAM / GPU）
- 模型识别（GGUF）
- 参数生成（静态规则版）
- 启动 llama-server

---

## 🔮 后期规划
- CUDA自动检测
- GPU驱动检查
- 动态显存调节
- 自动降级策略
- 一键环境修复
