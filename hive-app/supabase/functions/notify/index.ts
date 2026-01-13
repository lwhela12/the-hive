import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'The Hive <hive@yourdomain.com>';

interface NotificationPayload {
  type: 'wish_match' | 'meeting_summary' | 'queen_bee_update' | 'action_item' | 'general';
  user_ids?: string[];
  community_id?: string;
  data: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const payload: NotificationPayload = await req.json();
    const { type, user_ids, community_id, data } = payload;

    // Get users to notify
    let users;
    if (user_ids?.length) {
      const { data: usersData } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .in('id', user_ids);
      users = usersData;
    } else if (community_id) {
      const { data: memberRows } = await supabaseAdmin
        .from('community_memberships')
        .select('user_id')
        .eq('community_id', community_id);
      const memberIds = memberRows?.map((row) => row.user_id) || [];
      if (memberIds.length) {
        const { data: usersData } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .in('id', memberIds);
        users = usersData;
      } else {
        users = [];
      }
    } else {
      // Notify all users
      const { data: usersData } = await supabaseAdmin
        .from('profiles')
        .select('*');
      users = usersData;
    }

    if (!users?.length) {
      return new Response(JSON.stringify({ error: 'No users to notify' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const notifications = [];
    const emailPromises = [];

    for (const user of users) {
      let title = '';
      let content = '';
      let emailSubject = '';
      let emailBody = '';

      switch (type) {
        case 'wish_match': {
          const { wish, wisher } = data as { wish: { description: string }; wisher: { name: string } };
          title = 'Your skills might help!';
          content = `${wisher.name} is wishing for: ${wish.description}`;
          emailSubject = `Your skills might help ${wisher.name}!`;
          emailBody = `
            <h2>A wish you might be able to grant</h2>
            <p><strong>${wisher.name}</strong> is wishing for:</p>
            <blockquote>${wish.description}</blockquote>
            <p>Think you can help? Open The Hive to connect.</p>
          `;
          break;
        }

        case 'meeting_summary': {
          const { meeting } = data as { meeting: { date: string; summary: string } };
          title = 'Meeting Summary Available';
          content = `The summary for your meeting on ${meeting.date} is ready.`;
          emailSubject = 'Meeting Summary Available';
          emailBody = `
            <h2>Meeting Summary - ${meeting.date}</h2>
            <p>${meeting.summary}</p>
            <p>Open The Hive to see action items and full details.</p>
          `;
          break;
        }

        case 'queen_bee_update': {
          const { queenBee, update } = data as { queenBee: { name: string; project: string }; update: string };
          title = `Update from ${queenBee.name}`;
          content = update;
          emailSubject = `Queen Bee Update: ${queenBee.project}`;
          emailBody = `
            <h2>${queenBee.name}'s Project Update</h2>
            <p>${update}</p>
          `;
          break;
        }

        case 'action_item': {
          const { description, dueDate } = data as { description: string; dueDate?: string };
          title = 'New Action Item';
          content = description;
          emailSubject = 'New Action Item Assigned';
          emailBody = `
            <h2>You've been assigned an action item</h2>
            <p>${description}</p>
            ${dueDate ? `<p><strong>Due:</strong> ${dueDate}</p>` : ''}
            <p>Open The Hive to mark it complete when done.</p>
          `;
          break;
        }

        case 'general': {
          const { titleText, contentText } = data as { titleText: string; contentText: string };
          title = titleText;
          content = contentText;
          emailSubject = titleText;
          emailBody = `<p>${contentText}</p>`;
          break;
        }
      }

      // Create in-app notification
      const notificationCommunityId = community_id || user.current_community_id;
      if (!notificationCommunityId) {
        continue;
      }

      notifications.push({
        user_id: user.id,
        community_id: notificationCommunityId,
        notification_type: type,
        title,
        content,
        related_wish_id: (data as Record<string, unknown>).wish_id as string | undefined,
        related_meeting_id: (data as Record<string, unknown>).meeting_id as string | undefined,
        related_action_item_id: (data as Record<string, unknown>).action_item_id as string | undefined,
      });

      // Send email if user prefers email and we have Resend configured
      if (RESEND_API_KEY && user.preferred_contact === 'email' && user.email) {
        emailPromises.push(
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: user.email,
              subject: emailSubject,
              html: emailBody
            })
          }).then(() => {
            // Mark email as sent
            return { userId: user.id, sent: true };
          }).catch((error) => {
            console.error(`Email failed for ${user.email}:`, error);
            return { userId: user.id, sent: false };
          })
        );
      }
    }

    // Insert notifications
    if (notifications.length > 0) {
      await supabaseAdmin.from('notifications').insert(notifications);
    }

    // Wait for emails
    const emailResults = await Promise.all(emailPromises);

    // Update email_sent status for successful sends
    for (const result of emailResults) {
      if (result.sent) {
        await supabaseAdmin
          .from('notifications')
          .update({ email_sent: true })
          .eq('user_id', result.userId)
          .order('created_at', { ascending: false })
          .limit(1);
      }
    }

    return new Response(
      JSON.stringify({
        notifications_created: notifications.length,
        emails_sent: emailResults.filter(r => r.sent).length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Notification error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
