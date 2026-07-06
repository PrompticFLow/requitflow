export function validatePersonLead(lead: any, targetRoles: string[] = []) {
  let status = "invalid";
  let score = 0;
  let reason = "";

  const isLinkedInSource = lead.source === "LinkedIn" || lead.source === "Apify LinkedIn Profile Scraper";

  // Basic presence checks
  const hasName = Boolean(lead.fullName || lead.firstName);
  const hasCompany = Boolean(lead.companyName || lead.businessName);
  const hasContact = Boolean(lead.email || lead.phone || lead.linkedinUrl);
  if (hasName && lead.linkedinUrl) {
    status = "valid";
    score = 30;
    reason = "Basic valid profile";
    
    if (hasCompany && lead.jobTitle) {
       score = 60;
       reason = "title/company exists but decision-maker unclear";
       
       const title = lead.jobTitle.toLowerCase();
       const dmKeywords = ['founder', 'ceo', 'owner', 'managing director', 'president', 'partner', 'director', 'head of', 'vp', 'vice president', 'cmo', 'cto', 'cfo', 'co-founder'];
       
       if (dmKeywords.some(kw => title.includes(kw))) {
         score = 90;
         reason = "High-value decision maker";
       }
    }
  } else if (hasName || lead.linkedinUrl) {
    status = "needs_review";
    reason = "Missing name or LinkedIn URL.";
    score = 15;
  } else {
    status = "invalid";
    reason = "Missing both name and LinkedIn URL.";
    score = 0;
  }

  // Add minor points for direct contact
  if (lead.email) {
    const genericPrefixes = ['info@', 'contact@', 'hello@', 'support@', 'sales@', 'admin@', 'hr@', 'careers@', 'jobs@', 'noreply@', 'no-reply@'];
    const lowerEmail = lead.email.toLowerCase();
    if (lowerEmail.includes('example.com') || lowerEmail.includes('test.com')) {
      status = "invalid";
      reason = "Fake or placeholder email.";
      score = 0;
    } else if (!genericPrefixes.some(prefix => lowerEmail.startsWith(prefix))) {
      score += 20;
    }
  }
  if (lead.phone) score += 10;

  return {
    ...lead,
    validationStatus: status,
    aiFitScore: Math.min(score, 100),
    aiFitReason: reason || (score >= 70 ? "High-value decision maker" : "Standard lead")
  };
}
