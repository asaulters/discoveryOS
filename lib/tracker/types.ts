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
  notes: string | null;
}
export interface Provenance {
  source_type: string | null;
  source_meeting_id: string | null;
  source_item_id: string | null;
  source_item_key: string | null;
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
  notes: string | null;
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
export interface Subtask extends TrackerTimestamps {
  id: string;
  task_id: string;
  title: string;
  notes: string | null;
  is_done: boolean;
}
export interface ProjectEvent extends Record<string, unknown> {
  id: string;
  project_id: string;
  entity_type: "project" | "work_package" | "task" | "raid_item";
  entity_id: string;
  action: string;
  from_value: unknown;
  to_value: unknown;
  created_at: string;
}
export const RAID_KINDS = ["risk", "assumption", "issue", "decision"] as const;
export const RAID_STATUSES = ["open", "resolved", "dismissed"] as const;
export interface RaidItem extends TrackerTimestamps, Provenance {
  id: string;
  project_id: string;
  kind: (typeof RAID_KINDS)[number];
  title: string;
  detail: string | null;
  status: (typeof RAID_STATUSES)[number];
  owner: string | null;
  recommendation_type: string | null;
  confidence: string | null;
  resolved_at: string | null;
}
export interface TrackerData {
  projects: Project[];
  workPackages: WorkPackage[];
  tasks: Task[];
  events: ProjectEvent[];
  raidItems: RaidItem[];
  subtasks: Subtask[];
  meetings: { id: string; name: string; project_id: string | null }[];
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

export interface ProjectAttachment extends TrackerTimestamps {
  id: string;
  project_id: string;
  kind: "file" | "link";
  name: string;
  description: string | null;
  url: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  content_type: string | null;
  state: "pending" | "ready";
}
