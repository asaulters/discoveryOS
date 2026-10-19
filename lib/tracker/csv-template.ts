import { CSV_COLUMNS } from "./csv";
const rows: Record<string, string>[] = [
  {
    type: "project",
    key: "p1",
    name: "Example project",
    notes: "Build notes and project context",
    requesting_team: "Operations",
    goal: "Improve the approval process",
    stage: "discovery",
    health: "on_track",
  },
  {
    type: "work_package",
    key: "wp1",
    parent_key: "p1",
    name: "Validate the workflow",
    notes: "Interview process owners",
    status: "todo",
    acceptance_criteria: "Current process confirmed",
  },
  {
    type: "task",
    key: "t1",
    parent_key: "wp1",
    name: "Map approval steps",
    notes: "Include exceptions and backup owners",
    status: "todo",
    size: "s",
  },
  {
    type: "subtask",
    key: "s1",
    parent_key: "t1",
    name: "Confirm backup owner",
    notes: "Ask the team lead",
    is_done: "false",
  },
  {
    type: "subtask",
    key: "s2",
    parent_key: "t1",
    name: "Document escalation",
    is_done: "false",
  },
];
const escape = (s: string) =>
  /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
export const PROJECT_CSV_TEMPLATE =
  [
    CSV_COLUMNS.join(","),
    ...rows.map((r) => CSV_COLUMNS.map((c) => escape(r[c] || "")).join(",")),
  ].join("\n") + "\n";
