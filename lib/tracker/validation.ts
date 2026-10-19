import { z } from "zod";
import {
  PROJECT_HEALTH,
  PROJECT_STAGES,
  TASK_STATUSES,
  RAID_KINDS,
  RAID_STATUSES,
} from "./types";
const name = z.string().trim().min(1).max(500);
const text = z.string().max(20000).nullable();
const date = z.iso.date().nullable();
const order = z.number().int().min(0).max(1000000);
const projectFields = {
  name,
  requesting_team: text,
  sponsor: text,
  goal: text,
  stage: z.enum(PROJECT_STAGES),
  health: z.enum(PROJECT_HEALTH),
  target_date: date,
  definition_of_done: text,
};
const packageFields = {
  name,
  status: z.enum(TASK_STATUSES),
  sort_order: order,
  target_date: date,
  acceptance_criteria: text,
  notes: text,
};
const taskFields = {
  title: name,
  status: z.enum(TASK_STATUSES),
  blocked_reason: text,
  due_date: date,
  size: z.enum(["s", "m", "l"]).nullable(),
  notes: text,
  sort_order: order,
};
export const projectCreate = z
  .object(projectFields)
  .partial()
  .required({ name: true })
  .strict();
export const projectPatch = z
  .object({ ...projectFields, archived: z.boolean() })
  .partial()
  .strict();
export const packageCreate = z
  .object({ ...packageFields, project_id: z.uuid() })
  .partial()
  .required({ name: true, project_id: true })
  .strict();
export const packagePatch = z
  .object({ ...packageFields, archived: z.boolean() })
  .partial()
  .strict();
export const taskCreate = z
  .object({ ...taskFields, work_package_id: z.uuid() })
  .partial()
  .required({ title: true, work_package_id: true })
  .strict();
export const taskPatch = z
  .object({ ...taskFields, archived: z.boolean() })
  .partial()
  .strict();
export const entityId = z.uuid();

const raidFields = {
  title: name,
  kind: z.enum(RAID_KINDS),
  detail: text,
  owner: text,
  status: z.enum(RAID_STATUSES),
};
export const raidCreate = z
  .object({ ...raidFields, project_id: z.uuid() })
  .partial()
  .required({ title: true, kind: true, project_id: true })
  .strict();
export const raidPatch = z
  .object({ ...raidFields, archived: z.boolean() })
  .partial()
  .strict();
export const sendBatch = z
  .object({
    project_id: z.uuid(),
    work_package_id: z.uuid().nullable().optional(),
    items: z
      .array(
        z
          .object({
            source_type: z.enum([
              "followup",
              "open_question",
              "workflow_gap",
              "mismatch",
              "risk",
              "recommendation",
              "experiment",
            ]),
            source_item_id: z.uuid(),
            source_item_key: z.string().nullable(),
            title: name.optional(),
            certainty: z.enum(["known", "inferred", "unknown"]).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const subtaskCreate = z
  .object({ task_id: z.uuid(), title: name, notes: text.optional() })
  .strict();
export const subtaskPatch = z
  .object({
    title: name,
    notes: text,
    is_done: z.boolean(),
    archived: z.boolean(),
  })
  .partial()
  .strict();
