import type { CommunicationQueueItem, CommunicationSettings } from '../types/index.ts';
import { db } from './storage.ts';

function normalizedPhone(value: string): string {
  const phone = value.replace(/[\s()-]/g, '');
  if (!/^\+?[1-9]\d{7,14}$/.test(phone)) throw new Error('Recipient phone must be in international format.');
  return phone;
}

async function postProvider(url: string, init: RequestInit): Promise<{ messageId?: string }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Provider request failed with HTTP ${response.status}.`);
  const payload: any = await response.json().catch(() => ({}));
  return { messageId: payload?.sid || payload?.messages?.[0]?.messageId || payload?.messages?.[0]?.id };
}

async function deliver(item: CommunicationQueueItem, settings: CommunicationSettings): Promise<{ messageId?: string }> {
  if (!settings.isActive || settings.provider === 'none') throw new Error('No active notification provider is configured.');
  const phone = normalizedPhone(item.recipientPhone);
  if (settings.provider === 'twilio') {
    if (!settings.apiKey || !settings.apiSecret || !settings.senderId) throw new Error('Twilio requires Account SID, Auth Token, and sender number.');
    const from = item.channel === 'whatsapp' ? `whatsapp:${settings.senderId.replace(/^whatsapp:/, '')}` : settings.senderId;
    const to = item.channel === 'whatsapp' ? `whatsapp:${phone}` : phone;
    const auth = Buffer.from(`${settings.apiKey}:${settings.apiSecret}`).toString('base64');
    return postProvider(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(settings.apiKey)}/Messages.json`, {
      method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: to, Body: item.content })
    });
  }
  if (settings.provider === 'infobip') {
    if (!settings.apiKey || !settings.senderId || !settings.webhookUrl) throw new Error('Infobip requires an API key, sender ID, and approved base URL.');
    let base: URL;
    try { base = new URL(settings.webhookUrl); } catch { throw new Error('Infobip base URL is invalid.'); }
    if (base.protocol !== 'https:' || !/(^|\.)api\.infobip\.com$/i.test(base.hostname)) throw new Error('Infobip base URL must use an official HTTPS api.infobip.com host.');
    const whatsapp = item.channel === 'whatsapp';
    const endpoint = whatsapp ? '/whatsapp/1/message/text' : '/sms/2/text/advanced';
    const payload = whatsapp
      ? { messages: [{ from: settings.senderId, to: phone.replace(/^\+/, ''), content: { text: item.content } }] }
      : { messages: [{ from: settings.senderId, destinations: [{ to: phone.replace(/^\+/, '') }], text: item.content }] };
    return postProvider(new URL(endpoint, base).toString(), {
      method: 'POST', headers: { Authorization: `App ${settings.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  if (settings.provider === 'whatsapp_business') {
    if (item.channel !== 'whatsapp') throw new Error('WhatsApp Business Cloud only supports WhatsApp messages.');
    if (!settings.apiKey || !settings.senderId) throw new Error('WhatsApp Business requires an access token and phone-number ID.');
    const version = process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0';
    if (!/^v\d+\.\d+$/.test(version)) throw new Error('WhatsApp Graph API version is invalid.');
    return postProvider(`https://graph.facebook.com/${version}/${encodeURIComponent(settings.senderId)}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone.replace(/^\+/, ''), type: 'text', text: { preview_url: false, body: item.content } })
    });
  }
  if (settings.provider === 'local_gateway') {
    const endpoint = process.env.SCHOOL_OS_LOCAL_GATEWAY_URL;
    if (!endpoint) throw new Error('SCHOOL_OS_LOCAL_GATEWAY_URL is required for the local gateway provider.');
    let target: URL;
    try { target = new URL(endpoint); } catch { throw new Error('Local gateway URL is invalid.'); }
    if (target.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && target.hostname === 'localhost')) {
      throw new Error('Local gateway must use HTTPS in production.');
    }
    return postProvider(target.toString(), {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.SCHOOL_OS_LOCAL_GATEWAY_TOKEN ? { Authorization: `Bearer ${process.env.SCHOOL_OS_LOCAL_GATEWAY_TOKEN}` } : {}) },
      body: JSON.stringify({ to: phone, channel: item.channel, message: item.content, schoolId: item.schoolId, messageId: item.id })
    });
  }
  throw new Error('Unsupported notification provider.');
}

let timer: NodeJS.Timeout | undefined;
let active = false;

async function processOne(): Promise<void> {
  if (active) return;
  active = true;
  try {
    const item = await db.claimCommunicationQueueItem();
    if (!item) return;
    try {
      const settings = await db.getCommunicationSettings(item.schoolId);
      const result = await deliver(item, settings);
      await db.completeCommunicationQueueItem(item.id, true, undefined, result.messageId);
    } catch (error: any) {
      await db.completeCommunicationQueueItem(item.id, false, String(error?.message || 'Provider delivery failed.'));
    }
  } catch (error: any) {
    console.error(`[notification-worker] ${String(error?.message || 'Queue processing failed.')}`);
  } finally {
    active = false;
  }
}

export function startNotificationWorker(): void {
  if (timer) return;
  void processOne();
  timer = setInterval(() => { void processOne(); }, 5_000);
  timer.unref();
}
