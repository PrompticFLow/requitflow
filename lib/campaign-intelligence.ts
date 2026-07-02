export interface CampaignIntelligenceParams {
  campaign: any;
  knowledgeBaseContext: string;
  leadPersonalization: any;
}

export function buildCampaignIntelligence({
  campaign,
  knowledgeBaseContext,
  leadPersonalization
}: CampaignIntelligenceParams) {
  return {
    campaignGoal: campaign.goal || 'Book a call',
    campaignType: campaign.campaignType || 'Cold outreach',
    targetAudience: campaign.targetAudience || 'Not specified',
    targetIndustry: campaign.targetIndustry || 'Not specified',
    targetCompanyType: campaign.targetCompanyType || 'Not specified',
    targetRoles: campaign.targetRoles || 'Not specified',
    targetMarket: campaign.targetMarket || 'Not specified',
    offer: campaign.offer || 'Not specified',
    mainBenefit: campaign.mainBenefit || 'Not specified',
    problemSolved: campaign.problemSolved || 'Not specified',
    uniqueMechanism: campaign.uniqueMechanism || 'Not specified',
    proof: campaign.proofCaseStudy || 'None provided',
    painPoints: campaign.painPoints || 'Not specified',
    desiredOutcome: campaign.desiredOutcome || 'Not specified',
    objections: campaign.objections || 'Not specified',
    avoidSaying: campaign.avoidSaying || 'None specified',
    emailTone: campaign.tone || 'Professional and friendly',
    emailLength: campaign.emailLength || 'Short',
    bookingLinkStrategy: campaign.bookingLinkStrategy || 'Soft CTA first, booking link later',
    
    // Knowledge Base
    knowledgeBaseContext: knowledgeBaseContext || 'No Knowledge Base available.',
    
    // Lead Personalization Details
    greeting: leadPersonalization.greeting,
    firstName: leadPersonalization.firstName || 'there',
    fullName: leadPersonalization.fullName || 'Unknown',
    safeCompanyMention: leadPersonalization.safeCompanyMention || campaign.companyFallback || 'your team',
    role: leadPersonalization.role || 'Unknown',
    jobTitle: leadPersonalization.jobTitle || 'Unknown',
    industry: leadPersonalization.industry || 'Unknown',
    location: leadPersonalization.location || 'Unknown',
    website: leadPersonalization.website || 'Unknown',
    linkedinUrl: leadPersonalization.linkedinUrl || 'Unknown',
    companyFallback: leadPersonalization.companyFallback || campaign.companyFallback || 'your team'
  };
}
