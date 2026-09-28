import 'server-only';
import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;
  // Omit apiVersion so it defaults to the Stripe account's pinned version
  // and stays compatible across `stripe` SDK bumps.
  cached = new Stripe(serverEnv().STRIPE_SECRET_KEY);
  return cached;
}
