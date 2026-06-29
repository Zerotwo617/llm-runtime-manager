import type { DeviceProfile, ModelFile } from "./types";

type AnyRecord = Record<string, unknown>;

export function normalizeDeviceProfile(raw: unknown): DeviceProfile {
  const value = asRecord(raw);
  const gpus = Array.isArray(value.gpus) ? value.gpus : [];
  const notes = Array.isArray(value.notes) ? value.notes.filter((item): item is string => typeof item === "string") : [];

  return {
    cpuLogicalThreads: toNumber(value.cpuLogicalThreads ?? value.cpu_logical_threads),
    totalRamMb: toNumber(value.totalRamMb ?? value.total_ram_mb),
    availableRamMb: toNumber(value.availableRamMb ?? value.available_ram_mb),
    gpus: gpus.map((gpu) => {
      const item = asRecord(gpu);
      return {
        name: String(item.name ?? "Unknown GPU"),
        backend: String(item.backend ?? "unknown"),
        totalVramMb: toNumber(item.totalVramMb ?? item.total_vram_mb),
        freeVramMb: optionalNumber(item.freeVramMb ?? item.free_vram_mb),
      };
    }),
    notes,
  };
}

export function normalizeModelFile(raw: unknown): ModelFile {
  const value = asRecord(raw);
  const path = String(value.path ?? "");
  const name = String(value.name ?? path.split(/[\\/]/).pop() ?? "unknown.gguf");
  const isMmproj = Boolean(value.isMmproj ?? value.is_mmproj ?? name.toLowerCase().includes("mmproj"));

  return {
    path,
    name,
    directory: String(value.directory ?? path.replace(/[\\/][^\\/]+$/, "")),
    sizeMb: toNumber(value.sizeMb ?? value.size_mb),
    isMmproj,
  };
}

export function normalizeModelFiles(raw: unknown): ModelFile[] {
  return Array.isArray(raw) ? raw.map(normalizeModelFile) : [];
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toNumber(value);
}
