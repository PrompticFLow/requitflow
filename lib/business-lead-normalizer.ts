export function normalizeGoogleMapsBusiness(raw: any) {
  // Extract business name
  const businessName = raw.title || raw.name || raw.businessName || "Unknown Business";
  
  // Extract URL
  let website = raw.website || raw.url || null;
  if (website && !website.startsWith('http')) {
    website = `https://${website}`;
  }

  // Phone
  const phone = raw.phoneUnformatted || raw.phone || raw.phoneNumber || null;

  // Address components
  const address = raw.address || raw.formattedAddress || null;
  const city = raw.city || null;
  const state = raw.state || null;
  const country = raw.countryCode || raw.country || null;
  
  // Create a generalized location string
  const locationParts = [city, state, country].filter(Boolean);
  const location = locationParts.length > 0 ? locationParts.join(', ') : address;

  // Other details
  const category = raw.categoryName || raw.category || null;
  const rating = typeof raw.totalScore === 'number' ? raw.totalScore : (typeof raw.rating === 'number' ? raw.rating : null);
  const reviewsCount = typeof raw.reviewsCount === 'number' ? raw.reviewsCount : null;
  const googleMapsUrl = raw.url || raw.googleMapsUrl || null;

  return {
    businessName,
    companyName: businessName, // Often the same for business leads
    website,
    phone,
    address,
    city,
    state,
    country,
    location,
    category,
    rating,
    reviewsCount,
    googleMapsUrl,
    source: "Google Maps Apify",
    sourceUrl: googleMapsUrl || website,
    rawData: raw
  };
}
