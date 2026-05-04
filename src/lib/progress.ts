type ProgressLike = {
  percent: number;
  completedAt: Date | null;
};

export type ProgressState = "completed" | "behind" | "on_track";

export function getProgressState(
  endsOn: Date,
  progress?: ProgressLike | null,
): ProgressState {
  if (progress?.completedAt || (progress?.percent ?? 0) >= 100) {
    return "completed";
  }

  if (endsOn < new Date()) {
    return "behind";
  }

  return "on_track";
}
