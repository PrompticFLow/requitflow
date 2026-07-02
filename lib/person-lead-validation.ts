export function validatePersonLead(lead: any, targetRoles: string[] = []) {
  let status = "Invalid";
  let score = 0;
  let reason = "";

  const isLinkedInSource = lead.source === "LinkedIn" || lead.source === "Apify LinkedIn Profile Scraper";

  // Basic presence checks
  const hasName = Boolean(lead.fullName || lead.firstName);
  const hasCompany = Boolean(lead.companyName || lead.businessName);
  const hasContact = Boolean(lead.email || lead.phone || lead.linkedinUrl);
  
  if (isLinkedInSource) {
    if (!hasName || !lead.linkedinUrl) {
      status = "Invalid";
      reason = "Missing name or LinkedIn URL.";
      score = 0;
    } else if (!hasCompany && !lead.jobTitle) {
      status = "Needs Review";
      reason = "Missing company and job title.";
      score = 15;
    } else {
      status = "Valid";
      score = 30; // base score for weak business context
      reason = "weak business context";
      
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
    }
    
    // Add minor points for direct contact
    if (lead.email) score += 10;
    if (lead.phone) score += 5;

  } else {
    // Old validation for standard leads
    if (!hasName || !hasCompany || !hasContact) {
      status = "Invalid";
      reason = "Missing name, company, or contact info.";
    } else {
      status = "Valid";
    }

    // Email specific validation
    if (lead.email) {
      const genericPrefixes = ['info@', 'contact@', 'hello@', 'support@', 'sales@', 'admin@', 'hr@', 'careers@', 'jobs@', 'noreply@', 'no-reply@'];
      const lowerEmail = lead.email.toLowerCase();
      
      if (lowerEmail.includes('example.com') || lowerEmail.includes('test.com')) {
        status = "Invalid";
        reason = "Fake or placeholder email.";
      } else if (genericPrefixes.some(prefix => lowerEmail.startsWith(prefix))) {
        if (status === "Valid") {
          status = "Needs Review";
          reason = "Generic inbox detected.";
        }
      } else {
        score += 40; // High value for direct email
      }
    } else if (status === "Valid") {
       if (!lead.linkedinUrl && !lead.phone) {
         status = "Needs Review";
         reason = "No direct email, phone, or LinkedIn.";
       }
    }

    if (lead.phone) {
      score += 20;
    }
    
    if (lead.linkedinUrl) {
      score += 10;
    }

    if (lead.jobTitle) {
      const title = lead.jobTitle.toLowerCase();
      const dmKeywords = ['founder', 'ceo', 'owner', 'managing director', 'president', 'partner', 'director', 'head of', 'vp', 'vice president', 'cmo', 'cto', 'cfo', 'co-founder'];
      
      if (dmKeywords.some(kw => title.includes(kw))) {
        score += 30; // High score for decision maker
      }
    }
  }

  return {
    ...lead,
    validationStatus: status,
    aiFitScore: Math.min(score, 100),
    aiFitReason: reason || (score >= 70 ? "High-value decision maker" : "Standard lead")
  };
}
