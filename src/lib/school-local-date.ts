export function getSchoolLocalDate(date: Date, timeZone?: string): string {
  const format = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const part = (type: string) => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  try {
    const value = format(timeZone?.trim() || 'Africa/Addis_Ababa');
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  } catch { /* Use the East Africa school-time fallback below. */ }
  try { return format('Africa/Addis_Ababa'); }
  catch { return date.toISOString().slice(0, 10); }
}
