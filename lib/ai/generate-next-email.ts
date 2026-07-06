import { generateAiResponse } from '@/lib/ai-provider';
import { prisma } from '@/lib/prisma';
import { buildLeadPersonalization } from '@/lib/lead-personalization';
import { buildCampaignIntelligence } from '@/lib/campaign-intelligence';
import { analyzeCampaign } from '@/lib/ai/campaign-analysis';

// Similarity check function (Jaccard similarity approximation for speed)
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w.length > 3));
  const words2 = new Set(str2.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w.length > 3));
  
  const intersection = new Set(Array.from(words1).filter(x => words2.has(x)));
  const union = new Set(Array.from(words1).concat(Array.from(words2)));
  
  if (union.size === 0) return 0;
  return intersection.size / union.size; // 0 to 1
}

export async function generateNextEmail({ 
  leadId, 
  campaignId, 
  userId, 
  targetStep, 
  kbResult 
}: { 
  leadId: string, 
  campaignId: string, 
  userId: string, 
  targetStep: number,
  kbResult: { hasKnowledge: boolean, context: string, summaries: string[], fileCount: number }
}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });

  if (!user || !campaign || !lead) throw new Error("Invalid parameters");

  // Fetch previous emails for this lead in this campaign
  const previousEmails = await prisma.emailSequence.findMany({
    where: { campaignId, leadId },
    orderBy: { sequenceStep: 'asc' }
  });

  if (previousEmails.length === 0 && targetStep > 1) {
    throw new Error("Cannot generate follow-up. No prior emails exist.");
  }

  // Formatting previous emails for the AI context
  const previousEmailContext = previousEmails.map(e => `
--- Email ${e.sequenceStep} ---
Sent At: ${e.sentAt ? e.sentAt.toISOString() : 'Unknown'}
Subject: ${e.subject}
Body: 
${e.body}
`).join('\n');

  let aiAnalysis = campaign.aiAnalysis as any;
  if (!aiAnalysis) {
    aiAnalysis = await analyzeCampaign(campaignId).catch(() => null);
  }

  const personalization = buildLeadPersonalization(lead);
  const intel = buildCampaignIntelligence({
    campaign,
    knowledgeBaseContext: kbResult.context,
    leadPersonalization: personalization
  });

  let stepType = "Follow-up";
  if (targetStep === 1) stepType = "Intro / Hook";
  else if (targetStep === 2) stepType = "Value delivery / Problem awareness";
  else if (targetStep === 3) stepType = "Proof / Case studies (or Discovery Question)";
  else if (targetStep === 4) stepType = "Soft follow-up / reminder";
  else if (targetStep === 5) stepType = "Final follow-up";
  else if (targetStep === 6) stepType = "Friendly re-engagement";
  else if (targetStep >= 7) stepType = "Final goodbye / breakup email";

  const prompt = `You are an expert email SDR for a professional business.
Your task is to generate EXACTLY ONE email: Email #${targetStep} (${stepType}).

IMPORTANT SDR RULES:
1. DO NOT REPEAT yourself. If an angle was used in a previous email, use a COMPLETELY NEW angle now.
2. NEVER use identical subject lines.
3. If this is a later follow-up (Step > 2), refer to the timeline appropriately (e.g. "I reached out a few days ago...").
4. Keep the email highly unique, human-sounding, and concise.
5. Use the first name.
6. Use Knowledge Base details if available.
7. Return ONLY valid JSON.

Campaign Answers:
* Goal: ${intel.campaignGoal}
* Type: ${intel.campaignType}
* Offer: ${intel.offer}
* Main benefit: ${intel.mainBenefit}
* Problem solved: ${intel.problemSolved}
* Unique mechanism: ${intel.uniqueMechanism}
* Pain points: ${intel.painPoints}
* Tone: ${intel.emailTone}

Knowledge Base:
${intel.knowledgeBaseContext}

Lead Personalization:
* First name: ${intel.firstName}
* Company: ${intel.safeCompanyMention}
* Job title: ${intel.jobTitle}
* Industry: ${intel.industry}

PREVIOUS EMAILS SENT TO THIS LEAD:
${previousEmailContext}

[EMAIL SEQUENCE STRUCTURE]
Generate EXACTLY 1 email.
Return ONLY valid JSON. Use lowercase keys only.

{
"emails": [
{
"step": ${targetStep},
"type": "${stepType}",
"subject": "Unique engaging subject",
"body": "Hi {{firstName}}, ...",
"spamRisk": "Low",
"spamIssues": "None",
"personalizationReason": "Explain the new angle used here."
}
]
}
`;

  let maxAttempts = 3;
  let finalEmail: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const aiContent = await generateAiResponse(prompt + (attempt > 0 ? "\n\nWARNING: Your previous attempt was too similar to previous emails or invalid. Ensure completely unique phrasing and structure." : ""));
      let jsonStr = (aiContent || '').trim();
      jsonStr = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
      const startIdx = jsonStr.indexOf('{');
      const endIdx = jsonStr.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1) throw new Error('AI returned invalid JSON');
      
      const parsed = JSON.parse(jsonStr.slice(startIdx, endIdx + 1));
      if (!parsed.emails || parsed.emails.length === 0) throw new Error('Missing emails array');
      
      const email = parsed.emails[0];
      if (!email.subject || !email.body) throw new Error('Missing subject or body');

      // Check similarity
      let isTooSimilar = false;
      for (const prev of previousEmails) {
        const bodySim = calculateSimilarity(email.body, prev.body);
        if (bodySim > 0.25) { // Similarity threshold 25%
          isTooSimilar = true;
          break;
        }
      }

      if (isTooSimilar) {
        console.warn(`Attempt ${attempt+1} failed similarity check.`);
        continue; // Try again
      }

      finalEmail = email;
      break;

    } catch (err: any) {
      console.warn(`Attempt ${attempt+1} failed:`, err.message);
    }
  }

  if (!finalEmail) {
    throw new Error("Failed to generate a unique valid email after 3 attempts.");
  }

  // Replace placeholders safely
  let subject = finalEmail.subject
    .replace(/{{firstName}}|{firstName}|\[firstName\]/gi, personalization.firstName || "there")
    .replace(/{{companyName}}|{companyName}|\[companyName\]/gi, personalization.safeCompanyMention);
  let body = finalEmail.body
    .replace(/{{firstName}}|{firstName}|\[firstName\]/gi, personalization.firstName || "there")
    .replace(/{{companyName}}|{companyName}|\[companyName\]/gi, personalization.safeCompanyMention);

  const spamWords = ['free', 'guarantee', 'click here', 'urgent', 'act now', 'limited time'];
  const bodyLower = body.toLowerCase();
  const spamHits = spamWords.filter(w => bodyLower.includes(w)).length;
  const spamRisk = spamHits >= 3 ? 'High' : spamHits >= 1 ? 'Medium' : 'Low';
  const spamIssues = spamHits > 0 ? spamWords.filter(w => bodyLower.includes(w)).join(', ') : 'None';

  return {
    subject,
    body,
    spamRisk,
    spamIssues,
    personalizationReason: finalEmail.personalizationReason || 'Generated dynamically',
    aiOriginalSubject: finalEmail.subject,
    aiOriginalBody: finalEmail.body
  };
}
