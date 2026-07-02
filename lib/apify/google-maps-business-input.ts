export function buildGoogleMapsBusinessInput(filters: any) {
  const { businessType, location, keywords, maxResults } = filters;

  // Build the search strings array based on what the user provided
  const searchStringsArray: string[] = [];
  
  if (businessType && location) {
    searchStringsArray.push(`${businessType} ${location}`);
  } else if (businessType) {
    searchStringsArray.push(businessType);
  }

  if (keywords && location) {
    searchStringsArray.push(`${keywords} ${location}`);
  } else if (keywords) {
    searchStringsArray.push(keywords);
  }

  // Fallback if nothing was provided
  if (searchStringsArray.length === 0) {
    searchStringsArray.push("businesses");
  }

  // Update this mapping based on selected Google Maps Apify actor input schema.
  return {
    searchStringsArray,
    maxCrawledPlacesPerSearch: parseInt(maxResults || "25", 10),
    language: "en",
    includeWebResults: true,
    scrapeContacts: true
  };
}
