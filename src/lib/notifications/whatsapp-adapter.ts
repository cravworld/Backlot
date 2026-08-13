import { createHmac, timingSafeEqual } from "crypto";
import type {
  NotificationProvider,
  OutboundMessage,
  SendResult,
  WebhookStatusEvent,
  WebhookVerdict,
} from "./types";

// WhatsApp Cloud API adapter — built against Meta's documented request/
// response shapes per sign-off open question 6 ("build the adapter
// against the documented API shape regardless of approval status"), even
// though no live WhatsApp Business account is configured yet. Calling
// .send() without real credentials throws a clear, real error rather than
// faking success — see requireEnv below.

const GRAPH_API_VERSION = "v20.0";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — WhatsApp dispatch is not configured (see .env.example). ` +
        "This is expected until a real WhatsApp Business API application is approved " +
        "(phase-0-findings.md open question 6)."
    );
  }
  return value;
}

const STATUS_MAP: Record<string, WebhookStatusEvent["status"]> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

export const whatsAppAdapter: NotificationProvider = {
  channel: "WHATSAPP",

  async send(message: OutboundMessage): Promise<SendResult> {
    const accessToken = requireEnv("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");

    // Real Cloud API constraint, not a Phase 0 simplification: outside a
    // user-initiated 24h session window, Meta requires a pre-approved
    // template message, not free-form text. Template *content* authoring
    // is explicitly out of Phase 0 scope (phase-0-findings.md "not
    // building" list) — this sends the rendered body as plain text, which
    // is what a real 24h-session reply would look like; swapping to a
    // `type: "template"` payload is a small, contained change once a real
    // template exists.
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.to,
          type: "text",
          text: { body: message.body },
        }),
      }
    );

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = json?.error?.message ?? `WhatsApp API returned HTTP ${res.status}`;
      throw new Error(reason);
    }
    const providerMessageId = json?.messages?.[0]?.id;
    if (!providerMessageId) {
      throw new Error("WhatsApp API response did not include a message id.");
    }
    return { providerMessageId };
  },

  verifyWebhookSignature(rawBody: string, headers: Headers): WebhookVerdict {
    const secret = process.env.WHATSAPP_APP_SECRET;
    const signatureHeader = headers.get("x-hub-signature-256");

    if (!secret) return "unverified";
    if (!signatureHeader) return "invalid";

    const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expected);
    const givenBuf = Buffer.from(signatureHeader);
    if (expectedBuf.length !== givenBuf.length) return "invalid";
    return timingSafeEqual(expectedBuf, givenBuf) ? "valid" : "invalid";
  },

  parseWebhookEvents(rawBody: string): WebhookStatusEvent[] | null {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const body = payload as {
      object?: string;
      entry?: Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<{
              id: string;
              status: string;
              timestamp?: string;
              errors?: Array<{ title?: string }>;
            }>;
          };
        }>;
      }>;
    };
    if (body?.object !== "whatsapp_business_account") return null;

    const events: WebhookStatusEvent[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          const mapped = STATUS_MAP[status.status];
          if (!mapped) continue;
          events.push({
            providerMessageId: status.id,
            status: mapped,
            failedReason: status.errors?.[0]?.title,
            occurredAt: status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date(),
          });
        }
      }
    }
    return events;
  },
};
