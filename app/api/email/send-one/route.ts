import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { sendCampaignEmail } from '@/lib/email-dispatch';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sequenceId } = await req.json();

  if (!sequenceId || typeof sequenceId !== "string" || sequenceId.trim() === "") {
    return NextResponse.json({ success: false, error: "Email draft ID is missing." }, { status: 400 });
  }

  const sequence = await prisma.emailSequence.findFirst({ 
    where: { id: sequenceId, userId: user.id },
    include: { lead: true }
  });

  if (!sequence || !sequence.lead.email) {
    return NextResponse.json({ error: 'Sequence not found or lead has no email' }, { status: 404 });
  }

  if (sequence.approvalStatus !== 'Approved') {
    return NextResponse.json({ error: 'Only approved emails can be sent.' }, { status: 400 });
  }

  if (sequence.status === 'Sent') {
    return NextResponse.json({ error: 'This email has already been sent.' }, { status: 400 });
  }

  const finalSubject = sequence.editedSubject || sequence.aiOriginalSubject || sequence.subject;
  const finalBody = sequence.editedBody || sequence.aiOriginalBody || sequence.body;

  try {
    const sendLog = await prisma.emailSendLog.create({
      data: {
        campaignId: sequence.campaignId,
        leadId: sequence.leadId,
        emailSequenceId: sequence.id,
        subject: finalSubject,
        body: finalBody,
        status: 'Sending'
      }
    });

    const sendResult = await sendCampaignEmail({
      to: sequence.lead.email,
      subject: finalSubject,
      html: finalBody.replace(/\n/g, '<br/>'),
      campaignId: sequence.campaignId,
      leadId: sequence.leadId,
      emailSequenceId: sequence.id,
      sendLogId: sendLog.id
    });

    if (!sendResult.success) {
      await prisma.emailSendLog.update({ where: { id: sendLog.id }, data: { status: 'Failed', errorMessage: sendResult.error } });
      throw new Error(sendResult.error);
    }

    const updated = await prisma.emailSequence.update({
      where: { id: sequence.id },
      data: { status: 'Sent', sentAt: new Date() }
    });
    
    await prisma.emailSendLog.update({
      where: { id: sendLog.id },
      data: { status: 'Sent', sentAt: new Date() }
    });

    return NextResponse.json({ sequence: updated });
  } catch (error: any) {
    await prisma.emailSequence.update({
      where: { id: sequence.id },
      data: { status: 'Failed', errorMessage: error.message }
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
