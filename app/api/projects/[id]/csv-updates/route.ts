import { z } from "zod";
import { NextResponse } from "next/server";
import { trackerResponse } from "@/lib/tracker/api";
import { TrackerError } from "@/lib/services/tracker";
import {
  projectCsvState,
  prepareProjectCsv,
} from "@/lib/services/project-csv-updates";
import { MAX_IMPORT_BYTES } from "@/lib/tracker/csv";
import { exportUpdateCsv } from "@/lib/tracker/project-updates";
function csvResponse(csv: string, name: string) {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // trackerResponse also handles CSV Responses so all errors have the same shape.
  return trackerResponse(async () => {
    const id = z.uuid().parse((await params).id),
      query = new URL(request.url).searchParams;
    const { db, snapshot } = await projectCsvState(id);
    if (query.get("download") === "baseline")
      return csvResponse(
        exportUpdateCsv(snapshot),
        `dos-project-${id}-baseline.csv`,
      );
    if (query.get("download") === "source") {
      const runId = z.uuid().parse(query.get("run_id"));
      const result = await db
        .from("project_csv_updates")
        .select("source_csv")
        .eq("project_id", id)
        .eq("id", runId)
        .maybeSingle();
      if (result.error) throw new TrackerError(result.error.message, 400);
      if (!result.data) throw new TrackerError("CSV update not found", 404);
      return csvResponse(
        result.data.source_csv,
        `dos-project-update-${runId}.csv`,
      );
    }
    const result = await db
      .from("project_csv_updates")
      .select("id,report_date,summary,created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(20);
    if (result.error) throw new TrackerError(result.error.message, 400);
    return { updates: result.data };
  });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return trackerResponse(async () => {
    const id = z.uuid().parse((await params).id);
    const { db, snapshot, revision } = await projectCsvState(id, true);
    if (Number(request.headers.get("content-length")) > MAX_IMPORT_BYTES * 3)
      throw new TrackerError("CSV request too large", 413);
    const body = z
      .object({
        mode: z.enum(["preview", "apply"]),
        csv: z.string().max(MAX_IMPORT_BYTES),
        report_date: z.iso.date(),
        request_id: z.uuid(),
        revision: z
          .string()
          .regex(/^[a-f0-9]{32}$/)
          .optional(),
      })
      .strict()
      .parse(await request.json());
    const plan = prepareProjectCsv(body.csv, snapshot, body.report_date);
    if (body.mode === "preview")
      return {
        revision,
        report_date: plan.reportDate,
        summary: plan.summary,
        changes: plan.changes,
        counts: plan.counts,
      };
    if (!body.revision)
      throw new TrackerError("Preview the CSV before applying it", 400);
    const result = await db.rpc("apply_project_csv_update", {
      p_project_id: id,
      p_request_id: body.request_id,
      p_revision: body.revision,
      p_report_date: plan.reportDate,
      p_summary: plan.summary,
      p_csv: body.csv,
      p_operations: plan.operations,
      p_changes: plan.changes,
    });
    if (result.error)
      throw new TrackerError(
        result.error.message,
        ["PT409", "40001", "23505"].includes(result.error.code)
          ? 409
          : result.error.code === "42501"
            ? 403
            : 400,
      );
    return result.data;
  });
}
