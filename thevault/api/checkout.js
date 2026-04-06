// api/checkout.js
// Vercel serverless function — creates a Stripe Checkout session and redirects.
//
// URL: /api/checkout?tier=solo|operator|studio
//
// Required env vars (set in Vercel dashboard):
//   STRIPE_SECRET_KEY        — sk_live_... or sk_test_...
//   STRIPE_PRICE_SOLO        — price_...
//   STRIPE_PRICE_OPERATOR    — price_...
//   STRIPE_PRICE_STUDIO      — price_...
//   APP_URL                  — https://usevaultiq.com

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_IDS = {
  solo:     process.env.STRIPE_PRICE_SOLO?.trim(),
  operator: process.env.STRIPE_PRICE_OPERATOR?.trim(),
  studio:   process.env.STRIPE_PRICE_STUDIO?.trim(),
};

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const tier = req.query.tier || req.body?.tier;

  if (!tier || !PRICE_IDS[tier]) {
    return res.status(400).json({ error: `Invalid tier: ${tier}` });
  }

  const priceId = PRICE_IDS[tier];
  if (!priceId) {
    return res.status(500).json({ error: `Price ID not configured for tier: ${tier}` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      // Pass tier through so the webhook knows which tier to activate
      metadata: { tier },
      // After payment, redirect back to the app
      success_url: `${process.env.APP_URL}/?payment=success&tier=${tier}`,
      cancel_url:  `${process.env.APP_URL}/?payment=cancelled`,
      // Prefill email if passed as query param (optional)
      ...(req.query.email ? { customer_email: req.query.email } : {}),
    });

    // Redirect the browser to Stripe Checkout
    return res.redirect(303, session.url);
  } catch (err) {
    console.error("[checkout] error:", err.message);
    console.error("[checkout] type:", err.type);
    console.error("[checkout] code:", err.code);
    console.error("[checkout] stack:", err.stack);
    return res.status(500).json({ error: err.message, type: err.type, code: err.code });
  }
}
