@echo off
echo Starting llama-server...
llama-server.exe -m model.gguf --ctx-size 4096 --gpu-layers 30
pause
