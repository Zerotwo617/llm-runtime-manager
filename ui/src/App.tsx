import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Cpu,
  FolderPlus,
  Gauge,
  Play,
  RefreshCcw,
  Save,
  Server,
  Square,
  Terminal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AppSettings,
  DeviceProfile,
  LaunchParameters,
  LaunchProfile,
  LaunchRecommendation,
  ModelFile,
  ProcessStatus,
  RecommendationRequest,
} from "./types";

const defaultSettings: AppSettings = {
  serverPath: "",
  modelDirectories: [],
  lastModelPath: null,
  lastMmprojPath: null,
  profile: "model_limit",
  host: "0.0.0.0",
  port: 8080,
};

const profileLabels: Record<LaunchProfile, string> = {
  model_limit: "模型上限优先",
  balanced: "平衡",
  conservative: "保守",
  custom: "自定义",
};

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [device, setDevice] = useState<DeviceProfile | null>(null);
  const [models, setModels] = useState<ModelFile[]>([]);
  const [selectedModelPath, setSelectedModelPath] = useState("");
  const [mmprojPath, setMmprojPath] = useState("");
  const [extraArgs, setExtraArgs] = useState("");
  const [recommendation, setRecommendation] = useState<LaunchRecommendation | null>(null);
  const [editableParams, setEditableParams] = useState<LaunchParameters | null>(null);
  const [commandPreview, setCommandPreview] = useState("");
  const [status, setStatus] = useState<ProcessStatus>({ running: false, message: "未启动" });
  const [logs, setLogs] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const selectedModel = useMemo(
    () => models.find((model) => model.path === selectedModelPath) ?? null,
    [models, selectedModelPath],
  );
  const launchableModels = models.filter((model) => !model.isMmproj);
  const mmprojModels = models.filter((model) => model.isMmproj);

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    if (!status.running) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshLogs();
      void refreshStatus();
    }, 1200);
    return () => window.clearInterval(timer);
  }, [status.running]);

  useEffect(() => {
    if (!editableParams) {
      setCommandPreview("");
      return;
    }

    invoke<string>("build_command", { parameters: editableParams })
      .then(setCommandPreview)
      .catch((error) => setMessage(String(error)));
  }, [editableParams]);

  async function boot() {
    try {
      const loaded = await invoke<AppSettings>("load_settings");
      setSettings({ ...defaultSettings, ...loaded });
      setSelectedModelPath(loaded.lastModelPath ?? "");
      setMmprojPath(loaded.lastMmprojPath ?? "");
      await refreshDevice();
      if (loaded.modelDirectories.length > 0) {
        await scanModels(loaded.modelDirectories);
      }
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function refreshDevice() {
    const profile = await invoke<DeviceProfile>("detect_device");
    setDevice(profile);
  }

  async function scanModels(directories = settings.modelDirectories) {
    const scanned = await invoke<ModelFile[]>("scan_models", { directories });
    setModels(scanned);
    if (!selectedModelPath) {
      const firstModel = scanned.find((model) => !model.isMmproj);
      if (firstModel) {
        setSelectedModelPath(firstModel.path);
      }
    }
  }

  async function pickServer() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "llama-server", extensions: ["exe"] }],
    });
    if (typeof selected === "string") {
      setSettings((current) => ({ ...current, serverPath: selected }));
    }
  }

  async function addModelDirectory() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") {
      return;
    }
    const directories = Array.from(new Set([...settings.modelDirectories, selected]));
    const next = { ...settings, modelDirectories: directories };
    setSettings(next);
    await scanModels(directories);
  }

  async function pickModelFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "GGUF", extensions: ["gguf"] }],
    });
    if (typeof selected !== "string") {
      return;
    }
    const name = selected.split(/[\\/]/).pop() ?? "model.gguf";
    const directModel: ModelFile = {
      path: selected,
      name,
      directory: selected.replace(/[\\/][^\\/]+$/, ""),
      sizeMb: 0,
      isMmproj: name.toLowerCase().includes("mmproj"),
    };
    setModels((current) => [directModel, ...current.filter((model) => model.path !== selected)]);
    setSelectedModelPath(selected);
  }

  async function pickMmprojFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "GGUF", extensions: ["gguf"] }],
    });
    if (typeof selected === "string") {
      setMmprojPath(selected);
    }
  }

  async function saveCurrentSettings(nextSettings = settings) {
    const saved = await invoke<AppSettings>("save_settings", {
      settings: {
        ...nextSettings,
        lastModelPath: selectedModelPath || null,
        lastMmprojPath: mmprojPath || null,
      },
    });
    setSettings(saved);
    setMessage("设置已保存。");
  }

  async function generateRecommendation() {
    if (!selectedModel) {
      setMessage("请先选择一个 GGUF 模型。");
      return;
    }

    const request: RecommendationRequest = {
      serverPath: settings.serverPath,
      model: {
        path: selectedModel.path,
        name: selectedModel.name,
        sizeMb: selectedModel.sizeMb,
        isMmproj: selectedModel.isMmproj,
      },
      mmprojPath: mmprojPath || null,
      profile: settings.profile,
      host: settings.host,
      port: settings.port,
      extraArgs,
    };

    const result = await invoke<LaunchRecommendation>("recommend_launch", { request });
    setRecommendation(result);
    setEditableParams(result.parameters);
    setCommandPreview(result.commandPreview);
    setMessage("已生成推荐参数。");
  }

  async function startServer() {
    if (!editableParams) {
      await generateRecommendation();
      return;
    }
    const result = await invoke<ProcessStatus>("start_server", { parameters: editableParams });
    setStatus(result);
    await saveCurrentSettings();
    await refreshLogs();
  }

  async function stopServer() {
    const result = await invoke<ProcessStatus>("stop_server");
    setStatus(result);
    await refreshLogs();
  }

  async function refreshStatus() {
    const result = await invoke<ProcessStatus>("process_status");
    setStatus(result);
  }

  async function refreshLogs() {
    const result = await invoke<string[]>("get_logs");
    setLogs(result);
  }

  function updateParam<K extends keyof LaunchParameters>(key: K, value: LaunchParameters[K]) {
    setEditableParams((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">LLM Runtime Manager</div>
          <div className="subtitle">模型能力适配启动器</div>
        </div>
        <nav>
          <a className="active">启动</a>
          <a>模型</a>
          <a>硬件</a>
          <a>日志</a>
        </nav>
        <div className={status.running ? "status running" : "status"}>
          <span>{status.running ? "运行中" : "空闲"}</span>
          <small>{status.message}</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>第一个版本</h1>
            <p>选择模型，读取硬件，生成可编辑的 llama-server 启动命令。</p>
          </div>
          <button className="icon-button" onClick={() => void saveCurrentSettings()}>
            <Save size={18} />
            保存
          </button>
        </header>

        <section className="grid">
          <Panel title="运行环境" icon={<Server size={18} />}>
            <label>
              llama-server.exe
              <div className="path-row">
                <input value={settings.serverPath} onChange={(event) => setSettings({ ...settings, serverPath: event.target.value })} />
                <button onClick={() => void pickServer()}>选择</button>
              </div>
            </label>
            <div className="actions">
              <button onClick={() => void addModelDirectory()}>
                <FolderPlus size={16} />
                添加模型目录
              </button>
              <button onClick={() => void pickModelFile()}>直接选模型</button>
              <button onClick={() => void scanModels()}>
                <RefreshCcw size={16} />
                扫描
              </button>
            </div>
            <div className="directory-list">
              {settings.modelDirectories.map((directory) => (
                <span key={directory}>{directory}</span>
              ))}
            </div>
          </Panel>

          <Panel title="硬件画像" icon={<Cpu size={18} />}>
            <button onClick={() => void refreshDevice()}>
              <RefreshCcw size={16} />
              重新检测
            </button>
            {device ? (
              <div className="hardware">
                <Metric label="CPU 线程" value={`${device.cpuLogicalThreads}`} />
                <Metric label="总内存" value={`${formatGb(device.totalRamMb)} GB`} />
                <Metric label="可用内存" value={`${formatGb(device.availableRamMb)} GB`} />
                <Metric
                  label="GPU"
                  value={
                    device.gpus[0]
                      ? `${device.gpus[0].name} / ${formatGb(device.gpus[0].totalVramMb)} GB`
                      : "CPU fallback"
                  }
                />
                {device.notes.map((note) => (
                  <p className="note" key={note}>{note}</p>
                ))}
              </div>
            ) : (
              <p className="muted">尚未检测。</p>
            )}
          </Panel>

          <Panel title="模型选择" icon={<Gauge size={18} />} wide>
            <div className="split">
              <label>
                主模型
                <select value={selectedModelPath} onChange={(event) => setSelectedModelPath(event.target.value)}>
                  <option value="">请选择模型</option>
                  {launchableModels.map((model) => (
                    <option key={model.path} value={model.path}>
                      {model.name} ({model.sizeMb || "未知"} MB)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                mmproj
                <div className="path-row">
                  <select value={mmprojPath} onChange={(event) => setMmprojPath(event.target.value)}>
                    <option value="">不使用</option>
                    {mmprojModels.map((model) => (
                      <option key={model.path} value={model.path}>{model.name}</option>
                    ))}
                  </select>
                  <button onClick={() => void pickMmprojFile()}>选择</button>
                </div>
              </label>
            </div>
            <div className="model-path">{selectedModel?.path ?? "未选择模型"}</div>
          </Panel>

          <Panel title="参数推荐" icon={<Terminal size={18} />} wide>
            <div className="split compact">
              <label>
                目标模式
                <select
                  value={settings.profile}
                  onChange={(event) => setSettings({ ...settings, profile: event.target.value as LaunchProfile })}
                >
                  {Object.entries(profileLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Host
                <input value={settings.host} onChange={(event) => setSettings({ ...settings, host: event.target.value })} />
              </label>
              <label>
                Port
                <input
                  type="number"
                  value={settings.port}
                  onChange={(event) => setSettings({ ...settings, port: Number(event.target.value) })}
                />
              </label>
            </div>
            <label>
              额外参数
              <input value={extraArgs} onChange={(event) => setExtraArgs(event.target.value)} placeholder="例如 --no-webui" />
            </label>
            <button className="primary" onClick={() => void generateRecommendation()}>
              生成推荐参数
            </button>

            {editableParams && (
              <div className="param-grid">
                <NumberField label="Context" value={editableParams.contextSize} onChange={(value) => updateParam("contextSize", value)} />
                <NumberField label="GPU Layers" value={editableParams.gpuLayers} onChange={(value) => updateParam("gpuLayers", value)} />
                <NumberField label="Threads" value={editableParams.threads} onChange={(value) => updateParam("threads", value)} />
                <NumberField label="Batch" value={editableParams.batchSize} onChange={(value) => updateParam("batchSize", value)} />
                <NumberField label="UBatch" value={editableParams.ubatchSize} onChange={(value) => updateParam("ubatchSize", value)} />
                <NumberField label="Parallel" value={editableParams.parallel} onChange={(value) => updateParam("parallel", value)} />
              </div>
            )}

            {recommendation && (
              <div className="explanations">
                {recommendation.explanations.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="命令与运行" icon={<Play size={18} />} wide>
            <pre className="command-preview">
              {editableParams ? commandPreview : "生成推荐参数后显示完整命令"}
            </pre>
            <div className="actions">
              <button className="primary" disabled={status.running} onClick={() => void startServer()}>
                <Play size={16} />
                启动
              </button>
              <button disabled={!status.running} onClick={() => void stopServer()}>
                <Square size={16} />
                停止
              </button>
              <button onClick={() => void refreshLogs()}>
                <RefreshCcw size={16} />
                刷新日志
              </button>
            </div>
          </Panel>

          <Panel title="日志" icon={<Terminal size={18} />} wide>
            <div className="log-view">
              {logs.length === 0 ? <span>暂无日志</span> : logs.map((line, index) => <pre key={`${line}-${index}`}>{line}</pre>)}
            </div>
          </Panel>
        </section>

        {message && <div className="toast">{message}</div>}
      </section>
    </main>
  );
}

function Panel({ title, icon, wide, children }: { title: string; icon: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={wide ? "panel wide" : "panel"}>
      <header>
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
      </header>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function formatGb(mb: number) {
  return (mb / 1024).toFixed(1);
}
