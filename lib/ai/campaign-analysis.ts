import { generateAiResponse } from '../ai-provider';
import { prisma } from '../prisma';

export async function analyzeCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      knowledgeBaseFiles: true
    }
  });

  if (!campaign) {
    throw new Error('Campaign not found.');
  }

  const kbContext = campaign.knowledgeBaseFiles.length > 0 
    ? campaign.knowledgeBaseFiles.map(kb => `--- Document: ${kb.fileName} ---\n${kb.extractedText || kb.summary}`).join('\n\n')
    : 'No Knowledge Base provided.';

  const prompt = `You are an expert AI Email Sales Agent strategist.
Your task is to analyze the campaign parameters and the knowledge base to create a comprehensive campaign analysis.
This analysis will be used later by the AI email generator to draft the perfect 25-step 28-day email sequence and handle replies.

[Campaign Context]
Name: ${campaign.name}
Goal: ${campaign.goal || 'Book discovery call'}
Target Audience: ${campaign.targetAudience || 'Unknown'}
Offer: ${campaign.offer || 'Not specified'}
Problem Solved: ${campaign.problemSolved || 'Not specified'}
Main Benefit: ${campaign.mainBenefit || 'Not specified'}
Proof / Case Study: ${campaign.proofCaseStudy || 'None'}
Tone: ${campaign.tone || 'Professional'}
Call To Action: ${campaign.ctaText || 'None'}
Booking Link: ${campaign.bookingLink || 'None'}
Follow-up Style: ${campaign.followUpStyle || 'Standard'}
Avoid Saying: ${campaign.avoidSaying || 'None'}
Objections: ${campaign.objections || 'None'}

[Knowledge Base Context]
${kbContext}

Based on this information, extract and infer the best angles for this campaign. Return a JSON object matching this exact schema:
{
  "campaignCategory": "The overall category (e.g. B2B SaaS, Recruitment)",
  "targetAudienceSummary": "A concise summary of who they are and what they care about",
  "offerSummary": "A concise summary of the offer",
  "painPoints": ["List", "of", "inferred", "pain", "points"],
  "desiredOutcomes": ["List", "of", "outcomes"],
  "buyingTriggers": ["Why would they buy right now?"],
  "likelyObjections": ["Objection 1", "Objection 2"],
  "personalizationAngles": ["How to personalize based on their role/company"],
  "recommendedTone": "The tone to use, mapped from the campaign settings",
  "ctaStrategy": "How to position the call to action",
  "emailStrategy": "Overall strategy for the 25-step 28-day sequence"
}`;

  const responseText = await generateAiResponse(prompt, campaign.userId);
  
  try {
    let jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const startIndex = jsonString.indexOf('{');
    const endIndex = jsonString.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1) {
      jsonString = jsonString.slice(startIndex, endIndex + 1);
    }
    
    const analysis = JSON.parse(jsonString);
    
    // Save to the database
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { aiAnalysis: analysis }
    });

    return analysis;
  } catch (error) {
    console.error("Failed to parse AI Analysis JSON:", responseText);
    throw new Error("AI returned malformed JSON analysis.");
  }
}
