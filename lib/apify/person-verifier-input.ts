export function buildPersonVerifierInputFromBusinesses(businesses: any[], filters: any) {
  const { targetDecisionMaker } = filters;

  // We map the normalized businesses to the expected input for the Person Verifier actor.
  // The Person Verifier Actor might expect an array of companies/queries to enrich.
  
  const searchQueries = businesses.map(b => {
    const parts = [b.businessName, b.location].filter(Boolean);
    return parts.join(' ');
  });

  return {
    // Modify these exact field names based on your selected Person Verifier Actor.
    // E.g., if it takes 'queries', 'companies', or 'startUrls'
    queries: searchQueries,
    targetRoles: targetDecisionMaker ? targetDecisionMaker.split(',').map((s: string) => s.trim()) : ["Founder", "CEO", "Owner"],
    extractEmails: true,
    extractPhones: true,
    maxResultsPerQuery: 5 // Just an example, usually you want 1-5 decision makers per business
  };
}
