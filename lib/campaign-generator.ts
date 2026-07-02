import { generateText } from '@/services/openrouter';
import { recommendNextSendTime, getDefaultSequenceDelays } from '@/lib/scheduling';

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
Generate a seven-step personalized follow-up sequence for this specific recipient.
Use only supplied campaign, recipient, public business context, and Knowledge Base information.

Never assume the business is a recruitment agency unless the user clearly says so.
Do not invent:
- Case studies
- Client names
- Specific statistics
- Pricing
- Testimonials

Every email should have a different purpose as follows:
Step 1: Personalized Introduction with soft CTA.
Step 2: Follow-up. Ask one simple question.
Step 3: Value and Process. Focus on the core problem solved.
Step 4: Proof or Case Study. ONLY use proof from the Knowledge Base or campaign context. If missing, use a value-based angle.
Step 5: Objection Reduction.
Step 6: Direct Call-Booking Follow-Up.
Step 7: Respectful Final Follow-Up. Include opt-out/polite closure.

Keep emails concise, natural, professional, and respectful. Do not sound automated or overly persistent. Use one clear CTA per email.

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
    
    // Fill in defaults if AI missed delays
    const defaultDelays = getDefaultSequenceDelays();
    
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
