// Interface contract per phase-0-findings.md §1.6:
// `OrchaLlmClient.complete({module_key, purpose, film_id, prompt, schema?})
// → result`. The findings doc's signature doesn't list a sensitivity
// flag explicitly — `sensitive` below is an addition, not something
// spec'd, needed to give the zero-retention gate something concrete to
// check. Flagged as an assumption rather than silently added: a real
// Phase 1 caller might instead want sensitivity inferred from `purpose`
// via a lookup table rather than passed by the caller — revisit if that
// turns out to matter once a real module calls this.

export type LlmCompleteInput = {
  orgId: string;
  filmId?: string | null;
  requestedByUserId?: string | null;
  moduleKey: string;
  purpose: string;
  prompt: string;
  /** If true, only a zero-retention-registered provider may handle this call. */
  sensitive?: boolean;
  /** Accepted per the interface contract; Phase 0 doesn't do anything with it yet — no module needs structured extraction until SceneSpine (Phase 1). */
  schema?: unknown;
};

export type LlmCompleteOutcome =
  | {
      status: "ok";
      text: string;
      model: string;
      providerKey: string;
      tokenCountIn: number | null;
      tokenCountOut: number | null;
      zeroRetentionUsed: boolean;
      requestLogId: string;
    }
  | { status: "refused"; reason: string; requestLogId: string }
  | { status: "failed"; reason: string; requestLogId: string };

export type ProviderCompleteResult = {
  text: string;
  tokenCountIn: number | null;
  tokenCountOut: number | null;
};

export interface LlmProviderAdapter {
  /** Matches LlmProvider.key in the database — how the gateway looks up which adapter to call. */
  providerKey: string;
  complete(prompt: string, model: string): Promise<ProviderCompleteResult>;
}
