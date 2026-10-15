import type { Task, TrackerData, WeekTask } from "./types";

export function progress(tasks: Task[]) {
  const active = tasks.filter((t) => !t.archived_at);
  return {
    total: active.length,
    done: active.filter((t) => t.status === "done").length,
    blocked: active.filter((t) => t.status === "blocked").length,
  };
}
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
export function weekWindow(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return {
    today: dateKey(now),
    upcomingEnd: dateKey(addDays(now, 6)),
    start,
    end: addDays(start, 7),
  };
}
export function weekTasks(
  data: TrackerData,
  now: Date,
  showArchived = false,
): { open: WeekTask[]; completed: WeekTask[] } {
  const projects = new Map(
    data.projects
      .filter((p) => showArchived || !p.archived_at)
      .map((p) => [p.id, p]),
  );
  const packages = new Map(
    data.workPackages
      .filter(
        (w) => (showArchived || !w.archived_at) && projects.has(w.project_id),
      )
      .map((w) => [w.id, w]),
  );
  const window = weekWindow(now);
  const open: WeekTask[] = [],
    completed: WeekTask[] = [];
  for (const task of data.tasks) {
    const workPackage = packages.get(task.work_package_id);
    if ((!showArchived && task.archived_at) || !workPackage) continue;
    const row = {
      task,
      workPackage,
      project: projects.get(workPackage.project_id)!,
    };
    if (task.status === "done") {
      const completedAt = task.completed_at
        ? new Date(task.completed_at)
        : null;
      if (
        completedAt &&
        completedAt >= window.start &&
        completedAt < window.end
      )
        completed.push(row);
    } else if (
      task.status === "doing" ||
      task.status === "blocked" ||
      (task.due_date && task.due_date <= window.upcomingEnd)
    )
      open.push(row);
  }
  const sort = (a: WeekTask, b: WeekTask) =>
    (a.task.due_date ?? "9999").localeCompare(b.task.due_date ?? "9999") ||
    a.task.sort_order - b.task.sort_order ||
    a.task.title.localeCompare(b.task.title);
  return { open: open.sort(sort), completed: completed.sort(sort) };
}
export function groupByDay(rows: WeekTask[], now: Date) {
  const today = dateKey(now);
  const groups = new Map<string, WeekTask[]>([["Overdue", []]]);
  for (let day = 0; day < 7; day++) groups.set(dateKey(addDays(now, day)), []);
  for (const row of rows) {
    const date = row.task.due_date;
    const key = !date ? "No date" : date < today ? "Overdue" : date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  // Doing/blocked tasks can also have dates beyond the upcoming seven days.
  const overdue = groups.get("Overdue")!,
    noDate = groups.get("No date") ?? [];
  const dated = [...groups]
    .filter(([k]) => k !== "Overdue" && k !== "No date")
    .sort(([a], [b]) => a.localeCompare(b));
  return [["Overdue", overdue], ...dated, ["No date", noDate]] as [
    string,
    WeekTask[],
  ][];
}
