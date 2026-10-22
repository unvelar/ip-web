export interface MinimumCapacitySettingsPatch {
  maxPods?: number;
  firstPodQueueThreshold?: number;
  jobsPerPodTarget?: number;
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


type AutoscalingLimits = Required<Pick<MinimumCapacitySettingsPatch,
  "maxPods" | "firstPodQueueThreshold" | "jobsPerPodTarget">>;

/** A zero cap disables RunPod and clears any warm-capacity window atomically. */
export function computeAutoscalingSettingsPatch(
  current: Pick<MinimumCapacitySettingsPatch, "minimumPods" | "minimumPodsUntil">,
  limits: AutoscalingLimits,
  now = Date.now(),
): MinimumCapacitySettingsPatch {
  const minimumActive = (current.minimumPods ?? 0) > 0
    && current.minimumPodsUntil != null
    && Date.parse(current.minimumPodsUntil) > now;
  if (limits.maxPods === 0 || !minimumActive) {
    return { ...limits, minimumPods: 0, minimumPodsUntil: null };
  }
  if ((current.minimumPods ?? 0) > limits.maxPods) {
    throw new Error("Maximum pods cannot be lower than the active minimum-pod setting. End the warm window first, or set maximum pods to 0 to disable RunPod.");
  }
  return limits;
}
