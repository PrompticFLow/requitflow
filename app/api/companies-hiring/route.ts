import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function deriveCategory(title: string | null | undefined, currentCategory: string | null | undefined): string {
  if (currentCategory && currentCategory !== 'Uncategorized' && currentCategory !== 'Other') {
    return currentCategory;
  }
  if (!title) return 'Other';
  const t = title.toLowerCase();
  if (t.includes('developer') || t.includes('engineer') || t.includes('frontend') || t.includes('backend') || t.includes('full stack') || t.includes('software')) return 'Software Engineering';
  if (t.includes('data scientist') || t.includes('data analyst') || t.includes('machine learning') || t.includes('ai') || t.includes('ml')) return 'Data / AI / ML';
  if (t.includes('sales') || t.includes('account executive') || t.includes('business development')) return 'Sales';
  if (t.includes('marketing') || t.includes('seo') || t.includes('content') || t.includes('ads') || t.includes('growth')) return 'Marketing';
  if (t.includes('recruiter') || t.includes('talent acquisition') || t.includes('hr')) return 'HR / Recruitment';
  if (t.includes('support') || t.includes('customer success') || t.includes('chat support')) return 'Customer Support';
  if (t.includes('intern') || t.includes('fresher') || t.includes('trainee')) return 'Internship / Fresher';
  if (t.includes('finance') || t.includes('accountant') || t.includes('accounts')) return 'Finance';
  if (t.includes('designer') || t.includes('ui') || t.includes('ux')) return 'Design';
  if (t.includes('product manager') || t.includes('product owner')) return 'Product Management';
  return 'Other';
}

function parseExactHeadcount(description: string | null | undefined, title: string | null | undefined): number | null {
  if (!description && !title) return null;
  const text = ((description || '') + ' ' + (title || '')).toLowerCase();
  const match = text.match(/(\d+)\s+(openings|candidates|positions available|vacancies)/);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }
  return null;
}

export async function GET(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database connection is not configured. Please add DATABASE_URL in environment variables.' }, { status: 500 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized. Please log in again.' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    
    // Parse parameters
    const q = searchParams.get('q') || '';
    const category = searchParams.get('category') || '';
    const country = searchParams.get('country') || '';
    const city = searchParams.get('city') || '';
    const source = searchParams.get('source') || '';
    const minOpenRoles = parseInt(searchParams.get('minOpenRoles') || '0', 10);
    const sort = searchParams.get('sort') || 'highest-open-roles';
    
    let page = parseInt(searchParams.get('page') || '1', 10);
    let pageSize = parseInt(searchParams.get('pageSize') || '25', 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) pageSize = 25;

    // Build the query safely
    const where: any = { archived: false };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
        { website: { contains: q, mode: 'insensitive' } },
        {
          jobs: {
            some: {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { category: { contains: q, mode: 'insensitive' } },
                { city: { contains: q, mode: 'insensitive' } },
                { country: { contains: q, mode: 'insensitive' } }
              ]
            }
          }
        }
      ];
    }

    if (source) {
      where.source = { equals: source, mode: 'insensitive' };
    }

    // Job-related filters
    const jobSome: any = {};
    let hasJobFilter = false;

    if (country) { jobSome.country = { equals: country, mode: 'insensitive' }; hasJobFilter = true; }
    if (city) { jobSome.city = { equals: city, mode: 'insensitive' }; hasJobFilter = true; }
    if (category) { jobSome.category = { equals: category, mode: 'insensitive' }; hasJobFilter = true; }
    
    if (hasJobFilter) {
      where.jobs = { some: jobSome };
    }

    // 1. Fetch total count safely
    const totalCompanies = await prisma.company.count({ where });

    if (totalCompanies === 0) {
      return NextResponse.json({
        summary: {
          totalHiringCompanies: 0,
          totalOpenRolesFound: 0,
          remoteRoles: 0,
          hybridRoles: 0,
          onsiteRoles: 0,
          topHiringCategory: null
        },
        companies: [],
        pagination: {
          page,
          pageSize,
          totalCompanies: 0,
          totalPages: 0
        }
      });
    }

    // 2. Fetch Paginated Companies with Include
    const includeConfig: any = {
      jobs: hasJobFilter ? { where: jobSome } : true
    };
    
    if (user) {
      includeConfig.leads = { where: { userId: user.id }, include: { campaignLeads: true } };
    }

    // We fetch a bit more because we'll sort manually for dynamic properties like "Highest open roles"
    const rawCompanies = await prisma.company.findMany({
      where,
      include: includeConfig
    });

    // 3. Process and Deduplicate Jobs
    let globalOpenRolesFound = 0;
    let globalRemoteRoles = 0;
    let globalHybridRoles = 0;
    let globalOnsiteRoles = 0;
    const globalCategoryCounts: Record<string, number> = {};

    const processedCompanies = rawCompanies.map(company => {
      const rawJobs = (company as any).jobs || [];
      
      // Deduplicate jobs by externalId, applicationUrl, descriptionHash, or combination
      const uniqueJobsMap = new Map<string, any>();
      rawJobs.forEach((job: any) => {
        const cName = company.name || 'Unknown';
        const jTitle = job.title || 'Unknown Role';
        const jLoc = job.location || job.city || job.country || 'Unknown Location';
        const dedupeKey = job.externalId || job.applicationUrl || job.descriptionHash || `${cName.toLowerCase()}-${jTitle.toLowerCase()}-${jLoc.toLowerCase()}`;
        if (!uniqueJobsMap.has(dedupeKey)) {
          uniqueJobsMap.set(dedupeKey, job);
        }
      });
      
      const uniqueJobs = Array.from(uniqueJobsMap.values());
      const openRolesFound = uniqueJobs.length;
      
      globalOpenRolesFound += openRolesFound;

      let exactHeadcount: number | null = null;
      let remoteRolesCount = 0;
      let hybridRolesCount = 0;
      let onsiteRolesCount = 0;
      
      const categoryCountsMap: Record<string, number> = {};
      const locationsSet = new Set<string>();
      const titlesMap: Record<string, number> = {};
      
      let latestPostingDate: Date | null = null;

      uniqueJobs.forEach(job => {
        // Derive exact headcount
        if (job.vacancies && job.vacancies > 0) {
          exactHeadcount = (exactHeadcount || 0) + job.vacancies;
        } else {
          const parsed = parseExactHeadcount(job.description, job.title);
          if (parsed) exactHeadcount = (exactHeadcount || 0) + parsed;
        }

        // Dates
        if (job.datePosted) {
          const postedDate = new Date(job.datePosted);
          if (!latestPostingDate || postedDate > latestPostingDate) {
            latestPostingDate = postedDate;
          }
        }

        // Category
        const cat = deriveCategory(job.title, job.category);
        categoryCountsMap[cat] = (categoryCountsMap[cat] || 0) + 1;
        globalCategoryCounts[cat] = (globalCategoryCounts[cat] || 0) + 1;

        // Title
        if (job.title) {
          titlesMap[job.title] = (titlesMap[job.title] || 0) + 1;
        }
        
        // Locations
        if (job.city) locationsSet.add(job.city);
        else if (job.region) locationsSet.add(job.region);
        else if (job.country) locationsSet.add(job.country);
        else if (job.location) locationsSet.add(job.location);
        
        // Work Mode
        const mode = (job.workMode || '').toLowerCase();
        if (mode.includes('remote')) { remoteRolesCount++; globalRemoteRoles++; }
        else if (mode.includes('hybrid')) { hybridRolesCount++; globalHybridRoles++; }
        else { onsiteRolesCount++; globalOnsiteRoles++; }
      });

      // Sort categories and titles
      const categoryCounts = Object.entries(categoryCountsMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      const topRoles = Object.entries(titlesMap).map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count).map(t => t.title).slice(0, 5);

      let calculatedActivity = 'Low';
      if (openRolesFound >= 10) calculatedActivity = 'High';
      else if (openRolesFound >= 4) calculatedActivity = 'Medium';

      return {
        id: company.id,
        companyName: company.name,
        website: company.website,
        country: company.country,
        city: company.location, // or company.city if added later
        industry: null,
        source: company.source || 'Unknown',
        openRolesFound,
        exactHeadcount: exactHeadcount ? String(exactHeadcount) : 'Not publicly disclosed',
        categoryCounts,
        topRoles,
        locations: Array.from(locationsSet).slice(0, 5),
        remoteRolesCount,
        hybridRolesCount,
        onsiteRolesCount,
        lastUpdated: latestPostingDate ? new Date(latestPostingDate as Date).toISOString() : (company.updatedAt ? new Date(company.updatedAt as Date).toISOString() : null),
        dataStatus: "FRESH", // Could derive STALE from lastUpdated
        hiringActivity: calculatedActivity,
        // UI flags
        addedToLeads: user && (company as any).leads && (company as any).leads.length > 0,
        addedToCampaign: user && (company as any).leads && (company as any).leads.some((l: any) => l.campaignLeads?.length > 0)
      };
    });

    // 4. Filter by Minimum Open Roles
    let filteredCompanies = processedCompanies;
    if (minOpenRoles > 0) {
      filteredCompanies = filteredCompanies.filter(c => c.openRolesFound >= minOpenRoles);
    }

    // 5. Sort In-Memory
    switch (sort) {
      case 'Highest open roles':
      case 'highest-open-roles':
        filteredCompanies.sort((a, b) => b.openRolesFound - a.openRolesFound);
        break;
      case 'Recently updated':
      case 'recently-updated':
        filteredCompanies.sort((a, b) => {
          const tA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
          const tB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
          return tB - tA;
        });
        break;
      case 'Company name A–Z':
      case 'name-asc':
        filteredCompanies.sort((a, b) => a.companyName.localeCompare(b.companyName));
        break;
      case 'Company name Z–A':
      case 'name-desc':
        filteredCompanies.sort((a, b) => b.companyName.localeCompare(a.companyName));
        break;
      case 'Remote roles count':
      case 'remote-roles':
        filteredCompanies.sort((a, b) => b.remoteRolesCount - a.remoteRolesCount);
        break;
      default:
        filteredCompanies.sort((a, b) => b.openRolesFound - a.openRolesFound);
    }

    // 6. Pagination
    const finalTotal = filteredCompanies.length;
    const totalPages = Math.ceil(finalTotal / pageSize);
    const paginatedCompanies = filteredCompanies.slice((page - 1) * pageSize, page * pageSize);

    // Global Top Category
    let topHiringCategory = null;
    let maxCatCount = 0;
    for (const [cat, count] of Object.entries(globalCategoryCounts)) {
      if (count > maxCatCount) {
        maxCatCount = count;
        topHiringCategory = cat;
      }
    }

    // Build sorted category breakdown array for the UI
    const categoryCounts = Object.entries(globalCategoryCounts)
      .map(([name, count]) => ({ name, count, percentage: 0 }))
      .sort((a, b) => b.count - a.count);

    // Add percentage relative to total jobs
    const totalJobs = categoryCounts.reduce((sum, c) => sum + c.count, 0);
    if (totalJobs > 0) {
      categoryCounts.forEach(c => { c.percentage = Math.round((c.count / totalJobs) * 100); });
    }

    return NextResponse.json({
      summary: {
        totalHiringCompanies: finalTotal,
        totalOpenRolesFound: globalOpenRolesFound,
        remoteRoles: globalRemoteRoles,
        hybridRoles: globalHybridRoles,
        onsiteRoles: globalOnsiteRoles,
        topHiringCategory
      },
      companies: paginatedCompanies,
      categoryCounts,
      pagination: {
        page,
        pageSize,
        totalCompanies: finalTotal,
        totalPages
      }
    });

  } catch (error: any) {
    console.error('Error fetching companies hiring:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

