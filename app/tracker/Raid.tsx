"use client";
import { useState } from "react";
import { OwnerOnly, WriteSelect } from "@/app/RoleControls";
import { RAID_KINDS, RAID_STATUSES, label } from "@/lib/tracker/types";
import Evidence from "./Evidence";
import {
  RecordForm,
  buttonClass,
  inputClass,
  panelClass,
  useTracker,
} from "./shared";
export default function Raid({
  tracker,
  showArchived,
}: {
  tracker: ReturnType<typeof useTracker>;
  showArchived: boolean;
}) {
  const [adding, setAdding] = useState(false),
    project = tracker.data.projects[0];
  return (
    <section>
      <OwnerOnly>
        <button
          className={buttonClass}
          disabled={!!project.archived_at}
          onClick={() => setAdding(!adding)}
        >
          {adding ? "Cancel" : "Add RAID item"}
        </button>
        {adding && (
          <RecordForm
            busy={tracker.busy}
            fields={[
              { name: "title", label: "Title", required: true },
              {
                name: "kind",
                label: "Kind",
                type: "select",
                options: RAID_KINDS,
              },
              { name: "detail", label: "Detail", type: "textarea" },
              { name: "owner", label: "Owner" },
            ]}
            save={async (v) => {
              if (
                await tracker.mutate("/api/raid-items", "POST", {
                  ...v,
                  project_id: project.id,
                })
              )
                setAdding(false);
            }}
          />
        )}
      </OwnerOnly>
      {RAID_KINDS.map((kind) => (
        <section key={kind} className="my-6">
          <h2 className="mb-3 font-semibold">{label(kind)}</h2>
          {tracker.data.raidItems
            .filter((r) => r.kind === kind && (showArchived || !r.archived_at))
            .map((r) => (
              <article className={`${panelClass} my-3`} key={r.id}>
                <h3 className="font-medium">{r.title}</h3>
                <p className="my-2 whitespace-pre-wrap text-sm">{r.detail}</p>
                <p className="text-xs text-neutral-500">
                  {label(r.status)}
                  {r.archived_at ? " · Archived" : ""}
                  {r.owner ? ` · Owner: ${r.owner}` : ""}
                  {r.recommendation_type
                    ? ` · ${label(r.recommendation_type)}`
                    : ""}
                  {r.confidence ? ` · ${r.confidence} confidence` : ""}
                </p>
                <Evidence item={r} />
                <OwnerOnly>
                  <div className="flex gap-3">
                    <label className="text-sm">
                      Status
                      <WriteSelect
                        aria-label={`Status for ${r.title}`}
                        className={inputClass}
                        value={r.status}
                        disabled={
                          tracker.busy ||
                          !!r.archived_at ||
                          !!project.archived_at
                        }
                        onChange={(e) =>
                          tracker.mutate(`/api/raid-items/${r.id}`, "PATCH", {
                            status: e.target.value,
                          })
                        }
                      >
                        {RAID_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </WriteSelect>
                    </label>
                    <button
                      className={buttonClass}
                      disabled={tracker.busy || !!project.archived_at}
                      onClick={() =>
                        tracker.mutate(`/api/raid-items/${r.id}`, "PATCH", {
                          archived: !r.archived_at,
                        })
                      }
                    >
                      {r.archived_at ? "Restore" : "Archive"}
                    </button>
                  </div>
                </OwnerOnly>
              </article>
            ))}
        </section>
      ))}
    </section>
  );
}
