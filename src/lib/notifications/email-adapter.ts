import { createHmac, timingSafeEqual } from "crypto";
import type {
  NotificationProvider,
  OutboundMessage,
  SendResult,
  WebhookStatusEvent,
  WebhookVerdict,
} from "./types";

// Email fallback adapter, using Resend's HTTP API directly (a single
// fetch call, no SDK/new dependency needed — same "built-in only" choice
// as lib/media.ts's use of Node's crypto). Resend is an assumption, not
// something asked about — the kickoff prompt only specified "email
// fallback," not a vendor. Flagged here rather than silently picked: the
// adapter is thin enough that swapping to SMTP/SES later is a one-file
// change, since the NotificationProvider interface is what every module
// actually depends on.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — email dispatch is not configured (see .env.example).`
    );
  }
  return value;
}

const STATUS_MAP: Record<string, WebhookStatusEvent["status"]> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.opened": "READ",
  "email.bounced": "FAILED",
};

export const emailAdapter: NotificationProvider = {
  channel: "EMAIL",

  async send(message: OutboundMessage): Promise<SendResult> {
    const apiKey = requireEnv("RESEND_API_KEY");
    const from = requireEnv("NOTIFICATIONS_EMAIL_FROM");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject || "(no subject)",
        text: message.body,
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.message ?? `Resend API returned HTTP ${res.status}`);
    }
    if (!json?.id) {
      throw new Error("Resend API response did not include a message id.");
    }
    return { providerMessageId: json.id };
  },

  verifyWebhookSignature(rawBody: string, headers: Headers): WebhookVerdict {
    // Resend signs webhooks using Svix's scheme: HMAC-SHA256 over
    // "{svix-id}.{svix-timestamp}.{body}", base64-encoded, secret is
    // "whsec_<base64 key>".
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    const svixId = headers.get("svix-id");
    const svixTimestamp = headers.get("svix-timestamp");
    const svixSignature = headers.get("svix-signature");

    if (!secret) return "unverified";
    if (!svixId || !svixTimestamp || !svixSignature) return "invalid";

    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
    const expectedBuf = Buffer.from(expected, "base64");

    // The header can carry multiple space-separated "v1,<sig>" candidates.
    const candidates = svixSignature
      .split(" ")
      .map((s) => s.split(",")[1])
      .filter(Boolean);

    for (const candidate of candidates) {
      const candidateBuf = Buffer.from(candidate, "base64");
      if (candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf)) {
        return "valid";
      }
    }
    return "invalid";
  },

  parseWebhookEvents(rawBody: string): WebhookStatusEvent[] | null {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const body = payload as {
      type?: string;
      created_at?: string;
      data?: { email_id?: string; bounce?: { message?: string } };
    };
    if (!body?.type || !(body.type in STATUS_MAP)) return null;

    const providerMessageId = body.data?.email_id;
    if (!providerMessageId) return null;

    const status = STATUS_MAP[body.type];
    return [
      {
        providerMessageId,
        status,
        failedReason: status === "FAILED" ? body.data?.bounce?.message ?? body.type : undefined,
        occurredAt: body.created_at ? new Date(body.created_at) : new Date(),
      },
    ];
  },
};
