# 参数生成系统（核心）

## 输入
- GPU VRAM
- RAM
- CPU cores
- 模型类型

---

## 输出
llama-server启动参数

---

## 规则（v1）

### GPU Layers
- VRAM >= 16GB → 60~100
- VRAM >= 8GB → 20~50
- VRAM < 8GB → 0

---

### Context Size
- RAM >= 32GB → 8192+
- RAM >= 16GB → 4096
- RAM < 16GB → 2048

---

### Batch Size
- GPU强 → 256~512
- CPU → 128
