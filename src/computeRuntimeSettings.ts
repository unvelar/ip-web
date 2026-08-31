export interface MinimumCapacitySettingsPatch {
  minimumPods?: number;
  minimumPodsUntil?: string | null;
  gpuTypeIds?: string[];
  minimumGpuMemoryGb?: number;
}

export function computeRuntimeSettingsPatchBody(
  expectedVersion: number,
  settings: MinimumCapacitySettingsPatch,
  minimumPodsDurationHours?: 4 | 8 | 24,
  pool?: string,
) {
  return {
    expectedVersion,
    settings,
    ...(minimumPodsDurationHours === undefined ? {} : { minimumPodsDurationHours }),
    ...(pool === undefined ? {} : { pool }),
  };
}
