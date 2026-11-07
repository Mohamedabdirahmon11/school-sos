type ResetMailLanguage = 'en' | 'so' | 'am';

const PASSWORD_RESET_TEMPLATES: Record<ResetMailLanguage, { subject: string; greeting: string; intro: string; expiry: string; ignore: string }> = {
  en: {
    subject: 'Your SchoolOS password reset code',
    greeting: 'Hello,',
    intro: 'Use this one-time code to reset your SchoolOS password:',
    expiry: 'This code expires in 10 minutes.',
    ignore: 'If you did not request this, ignore this email.'
  },
  so: {
    subject: 'Koodhka dib-u-dejinta furaha sirta SchoolOS',
    greeting: 'Salaan,',
    intro: 'Isticmaal koodhkan hal-mar ah si aad dib ugu dejiso furaha sirta SchoolOS:',
    expiry: 'Koodhkani wuxuu dhacayaa 10 daqiiqo gudahood.',
    ignore: 'Haddii aadan codsan, iska indho tir iimaylkan.'
  },
  am: {
    subject: 'የSchoolOS የይለፍ ቃል መቀየሪያ ኮድ',
    greeting: 'ሰላም፣',
    intro: 'የSchoolOS የይለፍ ቃልዎን ለመቀየር ይህን አንድ ጊዜ የሚጠቀሙበትን ኮድ ይጠቀሙ፦',
    expiry: 'ይህ ኮድ በ10 ደቂቃ ውስጥ ያበቃል።',
    ignore: 'ይህን ጥያቄ ካላቀረቡ ኢሜይሉን ችላ ይበሉ።'
  }
};

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  };
  return value.replace(/[&<>"']/g, character => entities[character] || character);
}

export function isPasswordResetMailConfigured(): boolean {
  return Boolean(process.env.MAIL_PROVIDER_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
}

export async function sendPasswordResetEmail(to: string, code: string, language: ResetMailLanguage = 'en'): Promise<void> {
  const apiKey = process.env.MAIL_PROVIDER_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error('Password reset email delivery is not configured.');

  const template = PASSWORD_RESET_TEMPLATES[language] || PASSWORD_RESET_TEMPLATES.en;
  const safeCode = escapeHtml(code);
  const text = [
    'SchoolOS',
    template.greeting,
    template.intro,
    code,
    template.expiry,
    template.ignore
  ].join('\n\n');
  const html = `<!doctype html><html lang="${language}"><body style="font-family:Arial,sans-serif;color:#132A29;line-height:1.5">
    <h2>SchoolOS</h2><p>${escapeHtml(template.greeting)}</p><p>${escapeHtml(template.intro)}</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:6px">${safeCode}</p>
    <p>${escapeHtml(template.expiry)}</p><p>${escapeHtml(template.ignore)}</p>
  </body></html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: template.subject, text, html })
  });
  if (!response.ok) {
    throw new Error(`Resend rejected password reset email (HTTP ${response.status}).`);
  }
}
