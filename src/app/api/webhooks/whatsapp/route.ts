import { whatsAppAdapter } from "@/lib/notifications/whatsapp-adapter";
import { applyWebhookEvents } from "@/lib/notifications/dispatch";

// Meta's webhook verification handshake — required to register this URL
// in the Meta App dashboard, even before a real WhatsApp Business account
// exists. Per sign-off open question 6: build against the documented
// shape regardless of approval status.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Public and unauthenticated by necessity (Meta calls this, not a logged-
// in user) — signature verification is what stands in for auth here. This
// is exactly the kind of route that needs its own guard rather than
// inheriting one, per the same reasoning as /api/media/[versionId].
export async function POST(req: Request) {
  const rawBody = await req.text(); // read raw text before parsing — signature is over the raw bytes

  const verdict = whatsAppAdapter.verifyWebhookSignature(rawBody, req.headers);
  if (verdict === "invalid") {
    return new Response("Invalid signature", { status: 401 });
  }
  // "unverified" (WHATSAPP_APP_SECRET not set) is allowed through — dev-
  // only posture, see .env.example. A real deployment must set that
  // secret; this route does not silently treat unverified as trusted.

  const events = whatsAppAdapter.parseWebhookEvents(rawBody);
  if (!events) {
    // Not our recognized shape — ack with 200 anyway, per Meta's
    // requirement that webhook endpoints always return 200 or it disables
    // the subscription.
    return new Response("OK", { status: 200 });
  }

  await applyWebhookEvents("WHATSAPP", events);
  return new Response("OK", { status: 200 });
}
