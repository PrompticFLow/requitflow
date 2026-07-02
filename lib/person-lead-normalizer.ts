export function normalizeVerifiedPersonLead(raw: any, businessContext?: any) {
  // Extract Name
  const rawFullName = raw.fullName || raw.name || raw.contactName || null;
  const rawFirstName = raw.firstName || (rawFullName ? rawFullName.split(' ')[0] : null);
  const rawLastName = raw.lastName || (rawFullName ? rawFullName.split(' ').slice(1).join(' ') : null);

  // Email
  let email = raw.email || raw.emailAddress || null;
  if (email) email = email.toLowerCase().trim();

  // Phone
  let phone = raw.phone || raw.phoneNumber || raw.mobile || null;
  if (phone) phone = phone.trim();

  // Job Title
  const jobTitle = raw.jobTitle || raw.role || raw.position || null;

  // Company Name
  const companyName = raw.companyName || raw.company || (businessContext?.businessName) || null;
  const businessName = companyName;

  // Website & LinkedIn
  let website = raw.website || raw.companyWebsite || (businessContext?.website) || null;
  if (website && !website.startsWith('http')) website = `https://${website}`;

  let linkedinUrl = raw.linkedinUrl || raw.linkedIn || raw.profileUrl || null;
  if (linkedinUrl && !linkedinUrl.startsWith('http')) linkedinUrl = `https://${linkedinUrl}`;

  // Geography & Categories
  const location = raw.location || (businessContext?.location) || null;
  const country = raw.country || (businessContext?.country) || null;
  const industry = raw.industry || (businessContext?.category) || null;
  const businessCategory = businessContext?.category || null;
  
  // Maps URL
  const googleMapsUrl = businessContext?.googleMapsUrl || null;

  return {
    firstName: rawFirstName,
    lastName: rawLastName,
    fullName: rawFullName,
    email,
    emailStatus: raw.emailStatus || null,
    phone,
    phoneStatus: raw.phoneStatus || null,
    jobTitle,
    companyName,
    businessName,
    website,
    linkedinUrl,
    location,
    country,
    industry,
    businessCategory,
    googleMapsUrl,
    source: "Apify Person Verification",
    sourceUrl: linkedinUrl || website || googleMapsUrl,
    validationStatus: "Unknown", // populated later
    aiFitScore: null,           // populated later
    aiFitReason: null,          // populated later
    rawData: raw
  };
}

function pickFirstString(...values: any[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const found = value.find((v) => typeof v === "string" && v.trim());
      if (found) return found.trim();
    }
  }
  return null;
}

function cleanLinkedInUrl(url: string | null) {
  if (!url) return null;
  if (!url.startsWith('http')) return `https://${url}`;
  return url;
}

export function normalizeLinkedInProfileLead(raw: any, fallback?: { industry?: string, location?: string, companyNote?: string }) {
  // Extract Name
  const fullName = pickFirstString(raw.fullName, raw.full_name, raw.name, raw.profileName, raw.personName) || null;
  const rawFirstName = pickFirstString(raw.firstName, raw.first_name);
  const rawLastName = pickFirstString(raw.lastName, raw.last_name);
  
  let firstName = rawFirstName;
  let lastName = rawLastName;
  
  if (fullName && !firstName && !lastName) {
    const parts = fullName.split(' ');
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  } else if (!fullName && firstName && lastName) {
    // If we only have pieces, that's fine too.
  }

  // Email
  let email = pickFirstString(raw.email, raw.emails) || null;
  if (email) email = email.toLowerCase();

  // Phone
  let phone = pickFirstString(raw.phone, raw.phoneNumber, raw.mobile, raw.phones) || null;

  // Job Title
  let jobTitle = pickFirstString(raw.jobTitle, raw.title, raw.headline, raw.occupation, raw.position, raw.currentPosition) || null;
  
  // Company Name
  let companyName = pickFirstString(raw.companyName, raw.company, raw.currentCompany, raw.organization, raw.employer) || null;
  
  if (raw.positions && Array.isArray(raw.positions) && raw.positions.length > 0) {
    const current = raw.positions[0];
    if (!jobTitle && current.title) jobTitle = current.title;
    if (!companyName && current.companyName) companyName = current.companyName;
  }

  // Location/Industry
  let location = pickFirstString(raw.location, raw.geoLocation, raw.address, raw.city, raw.countryCode, raw.country) || null;
  let country = pickFirstString(raw.countryCode, raw.country) || null;
  let industry = pickFirstString(raw.industry) || null;
  
  if (!industry && fallback?.industry) industry = fallback.industry;
  if (!location && fallback?.location) location = fallback.location;

  // URLs
  let linkedinUrl = cleanLinkedInUrl(pickFirstString(raw.linkedinUrl, raw.profileUrl, raw.url, raw.link, raw.linkedin, raw.profile_link)) || null;
  if (!linkedinUrl && raw.publicIdentifier) linkedinUrl = `https://www.linkedin.com/in/${raw.publicIdentifier}`;
  
  let website = pickFirstString(raw.website, raw.website_url, raw.companyWebsite, raw.websites) || null;

  return {
    firstName,
    lastName,
    fullName: fullName || (firstName && lastName ? `${firstName} ${lastName}` : null),
    email,
    emailStatus: email ? 'Unknown' : 'Missing',
    phone,
    phoneStatus: phone ? 'Found' : 'Missing',
    jobTitle,
    companyName,
    businessName: companyName,
    website,
    linkedinUrl,
    location,
    country,
    industry,
    source: "LinkedIn",
    sourceUrl: linkedinUrl,
    validationStatus: "Unknown", 
    aiFitScore: 0,           
    aiFitReason: null,          
    rawData: raw
  };
}
