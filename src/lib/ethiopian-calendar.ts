export interface EthiopianCalendarInfo {
  dateLabel: string;
  holiday: string | null;
}

const ETHIOPIAN_HOLIDAYS: Record<string, string> = {
  'meskerem:1': 'Ethiopian New Year (Enkutatash)',
  'meskerem:17': 'Meskel (Finding of the True Cross)',
  'tahsas:29': 'Ethiopian Christmas (Genna)',
  'tir:11': 'Ethiopian Epiphany (Timkat)',
  'yekatit:23': 'Victory of Adwa',
  'ginbot:20': 'Downfall of the Derg',
  'ginbot:27': 'Patriots’ Victory Day'
};

export function getEthiopianCalendarInfo(
  isoDate: string,
  timeZone = 'Africa/Addis_Ababa'
): EthiopianCalendarInfo {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return { dateLabel: isoDate, holiday: null };
  }
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return { dateLabel: isoDate, holiday: null };
  try {
    const formatter = new Intl.DateTimeFormat('en-u-ca-ethiopic', {
      timeZone, day: 'numeric', month: 'long', year: 'numeric'
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
    const month = String(parts.month || '').toLocaleLowerCase('en').replace(/[^a-z]/g, '');
    const day = Number(parts.day);
    const holiday = ETHIOPIAN_HOLIDAYS[`${month}:${day}`] || null;
    return { dateLabel: formatter.format(date), holiday };
  } catch {
    return { dateLabel: isoDate, holiday: null };
  }
}

export function getSchoolLocalDate(timeZone = 'Africa/Addis_Ababa'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}
