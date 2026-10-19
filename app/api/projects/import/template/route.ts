import { PROJECT_CSV_TEMPLATE } from "@/lib/tracker/csv-template";
export async function GET() {
  return new Response(PROJECT_CSV_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="discoveryos-project-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
