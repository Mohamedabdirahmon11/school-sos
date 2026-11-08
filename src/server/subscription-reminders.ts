import { calculateSubscriptionGraceEnd, db } from './storage.ts';
import { isPasswordResetMailConfigured, sendPlatformEmail } from './mail-service.ts';
import { supabase } from './supabase.ts';

export type ReminderStage = 'before_7' | 'before_3' | 'before_1' | 'grace' | 'read_only';
type ReminderLanguage = 'en' | 'so';

const DAY_MS = 24 * 60 * 60 * 1000;

export function reminderStageFor(
  sub: { cadence?: string; status?: string; validUntil: string; graceDays?: number } | undefined,
  now: Date,
  platformGraceDays = 7
): ReminderStage | null {
  if (!sub || sub.cadence === 'lifetime' || sub.status === 'suspended') return null;
  const validUntil = new Date(sub.validUntil);
  if (!Number.isFinite(validUntil.getTime())) return null;
  const graceEnd = calculateSubscriptionGraceEnd(sub.validUntil, sub.graceDays, platformGraceDays);
  if (now > graceEnd) return 'read_only';
  if (now >= validUntil) return 'grace';
  const daysLeft = Math.ceil((validUntil.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft <= 1) return 'before_1';
  if (daysLeft <= 3) return 'before_3';
  if (daysLeft <= 7) return 'before_7';
  return null;
}

const TEXT: Record<ReminderLanguage, Record<ReminderStage, { subject: string; body: string }>> = {
  en: {
    before_7: { subject: 'Your SchoolOS subscription ends in 7 days', body: 'Your subscription for {school} ends on {date}. Please renew to avoid interruption.' },
    before_3: { subject: 'Your SchoolOS subscription ends in 3 days', body: 'Your subscription for {school} ends on {date}. Please renew soon.' },
    before_1: { subject: 'Your SchoolOS subscription ends tomorrow', body: 'Your subscription for {school} ends on {date}. Renew today to keep full access.' },
    grace: { subject: 'Your SchoolOS subscription has expired (grace period)', body: 'The subscription for {school} ended on {date}. You are in a grace period; renew to avoid read-only access.' },
    read_only: { subject: 'SchoolOS is now read-only for your school', body: 'The grace period for {school} has ended. Your school is read-only until the subscription is renewed.' }
  },
  so: {
    before_7: { subject: 'Rukhsadda SchoolOS waxay dhacaysaa 7 maalmood gudahood', body: 'Rukhsadda {school} waxay dhacaysaa {date}. Fadlan cusboonaysii si aan loo go\'in.' },
    before_3: { subject: 'Rukhsadda SchoolOS waxay dhacaysaa 3 maalmood gudahood', body: 'Rukhsadda {school} waxay dhacaysaa {date}. Fadlan dhawaan cusboonaysii.' },
    before_1: { subject: 'Rukhsadda SchoolOS waxay dhacaysaa berri', body: 'Rukhsadda {school} waxay dhacaysaa {date}. Maanta cusboonaysii si aad u hayso gelitaanka buuxa.' },
    grace: { subject: 'Rukhsadda SchoolOS way dhacday (muddo deeq ah)', body: 'Rukhsadda {school} waxay dhammaatay {date}. Waxaad ku jirtaa muddo deeq ah; cusboonaysii si aan loo beddelin akhris-keliya.' },
    read_only: { subject: 'SchoolOS hadda waa akhris-keliya iskuulkaaga', body: 'Muddada deeqda ee {school} way dhammaatay. Iskuulkaagu waa akhris-keliya ilaa rukhsadda la cusboonaysiiyo.' }
  }
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

export function buildReminderEmail(stage: ReminderStage, language: ReminderLanguage, schoolName: string, validUntil: string) {
  const template = TEXT[language][stage];
  const date = validUntil.slice(0, 10);
  const text = template.body.replace('{school}', schoolName).replace('{date}', date);
  const html = `<!doctype html><html lang="${language}"><body style="font-family:Arial,sans-serif;color:#132A29;line-height:1.5"><h2>SchoolOS</h2><p>${escapeHtml(text)}</p></body></html>`;
  return { subject: template.subject, text, html };
}

/** Sends each reminder stage at most once per school and subscription period. Never throws. */
export async function runSubscriptionReminders(now = new Date()): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  if (!supabase || !isPasswordResetMailConfigured()) return result;
  try {
    const schools = await db.getSchools();
    const platformGraceDays = db.getSettings().graceDays;
    for (const school of schools) {
      const sub = school.subscription;
      const stage = reminderStageFor(sub, now, platformGraceDays);
      if (!sub || !stage) continue;
      const admins = (await db.getUsers(school.id, 'school_admin')).filter(user => user.email && !user.isBlocked);
      if (!admins.length) continue;
      // Claim the stage first. The unique key makes concurrent instances safe.
      const claim = await supabase.from('subscription_reminders').insert({ school_id: school.id, stage, valid_until: sub.validUntil }).select('id').single();
      if (claim.error || !claim.data) continue;
      const language: ReminderLanguage = (school as any).language === 'so' ? 'so' : 'en';
      const mail = buildReminderEmail(stage, language, school.name, sub.validUntil);
      let delivered = 0;
      for (const admin of admins) {
        try {
          await sendPlatformEmail({ to: admin.email!, ...mail });
          delivered += 1;
        } catch {
          result.failed += 1;
        }
      }
      if (delivered === 0) {
        // Release the claim so the next daily run retries.
        await supabase.from('subscription_reminders').delete().eq('id', claim.data.id);
      } else {
        result.sent += delivered;
        db.logAudit({
          action: 'SUBSCRIPTION_REMINDER_SENT', category: 'subscription', schoolId: school.id, schoolName: school.name,
          userId: 'system', userName: 'System Daemon', userRole: 'super_admin',
          details: `Subscription reminder (${stage}) emailed to ${delivered} school admin(s).`, severity: 'info'
        });
      }
    }
  } catch {
    console.error('[subscription-reminders] Reminder run failed.');
  }
  return result;
}
