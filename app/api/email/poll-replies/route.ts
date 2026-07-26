import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptSmtpPass } from '@/lib/smtp-encryption';
import { handleInboundReply } from '@/lib/reply-handler';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const hasCronSecret = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    // If no cron secret, check if the request is from an authenticated user (for manual sync)
    if (!hasCronSecret) {
      const { getCurrentUser } = await import('@/lib/auth');
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const now = new Date();

    const accounts = await prisma.smtpAccount.findMany({
      where: {
        OR: [
          { replyCaptureMethod: 'imap' },
          { replyCaptureMethod: null }
        ],
        imapEnabled: true,
        imapVerified: true,
        imapPasswordEncrypted: { not: null }
      }
    });

    let totalRepliesProcessed = 0;
    let gmailRepliesFound = 0;

    // Also poll connected Gmail accounts (primary path for campaign sending)
    try {
      const { getCurrentUser } = await import('@/lib/auth');
      const user = await getCurrentUser().catch(() => null);
      const { pollGmailAccount } = await import('@/lib/gmail');
      const gmailAccounts = await prisma.gmailAccount.findMany({
        where: {
          status: 'Active',
          ...(user && !hasCronSecret ? { userId: user.id } : {})
        },
        select: { id: true, email: true }
      });
      for (const account of gmailAccounts) {
        try {
          const result = await pollGmailAccount(account.id);
          gmailRepliesFound += result.repliesFound || 0;
          totalRepliesProcessed += result.repliesFound || 0;
        } catch (err: any) {
          console.error('Gmail poll failed for', account.email, err?.message);
        }
      }
    } catch (err: any) {
      console.error('Gmail poll section failed:', err?.message);
    }

    if (accounts.length === 0) {
      return NextResponse.json({
        success: true,
        processedCount: totalRepliesProcessed,
        gmailRepliesFound,
        message: gmailRepliesFound > 0
          ? `Synced ${gmailRepliesFound} Gmail replies.`
          : 'No new replies found.'
      });
    }

    for (const account of accounts) {
      let client: ImapFlow | null = null;
      try {
        const decryptedPassword = decryptSmtpPass(account.imapPasswordEncrypted!);
        
        let dbUsername = '';
        if (account.imapUsernameEncrypted) {
          try {
            dbUsername = decryptSmtpPass(account.imapUsernameEncrypted);
          } catch (e) {
            dbUsername = account.imapUsername || '';
          }
        } else {
          dbUsername = account.imapUsername || '';
        }

        const username = dbUsername || account.fromEmail;

        client = new ImapFlow({
          host: account.imapHost!,
          port: account.imapPort!,
          secure: account.imapSecure,
          auth: {
            user: username,
            pass: decryptedPassword
          },
          logger: false,
          connectionTimeout: 15000
        });

        await client.connect();

        const lock = await client.getMailboxLock('INBOX');
        try {
          const searchOptions: any = {};
          if (account.imapLastSyncedAt) {
            searchOptions.since = new Date(account.imapLastSyncedAt.getTime() - 60000); // 1 min overlap
          } else {
            searchOptions.since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
          }

          const uids = await client.search(searchOptions);
          if (!uids || !Array.isArray(uids)) continue;

          for (const uid of uids) {
            try {
              const emailStream = await client.fetchOne(uid.toString(), { source: true });
              if (!emailStream || !emailStream.source) continue;

              const parsed = await simpleParser(emailStream.source);

              const messageId = parsed.messageId || '';
              const inReplyTo = parsed.inReplyTo || '';
              const references = Array.isArray(parsed.references)
                ? parsed.references.join(' ')
                : (parsed.references || '');

              let fromEmail = '';
              const fromObj = parsed.from as any;
              if (fromObj) {
                if (Array.isArray(fromObj)) {
                  fromEmail = fromObj[0]?.value?.[0]?.address || fromObj[0]?.address || '';
                } else if (fromObj.value && fromObj.value[0]) {
                  fromEmail = fromObj.value[0].address || '';
                } else {
                  fromEmail = fromObj.address || '';
                }
              }

              let toEmail = '';
              const toObj = parsed.to as any;
              if (toObj) {
                if (Array.isArray(toObj)) {
                  toEmail = toObj[0]?.value?.[0]?.address || toObj[0]?.address || '';
                } else if (toObj.value && toObj.value[0]) {
                  toEmail = toObj.value[0].address || '';
                } else {
                  toEmail = toObj.address || '';
                }
              }

              const subject = parsed.subject || '';
              const body = parsed.text || parsed.textAsHtml || '';

              if (!fromEmail || !body) continue;

              // Skip bounces, mailer-daemon, postmaster, auto-replies, delivery failures
              const junkSenders = ['mailer-daemon', 'postmaster', 'noreply', 'no-reply', 'mailchannels', 'notifications@'];
              const junkSubjects = ['undelivered mail', 'delivery failure', 'delivery status', 'automatic reply', 'out of office', 'auto-reply', 'smtp connection successful', 'mail delivery failed', 'returned to sender'];
              const fromLower = fromEmail.toLowerCase();
              const subjectLower = subject.toLowerCase();
              const isJunk = junkSenders.some(j => fromLower.includes(j)) || junkSubjects.some(j => subjectLower.includes(j));
              if (isJunk) continue;


              const normalizedFrom = fromEmail.trim().toLowerCase();
              const normalizedSubject = subject.trim();
              const normalizedBody = body.trim();

              const processResult = await handleInboundReply({
                fromEmail: normalizedFrom,
                toEmail: toEmail || undefined,
                subject: normalizedSubject,
                body: normalizedBody,
                messageId: messageId || undefined,
                inReplyTo: inReplyTo || undefined,
                references: references || undefined
              });

              if (processResult.success) {
                await prisma.emailReply.update({
                  where: { id: processResult.replyId },
                  data: { messageId: messageId || null }
                });
                totalRepliesProcessed++;
              }

            } catch (msgErr) {
              console.error(`Failed to process message UID ${uid}:`, msgErr);
            }
          }
        } finally {
          lock.release();
        }

        await client.logout();

        await prisma.smtpAccount.update({
          where: { id: account.id },
          data: { imapLastSyncedAt: now }
        });

      } catch (accErr) {
        console.error(`Failed polling for account ID ${account.id}:`, accErr);
        if (client) {
          try { await client.logout(); } catch (e) {}
        }
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: totalRepliesProcessed
    });

  } catch (error: any) {
    console.error('IMAP Polling Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
