export function getLeadFirstName(lead: any): string | null {
  if (!lead) return null;

  // 1. If lead.firstName exists
  if (lead.firstName && typeof lead.firstName === 'string') {
    const cleaned = lead.firstName.trim();
    if (cleaned) {
      const safe = cleanFirstName(cleaned);
      if (safe) return safe;
    }
  }

  // 2. Else if lead.name/fullName/contactName exists
  const fullName = lead.name || lead.fullName || lead.contactName;
  if (fullName && typeof fullName === 'string') {
    const firstWord = fullName.trim().split(' ')[0];
    if (firstWord) {
      const safe = cleanFirstName(firstWord);
      if (safe) return safe;
    }
  }

  // 3. Else if email exists
  if (lead.email && typeof lead.email === 'string') {
    const emailPrefix = lead.email.split('@')[0];
    const namePart = emailPrefix.split('.')[0];
    const safe = cleanFirstName(namePart);
    if (safe) return safe;
  }

  return null;
}

function cleanFirstName(name: string): string | null {
  if (!name) return null;
  const genericNames = [
    'info', 'contact', 'hello', 'support', 'sales', 'admin', 
    'team', 'office', 'careers', 'hr', 'jobs', 'noreply', 'no-reply'
  ];
  
  const lowerName = name.toLowerCase().trim();
  if (genericNames.includes(lowerName)) {
    return null;
  }
  
  return lowerName.charAt(0).toUpperCase() + lowerName.slice(1);
}

export function getLeadGreeting(lead: any): string {
  const firstName = getLeadFirstName(lead);
  if (firstName) {
    return `Hi ${firstName},`;
  }
  return "Hi there,";
}

export function getLeadCompanyName(lead: any): string | null {
  if (!lead) return null;

  // 1. lead.companyName, 2. lead.businessName, 3. lead.company, 4. lead.organization, 5. lead.company?.name, 6. lead.business?.name
  const rawCompany = lead.companyName || lead.businessName || lead.company || lead.organization || lead?.company?.name || lead?.business?.name;
  
  if (rawCompany && typeof rawCompany === 'string') {
    return cleanCompanyName(rawCompany);
  }

  // 7. website domain fallback
  if (lead.website && typeof lead.website === 'string') {
    const fromWebsite = extractDomainAsCompany(lead.website);
    if (fromWebsite) return fromWebsite;
  }

  // email domain fallback
  if (lead.email && typeof lead.email === 'string' && lead.email.includes('@')) {
    const domain = lead.email.split('@')[1];
    if (domain) {
      const fromEmail = extractDomainAsCompany(`https://${domain}`);
      if (fromEmail) return fromEmail;
    }
  }

  return null;
}

export function getLeadBusinessName(lead: any): string | null {
  return getLeadCompanyName(lead);
}

function cleanCompanyName(name: string): string {
  let cleaned = name.trim();
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  cleaned = cleaned.replace(/\/$/i, '');
  // Note: We don't strip email domains suffix (.com, etc.) here if they actually put it in the companyName field,
  // but if they put an email or url, we can try to clean it. We'll leave the string largely intact
  // as per the requirement: "Remove email domain suffix only if needed"
  return cleaned;
}

function extractDomainAsCompany(url: string): string | null {
  try {
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    const domainObj = new URL(cleanUrl);
    let domain = domainObj.hostname;
    
    domain = domain.replace(/^www\./i, '');
    
    const genericDomains = [
      'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 
      'icloud.com', 'aol.com', 'proton.me', 'protonmail.com'
    ];
    
    if (genericDomains.includes(domain.toLowerCase())) {
      return null;
    }

    const namePart = domain.split('.')[0];
    if (!namePart) return null;
    
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
  } catch (e) {
    return null;
  }
}

export function getCompanyFallback(lead: any): string {
  const companyName = getLeadCompanyName(lead);
  if (companyName) {
    return companyName;
  }
  
  const industry = lead?.industry || lead?.category;
  if (industry && typeof industry === 'string') {
    return `your ${industry.toLowerCase()} business`;
  }
  
  return "your team";
}

export function buildLeadPersonalization(lead: any) {
  const firstName = getLeadFirstName(lead);
  const companyName = getLeadCompanyName(lead);
  const companyFallback = getCompanyFallback(lead);

  return {
    firstName: firstName || null,
    fullName: lead?.fullName || lead?.name || null,
    greeting: getLeadGreeting(lead),
    companyName: companyName || null,
    businessName: companyName || null,
    companyFallback: companyFallback,
    role: lead?.jobTitle || lead?.role || lead?.title || "Unknown",
    jobTitle: lead?.jobTitle || lead?.role || lead?.title || "Unknown",
    industry: lead?.industry || lead?.category || "Unknown",
    location: lead?.location || lead?.country || "Unknown",
    website: lead?.website || lead?.sourceUrl || "Unknown",
    linkedinUrl: lead?.linkedinUrl || "Unknown",
    safeCompanyMention: companyName || companyFallback
  };
}
