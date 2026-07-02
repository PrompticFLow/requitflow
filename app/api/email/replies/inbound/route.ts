import { NextResponse } from 'next/server';
import { handleInboundReply } from '@/lib/reply-handler';

export async function POST(req: Request) {
  try {
    let payload: any = {};
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      payload = await req.json();
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      formData.forEach((value, key) => {
        payload[key] = value;
      });
    }

    // Standard fields (JSON or flattened form-data fields)
    let fromEmail = payload.fromEmail || payload.from || '';
    let toEmail = payload.toEmail || payload.to || '';
    let subject = payload.subject || '';
    let body = payload.body || payload.text || payload.html || '';
    
    // Parse email out of from string e.g. "Lead Name <lead@example.com>" -> "lead@example.com"
    if (fromEmail.includes('<') && fromEmail.includes('>')) {
      const match = fromEmail.match(/<([^>]+)>/);
      if (match) {
        fromEmail = match[1];
      }
    }
    
    if (toEmail.includes('<') && toEmail.includes('>')) {
      const match = toEmail.match(/<([^>]+)>/);
      if (match) {
        toEmail = match[1];
      }
    }

    const messageId = payload.messageId || payload.message_id || '';
    const inReplyTo = payload.inReplyTo || payload.in_reply_to || '';
    const references = payload.references || '';
    const campaignId = payload.campaignId || '';
    const leadId = payload.leadId || '';
    const emailSequenceId = payload.emailSequenceId || '';

    if (!fromEmail || !body) {
      return NextResponse.json({ error: 'Missing required fromEmail or body fields' }, { status: 400 });
    }

    const result = await handleInboundReply({
      fromEmail,
      toEmail,
      subject,
      body,
      messageId,
      inReplyTo,
      references,
      campaignId,
      leadId,
      emailSequenceId
    });

    return NextResponse.json({
      success: true,
      matched: result.matched,
      replyId: result.replyId,
      classification: result.classification,
      aiReplyStatus: result.aiReplyStatus,
      futureFollowUpsCancelled: result.futureFollowUpsCancelled
    });
  } catch (error: any) {
    console.error('Inbound reply route error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process reply' }, { status: 500 });
  }
}
