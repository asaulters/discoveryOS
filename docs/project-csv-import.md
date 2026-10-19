# Project CSV import

On **Projects → Import project CSV**, download the template, edit it in Excel
or another spreadsheet, and save as **CSV UTF-8**. Upload it, review the
preview, and click **Create project from CSV**. The completed project has
an **Open imported project** link.

[Download the example CSV](project-import-template.csv).

Each file creates **one new project** with its work packages, tasks and
checklist subtasks. It does not update an existing project or overwrite
meeting data. Blank optional cells use the normal tracker defaults.
Files may be up to 2 MB and contain up to 2,000 data rows.

## Format an existing spreadsheet

If a file does not match the template, upload it under **Project CSV** and
click **Format CSV**. Nothing is saved while formatting.

1. Map each source column to a DiscoveryOS column. Common headings such as
   `Item Type`, `ID`, `Parent ID` and `Title` are suggested automatically.
   Check these mappings; **Ignore column** excludes that column.
2. Review the proposed value changes. The formatter standardizes row types
   (`Work Package` → `work_package`), common statuses (`In progress` → `doing`),
   sizes (`Small` → `s`) and subtask checkboxes (`Yes` → `true`). It clears
   non-applicable fields, including `sort_order` on a project. Nonempty ignored
   values and cleared values appear in the correction table.
3. Accept the changes using the checkbox. If validation flags a problem,
   correct it in **Formatted CSV (editable)**. Validation updates as you type
   and shows the next issue after the current one is fixed. Keys and parent
   links are kept as supplied; missing parents, duplicate keys, unknown values
   and ambiguous dates need your input. Dates must use `YYYY-MM-DD`.
4. Click **Download formatted CSV** to keep a corrected copy, or **Use formatted
   CSV** to return to the import preview. Review that preview and click
   **Create project from CSV** when ready.

Changes to column mappings regenerate the formatted CSV and reset manual
edits and the acceptance checkbox. **Reset CSV edits** restores the generated
version. Malformed CSV quoting or inconsistent column counts must be corrected
in the source spreadsheet before formatting. The original file is unchanged.
The formatter runs locally in your browser; the existing owner authorization,
server validation and atomic import still apply when you create the project.

## Required columns

| Column | Meaning |
| --- | --- |
| `type` | Exactly `project`, `work_package`, `task` or `subtask`. |
| `key` | Your unique row identifier, such as `p1`, `wp1`, `t1` or `s1`. Use 1–64 letters, numbers, underscores or hyphens, starting with a letter or number. |
| `parent_key` | The parent's key. Blank on the project; project key on a work package; work-package key on a task; task key on a subtask. |
| `name` | Project/work-package name or task/subtask title, up to 500 characters. |

These are local CSV keys, not database UUIDs. Keys must be unique throughout
the file. Names may repeat. Rows can appear in any order; parent links
control the hierarchy.

A minimal complete example:

```csv
type,key,parent_key,name,notes
project,p1,,Customer portal,Project build notes
work_package,wp1,p1,Discovery,Confirm the current process
task,t1,wp1,Map the workflow,Include exceptions
subtask,s1,t1,Confirm the owner,Ask the team lead
```

## Optional columns

| Column | Applies to | Allowed values / meaning |
| --- | --- | --- |
| `notes` | All rows | Optional context, up to 20,000 characters. |
| `status` | Work packages, tasks | `todo` (default), `doing`, `blocked`, `done`. |
| `due_date` | Tasks | `YYYY-MM-DD`. |
| `target_date` | Project, work packages | `YYYY-MM-DD`. |
| `blocked_reason` | Tasks | Required when the task status is `blocked`. |
| `size` | Tasks | `s`, `m` or `l`. |
| `sort_order` | Work packages, tasks | Whole number from 0 to 1,000,000; default 0. |
| `acceptance_criteria` | Work packages | What counts as complete. |
| `requesting_team` | Project | Team requesting the work. |
| `sponsor` | Project | Project sponsor. |
| `goal` | Project | Project goal. |
| `stage` | Project | `intake` (default), `discovery`, `decide`, `build`, `pilot`, `live`, `paused`, `closed`. |
| `health` | Project | `on_track` (default), `at_risk`, `off_track`. |
| `definition_of_done` | Project | Completion criteria. |
| `is_done` | Subtasks | `true` or `false` (default). Does not change the parent task's status. |

Include optional column headings only when needed. An optional column can
exist throughout the sheet, with blank cells on rows where it does not
apply. Nonblank fields on the wrong row type, unknown headings, duplicate
keys, invalid dates/statuses and missing parents are rejected with line
numbers. Column headings and enum values are case-sensitive. There are no
assignee, file-attachment, RAID or meeting-import columns in this format.
Add project files/links after the project is created.

CSV fields containing commas, quotes or line breaks must be quoted. Double
quotes inside a quoted field are escaped by doubling them. Spreadsheet
CSV export handles this. Both LF and CRLF, a UTF-8 BOM, and quoted multiline
notes are supported. Leading/trailing cell whitespace is trimmed.

## Saving and retrying

The server validates the CSV again and sends the hierarchy to a single
owner-only, security-invoker database function. A failed row rolls back
all imported records and their activity events. The importer keeps the
same request ID when retrying after a lost response, so a retry returns
the project already created. Choosing the file again starts a new import
and can intentionally create another project with the same name.

The preview lists up to the first 100 rows and shows counts for the entire
file; all validated rows are imported. Successful imports retain normal
tracker history, task completion timestamps and owner/viewer permissions.
CSV source files are not automatically stored as attachments.
