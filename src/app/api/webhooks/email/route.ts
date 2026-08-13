import { emailAdapter } from "@/lib/notifications/email-adapter";
import { applyWebhookEvents } from "@/lib/notifications/dispatch";

// Resend's delivery-status webhook. Same posture as /api/webhooks/whatsapp
// — public by necessity, signature verification stands in for auth.
export async function POST(req: Request) {
  const rawBody = await req.text();

  const verdict = emailAdapter.verifyWebhookSignature(rawBody, req.headers);
  if (verdict === "invalid") {
    return new Response("Invalid signature", { status: 401 });
  }
  // "unverified" (RESEND_WEBHOOK_SECRET not set) allowed through in dev
  // only — see .env.example.

  const events = emailAdapter.parseWebhookEvents(rawBody);
  if (!events) {
    return new Response("OK", { status: 200 });
  }

  await applyWebhookEvents("EMAIL", events);
  return new Response("OK", { status: 200 });
}
