import dotenv from 'dotenv';

dotenv.config();

export type SubscriptionTier = 'lite' | 'pro';

export interface SubscriptionPlanConfig {
  tier: SubscriptionTier;
  productId: string;
  minutesLimit: number;
  priceCents: number;
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const GOOGLE_PACKAGE_NAME = process.env.GOOGLE_PACKAGE_NAME || 'com.recaply.app';

const LITE_PLAN: SubscriptionPlanConfig = {
  tier: 'lite',
  productId: process.env.LITE_SUBSCRIPTION_PRODUCT_ID || 'recaply_lite_monthly',
  minutesLimit: toInt(process.env.LITE_PLAN_MINUTES, 300),
  priceCents: toInt(process.env.LITE_PLAN_PRICE, 900),
};

const PRO_PLAN: SubscriptionPlanConfig = {
  tier: 'pro',
  productId: process.env.PRO_SUBSCRIPTION_PRODUCT_ID || 'recaply_pro_monthly',
  minutesLimit: toInt(process.env.PRO_PLAN_MINUTES, 999999),
  priceCents: toInt(process.env.PRO_PLAN_PRICE, 1900),
};

export const SUBSCRIPTION_PLANS: SubscriptionPlanConfig[] = [LITE_PLAN, PRO_PLAN];

export function getSubscriptionPlanByProductId(productId: string): SubscriptionPlanConfig | undefined {
  return SUBSCRIPTION_PLANS.find((plan) => plan.productId === productId);
}
