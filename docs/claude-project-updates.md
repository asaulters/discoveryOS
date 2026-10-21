# DiscoveryOS daily project updates — handoff for Claude

DiscoveryOS (DOS) stores projects → work packages → tasks → checklist subtasks.
A daily CSV can update that existing hierarchy, add explicitly requested items,
and preserve dated progress/context. It never deletes or archives omitted rows.
The upload is made **inside the existing project**, not through Projects →
Import project CSV, which creates a new project.

## Adam's workflow

1. Open the project in DOS → **Daily CSV updates** → **Download current CSV baseline**.
2. Give that baseline, the prompt below, and today's actual work/context to Claude.
3. Claude returns one UTF-8 CSV. Save it as `triage-agent-update-YYYY-MM-DD.csv`.
4. In the same DOS project, upload under **Project update CSV**, choose the report
   date if it is absent from the project row, and click **Preview project updates**.
5. Review the before/after values, identity matches, new-item count and summary.
   Check the review box and click **Apply CSV updates**. All rows save together.
6. Download a fresh baseline after saving and use it for the next update. This
   includes new DOS IDs, saved keys and any changes made manually in DOS.

The supplied older triage CSV contains 1 project, 9 work packages, 42 tasks and
23 subtasks. Its existing columns remain supported. On first intake, rows
without `record_id` match only by an exact name within the exact parent.
Ambiguous, missing, archived or wrong-project matches stop the upload. No
fuzzy matching is performed. Downloading a current DOS baseline is preferred
because it includes real IDs and the latest progress. Once applied, keys are
saved, so subsequent updates can match the same records even if names change.

The supplied file puts blocker text on `wp7` and `wp8` in `blocked_reason`.
That column is task-only. The cleaned reference template preserves those two
messages in the work-package `notes` instead; the original file is unchanged.

Blank cells leave existing values unchanged. Rows absent from the CSV remain
unchanged. Nonblank values replace the corresponding field. Download the latest
baseline before generating a file: an older full file can propose replacing
newer manual work, which is visible in the before/after preview. DOS also
rejects applying a preview if the hierarchy changed after that preview.

## Copy this prompt to Claude

```text
You are preparing a daily CSV update for my existing DiscoveryOS (DOS) project.
Use the latest DOS-exported baseline I attach as the authoritative record list.
Use my work notes/conversation as evidence for progress, not as permission to
invent completed work or silently change scope.

Return a downloadable UTF-8 CSV with the same headers and the full hierarchy.
Do not put Markdown fences, commentary, or instructions inside the CSV.

Identity rules:
- Preserve every existing type, key, parent_key and record_id exactly.
- Keep keys stable forever; never renumber them or reuse a removed item's key.
- Names may change when identity stays the same. Do not move items to another parent.
- Existing rows use action=update. For new work, use a new unique key,
  action=create, a blank record_id, and an existing/included parent_key.
- Do not guess UUIDs. DOS assigns IDs to new items on save.
- Do not remove rows to represent completion or deletion. Omitted rows are untouched.
- Include the project row and all ancestors of any row you include.

Update rules:
- Change only facts supported by today's work. Ask me about uncertain progress.
- Keep unchanged values from the latest baseline, or leave the cell blank.
  Blank cells NEVER mean clear, false, zero, todo or delete.
- Prefer progress_note for new notes, decisions, blockers, evidence, context,
  handoff details and next steps. DOS appends it to existing notes with the report date.
- Leave notes blank unless deliberately replacing the complete current notes.
  Never rewrite old notes merely to add a sentence; use progress_note instead.
- On the project row only, set report_date=YYYY-MM-DD and update_summary to a
  concise factual overview: completed, in progress, blocked, decisions, next steps.
- Use clear_fields only when I explicitly want an optional field cleared.
  It is a semicolon-separated list, e.g. due_date;blocked_reason. Leave those
  value cells blank. Do not clear names, status, stage, health, sort_order or is_done.
- Work package/task status is todo, doing, blocked or done. A blocked task
  needs a nonempty blocked_reason (existing reason can remain if unchanged).
- Subtask completion uses is_done=true or false, never yes/no or status=done.
  Completing a task does not automatically complete its subtasks, and vice versa.
- Preserve ordering unless I explicitly ask to reorder. A nonblank sort_order
  applies to work packages, tasks and subtasks; it does not apply to the project.
- Dates are YYYY-MM-DD. Task size is s, m or l. Never use placeholder dates.
- Keep inapplicable fields blank on each row type. Do not fill project status,
  subtask status, project sort_order or task target_date.
- Quote fields containing commas, line breaks or double quotes. Escape embedded
  double quotes by doubling them. Use real CSV, not a Markdown table.
- Maximum 2 MB and 2,000 data rows. Do not embed attachments or base64 content.

Before delivering, check unique keys, correct parents, valid enums/dates,
unchanged IDs, explicit create actions and row-specific fields. Give me a brief
plain-language summary separately from the CSV, and identify uncertainties.
```

## File format

[Illustrative CSV template](project-update-template.csv). For the actual daily
file, start from **Download current CSV baseline**, which supplies real IDs.
The old create-project template and formatter are a separate workflow and do
not accept the added daily-update metadata columns.

Required headers: `type,key,parent_key,name`. The complete header is:

```csv
type,key,parent_key,name,notes,status,due_date,target_date,blocked_reason,size,sort_order,acceptance_criteria,requesting_team,sponsor,goal,stage,health,definition_of_done,is_done,record_id,action,clear_fields,report_date,update_summary,progress_note
```

| Field | Rule |
| --- | --- |
| `type` | `project`, `work_package`, `task`, `subtask`; never change an existing type. |
| `key` | Stable unique project-local identity, 1–64 letters/numbers/underscores/hyphens, starting with a letter or number. |
| `parent_key` | Blank for project; project key for WP; WP key for task; task key for subtask. Include the parent row. |
| `record_id` | Real DOS UUID from its export. Preserve for existing items; blank for new ones. |
| `action` | `update` (also the default when blank), or `create` for an explicitly new child. Previously created keys match the saved record on retry. |
| `name` | Project/WP name or task/subtask title, up to 500 characters. Required for a new item. A blank name on an ID/key-matched update preserves it. |
| `notes` | All types. A nonblank cell replaces the complete notes (max 20,000 characters). Blank preserves them. Prefer `progress_note` for daily additions. |
| `progress_note` | All types. Appends `[report_date] text` to notes. The same exact dated note block is not appended twice. Total notes must remain under 20,000 characters. |
| `report_date` | Project row only; ISO date. If blank/absent, use the report-date input in DOS. |
| `update_summary` | Project row only; human-readable daily summary retained with this upload (max 20,000 characters). |
| `clear_fields` | Semicolon-separated optional field names to set to null. Value cells for those fields must be blank. |
| `status` | WP/task only: `todo`, `doing`, `blocked`, `done`. Blank preserves the existing status; a new item defaults to `todo`. |
| `is_done` | Subtask only: `true` or `false`; blank preserves, new items default false. |
| `sort_order` | WP/task/subtask only. Integer 0–1,000,000. Blank preserves existing order. New WPs/tasks default to 0; new subtasks append unless an order is supplied. |
| `due_date` | Task only: ISO date. |
| `target_date` | Project/WP only: ISO date. |
| `blocked_reason` | Task only. Required for a blocked task. |
| `size` | Task only: `s`, `m`, `l`. |
| `acceptance_criteria` | WP only. |
| `requesting_team`, `sponsor`, `goal`, `definition_of_done` | Project only. |
| `stage` | Project only: `intake`, `discovery`, `decide`, `build`, `pilot`, `live`, `paused`, `closed`. |
| `health` | Project only: `on_track`, `at_risk`, `off_track`. |

Only the nullable fields applicable to that type can be cleared: `notes`,
`due_date`, `target_date`, `blocked_reason`, `size`, `acceptance_criteria`,
`requesting_team`, `sponsor`, `goal`, `definition_of_done`.

New-row defaults are applied only on creation. Blank values on an existing
record never reset it to those defaults. Do not mark a work package done simply
because one task is done; report completion based on actual work.

## How intake works

DOS validates quoting, field names, row types, limits, dates and hierarchy,
then resolves each row to an existing record or an explicit new item. IDs and
saved keys are authoritative; unique exact name/parent matching is only for
an initial baseline. The preview shows how every item matched, fields that
would change, and create/update/unchanged counts.

When Adam confirms, DOS revalidates on the server and applies everything in
one owner-checked database transaction. A concurrent hierarchy change after
preview rejects the save and requires a new preview. A failed row or activity
write rolls back the entire upload. Re-uploading the same file with the same
report date/summary does not add duplicate items or progress notes. Use a new
report date for new daily work.

Saved upload history contains the report date, summary, original CSV, changes
and before/after hierarchy snapshots. The latest 20 entries are listed in the
project, with original-file downloads; older history remains stored. Daily
progress notes also remain on the individual records. This is an audit trail,
not an automatic undo feature. Viewers can read history/baselines but cannot
upload changes. No AI API call is made by intake.

CSV updates do not change meeting evidence, project attachments/links, RAID,
archive state, or parent relationships. Use the existing DOS controls for those.
File attachments continue to live in the project's Files and links section.

### Readable notes and summaries

DOS displays Markdown in project notes and goals, work package notes and acceptance criteria, task/subtask notes, resource descriptions, and CSV update summaries. Use short paragraphs, `##` section headings, `-` bullet lists, `**bold**` labels, Markdown links, and tables. Plain text and line breaks also display correctly. HTML is not rendered.

Keep CSV rules unchanged: quote fields containing commas or line breaks, escape embedded quotes by doubling them, and preserve keys and record IDs. Formatting belongs inside the existing `notes`, `progress_note`, and `update_summary` cells; do not add columns for it. A concise update summary with Progress, Blockers, and Next steps sections is easiest to scan.
