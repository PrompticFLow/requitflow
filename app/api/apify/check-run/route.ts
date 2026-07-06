import { NextResponse } from 'next/server';
import { getRunStatus, getDatasetItems } from '@/services/apify';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

// Allow up to 5 minutes — Apify runs can take a while
export const maxDuration = 300;


// Extract the first valid email from a website's HTML (homepage + /contact fallback)
async function extractEmailFromWebsite(websiteUrl: string): Promise<string | null> {
  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  // Skip these generic/system addresses
  const SKIP = /noreply|no-reply|donotreply|support@|info@example|test@|admin@example/i;

  const pagesToTry: string[] = [];
  try {
    const base = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    pagesToTry.push(base.origin);               // homepage
    pagesToTry.push(`${base.origin}/contact`);  // contact page
    pagesToTry.push(`${base.origin}/about`);    // about page
  } catch {
    return null;
  }

  for (const url of pagesToTry) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadRadar/1.0)' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const matches = html.match(EMAIL_RE) || [];
      for (const email of matches) {
        if (!SKIP.test(email) && email.length < 80) {
          return email.toLowerCase();
        }
      }
    } catch {
      // timeout or network error — skip this page
    }
  }
  return null;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return NextResponse.json({ error: 'Apify token missing' }, { status: 400 });
  }

  const { runId, location, country } = await req.json();
  if (!runId) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

  try {
    const runStatus = await getRunStatus(apifyToken, runId);
    const status = runStatus.data.status;

    if (status !== 'SUCCEEDED') {
      return NextResponse.json({ status });
    }

    // If succeeded, fetch the results
    const datasetId = runStatus.data.defaultDatasetId;
    const items = await getDatasetItems(apifyToken, datasetId);

    // Filter out items without a name
    const validItems = items.filter((item: any) => item.title);

    // Save leads to database and generate AI insights concurrently
    const createdLeads = [];
    const bayOfAssetsKey = process.env.BAYOFASSETS_API_KEY;
    const bayOfAssetsModel = process.env.BAYOFASSETS_MODEL || 'google/gemini-2.5-flash';

    const processLead = async (item: any) => {
      // Basic scoring logic
      let score = 0;
      if (item.reviewsCount > 50) score += 20;
      if (item.rating && item.rating >= 4.0) score += 20;
      if (item.website) score += 30;
      if (item.phone || item.phoneUnformatted) score += 30;

      // Extract email from the business website
      let email: string | null = null;
      if (item.website) {
        try {
          email = await extractEmailFromWebsite(item.website);
          if (email) score += 10; // bonus for having a reachable email
        } catch {
          // silently skip if website is unreachable
        }
      }

      let tier = "Cold";
      if (score >= 80) tier = "Hot";
      else if (score >= 50) tier = "Warm";

      // Generate AI Insight
      let aiInsight = "Potential recruitment client based on public business presence and available contact details.";
      if (bayOfAssetsKey) {
        try {
          const prompt = `Based on this company name (${item.title}), category (${item.categoryName || 'Unknown'}), and rating (${item.rating || 'N/A'}), write exactly one brief sentence on why a recruitment agency should contact them to offer hiring/staffing services. Do not include quotes, just the sentence.`;
          
          const orRes = await fetch("${process.env.BAYOFASSETS_BASE_URL}/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${bayOfAssetsKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://funnelzen.ai",
              "X-Title": "FunnelZen AI"
            },
            body: JSON.stringify({
              model: bayOfAssetsModel,
              messages: [{ role: "user", content: prompt }]
            })
          });
          const orData = await orRes.json();
          if (orData.choices && orData.choices[0] && orData.choices[0].message) {
            aiInsight = orData.choices[0].message.content.trim();
          }
        } catch (err) {
          console.error("OpenRouter generation failed for lead", item.title, err);
        }
      }

      const lead = await prisma.lead.create({
        data: {
          userId: user.id,
          businessName: item.title || item.name,
          phone: item.phone || item.phoneUnformatted || null,
          email: email,
          website: item.website || null,
          address: item.address || item.street || null,
          rating: item.totalScore || item.rating || null,
          reviewCount: item.reviewsCount || null,
          googleMapsLink: item.url || item.googleMapsUrl || null,
          category: item.categoryName || item.category || null,
          country: country || null,
          location: location || item.city || null,
          leadScore: score,
          leadTier: tier,
          source: 'Apify',
          status: 'New',
          aiInsight: aiInsight,
        }
      });
      return lead;
    };

    // Run processing concurrently in batches of 10 to not overwhelm OpenRouter
    for (let i = 0; i < validItems.length; i += 10) {
      const batch = validItems.slice(i, i + 10);
      const batchResults = await Promise.all(batch.map(processLead));
      createdLeads.push(...batchResults);
    }

    return NextResponse.json({ status: 'SUCCEEDED', leads: createdLeads });

  } catch (error: any) {
    console.error('Apify check error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
