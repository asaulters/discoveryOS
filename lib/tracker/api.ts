import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { TrackerError } from "@/lib/services/tracker";
export async function trackerResponse(
  fn: () => Promise<unknown>,
  status = 200,
) {
  try {
    const result = await fn();
    return result instanceof Response
      ? result
      : NextResponse.json(result, { status });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Tracker request failed",
      },
      {
        status:
          error instanceof TrackerError
            ? error.status
            : error instanceof SyntaxError
              ? 400
              : 500,
      },
    );
  }
}
