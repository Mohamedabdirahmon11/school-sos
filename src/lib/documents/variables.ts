export type DocumentVariables = Record<string, string | null | undefined>;

export function escapeDocumentText(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Replaces only known variable tokens, inserts escaped plain text, and removes unresolved tokens. */
export function replaceDocumentVariables(template: string, values: DocumentVariables): { html: string; missing: string[] } {
  const source = String(template ?? '');
  const missing = new Set<string>();
  const html = source.replace(/\{([a-z][a-z0-9_]*)\}/gi, (_token, key: string) => {
    const value = values[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      missing.add(key);
      return '';
    }
    return escapeDocumentText(value);
  });
  return { html, missing: [...missing].sort() };
}

/** A batch with missing values must be explicitly confirmed before any rows are persisted. */
export function requiresDocumentGenerationConfirmation(
  warnings: Array<{ missing?: string[] }>,
  confirmed: boolean
): boolean {
  return !confirmed && warnings.some(warning => Array.isArray(warning.missing) && warning.missing.length > 0);
}
