import type { LlmProviderAdapter, ProviderCompleteResult } from "./types";

// Real Anthropic Messages API adapter — built against the documented
// request/response shape, same "real, not placeholder" posture as the
// WhatsApp/Resend adapters. No ANTHROPIC_API_KEY is configured in this
// deployment yet; calling .complete() throws a clear config error rather
// than faking a response. This is the only registered provider in Phase 0
// (see prisma/seed.ts) — no module needs a second one yet.
//
// zeroRetention for this provider is seeded as `false`: a standard
// Anthropic API key does not carry a zero-data-retention agreement by
// default — that requires a specific enterprise arrangement. Modelling it
// as `true` here would be exactly the "looks real but isn't" placeholder
// the guardrails rule out. This is also what makes the sensitivity gate
// in gateway.ts demonstrable without needing real credentials: a
// sensitive-tagged call is refused before ever reaching this adapter.

const ANTHROPIC_API_VERSION = "2023-06-01";
// Cheap/fast default appropriate for a plumbing-test gateway, not a
// quality-sensitive real feature — Phase 1 modules calling this for real
// work should pick per-purpose, which the interface contract's lack of a
// caller-supplied model param implies is the gateway's job, not the
// caller's.
export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — OrchaLLM dispatch is not configured (see .env.example).`);
  }
  return value;
}

export const anthropicAdapter: LlmProviderAdapter = {
  providerKey: "anthropic-claude",

  async complete(prompt: string, model: string): Promise<ProviderCompleteResult> {
    const apiKey = requireEnv("ANTHROPIC_API_KEY");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = json?.error?.message ?? `Anthropic API returned HTTP ${res.status}`;
      throw new Error(reason);
    }

    const text = json?.content?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error("Anthropic API response did not include completion text.");
    }

    return {
      text,
      tokenCountIn: json?.usage?.input_tokens ?? null,
      tokenCountOut: json?.usage?.output_tokens ?? null,
    };
  },
};
