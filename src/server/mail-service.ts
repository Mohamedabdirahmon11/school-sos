import nodemailer from 'nodemailer';

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

function providerName(): string {
  return (process.env.MAIL_PROVIDER?.trim().toLowerCase() || 'resend');
}

export function isPasswordResetMailConfigured(): boolean {
  const provider = providerName();
  if (provider === 'gmail') {
    return Boolean(process.env.GMAIL_SMTP_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '') && process.env.MAIL_FROM?.trim());
  }
  return provider === 'resend' && Boolean(process.env.MAIL_PROVIDER_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
}

interface MailMessage {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

export class PasswordResetMailError extends Error {
  constructor(
    readonly provider: string,
    readonly statusCode: number | null,
    readonly providerMessage: string
  ) {
    super(`Password reset email provider ${provider} failed.`);
    this.name = 'PasswordResetMailError';
  }
}

function redactMailDiagnostic(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b\d{6}\b/g, '[redacted-code]')
    .replace(/(?:Bearer\s+)[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 240);
}

export function formatPasswordResetMailFailure(error: unknown): string {
  const failure = error as Partial<PasswordResetMailError> | null;
  const provider = typeof failure?.provider === 'string' ? failure.provider : 'unknown';
  const status = Number.isInteger(failure?.statusCode) ? String(failure?.statusCode) : 'unknown';
  const rawMessage = typeof failure?.providerMessage === 'string'
    ? failure.providerMessage
    : error instanceof Error ? error.message : 'Unknown mail delivery error';
  return `Password reset email delivery failed provider=${provider} status=${status} message="${redactMailDiagnostic(rawMessage)}"`;
}

class ResendMailProvider implements MailProvider {
  async send(message: MailMessage): Promise<void> {
    const apiKey = process.env.MAIL_PROVIDER_API_KEY?.trim();
    if (!apiKey) throw new PasswordResetMailError('resend', null, 'Mail provider API key is not configured.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    if (!response.ok) {
      let providerMessage = response.statusText || 'Provider rejected the request.';
      try {
        const body = await response.json() as { message?: unknown; error?: unknown };
        const detail = typeof body.message === 'string' ? body.message : body.error;
        if (typeof detail === 'string' && detail.trim()) providerMessage = detail.trim();
      } catch {
        // Do not log the raw response body.
      }
      throw new PasswordResetMailError('resend', response.status, providerMessage);
    }
  }
}

class GmailSmtpMailProvider implements MailProvider {
  async send(message: MailMessage): Promise<void> {
    const user = process.env.GMAIL_SMTP_USER?.trim();
    const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
    if (!user || !pass) throw new PasswordResetMailError('gmail', null, 'Gmail SMTP credentials are not configured.');

    const sender = message.from.match(/<([^<>]+)>/)?.[1]?.trim() || message.from.trim();
    if (sender.toLowerCase() !== user.toLowerCase()) {
      throw new PasswordResetMailError('gmail', null, 'MAIL_FROM must use the authenticated Gmail address.');
    }

    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user, pass },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        tls: { minVersion: 'TLSv1.2' }
      });
      await transporter.sendMail(message);
      transporter.close();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'SMTP delivery failed.';
      const code = error && typeof error === 'object' && 'responseCode' in error && typeof error.responseCode === 'number'
        ? error.responseCode : null;
      throw new PasswordResetMailError('gmail', code, detail);
    }
  }
}

export async function sendPasswordResetEmail(to: string, code: string, language: ResetMailLanguage = 'en', schoolName?: string): Promise<void> {
  const from = process.env.MAIL_FROM?.trim();
  const providerNameValue = providerName();
  if (!isPasswordResetMailConfigured() || !from) {
    throw new Error('Password reset email delivery is not configured.');
  }

  const template = PASSWORD_RESET_TEMPLATES[language] || PASSWORD_RESET_TEMPLATES.en;
  const safeCode = escapeHtml(code);
  const safeSchoolName = schoolName?.trim() ? escapeHtml(schoolName.trim()) : '';
  const productLabel = safeSchoolName ? `${safeSchoolName} — SchoolOS` : 'SchoolOS';
  const text = [
    productLabel,
    template.greeting,
    template.intro,
    code,
    template.expiry,
    template.ignore
  ].join('\n\n');
  const html = `<!doctype html><html lang="${language}"><body style="font-family:Arial,sans-serif;color:#132A29;line-height:1.5">
    <h2>SchoolOS</h2>${safeSchoolName ? `<p>${safeSchoolName}</p>` : ''}<p>${escapeHtml(template.greeting)}</p><p>${escapeHtml(template.intro)}</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:6px">${safeCode}</p>
    <p>${escapeHtml(template.expiry)}</p><p>${escapeHtml(template.ignore)}</p>
  </body></html>`;

  const provider: MailProvider = providerNameValue === 'gmail'
    ? new GmailSmtpMailProvider()
    : new ResendMailProvider();
  if (providerNameValue !== 'gmail' && providerNameValue !== 'resend') {
    throw new Error('MAIL_PROVIDER must be either gmail or resend.');
  }
  await provider.send({ from, to: [to], subject: template.subject, text, html });
}
