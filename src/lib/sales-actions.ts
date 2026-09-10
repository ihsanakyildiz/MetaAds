import type { MetaInsightAction } from "@/lib/meta";

const PURCHASE_ACTION_TYPES = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
  "onsite_web_app_purchase",
  "web_in_store_purchase",
  "onsite_conversion.purchase",
] as const;

function toNumber(value?: string | number | null) {
  const amount = Number(value);
  return Number.isNaN(amount) ? 0 : amount;
}

function actionValue(
  actions: MetaInsightAction[] | undefined,
  keys: readonly string[],
) {
  if (!actions?.length) {
    return 0;
  }

  for (const key of keys) {
    const found = actions.find((action) => action.action_type === key);
    if (found) {
      return toNumber(found.value);
    }
  }

  return 0;
}

export function extractPurchases(actions?: MetaInsightAction[]) {
  return Math.round(actionValue(actions, PURCHASE_ACTION_TYPES));
}

export function extractPurchaseValue(actions?: MetaInsightAction[]) {
  return actionValue(actions, PURCHASE_ACTION_TYPES);
}
