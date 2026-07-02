export function buildContactEnrichmentInput(leads: any[]) {
  const urls = leads.map(l => l.linkedinUrl).filter(Boolean);
  return {
    profiles: leads.map((lead) => ({
      linkedinUrl: lead.linkedinUrl,
      fullName: lead.fullName,
      companyName: lead.companyName,
      jobTitle: lead.jobTitle,
      location: lead.location,
    })),
    urls: urls,
    linkedinUrls: urls,
    profileUrls: urls,
  };
}
