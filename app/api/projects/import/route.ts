import { z } from "zod";
import { trackerResponse } from "@/lib/tracker/api";
import { getAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TrackerError } from "@/lib/services/tracker";
import { parseProjectCsv, MAX_IMPORT_BYTES } from "@/lib/tracker/csv";
export async function POST(request: Request) {
  return trackerResponse(async () => {
    if ((await getAuth()).role !== "owner")
      throw new TrackerError("Owner role required", 403);
    if (Number(request.headers.get("content-length")) > MAX_IMPORT_BYTES * 2)
      throw new TrackerError("CSV request is too large", 413);
    const body = z
      .object({ csv: z.string().max(MAX_IMPORT_BYTES), request_id: z.uuid() })
      .strict()
      .parse(await request.json());
    let parsed;
    try {
      parsed = parseProjectCsv(body.csv);
    } catch (e) {
      throw new TrackerError(
        e instanceof Error ? e.message : "Invalid CSV",
        400,
      );
    }
    const db = await createServerSupabaseClient(),
      result = await db.rpc("import_project_csv", {
        p_request_id: body.request_id,
        p_rows: parsed.rows.map(({ type, key, parent_key, data }) => ({
          type,
          key,
          parent_key,
          data,
        })),
      });
    if (result.error)
      throw new TrackerError(
        result.error.message,
        result.error.code === "42501"
          ? 403
          : result.error.code === "23505"
            ? 409
            : 400,
      );
    return result.data;
  }, 201);
}
