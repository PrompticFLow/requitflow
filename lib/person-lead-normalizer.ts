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

export function normalizePersonLead(item: any) {
  return {
    linkedinUrl: item.url || item.public_identifier,
    fullName: item.full_name || "Unknown",
    jobTitle: item.title || "",
    location: item.location || "",
    isVerified: item.is_verified || false,

    // IMPORTANT: always null (actor limitation)
    email: null,
    phone: null,

    // Required by DB/validation
    source: "LinkedIn",
    validationStatus: "Unknown", 
    aiFitScore: 0,           
    aiFitReason: null,          
    rawData: item
  };
}
