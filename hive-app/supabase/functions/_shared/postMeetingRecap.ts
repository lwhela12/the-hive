export interface RecapMeeting {
  id: string;
  communityId: string;
  hiveName: string;
  title: string;
  date: string;
}

export interface RecapRecipient {
  id: string;
  name: string | null;
  email: string | null;
  emailRemindersEnabled?: boolean | null;
  emailPostMeetingRecapEnabled?: boolean | null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function firstName(name?: string | null): string {
  return name?.trim().split(/\s+/)[0] || 'there';
}

export function buildPostMeetingRecapLinks(appUrl: string, meeting: RecapMeeting) {
  const base = appUrl.replace(/\/$/, '');
  const hive = encodeURIComponent(meeting.communityId);
  const meetingId = encodeURIComponent(meeting.id);
  const [year, month, day] = meeting.date.split('-').map(Number);
  const friendlyDate = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : meeting.date;
  // This becomes the person's visible first message to Clive. Keep routing ids
  // in the URL where they belong; nobody talks in UUIDs (Nat, 2026-08-18).
  const context = `Hey Clive — I missed ${meeting.title} on ${friendlyDate}. Can you catch me up? Start with the decisions, anything I need to do, and what I should know before the next meeting.`;

  return {
    summaryUrl: `${base}/meetings?hive=${hive}&meeting=${meetingId}`,
    cliveUrl: `${base}/?hive=${hive}&prefill=${encodeURIComponent(context)}`,
    cliveContext: context,
  };
}

export function eligibleRecapRecipients(
  confirmedAbsentUserIds: string[],
  profiles: RecapRecipient[],
): RecapRecipient[] {
  const confirmed = new Set(confirmedAbsentUserIds);
  return profiles.filter((profile) =>
    confirmed.has(profile.id)
    && !!profile.email?.trim()
    && profile.emailRemindersEnabled !== false
    && profile.emailPostMeetingRecapEnabled !== false
  );
}

export function postMeetingRecapSubject(meeting: RecapMeeting): string {
  return `${meeting.hiveName} · What you missed at ${meeting.title}`;
}

/** Member email. Deliberately contains exactly two links/buttons. */
export function postMeetingRecapHtml(
  rawName: string | null,
  meeting: RecapMeeting,
  appUrl: string,
): string {
  const name = escapeHtml(firstName(rawName));
  const hive = escapeHtml(meeting.hiveName);
  const title = escapeHtml(meeting.title);
  const { summaryUrl, cliveUrl } = buildPostMeetingRecapLinks(appUrl, meeting);

  // Nat, 2026-08-24, reading this email live: "the only thing missing is one
  // of our bee's or logos or something." Same file the invite and The Buzz
  // already send — RGB with no transparency despite its name, hence the
  // white tile underneath; width in the tag as well as the style because
  // Outlook ignores CSS sizing on images.
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#2b2b2b;line-height:1.5;">
      <div style="text-align:center;padding:8px 0 4px;">
        <img src="https://the-hive.app/assets/hive-logo-email.png"
             alt="H.I.V.E. — Human, Insight, Vision, Execution"
             width="72" height="72"
             style="width:72px;height:72px;display:inline-block;border:0;outline:none;text-decoration:none;background:#ffffff;border-radius:36px;" />
      </div>
      <p style="text-align:center;color:#bd9348;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;margin:0 0 2px;">${hive}</p>
      <h1 style="color:#bd9348;font-size:22px;text-align:center;margin:8px 0 4px;">What you missed</h1>
      <p style="text-align:center;color:#6b6b6b;font-size:14px;margin:0 0 20px;">${title}</p>
      <p style="font-size:15px;">Hi ${name},</p>
      <p style="font-size:15px;">We missed you. Tonight&rsquo;s notes are sealed, so you can catch up without hunting through the app.</p>
      <div style="text-align:center;margin:28px 0 12px;">
        <a href="${summaryUrl}" style="background:#bd9348;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:15px;font-weight:600;display:inline-block;">Open Meeting Summaries</a>
      </div>
      <div style="text-align:center;margin:12px 0 28px;">
        <a href="${cliveUrl}" style="background:#313130;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:15px;font-weight:600;display:inline-block;">Ask Clive what I missed</a>
      </div>
      <p style="font-size:12px;color:#9a9a9a;text-align:center;">You received this because you were marked absent at Wrap-Up. Turn off <strong>Recap email if I miss a meeting</strong> in Profile → Settings any time.</p>
    </div>`;
}

export function recapPreviewBanner(meeting: RecapMeeting, recipientCount: number): string {
  const hive = escapeHtml(meeting.hiveName);
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto 18px;">
      <div style="background:#fdf3dc;border:1px solid #e6d2a4;border-radius:14px;padding:14px 16px;color:#6b5220;">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;">Waiting for your go-ahead</p>
        <p style="margin:0;font-size:14px;line-height:1.5;">Nobody has this yet. Below is the member email for <strong>${hive}</strong>. Approval sends it only to the ${recipientCount} confirmed ${recipientCount === 1 ? 'absentee who still has' : 'absentees who still have'} recap email turned on. If you do nothing, nothing sends.</p>
      </div>
    </div>`;
}
