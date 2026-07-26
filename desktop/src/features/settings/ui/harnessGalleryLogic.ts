/**
 * Pure logic helpers for the harness gallery (HarnessManagementCard).
 *
 * Extracted for deterministic unit-testing — no React, no Tauri, no network.
 */

import type { AcpRuntimeCatalogEntry } from "@/shared/api/types";

/**
 * Filter catalog entries to preset-only, sorted detected-first then
 * alphabetically within each group.
 *
 * "Detected" means availability === "available". This mirrors the
 * React.useMemo sort inside HarnessManagementCard.
 */
export function sortedPresetEntries(
  catalog: readonly AcpRuntimeCatalogEntry[],
): AcpRuntimeCatalogEntry[] {
  const presets = catalog.filter((e) => e.source === "preset");
  return [...presets].sort((a, b) => {
    const aDetected = a.availability === "available" ? 0 : 1;
    const bDetected = b.availability === "available" ? 0 : 1;
    if (aDetected !== bDetected) return aDetected - bDetected;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Filter catalog entries to custom-only.
 */
export function customEntries(
  catalog: readonly AcpRuntimeCatalogEntry[],
): AcpRuntimeCatalogEntry[] {
  return catalog.filter((e) => e.source === "custom");
}

/**
 * Returns true iff the given catalog entry is editable by the user.
 * Only `source === "custom"` entries are editable/deletable.
 */
export function isEditableEntry(entry: AcpRuntimeCatalogEntry): boolean {
  return entry.source === "custom";
}

/**
 * Count managed agents whose effective harness is the given definition id —
 * either a direct record-level `runtime` pin, or inheritance from a linked
 * persona whose `runtime` is that id.
 *
 * Drives the delete-confirmation copy: deleting a harness that agents still
 * reference is allowed (blocking would turn cleanup into dependency
 * untangling), but the user is told those agents will stop launching.
 */
export function countAgentsReferencingHarness(
  harnessId: string,
  agents: ReadonlyArray<{ runtime: string | null; personaId: string | null }>,
  personas: ReadonlyArray<{ id: string; runtime: string | null }>,
): number {
  const personaRuntime = new Map(personas.map((p) => [p.id, p.runtime]));
  return agents.filter((agent) => {
    if (agent.runtime !== null) return agent.runtime === harnessId;
    if (agent.personaId === null) return false;
    return personaRuntime.get(agent.personaId) === harnessId;
  }).length;
}

/**
 * Confirmation copy for deleting a custom harness. Names the blast radius
 * when agents still reference the definition; stays quiet when none do.
 */
export function deleteHarnessConfirmMessage(
  label: string,
  referencingAgents: number,
): string {
  if (referencingAgents === 0) return `Delete ${label}?`;
  const noun = referencingAgents === 1 ? "agent uses" : "agents use";
  return `${referencingAgents} ${noun} this harness and will stop launching. Delete ${label}?`;
}
