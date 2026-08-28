export interface MinimumCapacitySettingsPatch {
  minimumPods?: number;
  minimumPodsUntil?: string | null;
}

export function computeRuntimeSettingsPatchBody(
  expectedVersion: number,
  settings: MinimumCapacitySettingsPatch,
  minimumPodsDurationHours?: 4 | 8 | 24,
) {
  return {
    expectedVersion,
    settings,
    ...(minimumPodsDurationHours === undefined ? {} : { minimumPodsDurationHours }),
  };
}
