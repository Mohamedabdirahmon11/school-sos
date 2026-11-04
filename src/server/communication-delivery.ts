import { Buffer } from 'node:buffer';
import type { CommunicationQueueItem, CommunicationSettings } from '../types/index.ts';

export interface DeliveryResult {
  accepted: true;
}

const normalizePhone = (value: string): string => value.replace(/[\s().-]/g, '');

const requestJson = async (url: string, init: RequestInit): Promise<any> => {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error('The notification provider could not be reached. Check the gateway endpoint and server network.');
  }
  if (!response.ok) {
    // Never echo provider response bodies: gateways sometimes include account or credential details.
    throw new Error(`The notification provider rejected the request (HTTP ${response.status}). Check its configuration and account status.`);
  }
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const requireHttpsEndpoint = (value: string | undefined, provider: string): URL => {
  if (!value || value.length > 1000) throw new Error(`${provider} requires its HTTPS API endpoint URL in Gateway Endpoint URL.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Gateway endpoint URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Gateway endpoint must use HTTPS and must not contain embedded credentials.');
  return url;
};

async function deliverTwilio(settings: CommunicationSettings, item: CommunicationQueueItem): Promise<void> {
  const accountSid = settings.apiKey?.trim() || '';
  const authToken = settings.apiSecret?.trim() || '';
  const sender = settings.senderId?.trim() || '';
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid) || !authToken || !sender) {
    throw new Error('Twilio requires a valid Account SID, Auth Token and sender number or approved WhatsApp sender.');
  }
  const from = item.channel === 'whatsapp'
    ? (sender.startsWith('whatsapp:') ? sender : `whatsapp:${normalizePhone(sender)}`)
    : sender;
  const to = item.channel === 'whatsapp'
    ? `whatsapp:${normalizePhone(item.recipientPhone)}`
    : normalizePhone(item.recipientPhone);
  if (!/^\+?[0-9]{6,20}$/.test(normalizePhone(item.recipientPhone))) throw new Error('Recipient phone must contain a valid international number.');
  const form = new URLSearchParams({ To: to, From: from, Body: item.content });
  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  await requestJson(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
}

async function deliverInfobip(settings: CommunicationSettings, item: CommunicationQueueItem): Promise<void> {
  const apiKey = settings.apiKey?.trim() || '';
  const sender = settings.senderId?.trim() || '';
  if (!apiKey || !sender) throw new Error('Infobip requires an API key and an approved sender ID.');
  const endpoint = requireHttpsEndpoint(settings.webhookUrl, 'Infobip');
  if (!endpoint.hostname.endsWith('infobip.com')) throw new Error('Infobip endpoint must use an infobip.com HTTPS host.');
  const url = new URL(item.channel === 'whatsapp' ? '/whatsapp/1/message/text' : '/sms/2/text/advanced', endpoint.origin);
  const body = item.channel === 'whatsapp'
    ? { from: sender, to: normalizePhone(item.recipientPhone), content: { text: item.content } }
    : { messages: [{ from: sender, destinations: [{ to: normalizePhone(item.recipientPhone) }], text: item.content }] };
  await requestJson(url.toString(), {
    method: 'POST',
    headers: { Authorization: `App ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
}

async function deliverLocalGateway(settings: CommunicationSettings, item: CommunicationQueueItem): Promise<void> {
  const endpoint = requireHttpsEndpoint(settings.webhookUrl, 'Local gateway');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  if (settings.apiSecret) headers['X-Gateway-Secret'] = settings.apiSecret.trim();
  await requestJson(endpoint.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messageId: item.id,
      schoolId: item.schoolId,
      channel: item.channel,
      to: normalizePhone(item.recipientPhone),
      from: settings.senderId || undefined,
      message: item.content
    })
  });
}

/** Returns only after the provider accepts the message; this is not handset delivery confirmation. */
export async function deliverCommunication(
  settings: CommunicationSettings,
  item: CommunicationQueueItem
): Promise<DeliveryResult> {
  if (!settings.isActive || settings.provider === 'none') {
    throw new Error('No active SMS/WhatsApp provider is configured.');
  }
  if (item.channel === 'whatsapp' && !['twilio', 'infobip', 'local_gateway'].includes(settings.provider)) {
    throw new Error('The selected provider does not support WhatsApp delivery.');
  }
  switch (settings.provider) {
    case 'twilio': await deliverTwilio(settings, item); break;
    case 'infobip': await deliverInfobip(settings, item); break;
    case 'local_gateway': await deliverLocalGateway(settings, item); break;
    default: throw new Error('The selected notification provider is not supported.');
  }
  return { accepted: true };
}
