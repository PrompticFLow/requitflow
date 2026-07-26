import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let bayOfAssetsKey: string;
  try {
    bayOfAssetsKey = await resolveUserApiKey(user.id, 'bayofassets');
  } catch (e: any) {
    if (e instanceof ByokKeyMissingError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
  const bayOfAssetsModel = process.env.BAYOFASSETS_MODEL || 'google/gemini-2.5-flash';

  try {
    const { id } = await params;
    if (!id || typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ success: false, error: "Email draft ID is missing." }, { status: 400 });
    }

    const existing = await prisma.emailSequence.findFirst({
      where: { id, userId: user.id },
      include: { lead: true, campaign: true }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Email draft not found.' }, { status: 404 });
    }

    const { lead, campaign } = existing;

    const proofInstruction = campaign.proofCaseStudy
      ? `Use this proof/case study if relevant: "${campaign.proofCaseStudy}"`
      : `No proof provided. Do NOT invent or fabricate any statistics, client names, or results.`;

    const prompt = `You are an expert AI outbound sales agent.
Rewrite Email Step ${existing.sequenceStep} (${existing.name || existing.emailType || 'Follow-up'}) for this lead.

${proofInstruction}

Campaign Context:
- Goal: ${campaign.goal || 'Book a discovery call'}
- Offer: ${campaign.offer || 'Our services'}
- Tone: ${campaign.tone || 'Professional'}
- Language: ${campaign.language || 'English'}
- CTA Style: ${campaign.ctaStyle || 'Soft'}
- Unsubscribe: ${campaign.unsubscribeLine || 'Reply STOP to unsubscribe'}
- Booking Link: ${campaign.bookingLink || campaign.ctaLink || ''}

Lead Details:
- Business: ${lead.businessName}
- Location: ${lead.location || lead.address || 'Unknown'}
- Category: ${lead.category || 'Unknown'}
- AI Insight: ${lead.aiInsight || 'None'}

Rules:
- Short and human (under 100 words for body)
- Subject under 8 words
- One clear CTA
- No emojis
- No invented proof or fake results

Return ONLY valid JSON (no markdown):
{ "subject": "...", "preview_text": "...", "body": "...", "cta_text": "...", "personalization_reason": "...", "personalization_score": 85 }`;

    const res = await fetch(`${process.env.BAYOFASSETS_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bayOfAssetsKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://funnelzenai.com',
        'X-Title': 'FunnelZen AI'
      },
      body: JSON.stringify({
        model: bayOfAssetsModel,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const orData = await res.json();
    if (!orData.choices?.[0]?.message?.content) {
      throw new Error('AI returned empty response');
    }

    let jsonStr = orData.choices[0].message.content.trim();
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error('Invalid AI response format');
    jsonStr = jsonStr.slice(startIdx, endIdx + 1);

    const regenData = JSON.parse(jsonStr);

    if (!regenData.subject || !regenData.body) {
      throw new Error('AI returned incomplete email data');
    }

    // Recalculate spam risk
    const spamWords = ['free', 'guarantee', 'click here', 'urgent', 'act now', 'limited time', 'winner', 'congratulations'];
    const bodyLower = (regenData.body || '').toLowerCase();
    const spamHits = spamWords.filter(w => bodyLower.includes(w)).length;
    const spamRisk = spamHits >= 3 ? 'High' : spamHits >= 1 ? 'Medium' : 'Low';

    // Recalculate personalization score
    let aiScore = parseInt(regenData.personalization_score);
    const personalizationScore = !isNaN(aiScore) ? aiScore : (lead.aiInsight ? 75 : lead.category ? 60 : 40);

    const updated = await prisma.emailSequence.update({
      where: { id },
      data: {
        subject: regenData.subject,
        previewText: regenData.preview_text,
        body: regenData.body,
        ctaText: regenData.cta_text,
        ctaLink: campaign.bookingLink || campaign.ctaLink || existing.ctaLink,
        aiOriginalSubject: regenData.subject,
        aiOriginalBody: regenData.body,
        // Reset manual edits — AI draft replaces them
        editedSubject: null,
        editedBody: null,
        // Reset approval — must re-review after regeneration
        approvalStatus: 'Pending',
        approvedAt: null,
        aiGenerationReason: regenData.personalization_reason || 'Regenerated via UI',
        personalizationScore,
        spamRisk,
      }
    });

    return NextResponse.json({ success: true, email: updated });
  } catch (error: any) {
    console.error('Regenerate sequence error:', error);
    return NextResponse.json({
      error: 'Something went wrong while regenerating this email. Please try again.'
    }, { status: 500 });
  }
}
