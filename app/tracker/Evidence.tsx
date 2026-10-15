import Link from "next/link";
import type { Provenance } from "@/lib/tracker/types";
export default function Evidence({ item }: { item: Provenance }) {
  if (!item.source_type && !item.evidence_quote && !item.certainty) return null;
  return (
    <aside className="my-3 border-l-2 border-neutral-300 pl-3 text-sm">
      <p className="whitespace-pre-wrap">{item.evidence_quote || "No quote"}</p>
      <p className="text-xs text-neutral-500">
        Certainty: {item.certainty || "unknown"}
      </p>
      {item.source_meeting_id ? (
        <Link
          className="text-xs underline"
          href={`/meetings/${item.source_meeting_id}/review`}
        >
          Source meeting
        </Link>
      ) : item.source_type ? (
        <p className="text-xs text-neutral-500">Meeting deleted</p>
      ) : null}
    </aside>
  );
}
