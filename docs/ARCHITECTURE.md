# 架构设计

## 总体结构

```
UI (Tauri)
   ↓ IPC
Rust Core Engine
   ├── Device Profiler
   ├── Model Analyzer
   ├── Parameter Engine
   ├── Process Manager
   └── System Toolkit
        ↓
   llama-server.exe
```

---

## 核心模块说明

### 1. Device Profiler
获取：
- CPU核心数
- RAM大小
- GPU & VRAM
- CUDA可用性（后期）

输出 profile。

---

### 2. Model Analyzer
解析 GGUF：
- 参数规模
- 量化类型
- 内存需求估算

---

### 3. Parameter Engine
生成启动参数：
- ctx
- gpu_layers
- batch size

---

### 4. Process Manager
负责：
- 启动 llama-server
- 关闭进程
- 重启模型
