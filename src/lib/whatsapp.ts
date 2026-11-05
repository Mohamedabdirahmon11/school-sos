/** Normalize an explicitly international WhatsApp number to wa.me digits. */
export function normalizeWhatsAppNumber(phone?: string | null): string | null {
  const value = phone?.trim();
  if (!value) return null;
  const hasPlusPrefix = value.startsWith('+');
  const hasInternationalDialPrefix = value.startsWith('00');
  if (!hasPlusPrefix && !hasInternationalDialPrefix) return null;
  const nationalPart = hasPlusPrefix ? value.slice(1) : value.slice(2);
  if (!/^[\d\s().-]+$/.test(nationalPart)) return null;
  const digits = nationalPart.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
  return digits;
}
