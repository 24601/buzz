/**
 * In-memory custom harness store for the e2e bridge.
 *
 * Extracted as a separate module so the handler logic can be unit-tested
 * independently of the full e2eBridge.ts context (which requires a browser
 * environment and full Playwright setup).
 */
import type { RawAcpRuntimeCatalogEntry } from "../shared/api/tauri.ts";

/** In-memory store for custom harnesses saved via `save_custom_harness`. */
export const mockCustomHarnesses = new Map<string, RawAcpRuntimeCatalogEntry>();

/** Reset the store between tests. */
export function resetMockCustomHarnesses(): void {
  mockCustomHarnesses.clear();
}

/**
 * Handle `save_custom_harness`.
 *
 * Persists the definition into `mockCustomHarnesses` so that the next
 * `discover_acp_providers` call includes it. Mirrors the Rust command's
 * return shape: an `AcpRuntimeCatalogEntry` for the saved harness.
 */
export function handleSaveCustomHarness(args: {
  definition?: {
    id?: string;
    label?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    installInstructionsUrl?: string;
    installHint?: string;
  };
  originalId?: string | null;
}): RawAcpRuntimeCatalogEntry {
  const def = args.definition ?? {};
  const id = def.id ?? "";
  const originalId = args.originalId ?? null;

  // On rename: remove the old entry so the old id is no longer in the catalog.
  if (originalId && originalId !== id) {
    mockCustomHarnesses.delete(originalId);
  }

  const entry: RawAcpRuntimeCatalogEntry = {
    id,
    label: def.label ?? id,
    avatar_url: "",
    availability: "not_installed", // PATH not probed in e2e mock
    command: def.command ?? null,
    binary_path: null,
    default_args: def.args ?? [],
    mcp_command: null,
    install_hint: def.installHint ?? "",
    install_instructions_url: def.installInstructionsUrl ?? "",
    can_auto_install: false,
    requires_external_cli: true,
    underlying_cli_path: null,
    node_required: false,
    auth_status: { status: "not_applicable" },
    source: "custom",
    // Omit definition_env when the env map is empty — mirrors Rust's BTreeMap
    // serialization which skips empty maps so the field is absent on the wire.
    definition_env:
      def.env && Object.keys(def.env).length > 0 ? def.env : undefined,
    login_hint: undefined,
  };
  mockCustomHarnesses.set(id, entry);
  return entry;
}

/**
 * Handle `delete_custom_harness`.
 * Removes the harness from the in-memory store. Idempotent (not-found is OK).
 */
export function handleDeleteCustomHarness(args: { id?: string }): void {
  const id = args.id ?? "";
  mockCustomHarnesses.delete(id);
}
