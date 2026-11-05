export interface SubscriptionPlanPricing {
  monthlyPrice?: unknown;
  yearlyPrice?: unknown;
}

export function getRecurringInvoiceAmount(
  cadence: string,
  plan: SubscriptionPlanPricing | null | undefined
): number | null {
  if (cadence === 'lifetime' || !plan) return null;
  const rawAmount = cadence === 'yearly' ? plan.yearlyPrice : cadence === 'monthly' ? plan.monthlyPrice : null;
  if (rawAmount === null || rawAmount === undefined || rawAmount === '') return null;
  const amount = Number(rawAmount);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function isOpenSubscriptionInvoice(status: string): boolean {
  return status === 'unpaid' || status === 'overdue';
}
