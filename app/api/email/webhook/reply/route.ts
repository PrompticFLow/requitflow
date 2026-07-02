import { NextResponse } from 'next/server';
import { handleInboundReply } from '@/lib/reply-handler';

export async function POST(req: Request) {
  try {
    const { fromEmail, toEmail, subject, body, messageId } = await req.json();

    if (!fromEmail || !body) {
      return NextResponse.json({ error: 'fromEmail and body are required' }, { status: 400 });
    }

    const result = await handleInboundReply({
      fromEmail,
      toEmail,
      subject,
      body,
      messageId
    });

    return NextResponse.json({
      success: true,
      aiCategory: result.classification,
      replyId: result.replyId,
      aiReplyStatus: result.aiReplyStatus,
      futureFollowUpsCancelled: result.futureFollowUpsCancelled
    });
  } catch (error: any) {
    console.error("Webhook Reply Error:", error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
