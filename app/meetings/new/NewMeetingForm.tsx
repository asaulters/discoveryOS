"use client";

import {
  WriteSelect,
  WriteInput,
  WriteTextarea,
  WriteButton,
} from "@/app/RoleControls";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ConfidenceLevel,
  DiscoveryStrategy,
  MeetingType,
} from "@/lib/types/database";
import {
  SCENARIOS,
  getScenarioById,
  getScenarioDisplayLabel,
} from "@/lib/scenarios";

const CONFIDENCE_LEVELS: ConfidenceLevel[] = [
  "unclear",
  "emerging",
  "likely",
  "confirmed",
];

const MEETING_TYPE_OPTIONS: {
  value: MeetingType;
  label: string;
  helper: string;
}[] = [
  {
    value: "automation_discovery",
    label: "Automation discovery",
    helper:
      "Understanding an existing manual workflow to figure out what could be automated.",
  },
  {
    value: "product_discovery",
    label: "Product discovery",
    helper:
      "Exploring a new product or feature area before committing to a direction.",
  },
  {
    value: "technical_feasibility",
    label: "Technical feasibility",
    helper:
      "Assessing whether something is technically possible or practical to build.",
  },
  {
    value: "requirements_gathering",
    label: "Requirements gathering",
    helper:
      "Scope is already decided - collecting the concrete details needed to build it.",
  },
  {
    value: "business_case",
    label: "Business case",
    helper:
      "Building the case for why something should be prioritized or funded.",
  },
  {
    value: "ux_research",
    label: "UX research",
    helper: "Understanding user behavior, pain points, or usability.",
  },
  {
    value: "applied_ai_discovery",
    label: "Applied AI Discovery",
    helper:
      "Assessing whether a workflow or process is a good candidate for AI assist, automation, workflow redesign, reporting, or human process change - for internal teams, freelance discovery calls, or client consulting work. Never assumes AI is the answer.",
  },
];

const DISCOVERY_STRATEGY_OPTIONS: {
  value: DiscoveryStrategy;
  label: string;
  helper: string;
}[] = [
  {
    value: "broad_exploration",
    label: "Broad exploration",
    helper: "Cast a wide net - you don't yet know where the real problem is.",
  },
  {
    value: "deep_validation",
    label: "Deep validation",
    helper: "You have a specific hypothesis and need to stress-test it.",
  },
  {
    value: "requirements_gathering",
    label: "Requirements gathering",
    helper:
      "Scope is decided; you're collecting the details needed to build it.",
  },
  {
    value: "technical_feasibility",
    label: "Technical feasibility",
    helper: "Focused on whether and how something can be built.",
  },
  {
    value: "business_case",
    label: "Business case",
    helper: "Focused on justifying investment or priority.",
  },
];

interface AssumptionDraft {
  text: string;
  confidenceLevel: ConfidenceLevel;
}

type ProjectOption = {
  id: string;
  name: string;
  requesting_team: string | null;
  goal: string | null;
};
export default function NewMeetingForm({
  projects,
  initialProjectId,
}: {
  projects: ProjectOption[];
  initialProjectId: string;
}) {
  const initialProject = projects.find((p) => p.id === initialProjectId);
  const [projectId, setProjectId] = useState(initialProject?.id || "");
  const router = useRouter();

  const [scenarioId, setScenarioId] = useState("");
  const [name, setName] = useState(initialProject?.name || "");
  const [company, setCompany] = useState(initialProject?.requesting_team || "");
  const [meetingType, setMeetingType] = useState<MeetingType | "">("");
  const [discoveryStrategy, setDiscoveryStrategy] = useState<
    DiscoveryStrategy | ""
  >("");
  const [goal, setGoal] = useState(initialProject?.goal || "");
  const [currentUnderstanding, setCurrentUnderstanding] = useState("");
  const [tentativeBuildDirection, setTentativeBuildDirection] = useState("");
  const [risksUnknowns, setRisksUnknowns] = useState<string[]>([""]);
  const [assumptions, setAssumptions] = useState<AssumptionDraft[]>([
    { text: "", confidenceLevel: "unclear" },
  ]);
  const [pastedContext, setPastedContext] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRisk(index: number, value: string) {
    setRisksUnknowns((prev) => prev.map((r, i) => (i === index ? value : r)));
  }

  function addRisk() {
    setRisksUnknowns((prev) => [...prev, ""]);
  }

  function removeRisk(index: number) {
    setRisksUnknowns((prev) => prev.filter((_, i) => i !== index));
  }

  function updateAssumption(index: number, patch: Partial<AssumptionDraft>) {
    setAssumptions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  }

  function addAssumption() {
    setAssumptions((prev) => [
      ...prev,
      { text: "", confidenceLevel: "unclear" },
    ]);
  }

  function removeAssumption(index: number) {
    setAssumptions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleScenarioChange(value: string) {
    setScenarioId(value);

    if (!value) {
      // "Blank meeting" - only resets which scenario is selected, doesn't
      // clear anything the user may have already typed.
      return;
    }

    const scenario = getScenarioById(value);
    if (!scenario) return;

    const setup = scenario.meetingSetup;
    setName(setup.meetingName);
    setMeetingType(setup.meetingType);
    setDiscoveryStrategy(setup.discoveryStrategy);
    setGoal(setup.goal);
    setCurrentUnderstanding(setup.currentUnderstanding);
    setTentativeBuildDirection(setup.tentativeBuildDirection);
    setRisksUnknowns(setup.risks.length > 0 ? setup.risks : [""]);
    setAssumptions(
      setup.assumptions.length > 0
        ? setup.assumptions.map((text) => ({
            text,
            confidenceLevel: "unclear" as ConfidenceLevel,
          }))
        : [{ text: "", confidenceLevel: "unclear" }],
    );
    setPastedContext(setup.pastedContext);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim() || !meetingType) {
      setError("Name and meeting type are required.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          company: company.trim() || undefined,
          projectId: projectId || undefined,
          meetingType,
          discoveryStrategy: discoveryStrategy || undefined,
          goal: goal.trim() || undefined,
          currentUnderstanding: currentUnderstanding.trim() || undefined,
          tentativeBuildDirection: tentativeBuildDirection.trim() || undefined,
          risksUnknowns: risksUnknowns.map((r) => r.trim()).filter(Boolean),
          assumptions: assumptions.filter((a) => a.text.trim()),
          pastedContext: pastedContext.trim() || undefined,
          scenarioId: scenarioId || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to create meeting");
      }

      router.push(`/meetings/${result.meeting.id}/brief`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create meeting");
      setSubmitting(false);
    }
  }

  const selectedMeetingType = MEETING_TYPE_OPTIONS.find(
    (o) => o.value === meetingType,
  );
  const selectedDiscoveryStrategy = DISCOVERY_STRATEGY_OPTIONS.find(
    (o) => o.value === discoveryStrategy,
  );

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">New discovery meeting</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Set the goal, strategy, and starting assumptions before a discovery
        conversation. Once you&apos;ve filled this in, the Setup Analyst can
        generate a pre-meeting brief on the next page — it treats your tentative
        build direction as a hypothesis to challenge, not a done deal.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-8">
        <section className="rounded border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
          <label className="block text-sm font-medium" htmlFor="scenario">
            Load demo scenario
          </label>
          <p className="mt-0.5 text-xs text-neutral-500">
            Prefills the fields below from a scenario fixture (
            <code className="text-[11px]">lib/scenarios/</code>) - review and
            edit anything before creating the meeting. Transcript chunks for the
            loaded scenario show up on the Live page once the meeting is
            created.
          </p>
          <WriteSelect
            id="scenario"
            className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={scenarioId}
            onChange={(e) => handleScenarioChange(e.target.value)}
          >
            <option value="">Blank meeting</option>
            {SCENARIOS.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {getScenarioDisplayLabel(scenario)}
              </option>
            ))}
          </WriteSelect>
        </section>

        <section className="space-y-4">
          <div>
            <label className="mb-4 block text-sm">
              Project
              <WriteSelect
                aria-label="Project"
                className="mt-1 w-full rounded border p-2"
                value={projectId}
                onChange={(e) => {
                  const p = projects.find((p) => p.id === e.target.value);
                  setProjectId(e.target.value);
                  if (p) {
                    setName(p.name);
                    setCompany(p.requesting_team || "");
                    setGoal(p.goal || "");
                  }
                }}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </WriteSelect>
            </label>
            <label className="block text-sm font-medium" htmlFor="name">
              Meeting name *
            </label>
            <WriteInput
              id="name"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium" htmlFor="company">
                Company
              </label>
              <WriteInput
                id="company"
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium"
                htmlFor="meetingType"
              >
                Meeting type *
              </label>
              <WriteSelect
                id="meetingType"
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                value={meetingType}
                onChange={(e) => setMeetingType(e.target.value as MeetingType)}
                required
              >
                <option value="" disabled>
                  Select a type...
                </option>
                {MEETING_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </WriteSelect>
              {selectedMeetingType && (
                <p className="mt-1 text-xs text-neutral-500">
                  {selectedMeetingType.helper}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Discovery framing
          </h2>

          <div>
            <label
              className="block text-sm font-medium"
              htmlFor="discoveryStrategy"
            >
              Discovery strategy
            </label>
            <WriteSelect
              id="discoveryStrategy"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              value={discoveryStrategy}
              onChange={(e) =>
                setDiscoveryStrategy(e.target.value as DiscoveryStrategy)
              }
            >
              <option value="">No preference / not sure yet</option>
              {DISCOVERY_STRATEGY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </WriteSelect>
            {selectedDiscoveryStrategy && (
              <p className="mt-1 text-xs text-neutral-500">
                {selectedDiscoveryStrategy.helper}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium" htmlFor="goal">
              Goal
            </label>
            <p className="mt-0.5 text-xs text-neutral-500">
              What decision or outcome does this meeting need to move forward?
            </p>
            <WriteTextarea
              id="goal"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium"
              htmlFor="currentUnderstanding"
            >
              Current understanding
            </label>
            <p className="mt-0.5 text-xs text-neutral-500">
              What you already know going in - the Setup Analyst builds on this
              rather than starting from scratch.
            </p>
            <WriteTextarea
              id="currentUnderstanding"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              rows={2}
              value={currentUnderstanding}
              onChange={(e) => setCurrentUnderstanding(e.target.value)}
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium"
              htmlFor="tentativeBuildDirection"
            >
              Tentative build direction
            </label>
            <p className="mt-0.5 text-xs text-neutral-500">
              Your current guess at what to build, if you have one. The Setup
              Analyst treats this as a hypothesis to validate or challenge,
              never as a fact.
            </p>
            <WriteTextarea
              id="tentativeBuildDirection"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              rows={2}
              value={tentativeBuildDirection}
              onChange={(e) => setTentativeBuildDirection(e.target.value)}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Risks &amp; unknowns
          </h2>
          <p className="text-xs text-neutral-500">
            Anything you&apos;re worried about or don&apos;t yet know that could
            change the outcome.
          </p>
          {risksUnknowns.map((risk, index) => (
            <div key={index} className="flex gap-2">
              <WriteInput
                className="flex-1 rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                value={risk}
                onChange={(e) => updateRisk(index, e.target.value)}
                placeholder="Risk or unknown"
              />
              <WriteButton
                type="button"
                onClick={() => removeRisk(index)}
                className="rounded border border-neutral-300 px-3 text-sm dark:border-neutral-700"
              >
                Remove
              </WriteButton>
            </div>
          ))}
          <WriteButton
            type="button"
            onClick={addRisk}
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            + Add risk
          </WriteButton>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Assumptions
          </h2>
          <p className="text-xs text-neutral-500">
            Things you&apos;re currently taking for granted. Rate how sure you
            are - the Setup Analyst may add more assumptions it thinks
            you&apos;re implicitly making.
          </p>
          {assumptions.map((assumption, index) => (
            <div key={index} className="flex gap-2">
              <WriteInput
                className="flex-1 rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                value={assumption.text}
                onChange={(e) =>
                  updateAssumption(index, { text: e.target.value })
                }
                placeholder="Assumption"
              />
              <WriteSelect
                className="rounded border border-neutral-300 px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                value={assumption.confidenceLevel}
                onChange={(e) =>
                  updateAssumption(index, {
                    confidenceLevel: e.target.value as ConfidenceLevel,
                  })
                }
              >
                {CONFIDENCE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </WriteSelect>
              <WriteButton
                type="button"
                onClick={() => removeAssumption(index)}
                className="rounded border border-neutral-300 px-3 text-sm dark:border-neutral-700"
              >
                Remove
              </WriteButton>
            </div>
          ))}
          <WriteButton
            type="button"
            onClick={addAssumption}
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            + Add assumption
          </WriteButton>
        </section>

        <section className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="pastedContext">
            Pasted context (optional)
          </label>
          <p className="text-xs text-neutral-500">
            Prior notes, emails, tickets, or research - the Setup Analyst reads
            this verbatim when preparing the brief.
          </p>
          <WriteTextarea
            id="pastedContext"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            rows={5}
            placeholder="Paste prior notes, emails, or research here"
            value={pastedContext}
            onChange={(e) => setPastedContext(e.target.value)}
          />
        </section>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <WriteButton
          type="submit"
          disabled={submitting}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {submitting ? "Creating..." : "Create meeting"}
        </WriteButton>
      </form>
    </main>
  );
}
