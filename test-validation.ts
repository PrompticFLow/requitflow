import 'dotenv/config';
import { getApifyDatasetItems } from "./lib/apify/client";
import { normalizePersonLead } from './lib/person-lead-normalizer';
import { validatePersonLead } from "./lib/person-lead-validation";

async function run() {
  const datasetId = "acykWZixmWyVwesgA"; // From latest successful run
  console.log("Fetching dataset", datasetId);

  try {
    const rawItems = await getApifyDatasetItems(datasetId);
    console.log("rawCount:", rawItems.length);

    let validCount = 0;
    let needsReviewCount = 0;
    let invalidCount = 0;

    for (const raw of rawItems) {
      const normalized = normalizePersonLead(raw);
      const validated = validatePersonLead(normalized);

      if (validated.validationStatus === "Valid") validCount++;
      else if (validated.validationStatus === "Needs Review") needsReviewCount++;
      else invalidCount++;
    }

    console.log("Normalized results:");
    console.log({
      valid: validCount,
      needsReview: needsReviewCount,
      invalid: invalidCount,
    });

    if (rawItems.length > 0) {
      console.log("\nFirst Raw Item snippet:");
      console.log(JSON.stringify(rawItems[0], null, 2).slice(0, 500));
      
      const firstNormalized = normalizePersonLead(rawItems[0]);
      const firstValidated = validatePersonLead(firstNormalized);
      console.log("\nFirst Validated Item:");
      console.log(JSON.stringify(firstValidated, null, 2));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
