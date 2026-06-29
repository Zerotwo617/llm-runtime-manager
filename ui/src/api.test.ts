import { describe, expect, it } from "vitest";
import { normalizeDeviceProfile, normalizeModelFile } from "./api";

describe("Tauri API normalization", () => {
  it("maps snake_case hardware fields into UI camelCase fields", () => {
    const profile = normalizeDeviceProfile({
      cpu_logical_threads: 24,
      total_ram_mb: 65536,
      available_ram_mb: 49152,
      gpus: [
        {
          name: "NVIDIA GeForce RTX 5070 Ti",
          backend: "nvidia",
          total_vram_mb: 16384,
          free_vram_mb: 12000,
        },
      ],
      notes: [],
    });

    expect(profile.cpuLogicalThreads).toBe(24);
    expect(profile.totalRamMb).toBe(65536);
    expect(profile.availableRamMb).toBe(49152);
    expect(profile.gpus[0].totalVramMb).toBe(16384);
    expect(profile.gpus[0].freeVramMb).toBe(12000);
  });

  it("keeps mmproj files out of the main model list and preserves model size", () => {
    const model = normalizeModelFile({
      path: "D:\\models\\Qwythos-9B-Q4_K_M.gguf",
      name: "Qwythos-9B-Q4_K_M.gguf",
      directory: "D:\\models",
      size_mb: 6144,
      is_mmproj: false,
    });
    const projector = normalizeModelFile({
      path: "D:\\models\\mmproj-Qwythos-f16.gguf",
      name: "mmproj-Qwythos-f16.gguf",
      directory: "D:\\models",
      size_mb: 512,
      is_mmproj: true,
    });

    expect(model.sizeMb).toBe(6144);
    expect(model.isMmproj).toBe(false);
    expect(projector.sizeMb).toBe(512);
    expect(projector.isMmproj).toBe(true);
  });
});
