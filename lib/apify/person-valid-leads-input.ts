/**
 * This mapping is for harvestapi/linkedin-profile-scraper.
 * If PERSON_VALID_LEADS_ACTOR_ID is changed to a bulk search actor, update this file.
 */
export function buildLinkedInProfileScraperInput(url: string) {
  return {
    url: url
  };
}
