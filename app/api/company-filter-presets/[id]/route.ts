import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { name, description, isDefault } = await req.json();

    const preset = await prisma.companyFilterPreset.findUnique({ where: { id } });
    if (!preset || preset.userId !== user.id) {
      return NextResponse.json({ error: 'Preset not found or unauthorized' }, { status: 404 });
    }

    if (isDefault) {
      await prisma.companyFilterPreset.updateMany({
        where: { userId: user.id, isDefault: true, id: { not: id } },
        data: { isDefault: false }
      });
    }

    const updated = await prisma.companyFilterPreset.update({
      where: { id },
      data: { name, description, isDefault }
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Preset PUT error:', error);
    return NextResponse.json({ error: 'Failed to update preset' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    
    const preset = await prisma.companyFilterPreset.findUnique({ where: { id } });
    if (!preset || preset.userId !== user.id) {
      return NextResponse.json({ error: 'Preset not found or unauthorized' }, { status: 404 });
    }

    await prisma.companyFilterPreset.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Preset DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete preset' }, { status: 500 });
  }
}
