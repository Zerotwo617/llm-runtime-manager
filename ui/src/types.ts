export type LaunchProfile = "model_limit" | "balanced" | "conservative" | "custom";
export type CloseAction = "ask" | "hideToTray" | "quit";

export interface AppSettings {
  serverPath: string;
  modelDirectories: string[];
  lastModelPath?: string | null;
  lastMmprojPath?: string | null;
  profile: LaunchProfile;
  host: string;
  port: number;
  closeAction: CloseAction;
}

export interface GpuInfo {
  name: string;
  backend: string;
  totalVramMb: number;
  freeVramMb?: number | null;
}

export interface DeviceProfile {
  cpuLogicalThreads: number;
  totalRamMb: number;
  availableRamMb: number;
  gpus: GpuInfo[];
  notes: string[];
}

export interface ModelFile {
  path: string;
  name: string;
  directory: string;
  sizeMb: number;
  isMmproj: boolean;
}

export interface SelectedModel {
  path: string;
  name: string;
  sizeMb: number;
  isMmproj: boolean;
}

export interface RecommendationRequest {
  serverPath: string;
  model: SelectedModel;
  mmprojPath?: string | null;
  profile: LaunchProfile;
  host: string;
  port: number;
  extraArgs: string;
}

export interface LaunchParameters {
  serverPath: string;
  modelPath: string;
  mmprojPath?: string | null;
  imageMinTokens?: number | null;
  gpuLayers: number;
  cpuMoe?: number | null;
  flashAttn: boolean;
  jinja: boolean;
  contextSize: number;
  threads: number;
  threadsBatch: number;
  batchSize: number;
  ubatchSize: number;
  cacheTypeK?: string | null;
  cacheTypeV?: string | null;
  noMmap: boolean;
  mlock: boolean;
  parallel: number;
  host: string;
  port: number;
  extraArgs: string;
}

export interface LaunchRecommendation {
  parameters: LaunchParameters;
  commandPreview: string;
  explanations: string[];
}

export interface ProcessStatus {
  running: boolean;
  command?: string | null;
  message: string;
}
