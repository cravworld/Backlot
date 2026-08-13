// Provider-agnostic contract every adapter implements. Per
// phase-0-findings.md §1.5: `NotificationProvider.send(message) →
// {provider_message_id}`, `.handleWebhook(payload) → status update`. The
// webhook half is split into verify + parse here rather than one
// handleWebhook(payload) call, so a route handler can reject a bad
// signature before doing any parsing work.

export type NotificationChannel = "WHATSAPP" | "EMAIL";

export type OutboundMessage = {
  /** E.164 phone number for WhatsApp, email address for Email. */
  to: string;
  /** Email only — WhatsApp Cloud API text messages have no subject line. */
  subject?: string;
  body: string;
};

export type SendResult = {
  providerMessageId: string;
};

export type WebhookStatus = "SENT" | "DELIVERED" | "READ" | "FAILED";

export type WebhookStatusEvent = {
  providerMessageId: string;
  status: WebhookStatus;
  failedReason?: string;
  occurredAt: Date;
};

export type WebhookVerdict = "valid" | "invalid" | "unverified";

export interface NotificationProvider {
  channel: NotificationChannel;

  send(message: OutboundMessage): Promise<SendResult>;

  /**
   * "unverified" means no signing secret is configured for this provider —
   * allowed through in dev only, never in a real deployment. Never
   * silently treated the same as "valid" by a caller; route handlers must
   * branch on it explicitly.
   */
  verifyWebhookSignature(rawBody: string, headers: Headers): WebhookVerdict;

  /** Returns null if `rawBody` isn't recognized as this provider's payload shape. */
  parseWebhookEvents(rawBody: string): WebhookStatusEvent[] | null;
}
