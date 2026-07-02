import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await req.json();
    const { id } = await params;
    if (!id || typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ success: false, error: "Email draft ID is missing." }, { status: 400 });
    }

    const existing = await prisma.emailSequence.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Email draft not found.' }, { status: 404 });
    }

    const newSubject = data.subject ?? existing.subject;
    const newBody = data.body ?? existing.body;

    if (!newSubject || !newSubject.trim()) {
      return NextResponse.json({ error: 'Subject cannot be empty.' }, { status: 400 });
    }
    if (!newBody || !newBody.trim()) {
      return NextResponse.json({ error: 'Body cannot be empty.' }, { status: 400 });
    }

    const subjectEdited = newSubject !== existing.aiOriginalSubject;
    const bodyEdited = newBody !== existing.aiOriginalBody;

    const updated = await prisma.emailSequence.update({
      where: { id },
      data: {
        subject: newSubject,
        previewText: data.previewText ?? existing.previewText,
        body: newBody,
        delayAmount: data.delayAmount ?? existing.delayAmount,
        editedSubject: subjectEdited ? newSubject : existing.editedSubject,
        editedBody: bodyEdited ? newBody : existing.editedBody,
        // Auto-approve only if save-and-approve was requested
        ...(data.approve === true ? {
          approvalStatus: 'Approved',
          approvedAt: new Date()
        } : {})
      }
    });

    return NextResponse.json({ success: true, email: updated });
  } catch (error: any) {
    console.error('Update email sequence error:', error);
    return NextResponse.json({ error: 'Something went wrong while saving your changes. Please try again.' }, { status: 500 });
  }
}

// Keep PUT for backward compat
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return PATCH(req, { params });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      return NextResponse.json({ success: false, error: 'Email draft ID is missing.' }, { status: 400 });
    }

    const existing = await prisma.emailSequence.findFirst({
      where: { id, userId: user.id },
      include: { emailSendLogs: true }
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Email draft not found.' }, { status: 404 });
    }

    // Block deletion of already-sent emails
    if (existing.status === 'Sent' || existing.sentAt) {
      return NextResponse.json({
        success: false,
        error: 'Sent emails cannot be deleted.'
      }, { status: 400 });
    }

    // If send logs exist (partially sent / bounced), soft delete
    if (existing.emailSendLogs && existing.emailSendLogs.length > 0) {
      await prisma.emailSequence.update({
        where: { id },
        data: { deletedAt: new Date() }
      });
      return NextResponse.json({
        success: true,
        message: 'Email review soft-deleted (has send history).'
      });
    }

    // Clean up linked scheduling decisions
    await prisma.schedulingDecision.deleteMany({
      where: { emailSequenceId: id }
    });

    // Hard delete unsent email sequence
    await prisma.emailSequence.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: 'Email review deleted successfully.'
    });
  } catch (error: any) {
    console.error('Delete email sequence error:', error);
    return NextResponse.json({
      success: false,
      error: 'Something went wrong while deleting. Please try again.'
    }, { status: 500 });
  }
}
