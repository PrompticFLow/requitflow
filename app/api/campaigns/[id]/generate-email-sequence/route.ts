import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { generateAiResponse } from '@/lib/ai-provider';
import { buildLeadPersonalization } from '@/lib/lead-personalization';
import { buildCampaignIntelligence } from '@/lib/campaign-intelligence';
import { analyzeCampaign } from '@/lib/ai/campaign-analysis';

// ─── Knowledge Base Context Builder ───────────────────────────────────────────

interface KbResult {
  hasKnowledge: boolean;
  context: string;
  summaries: string[];
  hasEmptyFiles: boolean;
  fileCount: number;
}

function buildKnowledgeContext(kbFiles: any[]): KbResult {
  if (!kbFiles || kbFiles.length === 0) {
    return { hasKnowledge: false, context: '', summaries: [], hasEmptyFiles: false, fileCount: 0 };
  }

  const summaries: string[] = [];
  let contextParts: string[] = [];
  let hasEmptyFiles = false;

  for (const file of kbFiles) {
    const hasText = file.extractedText && file.extractedText.trim().length > 0;
    const hasSummary = file.summary && file.summary.trim().length > 0;

    if (!hasText && !hasSummary) {
      hasEmptyFiles = true;
      continue;
    }

    let section = `--- Knowledge Base: ${file.fileName} ---\n`;

    if (hasSummary) {
      section += `Summary: ${file.summary.trim()}\n`;
      summaries.push(file.summary.trim());
    }

    if (hasText) {
      // Allow up to 150,000 chars of content per file to support large docs and pasted URLs
      const content = file.extractedText.trim().substring(0, 150000);
      section += `\nContent:\n${content}\n`;
    }

    contextParts.push(section);
  }

  if (contextParts.length === 0) {
    return {
      hasKnowledge: false,
      context: '',
      summaries,
      hasEmptyFiles,
      fileCount: kbFiles.length
    };
  }

  let combined = contextParts.join('\n\n');

  // Hard cap at 300,000 characters to stay within safe token limits of modern models
  if (combined.length > 300000) {
    combined = combined.substring(0, 300000);
  }

  return {
    hasKnowledge: true,
    context: combined,
    summaries,
    hasEmptyFiles,
    fileCount: kbFiles.length
  };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: campaignId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { leadIds: providedLeadIds, preview } = body;

    // 1. Validate campaign ownership
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    // 2. Load leads
    let leadIds: string[] = providedLeadIds || [];
    if (!leadIds.length) {
      const campaignLeads = await prisma.campaignLead.findMany({
        where: { campaignId },
        select: { leadId: true }
      });
      leadIds = campaignLeads.map(cl => cl.leadId);
    }

    if (!leadIds.length) {
      return NextResponse.json({
        error: 'No leads found for this campaign. Add leads before generating emails.'
      }, { status: 400 });
    }

    let leads = await prisma.lead.findMany({
      where: { id: { in: leadIds }, userId: user.id }
    });
    
    if (preview && leads.length > 0) {
      leads = [leads[0]]; // Only generate for the first lead as a preview
    }

    // 3. Load Knowledge Base files FIRST before any generation
    let kbResult: KbResult = { hasKnowledge: false, context: '', summaries: [], hasEmptyFiles: false, fileCount: 0 };

    try {
      let kbFiles: any[] = [];

      if (campaign.knowledgeBaseMode === 'Selected Files' && campaign.selectedKnowledgeBaseFileIds) {
        try {
          const fileIds = JSON.parse(campaign.selectedKnowledgeBaseFileIds);
          if (Array.isArray(fileIds) && fileIds.length > 0) {
            kbFiles = await prisma.knowledgeBaseFile.findMany({
              where: { id: { in: fileIds }, userId: user.id, status: 'Ready' }
            });
          }
        } catch (e) {
          // Ignore JSON parse error, fallback to all files
        }
      }

      // Fallback: load campaign-specific files, then user files
      if (kbFiles.length === 0) {
        kbFiles = await prisma.knowledgeBaseFile.findMany({
          where: { campaignId, userId: user.id, status: 'Ready' }
        });
      }

      if (kbFiles.length === 0) {
        kbFiles = await prisma.knowledgeBaseFile.findMany({
          where: { userId: user.id, status: 'Ready' },
          take: 5,
          orderBy: { createdAt: 'desc' }
        });
      }

      kbResult = buildKnowledgeContext(kbFiles);
    } catch (e) {
      console.warn('Failed to load knowledge base:', e);
    }

    // 4. Check if KB has files but no readable text — warn before generating
    if (kbResult.fileCount > 0 && !kbResult.hasKnowledge && kbResult.hasEmptyFiles) {
      return NextResponse.json({
        success: false,
        error: 'Knowledge Base file has no readable text. Please upload a text-based PDF, DOCX, TXT, CSV, Markdown, or JSON file.',
        knowledgeBaseUsed: false
      }, { status: 400 });
    }

    // 5. Generate AI Campaign Analysis if missing
    let aiAnalysis = campaign.aiAnalysis as any;
    if (!aiAnalysis) {
      try {
        aiAnalysis = await analyzeCampaign(campaignId);
      } catch (e) {
        console.error("Failed to generate AI analysis:", e);
      }
    }

    let successCount = 0;
    let fallbackCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const failedLeads: string[] = [];

    const generateForLead = async (lead: any) => {
      try {
        // Skip if Step 1 already exists (idempotency)
        const existing = await prisma.emailSequence.findFirst({
          where: { campaignId, leadId: lead.id, sequenceStep: 1 }
        });
        if (existing) return { success: false, reason: 'Already generated', skipped: true };

        const proofInstruction = campaign.proofCaseStudy
          ? `Use this proof/case study if relevant: "${campaign.proofCaseStudy}"`
          : `No proof provided. Do NOT invent or fabricate any statistics, client names, testimonials, or case studies.`;

        const personalization = buildLeadPersonalization(lead);

        const intel = buildCampaignIntelligence({
          campaign,
          knowledgeBaseContext: kbResult.context,
          leadPersonalization: personalization
        });

        const prompt = `You are an expert email strategist for a professional business introduction.
Write a permission-based outreach email.
YOU ARE AN API. YOU MUST ONLY RETURN JSON.

IMPORTANT:
You must write emails based on the campaign answers and Knowledge Base.
Use the lead's first name and company/business name when available. If missing, use generic terms like "there" or "your company".
Do not invent facts, proof, pricing, guarantees, or results.
If a detail is missing, use safe fallback language. Do not refuse to generate the email.

Campaign Answers:
* Goal: ${intel.campaignGoal}
* Type: ${intel.campaignType}
* Target audience: ${intel.targetAudience}
* Industry: ${intel.targetIndustry}
* Company type: ${intel.targetCompanyType}
* Roles: ${intel.targetRoles}
* Market: ${intel.targetMarket}
* Offer: ${intel.offer}
* Main benefit: ${intel.mainBenefit}
* Problem solved: ${intel.problemSolved}
* Unique mechanism: ${intel.uniqueMechanism}
* Proof: ${intel.proof}
* Pain points: ${intel.painPoints}
* Desired outcome: ${intel.desiredOutcome}
* Objections: ${intel.objections}
* Avoid saying: ${intel.avoidSaying}
* Tone: ${intel.emailTone}
* Length: ${intel.emailLength}
* CTA strategy: ${intel.bookingLinkStrategy}

Knowledge Base:
${intel.knowledgeBaseContext}

AI Campaign Analysis (Use these strategies):
* Category: ${aiAnalysis?.campaignCategory || 'Unknown'}
* Pain Points: ${aiAnalysis?.painPoints?.join(', ') || 'None'}
* Desired Outcomes: ${aiAnalysis?.desiredOutcomes?.join(', ') || 'None'}
* Objections: ${aiAnalysis?.likelyObjections?.join(', ') || 'None'}
* Recommended Tone: ${aiAnalysis?.recommendedTone || intel.emailTone}
* CTA Strategy: ${aiAnalysis?.ctaStrategy || intel.bookingLinkStrategy}
* Discovery Questions: ${aiAnalysis?.generatedQuestions?.join(' | ') || 'None'}

Lead Personalization:
* Greeting: ${intel.greeting}
* First name: ${intel.firstName}
* Full name: ${intel.fullName}
* Company/business: ${intel.safeCompanyMention}
* Job title: ${intel.jobTitle}
* Industry: ${intel.industry}
* Location: ${intel.location}
* Website: ${intel.website}
* LinkedIn: ${intel.linkedinUrl}
* Company fallback: ${intel.companyFallback}

Instructions:
* Start every email with a personalized greeting.
* IMPORTANT: Analyze the provided 'First name' or 'Full name'. If it contains a company name, a job title, or a mix of names and companies (e.g., "John Doe - Acme Corp"), intelligently extract ONLY the person's actual first name for the greeting (e.g., "Hi John,").
* If it is entirely a company name with no person's name, use a generic greeting like "Hi there,".
* Mention the company/business name naturally when relevant.
* Use the pain point and desired outcome.
* Use knowledge base facts only when available.
* Push toward booking a call.
* Use CTA strategy.
* Keep emails short and human.
* Never output placeholders.
* Never output undefined/null.
* CRITICAL: You MUST output the JSON exactly as requested even if some or all prospect details are missing. DO NOT refuse to generate. Use generic fallback language if a specific detail is missing.
* Return valid JSON only. Do not apologize or ask for more details.

[EMAIL SEQUENCE STRUCTURE]
Generate EXACTLY 1 email (Email 1: Introduction / Hook).
The delay for the first email is 0.

You MUST strictly follow this funnel structure:
* Email 1 (Day 0): Introduction / Hook

Return ONLY valid JSON. Do not include markdown. Do not include explanations. Use lowercase keys only.

{
"emails": [
{
"step": 1,
"type": "Intro",
"delayDays": 0,
"subject": "Quick question",
"body": "Hi {{firstName}}, ...",
"spamRisk": "Low",
"spamIssues": "None",
"personalizationReason": "Mentioned their specific pain point.",
"personalizationScore": 85
}
]
}

PLACEHOLDER RULE: The ONLY allowed placeholders are {{firstName}} and {{companyName}}. NEVER invent other placeholders like {{targetIndustry}}, {{painPoints}}, {{yourCompany}}, {{desiredOutcome}} or {{yourName}} — write the actual words using the campaign details above. If a detail is unknown, write around it naturally.

If the model cannot generate, return: {"emails": []}`;

        let sequenceData: any[] = [];
        let attempt = 0;
        let success = false;
        let currentPrompt = prompt;
        let aiContent = '';

        while (attempt < 2 && !success) {
          try {
            aiContent = await generateAiResponse(currentPrompt, user.id);
          } catch (apiError: any) {
            throw apiError;
          }

          try {
            let jsonStr = (aiContent || '').trim();
            jsonStr = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();

            const startIdx = jsonStr.indexOf('{');
            const endIdx = jsonStr.lastIndexOf('}');
            if (startIdx === -1 || endIdx === -1) {
              throw new Error('AI returned invalid JSON format');
            }
            jsonStr = jsonStr.slice(startIdx, endIdx + 1);

            const parsed = JSON.parse(jsonStr);
            if (parsed && Array.isArray(parsed.emails) && parsed.emails.length > 0) {
              sequenceData = parsed.emails;
              success = true;
            } else {
              throw new Error('Missing emails array');
            }
          } catch (err: any) {
            attempt++;
            if (attempt >= 2) break;
            currentPrompt = prompt + '\n\nYour last response was invalid. Return only valid JSON using the exact schema provided.';
          }
        }

        // ─── FALLBACK DRAFTS (uses KB summaries if available) ─────────────────
        let fallbackUsed = false;
        if (sequenceData.length === 0) {
          fallbackUsed = true;

          const targetAudience = campaign.targetAudience || 'professionals';
          const mainBenefit = campaign.mainBenefit || campaign.offer || 'our services';
          const senderName = (campaign as any).senderName || user.name || '';
          const bookingLink = campaign.bookingLink || campaign.ctaLink || '';
          const unsubLine = campaign.unsubscribeLine || 'Reply STOP to unsubscribe';

          // Use KB summary if available for fallback
          const kbBenefit = kbResult.summaries.length > 0
            ? `\n\n${kbResult.summaries[0]}`
            : '';

          const signOff = senderName ? `\n\nBest,\n${senderName}` : `\n\nBest,`;

          sequenceData = [];
          sequenceData.push({
            step: 1,
            delayDays: 0,
            type: 'Intro / Hook',
            subject: 'Quick question',
            body: `${personalization.greeting}\n\nI am reaching out regarding ${intel.mainBenefit} for ${personalization.safeCompanyMention}.\n\nLet me know if you are open to a quick chat.${bookingLink ? `\n\n${bookingLink}` : ''}${signOff}`,
            spamRisk: 'Low',
            spamIssues: 'None',
            personalizationReason: 'Fallback generation'
          });
        }

        // ─── Save email drafts ─────────────────────────────────────────────────
        let savedCount = 0;

        for (let seq of sequenceData) {
          // Normalize keys
          const normalizedSeq: any = {};
          for (const key in seq) normalizedSeq[key.toLowerCase()] = seq[key];
          seq = normalizedSeq;

          // Sanitize placeholders
          if (seq.subject) {
            seq.subject = seq.subject
              .replace(/{{firstName}}|{firstName}|\[firstName\]|FIRST_NAME/gi, personalization.firstName || "there")
              .replace(/{{companyName}}|{companyName}|\[companyName\]|COMPANY_NAME|{{businessName}}|{businessName}|\[businessName\]|BUSINESS_NAME|{{company}}|{company}|\[company\]/gi, personalization.safeCompanyMention)
              .replace(/\b(undefined|null|NaN)\b/gi, '');
          }
          if (seq.body) {
            seq.body = seq.body
              .replace(/{{firstName}}|{firstName}|\[firstName\]|FIRST_NAME/gi, personalization.firstName || "there")
              .replace(/{{companyName}}|{companyName}|\[companyName\]|COMPANY_NAME|{{businessName}}|{businessName}|\[businessName\]|BUSINESS_NAME|{{company}}|{company}|\[company\]/gi, personalization.safeCompanyMention)
              .replace(/\b(undefined|null|NaN)\b/gi, '');
          }

          if (!seq.subject || typeof seq.subject !== 'string' || seq.subject.trim() === '') continue;
          if (!seq.body || typeof seq.body !== 'string' || seq.body.trim() === '') continue;

          const stepNum = parseInt(String(seq.step));
          // Prefer delayDays from AI, fallback to delaydays (alt casing), then the standard map
          const rawDelay = seq.delaydays ?? seq.delay_days ?? seq.delayDays;
          const delayNum = rawDelay !== undefined && rawDelay !== null
            ? parseInt(String(rawDelay))
            : Math.floor((stepNum - 1) * (28 / 24)); // Fallback spread

          if (isNaN(stepNum)) continue;

          const spamWords = ['free', 'guarantee', 'click here', 'urgent', 'act now', 'limited time', 'winner', 'congratulations'];
          const bodyLower = (seq.body || '').toLowerCase();
          const spamHits = spamWords.filter(w => bodyLower.includes(w)).length;
          const calculatedSpamRisk = spamHits >= 3 ? 'High' : spamHits >= 1 ? 'Medium' : 'Low';
          const calculatedSpamIssues = spamHits > 0 ? spamWords.filter(w => bodyLower.includes(w)).join(', ') : 'None';
          
          let aiScore = parseInt(seq.personalizationScore);
          const personalizationScore = !isNaN(aiScore) ? aiScore : (lead.aiInsight ? 75 : lead.category ? 60 : 40);

          await prisma.emailSequence.create({
            data: {
              userId: user.id,
              campaignId,
              leadId: lead.id,
              name: `Email ${stepNum}`,
              subject: seq.subject.trim(),
              previewText: '',
              body: seq.body.trim(),
              sequenceStep: stepNum,
              ctaText: '',
              ctaLink: campaign.bookingLink || campaign.ctaLink || '',
              delayAmount: isNaN(delayNum) ? 0 : delayNum,
              delayUnit: 'business_days',
              status: 'Draft',
              approvalStatus: 'Pending',
              aiOriginalSubject: seq.subject,
              aiOriginalBody: seq.body,
              aiGenerationReason: kbResult.hasKnowledge
                ? `Generated using Knowledge Base (${kbResult.fileCount} file${kbResult.fileCount > 1 ? 's' : ''})`
                : 'Generated using campaign fields (no Knowledge Base)',
              personalizationScore,
              spamRisk: seq.spamrisk ?? seq.spam_risk ?? seq.spamRisk ?? calculatedSpamRisk,
              personalizationReason: seq.personalizationreason ?? seq.personalization_reason ?? seq.personalizationReason ?? 'AI Generated',
              emailType: seq.type || null,
              personalizationLevel: campaign.personalizationLevel || 'Medium',
              emailLength: campaign.emailLength || 'Short',
              spamSafety: campaign.spamSafety || 'High',
              ctaStyle: campaign.ctaStyle || 'Soft',
              enabled: true,
            }
          });
          savedCount++;
        }

        await prisma.campaignLead.update({
          where: { campaignId_leadId: { campaignId, leadId: lead.id } },
          data: { status: 'Email Generated' }
        }).catch(() => {});

        return { success: true, fallback: fallbackUsed, draftsCreated: savedCount };
      } catch (err: any) {
        console.error('AI Generation failed for lead', lead.id, err);
        return { success: false, reason: err.message, leadId: lead.id };
      }
    };

    const failedDetails: any[] = [];
    const BATCH_SIZE = 5;
    let totalGenerated = 0;

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(generateForLead));
      results.forEach(r => {
        if (r.success) {
          if (r.fallback) fallbackCount++;
          else successCount++;
          totalGenerated += r.draftsCreated || 0;
        } else if (r.skipped) {
          skippedCount++;
        } else if (r.leadId) {
          failedCount++;
          failedLeads.push(r.leadId);
          failedDetails.push({ leadId: r.leadId, reason: r.reason });
        }
      });
    }

    // ─── Build response message ────────────────────────────────────────────────
    let finalMessage = '';
    if (successCount === 0 && fallbackCount === 0 && failedCount === 0) {
      finalMessage = 'All leads already have emails generated. Delete existing drafts to regenerate.';
    } else if (kbResult.hasKnowledge) {
      finalMessage = `AI read your Knowledge Base and created ${totalGenerated} email drafts for review.`;
    } else {
      finalMessage = `No Knowledge Base found. AI created ${totalGenerated} drafts using campaign details only.`;
    }

    if (fallbackCount > 0) finalMessage += ` (${fallbackCount} safe fallback drafts were used)`;
    if (failedCount > 0) finalMessage += ` ${failedCount} leads failed.`;
    if (failedCount > 0 && failedDetails.length > 0 && successCount === 0 && fallbackCount === 0) {
      finalMessage += ` Error: ${failedDetails[0].reason}`;
    }

    return NextResponse.json({
      success: true,
      message: finalMessage,
      created: successCount,
      fallbackCreated: fallbackCount,
      skippedDuplicates: skippedCount,
      failed: failedCount,
      totalDrafts: totalGenerated,
      failedLeads,
      failedDetails,
      knowledgeBaseUsed: kbResult.hasKnowledge,
      knowledgeBaseFileCount: kbResult.fileCount
    });

  } catch (error: any) {
    console.error('Generate email internal error:', error?.message);

    const safeErrors = [
      'Google AI API key is not configured or invalid.',
      'Google AI quota limit reached. Please try again later.',
      'AI could not generate this email because the prompt was blocked by safety filters. Please simplify the campaign offer and try again.',
      'Google Gemini returned an empty response. Please try again.',
      'AI response was not valid JSON. Please try again.',
      'AI generation failed. Please try again.'
    ];

    let userMessage = error?.message || '';
    if (userMessage === 'Google AI API key is not configured or invalid.') {
      return NextResponse.json(
        {
          success: false,
          error: "AI generation is not connected.",
          technicalError: "Missing GEMINI_API_KEY.",
          action: "Add a valid GEMINI_API_KEY to .env.local and restart the server.",
        },
        { status: 400 }
      );
    }

    if (!safeErrors.includes(userMessage)) {
      userMessage = 'Draft generation failed. Please try again.';
    }

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
