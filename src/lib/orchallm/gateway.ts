import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { anthropicAdapter, DEFAULT_MODEL } from "./anthropic-provider";
import type { LlmCompleteInput, LlmCompleteOutcome, LlmProviderAdapter } from "./types";

// The single gateway every module's LLM call routes through — per
// phase-0-findings.md §1.6, no module (this one included) ever imports a
// provider SDK or calls a provider's HTTP API directly. Phase 0 wires
// this end-to-end (including logging) even though no module calls it
// yet, so Phase 1's SceneSpine extraction calls don't require touching
// this layer's shape.
//
// Every outcome — refused, failed, or ok — is logged. Unlike
// dispatchNotification's minor-block (which has no row to attach a
// blocked attempt to), every LLM call attempt here has a natural home in
// llm_request_log, so refused/failed calls are recorded there rather
// than as a distinct audit-log entry.

const ADAPTERS: Record<string, LlmProviderAdapter> = {
  "anthropic-claude": anthropicAdapter,
};

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function orchaLlmComplete(input: LlmCompleteInput): Promise<LlmCompleteOutcome> {
  if (!input.moduleKey.trim() || !input.purpose.trim() || !input.prompt.trim()) {
    throw new ActionError("moduleKey, purpose, and prompt are all required.");
  }

  const promptHash = hashText(input.prompt);

  const providers = await prisma.llmProvider.findMany({ where: { enabled: true } });
  const moduleEligible = providers.filter(
    (p) => p.allowedFor.length === 0 || p.allowedFor.includes(input.moduleKey)
  );
  const eligible = input.sensitive ? moduleEligible.filter((p) => p.zeroRetention) : moduleEligible;

  if (eligible.length === 0) {
    const reason = input.sensitive
      ? "No enabled provider is registered as zero-retention — a sensitivity-tagged call cannot be routed anywhere."
      : `No enabled provider is registered for module "${input.moduleKey}".`;

    const log = await prisma.llmRequestLog.create({
      data: {
        orgId: input.orgId,
        filmId: input.filmId ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        moduleKey: input.moduleKey,
        purpose: input.purpose,
        providerKey: "none",
        model: "none",
        promptHash,
        zeroRetentionUsed: false,
        status: "refused",
        failedReason: reason,
      },
    });

    return { status: "refused", reason, requestLogId: log.id };
  }

  // Phase 0: first eligible provider, no real routing/cost strategy yet —
  // there's exactly one registered provider (see prisma/seed.ts), so this
  // is a placeholder for a real selection policy, not a meaningful choice
  // today.
  const provider = eligible[0];
  const adapter = ADAPTERS[provider.key];
  const model = DEFAULT_MODEL;

  if (!adapter) {
    const reason = `Provider "${provider.key}" is registered but has no adapter implementation.`;
    const log = await prisma.llmRequestLog.create({
      data: {
        orgId: input.orgId,
        filmId: input.filmId ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        moduleKey: input.moduleKey,
        purpose: input.purpose,
        providerKey: provider.key,
        model,
        promptHash,
        zeroRetentionUsed: provider.zeroRetention,
        status: "failed",
        failedReason: reason,
      },
    });
    return { status: "failed", reason, requestLogId: log.id };
  }

  try {
    const result = await adapter.complete(input.prompt, model);

    const log = await prisma.llmRequestLog.create({
      data: {
        orgId: input.orgId,
        filmId: input.filmId ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        moduleKey: input.moduleKey,
        purpose: input.purpose,
        providerKey: provider.key,
        model,
        promptHash,
        // Response hash only — never the response text itself, same
        // discipline as the prompt.
        responseHash: hashText(result.text),
        tokenCountIn: result.tokenCountIn,
        tokenCountOut: result.tokenCountOut,
        zeroRetentionUsed: provider.zeroRetention,
        status: "ok",
      },
    });

    return {
      status: "ok",
      text: result.text,
      model,
      providerKey: provider.key,
      tokenCountIn: result.tokenCountIn,
      tokenCountOut: result.tokenCountOut,
      zeroRetentionUsed: provider.zeroRetention,
      requestLogId: log.id,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown provider error";
    const log = await prisma.llmRequestLog.create({
      data: {
        orgId: input.orgId,
        filmId: input.filmId ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        moduleKey: input.moduleKey,
        purpose: input.purpose,
        providerKey: provider.key,
        model,
        promptHash,
        zeroRetentionUsed: provider.zeroRetention,
        status: "failed",
        failedReason: reason,
      },
    });
    return { status: "failed", reason, requestLogId: log.id };
  }
}
