/** Applies a school's saved brand color to built-in template accents. */
export function applySchoolBrandColor(html: string, rawColor?: string): string {
  const color = /^#[0-9a-f]{6}$/i.test(String(rawColor || '')) ? String(rawColor).toUpperCase() : '#0F766E';
  const channels = [1,3,5].map(index => parseInt(color.slice(index,index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const contrastOnWhite = 1.05 / (luminance + 0.05);
  const textColor = contrastOnWhite >= 4.5 ? color : '#0F172A';

  return String(html || '')
    .replace(/color:\s*#0f766e/gi, 'color:' + textColor)
    .replace(/#0f766e/gi, color);
}
