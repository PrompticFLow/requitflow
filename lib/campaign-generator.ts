import { generateText } from '@/services/bayofassets';
import { recommendNextSendTime, getDefaultSequenceDelays, getSevenStepSequenceDelays } from '@/lib/scheduling';

export async function generateSevenStepSequence(
  apiKey: string,
  model: string = 'openai/gpt-4o-mini',
  campaign: any,
  recipient: any,
  knowledgeBaseFiles: any[] = []
) {
  // Extract content from KB files if available
  const kbContext = knowledgeBaseFiles.length > 0 
    ? knowledgeBaseFiles.map(kb => `--- Document: ${kb.name} ---\n${kb.content}`).join('\n\n')
    : 'No Knowledge Base available. Use value-based messaging.';

  const prompt = `You are an expert AI outbound sales agent.
Generate a five-step personalized follow-up sequence for this specific recipient.

CRITICAL RULES FOR EMAIL GENERATION:
1. DO NOT just list or regurgitate the provided campaign data or variables (e.g., do not say "Our offer is X. We solve Y."). 
2. Weave the context organically into a conversational, human-to-human narrative.
3. Write persuasive, engaging, and highly personalized emails.
4. Keep emails concise, natural, professional, and respectful. Do not sound automated or overly persistent. 
5. Use one clear, low-friction Call to Action (CTA) per email.
6. Never assume the business is a recruitment agency unless the user clearly says so.
7. Do not invent: Case studies, Client names, Specific statistics, Pricing, or Testimonials. Use only the provided context or knowledge base.
8. NAME DETECTION: Analyze the recipient's provided 'Name' or 'Company'. If the name contains a mix of person and company (e.g., "John Doe - Acme Corp"), intelligently extract ONLY the person's actual first name for the greeting. If it's entirely a company name with no person's name, use a generic greeting like "Hi there,".

Every email should have a different purpose as follows:
Initial Outreach Sequence (5 Emails):
Step 1: Introduction + Hook. Catch their attention with something specific about them.
Step 2: Value + Problem awareness. Highlight a specific pain point and how you solve it.
Step 3: Proof + Case study. ONLY use proof from the Knowledge Base or campaign context. If missing, use a value-based angle.
Step 4: Soft follow-up / reminder. Very brief.
Step 5: Final breakup email. Professional and leaving the door open.

[Campaign Context]
Campaign Name: ${campaign.name || 'Outreach Campaign'}
Business/Client Name: ${campaign.clientName || campaign.agencyName || 'Your Company'}
Industry/Niche: ${campaign.industry || 'B2B'}
Goal/CTA: ${campaign.goal || campaign.ctaText || campaign.callToAction || 'Book Discovery Call'}
Target Audience: ${campaign.targetAudience || 'Unknown'}
Offer: ${campaign.offer || 'Our Services'}
Problem Solved: ${campaign.problemSolved || 'Unknown'}
Desired Result: ${campaign.desiredOutcome || 'Unknown'}
Trust Reason: ${campaign.trustReason || 'Unknown'}
Common Objections: ${campaign.commonObjections || 'None'}
Do Not Mention: ${campaign.doNotMention || 'None'}

[Recipient Context]
Name: ${recipient.name || recipient.businessName || 'There'}
Role: ${recipient.jobTitle || 'Hiring Manager'}
Company: ${recipient.companyName || recipient.businessName || 'Your Company'}
Location: ${recipient.location || recipient.country || 'Your Region'}
Active Jobs: ${recipient.activeJobPostsFound || 'Unknown'}
Recent Posts (7 days): ${recipient.recentPosts7Days || 'Unknown'}
Hiring Demand: ${recipient.hiringDemand || 'Unknown'}

[Knowledge Base Context]
${kbContext}

[AI Strategy Builder Context]
${campaign.aiAnalysis ? `
Target Audience Analysis: ${campaign.aiAnalysis.messagingAngle || 'N/A'}
User's Deep Context (Q&A):
${campaign.aiAnalysis.userQnA ? campaign.aiAnalysis.userQnA.map((a: any, i: number) => `Q: ${a.question}\nA: ${a.answer}`).join('\n') : 'N/A'}
Generated Discovery Questions to ask the prospect (Use 1 per relevant email):
${campaign.aiAnalysis.generatedQuestions ? campaign.aiAnalysis.generatedQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n') : 'N/A'}
` : 'No pre-generated strategy available.'}

Return valid JSON only matching this schema exactly:
{
  "sequence": [
    {
      "step": 1,
      "name": "Email Name",
      "delayAmount": 0,
      "delayUnit": "business_days",
      "subject": "Subject Line",
      "previewText": "Preview snippet",
      "body": "Email body (can contain line breaks)",
      "ctaText": "Call to action text",
      "ctaLink": "Link if applicable",
      "personalizationReason": "Why this is personalized",
      "knowledgeBaseSources": ["Source doc name or None"]
    }
  ]
}`;

  const responseText = await generateText(apiKey, prompt, model);
  
  try {
    // Strip markdown formatting if AI wraps the response
    let jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    // Sometimes it might not start with { 
    const startIndex = jsonString.indexOf('{');
    const endIndex = jsonString.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1) {
      jsonString = jsonString.slice(startIndex, endIndex + 1);
    }
    
    const parsed = JSON.parse(jsonString);
    
    if (!parsed.sequence || !Array.isArray(parsed.sequence)) {
      throw new Error("Invalid sequence format returned by AI.");
    }
    
    // Validate we got 7 steps
    let steps = parsed.sequence.slice(0, 7);
    
    // Fill in defaults if AI missed delays (Using 7-step delays specifically to prevent out of bounds crashes)
    const defaultDelays = getSevenStepSequenceDelays();
    
    steps = steps.map((step: any, idx: number) => {
      const defaultStep = defaultDelays[idx];
      return {
        ...step,
        step: idx + 1,
        delayAmount: step.delayAmount ?? defaultStep.delay,
        delayUnit: step.delayUnit || defaultStep.unit,
      };
    });

    return steps;
  } catch (error) {
    console.error("Failed to parse OpenRouter sequence:", responseText);
    throw new Error("AI returned malformed JSON sequence.");
  }
}
