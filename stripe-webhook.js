// api/stripe-webhook.js
// Vercel serverless function — receives Stripe events and writes entitlement
// to Supabase so the app knows the user has a paid tier.
//
// Required env vars:
//   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET      — whsec_... (from Stripe Dashboard → Webhooks)
//   SUPABASE_URL               — https://xxxx.supabase.co  (server-side, no VITE_ prefix)
//   SUPABASE_SERVICE_ROLE_KEY  — service_role key (never expose to browser)

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Use the service-role key here — this runs server-side only and needs to
// bypass RLS to write entitlements.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: { bodyParser: false }, // Stripe needs the raw body to verify signature
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end",  () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sig = req.headers["stripe-signature"];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[webhook] signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // ── Handle events ────────────────────────────────────────────────────────
  try {
    switch (event.type) {

      // Payment succeeded — grant access
      case "checkout.session.completed": {
        const session = event.data.object;
        const tier = session.metadata?.tier;
        const email = session.customer_details?.email || session.customer_email;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (!email || !tier) {
          console.error("[webhook] missing email or tier in session", session.id);
          break;
        }

        // Look up the Supabase user by email
        const { data: { users }, error: lookupErr } = await supabase.auth.admin.listUsers();
        if (lookupErr) throw lookupErr;
        const user = users.find(u => u.email === email);

        if (!user) {
          console.error("[webhook] no Supabase user found for email:", email);
          break;
        }

        // Write entitlement to user metadata
        const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
          user_metadata: {
            tier,
            stripe_customer_id:    customerId,
            stripe_subscription_id: subscriptionId,
            activated_at: new Date().toISOString(),
          },
        });
        if (updateErr) throw updateErr;

        console.log(`[webhook] activated tier=${tier} for ${email}`);
        break;
      }

      // Subscription cancelled or payment failed — revoke access
      case "customer.subscription.deleted":
      case "invoice.payment_failed": {
        const obj = event.data.object;
        const customerId = obj.customer;

        // Find user by stripe_customer_id in metadata
        const { data: { users }, error: lookupErr } = await supabase.auth.admin.listUsers();
        if (lookupErr) throw lookupErr;
        const user = users.find(u => u.user_metadata?.stripe_customer_id === customerId);

        if (!user) {
          console.error("[webhook] no user found for customer:", customerId);
          break;
        }

        const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...user.user_metadata,
            tier: null,
            deactivated_at: new Date().toISOString(),
          },
        });
        if (updateErr) throw updateErr;

        console.log(`[webhook] deactivated for customer ${customerId}`);
        break;
      }

      default:
        // Ignore other events
        break;
    }
  } catch (err) {
    console.error("[webhook] handler error:", err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
}
