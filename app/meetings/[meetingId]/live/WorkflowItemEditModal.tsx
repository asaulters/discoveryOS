"use client";

import { WriteInput, WriteTextarea, WriteButton } from "@/app/RoleControls";

import { useState } from "react";
import type { WorkflowItemType } from "@/lib/services/workflows";

export interface EditableWorkflowItem {
  itemType: WorkflowItemType;
  itemId: string;
  /** "Title" for steps, "Label" for components/gaps - drives the text field's caption. */
  textFieldLabel: string;
  text: string;
  description: string | null;
  humanNote: string | null;
}

export interface WorkflowItemEditPatch {
  text: string;
  description: string | null;
  humanNote: string | null;
}

/**
 * Rendered with `key={item.itemId}` by the caller so opening a different
 * item remounts this component and resets local state from its props,
 * instead of needing a useEffect to resync on prop change.
 */
export default function WorkflowItemEditModal({
  item,
  saving,
  error,
  onSave,
  onCancel,
}: {
  item: EditableWorkflowItem;
  saving: boolean;
  error: string | null;
  onSave: (patch: WorkflowItemEditPatch) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(item.text);
  const [description, setDescription] = useState(item.description ?? "");
  const [humanNote, setHumanNote] = useState(item.humanNote ?? "");

  function handleSave() {
    onSave({
      text: text.trim(),
      description: description.trim() ? description.trim() : null,
      humanNote: humanNote.trim() ? humanNote.trim() : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Cancel edit"
        onClick={onCancel}
        className="absolute inset-0 bg-black/30"
      />
      <div className="relative w-full max-w-md rounded border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="text-base font-semibold">Edit {item.itemType}</h3>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {item.textFieldLabel}
        </label>
        <WriteInput
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={saving}
        />

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Description
        </label>
        <WriteTextarea
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving}
        />

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Human note
        </label>
        <WriteTextarea
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          rows={2}
          placeholder="Optional note - context, correction rationale, anything worth remembering"
          value={humanNote}
          onChange={(e) => setHumanNote(e.target.value)}
          disabled={saving}
        />

        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex items-center gap-2">
          <WriteButton
            onClick={handleSave}
            disabled={saving || !text.trim()}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {saving ? "Saving..." : "Save"}
          </WriteButton>
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
