export const TASK_STATUSES = ["todo", "doing", "blocked", "done"] as const;
export const PROJECT_STAGES = [
  "intake",
  "discovery",
  "decide",
  "build",
  "pilot",
  "live",
  "paused",
  "closed",
] as const;
export const PROJECT_HEALTH = ["on_track", "at_risk", "off_track"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Certainty = "known" | "inferred" | "unknown";
export interface TrackerTimestamps extends Record<string, unknown> {
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}
export interface Project extends TrackerTimestamps {
  id: string;
  name: string;
  requesting_team: string | null;
  sponsor: string | null;
  goal: string | null;
  stage: (typeof PROJECT_STAGES)[number];
  health: (typeof PROJECT_HEALTH)[number];
  target_date: string | null;
  definition_of_done: string | null;
}
export interface Provenance {
  source_type: string | null;
  source_meeting_id: string | null;
  source_item_id: string | null;
  evidence_quote: string | null;
  certainty: Certainty | null;
}
export interface WorkPackage extends TrackerTimestamps, Provenance {
  id: string;
  project_id: string;
  name: string;
  status: TaskStatus;
  sort_order: number;
  target_date: string | null;
  acceptance_criteria: string | null;
}
export interface Task extends TrackerTimestamps, Provenance {
  id: string;
  work_package_id: string;
  title: string;
  status: TaskStatus;
  blocked_reason: string | null;
  due_date: string | null;
  size: "s" | "m" | "l" | null;
  notes: string | null;
  sort_order: number;
  completed_at: string | null;
}
export interface ProjectEvent extends Record<string, unknown> {
  id: string;
  project_id: string;
  entity_type: "project" | "work_package" | "task";
  entity_id: string;
  action: string;
  from_value: unknown;
  to_value: unknown;
  created_at: string;
}
export interface TrackerData {
  projects: Project[];
  workPackages: WorkPackage[];
  tasks: Task[];
  events: ProjectEvent[];
}
export interface WeekTask {
  task: Task;
  workPackage: WorkPackage;
  project: Project;
}
export function label(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "Doing",
  blocked: "Blocked",
  done: "Done",
};
