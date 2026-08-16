import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { sendCampaignEmail } from '@/lib/sendgrid';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    if (!id || typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ success: false, error: "Email draft ID is missing." }, { status: 400 });
    }

    const sequence = await prisma.emailSequence.findFirst({
      where: { id, userId: user.id },
      include: { lead: true }
    });

    if (!sequence) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (sequence.approvalStatus !== 'Approved') {
      return NextResponse.json({ error: 'Only approved emails can be sent' }, { status: 400 });
    }
    
    if (sequence.status === 'Sent') {
      return NextResponse.json({ error: 'Email has already been sent' }, { status: 400 });
    }

    if (!sequence.lead.email) {
      return NextResponse.json({ error: 'Lead does not have an email address' }, { status: 400 });
    }

    // Check unsubscribe list
    const isUnsub = await prisma.unsubscribeList.findUnique({
      where: { userId_email: { userId: user.id, email: sequence.lead.email } }
    });
    if (isUnsub || sequence.lead.status === 'Unsubscribed') {
      return NextResponse.json({ error: 'Cannot send to unsubscribed lead' }, { status: 400 });
    }

    if (sequence.lead.status === 'Booked') {
      return NextResponse.json({ error: 'Cannot send to a lead that has already booked' }, { status: 400 });
    }

    // A reply blocks sending only within the campaign it was received in
    const repliedInCampaign = await prisma.emailReply.findFirst({
      where: {
        leadId: sequence.leadId,
        OR: [{ campaignId: sequence.campaignId }, { campaignId: null }]
      },
      select: { id: true }
    });
    if (repliedInCampaign) {
      return NextResponse.json({ error: 'Cannot send: this lead has already replied in this campaign' }, { status: 400 });
    }

    const smtpAccount = await prisma.smtpAccount.findUnique({ where: { userId: user.id } });
    if (!smtpAccount || !smtpAccount.isVerified || smtpAccount.status !== 'Active') {
      return NextResponse.json({ error: 'SMTP must be verified before sending' }, { status: 400 });
    }

    const finalSubject = sequence.editedSubject || sequence.aiOriginalSubject || sequence.subject;
    const finalBody = sequence.editedBody || sequence.aiOriginalBody || sequence.body;

    try {
      const sendResult = await sendCampaignEmail({
        to: sequence.lead.email,
        subject: finalSubject,
        html: finalBody,
        campaignId: sequence.campaignId,
        leadId: sequence.leadId,
        emailSequenceId: sequence.id
      });

      if (!sendResult.success) {
        throw new Error(sendResult.error);
      }

      const updatedSeq = await prisma.emailSequence.update({
        where: { id: sequence.id },
        data: {
          status: 'Sent',
          sentAt: new Date()
        }
      });

      await prisma.emailSendLog.create({
        data: {
          campaignId: sequence.campaignId,
          leadId: sequence.leadId,
          emailSequenceId: sequence.id,
          subject: finalSubject,
          body: finalBody,
          status: 'Sent',
          sentAt: new Date()
        }
      });

      return NextResponse.json({ success: true, email: updatedSeq });
    } catch (sendError: any) {
      console.error("SMTP Send Failed:", sendError);
      
      await prisma.emailSequence.update({
        where: { id: sequence.id },
        data: { status: 'Failed', errorMessage: sendError.message }
      });

      await prisma.emailSendLog.create({
        data: {
          campaignId: sequence.campaignId,
          leadId: sequence.leadId,
          emailSequenceId: sequence.id,
          subject: finalSubject,
          body: finalBody,
          status: 'Failed',
          errorMessage: sendError.message
        }
      });

      return NextResponse.json({ error: 'Sending failed: ' + sendError.message }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Send now error:", error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
