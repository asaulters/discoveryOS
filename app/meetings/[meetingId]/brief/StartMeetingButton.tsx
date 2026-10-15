"use client";

import { WriteButton } from "@/app/RoleControls";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartMeetingButton({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setError(null);
    setStarting(true);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/start`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to start meeting");
      }

      router.push(`/meetings/${meetingId}/live`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start meeting");
      setStarting(false);
    }
  }

  return (
    <div>
      <WriteButton
        onClick={handleStart}
        disabled={starting}
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {starting ? "Starting..." : "Start meeting"}
      </WriteButton>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
