# SchoolOS SMS and WhatsApp provider setup

The notification worker starts automatically with the production server. Messages remain queued until the selected provider returns a successful HTTP response; a queued row is not treated as delivered.

## Credential storage

Provider API keys and secrets are encrypted at rest with AES-256-GCM. Set a dedicated `COMMUNICATION_CREDENTIALS_KEY` with at least 32 characters. If it is not set, SchoolOS derives the encryption key from `SESSION_SECRET`. Keep this key stable and back it up securely; changing it makes previously encrypted provider credentials unreadable, so the credentials must be entered again.

The settings API returns only configured/not-configured flags. It never returns stored API keys, API secrets, or webhook URLs.

## Provider fields

| Provider | API key | API secret | Sender ID | Webhook URL |
| --- | --- | --- | --- | --- |
| Twilio | Account SID | Auth Token | SMS number or WhatsApp-enabled number | Not used |
| Infobip | API key | Not required | Approved sender | HTTPS base URL on an official `*.api.infobip.com` host |
| WhatsApp Business Cloud | Permanent access token | Not required | WhatsApp phone-number ID | Not used |
| Local gateway | Not used by the worker | Not used by the worker | Optional provider-specific value | Set `SCHOOL_OS_LOCAL_GATEWAY_URL` on the server instead |

For WhatsApp Business Cloud, SchoolOS uses `WHATSAPP_GRAPH_API_VERSION` when set, otherwise `v23.0`. The Local Gateway URL must be HTTPS in production. An optional `SCHOOL_OS_LOCAL_GATEWAY_TOKEN` is sent as a bearer token.

Provider activation is rejected when required credentials or server configuration are missing.

## Delivery and retries

- The worker claims one due queue item at a time using a database row lock with `SKIP LOCKED`.
- Failed sends retry after 1 minute, 5 minutes, 15 minutes, then 1 hour, up to 5 attempts.
- Worker claims older than 5 minutes are recovered after a process restart or crash.
- A school administrator can manually retry a failed queue item. The retry is restricted to that school.
- Provider responses are marked sent only after an HTTP success response; provider message IDs are stored when available.


## Manual WhatsApp absence messages (no API provider required)

SchoolOS can prepare a parent absence message directly in the administrator's WhatsApp account without Twilio or WhatsApp Business Cloud API:

1. Save the school's official telephone/administrator WhatsApp number in School Settings using international format (for example, `+2519XXXXXXXX`). This is the school's displayed contact number; it does not sign WhatsApp in automatically.
2. Sign in to WhatsApp or WhatsApp Web with the administrator's WhatsApp account on the device/browser used for SchoolOS.
3. Open Attendance, mark the student as Absent, and save attendance.
4. Use the WhatsApp action on that student's row. SchoolOS opens the parent's chat and pre-fills a message with the student's name, ID, date, class, and school.
5. The administrator reviews the message and presses **Send** in WhatsApp.

The parent's phone number must be stored in international format (starting with `+` or `00`). The message is not sent automatically; the administrator controls and confirms every send. The WhatsApp account currently signed in on the device is the sender.
