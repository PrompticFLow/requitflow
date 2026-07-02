/**
 * Builds the input configuration for the harvestapi/linkedin-profile-search Apify actor.
 * The actor expects a keyword/search query and a location filter.
 */
export function buildPersonBulkSearchInput({
  targetAudience,
  location,
  leadCount,
  keywords,
}: {
  targetAudience: string;
  location: string;
  leadCount: number;
  keywords?: string;
}) {
  const audienceLower = targetAudience.toLowerCase();
  
  const dmRoles = ['owner', 'founder', 'ceo', 'director', 'manager', 'president', 'partner', 'vp', 'head'];
  const companyTypes = ['recruitment agency', 'real estate', 'marketing agency', 'clinic', 'brokerage', 'firm', 'company', 'agency'];

  const hasDmRole = dmRoles.some(role => audienceLower.includes(role));
  const hasCompanyType = companyTypes.some(type => audienceLower.includes(type));

  let jobTitleSearch = [targetAudience, keywords].filter(Boolean).join(" ");
  let companySearch = "";

  if (hasCompanyType && hasDmRole) {
    // Example: "Recruitment agency owners"
    // Split intent: company = "recruitment agency", title = "owners"
    // Heuristic: just put the company type in company/nameSearchKeywords and dm roles in title
    const foundType = companyTypes.find(type => audienceLower.includes(type));
    companySearch = foundType || "";
    jobTitleSearch = [
      keywords, 
      ...dmRoles.filter(role => audienceLower.includes(role))
    ].filter(Boolean).join(" ");
    
    // If jobTitleSearch is empty after extraction, fallback to original
    if (!jobTitleSearch) jobTitleSearch = [targetAudience, keywords].filter(Boolean).join(" ");
  } else if (hasCompanyType) {
    companySearch = targetAudience;
    jobTitleSearch = keywords || "";
  }

  const nameSearchKeywords = companySearch || "";
  const jobTitle = jobTitleSearch.trim() || "";

  return {
    nameSearchKeywords,
    jobTitle,
    geocodeLocation: location,
    maximumResults: leadCount,
  };
}
