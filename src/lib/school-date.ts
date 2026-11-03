export const getSchoolLocalDate = (timeZone?: string, now = new Date()): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);
    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    const day = parts.find(part => part.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Invalid school timezone: use the device's local calendar date.
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const getSchoolMonthLabel = (timeZone?: string, now = new Date()): string => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      month: 'long',
      year: 'numeric'
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(now);
  }
};
