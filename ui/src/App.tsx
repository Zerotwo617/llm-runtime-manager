import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message as dialogMessage, open } from "@tauri-apps/plugin-dialog";
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
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeDeviceProfile, normalizeModelFile, normalizeModelFiles } from "./api";
import logoUrl from "./assets/logo.png";
import type {
  AppSettings,
  CloseAction,
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
  closeAction: "ask",
};

const profileLabels: Record<LaunchProfile, string> = {
  model_limit: "模型上限优先",
  balanced: "平衡",
  conservative: "保守",
  custom: "自定义",
};

const MODEL_PICKER_LIMIT = 60;
const LOG_VIEW_LIMIT = 360;

type SectionId = "launch" | "models" | "hardware" | "logs";

const sections: Array<{ id: SectionId; label: string }> = [
  { id: "launch", label: "启动" },
  { id: "models", label: "模型" },
  { id: "hardware", label: "硬件" },
  { id: "logs", label: "日志" },
];

const sectionCopy: Record<SectionId, { title: string; description: string }> = {
  launch: {
    title: "启动配置",
    description: "生成可编辑的 llama-server 参数，确认命令后启动或停止服务。",
  },
  models: {
    title: "模型管理",
    description: "扫描模型目录，选择主模型，并为多模态模型绑定 mmproj。",
  },
  hardware: {
    title: "硬件画像",
    description: "读取当前电脑的 CPU、内存和 GPU 信息，作为推荐参数的约束。",
  },
  logs: {
    title: "运行日志",
    description: "查看 llama-server 的运行状态和最近输出。",
  },
};

const parameterReference = [
  { flag: "-m", name: "主模型", description: "要加载的 GGUF 主模型文件。" },
  { flag: "--mmproj", name: "多模态投影", description: "视觉/多模态模型使用的 mmproj GGUF 文件。" },
  { flag: "--image-min-tokens", name: "图片 token", description: "图片输入至少预留的 token 数，通常只在启用 mmproj 时使用。" },
  { flag: "-ngl", name: "GPU Layers", description: "卸载到 GPU 的模型层数；999 表示尽量全交给 llama.cpp 自动封顶。" },
  { flag: "--n-cpu-moe", name: "CPU MoE", description: "MoE 模型可指定留给 CPU 的专家层数量，用来降低显存压力。" },
  { flag: "--flash-attn", name: "Flash Attention", description: "开启更高效的注意力计算，支持时通常更省显存。" },
  { flag: "--jinja", name: "聊天模板", description: "启用 GGUF 内置 chat template/Jinja 模板渲染。" },
  { flag: "-c", name: "Context", description: "上下文窗口 token 数，决定能吃多长上下文，也是显存/内存大头。" },
  { flag: "-t", name: "Threads", description: "推理阶段 CPU 线程数。" },
  { flag: "-tb", name: "Threads Batch", description: "prompt/batch 处理阶段 CPU 线程数。" },
  { flag: "-b", name: "Batch", description: "逻辑批大小，影响吞吐和显存峰值。" },
  { flag: "-ub", name: "UBatch", description: "物理 micro-batch 大小，用来控制显存峰值。" },
  { flag: "--cache-type-k/v", name: "KV cache", description: "K/V 缓存精度；q4_0 更省显存，f16 更保守。" },
  { flag: "--no-mmap", name: "禁用 mmap", description: "不把模型文件映射到内存，部分机器上更稳定。" },
  { flag: "--mlock", name: "锁定内存", description: "尝试防止模型内存被换出，内存充足时更适合。" },
  { flag: "-np", name: "Parallel", description: "并行序列/请求数量，本地单用户通常为 1。" },
  { flag: "--host", name: "监听地址", description: "0.0.0.0 允许局域网访问，127.0.0.1 仅本机访问。" },
  { flag: "--port", name: "端口", description: "llama-server HTTP 服务端口。" },
];

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [activeSection, setActiveSection] = useState<SectionId>("launch");
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
  const [modelQuery, setModelQuery] = useState("");
  const [mmprojQuery, setMmprojQuery] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("未扫描");
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const logCursorRef = useRef(0);
  const closeDialogPendingRef = useRef(false);
  const closeActionRef = useRef<CloseAction>(defaultSettings.closeAction);
  const allowCloseRef = useRef(false);

  const selectedModel = useMemo(
    () => models.find((model) => model.path === selectedModelPath) ?? null,
    [models, selectedModelPath],
  );
  const launchableModels = useMemo(() => models.filter((model) => !model.isMmproj), [models]);
  const mmprojModels = useMemo(() => models.filter((model) => model.isMmproj), [models]);
  const visibleLaunchableModels = useMemo(
    () => filterModels(launchableModels, modelQuery).slice(0, MODEL_PICKER_LIMIT),
    [launchableModels, modelQuery],
  );
  const visibleMmprojModels = useMemo(
    () => filterModels(mmprojModels, mmprojQuery).slice(0, MODEL_PICKER_LIMIT),
    [mmprojModels, mmprojQuery],
  );
  const activeCopy = sectionCopy[activeSection];

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    closeActionRef.current = settings.closeAction;
  }, [settings.closeAction]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    appWindow
      .onCloseRequested(async (event) => {
        if (allowCloseRef.current) {
          return;
        }

        if (closeActionRef.current === "quit") {
          return;
        }

        event.preventDefault();
        void handleCloseRequest(appWindow);
      })
      .then((handler) => {
        unlisten = handler;
      })
      .catch((error) => setMessage(String(error)));

    return () => {
      unlisten?.();
    };
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
      setScanStatus(loaded.modelDirectories.length > 0 ? "已加载模型目录，点击扫描后刷新模型列表。" : "未添加模型目录");
      void refreshDevice();
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function refreshDevice() {
    const profile = await invoke<unknown>("detect_device");
    setDevice(normalizeDeviceProfile(profile));
  }

  async function scanModels(directories = settings.modelDirectories) {
    if (directories.length === 0) {
      setScanStatus("请先添加模型目录。");
      setMessage("请先添加模型目录。");
      return;
    }

    setIsScanning(true);
    setScanStatus("正在扫描模型目录...");
    try {
      const raw = await invoke<unknown>("scan_models", { directories });
      const scanned = normalizeModelFiles(raw);
      setModels(scanned);
      const current = scanned.find((model) => model.path === selectedModelPath);
      const firstModel = scanned.find((model) => !model.isMmproj);
      if ((!current || current.isMmproj) && firstModel) {
        setSelectedModelPath(firstModel.path);
      }
      setScanStatus(`扫描完成：发现 ${scanned.length} 个 GGUF 文件。`);
    } catch (error) {
      setScanStatus("扫描失败。");
      setMessage(String(error));
    } finally {
      setIsScanning(false);
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
    setScanStatus("已添加模型目录，点击扫描后刷新模型列表。");
  }

  async function pickModelFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "GGUF", extensions: ["gguf"] }],
    });
    if (typeof selected !== "string") {
      return;
    }
    const raw = await invoke<unknown>("inspect_model_file", { path: selected });
    const directModel = normalizeModelFile(raw);
    setModels((current) => [directModel, ...current.filter((model) => model.path !== selected)]);
    if (directModel.isMmproj) {
      setMmprojPath(directModel.path);
      setMessage("这个文件是 mmproj，已放到 mmproj 选择框。");
    } else {
      setSelectedModelPath(directModel.path);
    }
    setScanStatus(`已直接添加：${directModel.name}`);
  }

  async function pickMmprojFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "GGUF", extensions: ["gguf"] }],
    });
    if (typeof selected === "string") {
      const raw = await invoke<unknown>("inspect_model_file", { path: selected });
      const projector = normalizeModelFile(raw);
      setModels((current) => [projector, ...current.filter((model) => model.path !== selected)]);
      setMmprojPath(projector.path);
    }
  }

  async function saveCurrentSettings(nextSettings = settings, notify = true) {
    const saved = await invoke<AppSettings>("save_settings", {
      settings: {
        ...nextSettings,
        lastModelPath: selectedModelPath || null,
        lastMmprojPath: mmprojPath || null,
      },
    });
    setSettings(saved);
    if (notify) {
      setMessage("设置已保存。");
    }
  }

  async function chooseCloseAction(closeAction: CloseAction) {
    const nextSettings = { ...settings, closeAction };
    closeActionRef.current = closeAction;
    setSettings(nextSettings);
    await saveCurrentSettings(nextSettings, false);
    setClosePromptOpen(false);

    const appWindow = getCurrentWindow();
    if (closeAction === "hideToTray") {
      await appWindow.hide();
      return;
    }

    allowCloseRef.current = true;
    await appWindow.close();
  }

  async function handleCloseRequest(appWindow = getCurrentWindow()) {
    if (closeDialogPendingRef.current) {
      return;
    }

    const closeAction = closeActionRef.current;
    if (closeAction === "hideToTray") {
      await appWindow.hide();
      return;
    }
    if (closeAction === "quit") {
      allowCloseRef.current = true;
      await appWindow.close();
      return;
    }

    closeDialogPendingRef.current = true;
    try {
      const result = await dialogMessage("请选择点击右上角关闭按钮时的处理方式。选择后会记住，可在启动页里改回询问。", {
        title: "关闭 LlamaCPP Launcher",
        kind: "info",
        buttons: {
          yes: "隐藏到右下角",
          no: "关闭软件",
          cancel: "取消",
        },
      });

      if (result === "隐藏到右下角" || result === "Yes") {
        await chooseCloseAction("hideToTray");
      } else if (result === "关闭软件" || result === "No") {
        await chooseCloseAction("quit");
      }
    } catch (error) {
      setMessage(String(error));
      setClosePromptOpen(true);
    } finally {
      closeDialogPendingRef.current = false;
    }
  }

  async function generateRecommendation(): Promise<LaunchRecommendation | null> {
    if (!selectedModel) {
      setMessage("请先选择一个 GGUF 模型。");
      return null;
    }
    if (selectedModel.isMmproj) {
      setMessage("当前选中的是 mmproj，请选择主模型 GGUF。");
      return null;
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
      deviceProfile: device ?? null,
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
    return result;
  }

  async function startServer() {
    const parameters = editableParams ?? (await generateRecommendation())?.parameters;
    if (!parameters) {
      return;
    }
    const result = await invoke<ProcessStatus>("start_server", { parameters });
    setStatus(result);
    await saveCurrentSettings();
    logCursorRef.current = 0;
    await refreshLogs(true);
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

  async function refreshLogs(reset = false) {
    if (reset) {
      logCursorRef.current = 0;
      setLogs([]);
    }
    const result = await invoke<{ lines: string[]; nextCursor: number }>("get_logs_since", { cursor: logCursorRef.current });
    logCursorRef.current = result.nextCursor;
    if (result.lines.length === 0) {
      return;
    }
    setLogs((current) => [...current, ...result.lines].slice(-LOG_VIEW_LIMIT));
  }

  function updateParam<K extends keyof LaunchParameters>(key: K, value: LaunchParameters[K]) {
    setEditableParams((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-main">
          <div className="brand-block">
            <img className="brand-logo" src={logoUrl} alt="LlamaCPP Launcher" />
            <div>
              <div className="brand">LlamaCPP Launcher</div>
              <div className="subtitle">模型能力适配启动器</div>
            </div>
          </div>
          <nav>
            {sections.map((section) => (
              <button
                key={section.id}
                className={section.id === activeSection ? "nav-item active" : "nav-item"}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </div>
        <div className={status.running ? "status running" : "status"}>
          <span>{status.running ? "运行中" : "空闲"}</span>
          <small>{status.message}</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{activeCopy.title}</h1>
            <p>{activeCopy.description}</p>
          </div>
          <button className="icon-button" onClick={() => void saveCurrentSettings()}>
            <Save size={18} />
            保存
          </button>
        </header>

        {activeSection === "launch" && (
          <section className="grid module-grid">
            <Panel title="运行环境" icon={<Server size={18} />} wide>
              <label>
                llama-server.exe
                <div className="path-row">
                  <input value={settings.serverPath} onChange={(event) => setSettings({ ...settings, serverPath: event.target.value })} />
                  <button onClick={() => void pickServer()}>选择</button>
                </div>
              </label>
              <label>
                关闭按钮行为
                <select
                  value={settings.closeAction}
                  onChange={(event) => setSettings({ ...settings, closeAction: event.target.value as CloseAction })}
                >
                  <option value="ask">每次询问</option>
                  <option value="hideToTray">隐藏到右下角</option>
                  <option value="quit">关闭软件</option>
                </select>
              </label>
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
                  <NumberField
                    label="Context"
                    value={editableParams.contextSize}
                    description="对应 -c，控制上下文窗口 tokens 数，越大越吃显存和内存。"
                    onChange={(value) => updateParam("contextSize", value)}
                  />
                  <NumberField
                    label="GPU Layers"
                    value={editableParams.gpuLayers}
                    description="对应 -ngl，控制卸载到 GPU 的层数；999 通常表示让 llama.cpp 自动按模型层数封顶。"
                    onChange={(value) => updateParam("gpuLayers", value)}
                  />
                  <NumberField
                    label="Threads"
                    value={editableParams.threads}
                    description="对应 -t，控制推理阶段 CPU 线程数，通常略低于逻辑线程数给系统留余量。"
                    onChange={(value) => updateParam("threads", value)}
                  />
                  <NumberField
                    label="Threads Batch"
                    value={editableParams.threadsBatch}
                    description="对应 -tb，控制 prompt/batch 处理线程数，可高于普通推理线程。"
                    onChange={(value) => updateParam("threadsBatch", value)}
                  />
                  <NumberField
                    label="Batch"
                    value={editableParams.batchSize}
                    description="对应 -b，控制一次处理的 token 批量，越大吞吐可能越高但显存压力更大。"
                    onChange={(value) => updateParam("batchSize", value)}
                  />
                  <NumberField
                    label="UBatch"
                    value={editableParams.ubatchSize}
                    description="对应 -ub，控制 micro-batch，常用于降低峰值显存压力。"
                    onChange={(value) => updateParam("ubatchSize", value)}
                  />
                  <OptionalNumberField
                    label="Image Tokens"
                    value={editableParams.imageMinTokens}
                    description="对应 --image-min-tokens，多模态 mmproj 输入图片时预留的最小 image token 数。"
                    onChange={(value) => updateParam("imageMinTokens", value)}
                  />
                  <OptionalNumberField
                    label="CPU MoE"
                    value={editableParams.cpuMoe}
                    description="对应 --n-cpu-moe，MoE 模型可把部分专家层留给 CPU，平衡显存占用。"
                    onChange={(value) => updateParam("cpuMoe", value)}
                  />
                  <NumberField
                    label="Parallel"
                    value={editableParams.parallel}
                    description="对应 -np，并行请求/序列数；单用户本地启动通常保持 1。"
                    onChange={(value) => updateParam("parallel", value)}
                  />
                  <CacheField
                    label="Cache K"
                    value={editableParams.cacheTypeK}
                    description="对应 --cache-type-k，KV cache 的 K 缓存类型；q4_0 更省显存，f16 更保守。"
                    onChange={(value) => updateParam("cacheTypeK", value)}
                  />
                  <CacheField
                    label="Cache V"
                    value={editableParams.cacheTypeV}
                    description="对应 --cache-type-v，KV cache 的 V 缓存类型；大上下文常用 q4_0 降低占用。"
                    onChange={(value) => updateParam("cacheTypeV", value)}
                  />
                  <ToggleField
                    label="Flash Attention"
                    checked={editableParams.flashAttn}
                    description="对应 --flash-attn on，支持时可降低显存占用并提升注意力计算效率。"
                    onChange={(value) => updateParam("flashAttn", value)}
                  />
                  <ToggleField
                    label="Jinja"
                    checked={editableParams.jinja}
                    description="对应 --jinja，启用模型聊天模板渲染，适合带 chat template 的 GGUF。"
                    onChange={(value) => updateParam("jinja", value)}
                  />
                  <ToggleField
                    label="No mmap"
                    checked={editableParams.noMmap}
                    description="对应 --no-mmap，禁用把模型文件映射到内存，可能更稳定但启动/内存行为不同。"
                    onChange={(value) => updateParam("noMmap", value)}
                  />
                  <ToggleField
                    label="Mlock"
                    checked={editableParams.mlock}
                    description="对应 --mlock，尝试锁定模型内存，减少换页；内存不足时不建议开启。"
                    onChange={(value) => updateParam("mlock", value)}
                  />
                </div>
              )}

              {recommendation && (
                <div className="explanations">
                  {recommendation.explanations.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              )}

              <div className="parameter-reference">
                <h3>参数说明</h3>
                <div>
                  {parameterReference.map((item) => (
                    <article key={item.flag}>
                      <code>{item.flag}</code>
                      <strong>{item.name}</strong>
                      <span>{item.description}</span>
                    </article>
                  ))}
                </div>
              </div>
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
          </section>
        )}

        {activeSection === "models" && (
          <section className="grid module-grid">
            <Panel title="模型目录" icon={<FolderPlus size={18} />} wide>
              <div className="actions">
                <button onClick={() => void addModelDirectory()}>
                  <FolderPlus size={16} />
                  添加模型目录
                </button>
                <button onClick={() => void pickModelFile()}>直接选模型</button>
                <button disabled={isScanning} onClick={() => void scanModels()}>
                  <RefreshCcw size={16} />
                  {isScanning ? "扫描中" : "扫描"}
                </button>
              </div>
              <p className="muted">{scanStatus}</p>
              <div className="directory-list">
                {settings.modelDirectories.length === 0 ? (
                  <span>尚未添加模型目录</span>
                ) : (
                  settings.modelDirectories.map((directory) => (
                    <span key={directory}>{directory}</span>
                  ))
                )}
              </div>
            </Panel>

            <Panel title="模型选择" icon={<Gauge size={18} />} wide>
              <div className="split">
                <ModelPicker
                  label="主模型"
                  query={modelQuery}
                  onQueryChange={setModelQuery}
                  models={visibleLaunchableModels}
                  totalCount={launchableModels.length}
                  selectedPath={selectedModelPath}
                  onSelect={setSelectedModelPath}
                  emptyLabel="未找到主模型"
                />
                <label>
                  mmproj
                  <div className="picker-shell">
                    <div className="path-row">
                      <input
                        value={mmprojQuery}
                        onChange={(event) => setMmprojQuery(event.target.value)}
                        placeholder="搜索 mmproj"
                      />
                      <button onClick={() => void pickMmprojFile()}>选择</button>
                    </div>
                    <button className={mmprojPath === "" ? "model-option active" : "model-option"} onClick={() => setMmprojPath("")}>
                      <span>不使用 mmproj</span>
                      <small>纯文本模型或暂不启用多模态</small>
                    </button>
                    <ModelOptionList
                      models={visibleMmprojModels}
                      totalCount={mmprojModels.length}
                      selectedPath={mmprojPath}
                      onSelect={setMmprojPath}
                      emptyLabel="未找到 mmproj"
                    />
                  </div>
                </label>
              </div>
              <div className="model-path">{selectedModel?.path ?? "未选择模型"}</div>
            </Panel>
          </section>
        )}

        {activeSection === "hardware" && (
          <section className="grid module-grid">
            <Panel title="硬件画像" icon={<Cpu size={18} />} wide>
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
          </section>
        )}

        {activeSection === "logs" && (
          <section className="grid module-grid">
            <Panel title="运行控制" icon={<Play size={18} />} wide>
              <div className="actions">
                <button className="primary" disabled={status.running} onClick={() => void startServer()}>
                  <Play size={16} />
                  启动
                </button>
                <button disabled={!status.running} onClick={() => void stopServer()}>
                  <Square size={16} />
                  停止
                </button>
                <button onClick={() => void refreshStatus()}>
                  <RefreshCcw size={16} />
                  刷新状态
                </button>
              </div>
            </Panel>
            <Panel title="日志" icon={<Terminal size={18} />} wide>
              <button onClick={() => void refreshLogs()}>
                <RefreshCcw size={16} />
                刷新日志
              </button>
              <div className="log-view tall">
                {logs.length === 0 ? <span>暂无日志</span> : logs.map((line, index) => <pre key={`${line}-${index}`}>{line}</pre>)}
              </div>
            </Panel>
          </section>
        )}

        {message && <div className="toast">{message}</div>}
        {closePromptOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <section className="close-dialog">
              <h2>关闭 LlamaCPP Launcher</h2>
              <p>选择后会记住，下次点击关闭会直接按这个方式处理。</p>
              <div className="close-actions">
                <button className="primary" onClick={() => void chooseCloseAction("hideToTray")}>
                  隐藏到右下角
                </button>
                <button onClick={() => void chooseCloseAction("quit")}>关闭软件</button>
                <button onClick={() => setClosePromptOpen(false)}>取消</button>
              </div>
            </section>
          </div>
        )}
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

function NumberField({
  label,
  value,
  description,
  onChange,
}: {
  label: string;
  value: number;
  description?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      {description && <span className="param-help">{description}</span>}
    </label>
  );
}

function OptionalNumberField({
  label,
  value,
  description,
  onChange,
}: {
  label: string;
  value?: number | null;
  description: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value ?? ""}
        placeholder="不启用"
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
      <span className="param-help">{description}</span>
    </label>
  );
}

function CacheField({
  label,
  value,
  description,
  onChange,
}: {
  label: string;
  value?: string | null;
  description: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <label>
      {label}
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">默认</option>
        <option value="q4_0">q4_0</option>
        <option value="q8_0">q8_0</option>
        <option value="f16">f16</option>
      </select>
      <span className="param-help">{description}</span>
    </label>
  );
}

function ToggleField({
  label,
  checked,
  description,
  onChange,
}: {
  label: string;
  checked: boolean;
  description: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <span className="toggle-row">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </span>
      <span className="param-help">{description}</span>
    </label>
  );
}

function ModelPicker({
  label,
  query,
  onQueryChange,
  models,
  totalCount,
  selectedPath,
  onSelect,
  emptyLabel,
}: {
  label: string;
  query: string;
  onQueryChange: (value: string) => void;
  models: ModelFile[];
  totalCount: number;
  selectedPath: string;
  onSelect: (path: string) => void;
  emptyLabel: string;
}) {
  return (
    <label>
      {label}
      <div className="picker-shell">
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={`搜索${label}`} />
        <ModelOptionList
          models={models}
          totalCount={totalCount}
          selectedPath={selectedPath}
          onSelect={onSelect}
          emptyLabel={emptyLabel}
        />
      </div>
    </label>
  );
}

function ModelOptionList({
  models,
  totalCount,
  selectedPath,
  onSelect,
  emptyLabel,
}: {
  models: ModelFile[];
  totalCount: number;
  selectedPath: string;
  onSelect: (path: string) => void;
  emptyLabel: string;
}) {
  if (models.length === 0) {
    return <div className="picker-empty">{emptyLabel}</div>;
  }

  return (
    <div className="model-option-list">
      {models.map((model) => (
        <button
          key={model.path}
          className={model.path === selectedPath ? "model-option active" : "model-option"}
          onClick={() => onSelect(model.path)}
        >
          <span>{model.name}</span>
          <small>{model.sizeMb ? `${model.sizeMb} MB` : "大小未知"} · {model.directory}</small>
        </button>
      ))}
      {totalCount > models.length && <div className="picker-empty">仅显示前 {models.length} 个结果，请继续输入关键词缩小范围。</div>}
    </div>
  );
}

function filterModels(models: ModelFile[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return models;
  }

  return models.filter((model) => `${model.name} ${model.path}`.toLowerCase().includes(normalizedQuery));
}

function formatGb(mb: number) {
  return (mb / 1024).toFixed(1);
}
