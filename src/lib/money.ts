export type SchoolCurrency = 'ETB' | 'USD' | 'SOS';

export function formatMoney(amount: number | string | null | undefined, currency: string | null | undefined): string {
  const value = Number(amount);
  const code = ['ETB', 'USD', 'SOS'].includes(String(currency || '').toUpperCase())
    ? String(currency).toUpperCase()
    : 'ETB';
  return `${code} ${(Number.isFinite(value) ? value : 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
