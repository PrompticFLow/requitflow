import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Basic counts
    const clientLeadsFound = await prisma.lead.count({ where: { source: { not: "Candidate" } } });
    const candidatesFound = await prisma.lead.count({ where: { source: "Candidate" } });
    const activeCampaigns = await prisma.campaign.count({ where: { status: "Active" } });
    
    // Outreach metrics
    const emailsSent = await prisma.emailSequence.count({ where: { status: "Sent" } });
    const smsSent = await prisma.smsSequence.count({ where: { status: "Sent" } });
    
    // Replies & Calls
    const repliesReceived = await prisma.reply.count();
    const interestedReplies = await prisma.reply.count({ where: { intent: "Interested" } });
    const discoveryCallsBooked = await prisma.bookedCall.count();
    const screeningCallsBooked = 0; // Placeholder for now since we don't track call types explicitly yet
    
    // Lead Tiers
    const hotClientLeads = await prisma.lead.count({ where: { leadTier: "Hot" } });
    const warmClientLeads = await prisma.lead.count({ where: { leadTier: "Warm" } });
    const coldClientLeads = await prisma.lead.count({ where: { leadTier: "Cold" } });
    
    // Rates
    const positiveReplyRate = repliesReceived > 0 ? ((interestedReplies / repliesReceived) * 100).toFixed(1) + "%" : "0.0%";
    const callBookingRate = emailsSent > 0 ? ((discoveryCallsBooked / emailsSent) * 100).toFixed(1) + "%" : "0.0%";
    
    // Other metrics
    const noReplyCount = await prisma.emailSequence.count({ where: { status: "Sent", replyReceived: false } });
    const unsubscribedCount = await prisma.lead.count({ where: { status: "Unsubscribed" } });

    // Funnel data
    const leadsAddedToCampaign = await prisma.campaignLead.count();
    const funnel = {
      added: leadsAddedToCampaign,
      emailsSent: emailsSent,
      replies: repliesReceived,
      interested: interestedReplies,
      booked: discoveryCallsBooked,
      won: 0 // Placeholder
    };

    // Trend data (Last 7 days of leads)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentLeads = await prisma.lead.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true }
    });
    
    // Group leads by date string (YYYY-MM-DD)
    const trendMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      trendMap[dateStr] = 0;
    }
    
    recentLeads.forEach(lead => {
      const dateStr = lead.createdAt.toISOString().split('T')[0];
      if (trendMap[dateStr] !== undefined) {
        trendMap[dateStr]++;
      }
    });

    const trend = Object.keys(trendMap).map(date => ({
      date,
      count: trendMap[date]
    }));

    return NextResponse.json({
      clientLeadsFound,
      candidatesFound,
      activeCampaigns,
      emailsSent,
      smsSent,
      repliesReceived,
      discoveryCallsBooked,
      screeningCallsBooked,
      positiveReplyRate,
      callBookingRate,
      hotClientLeads,
      warmClientLeads,
      coldClientLeads,
      interestedReplies,
      noReplyCount,
      unsubscribedCount,
      funnel,
      trend
    });

  } catch (error: any) {
    console.error("Dashboard analytics error:", error);
    if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
      return NextResponse.json({
        clientLeadsFound: 0, candidatesFound: 0, activeCampaigns: 0, emailsSent: 0, smsSent: 0,
        repliesReceived: 0, interestedReplies: 0, discoveryCallsBooked: 0, screeningCallsBooked: 0,
        hotClientLeads: 0, warmClientLeads: 0, coldClientLeads: 0,
        positiveReplyRate: "0.0%", callBookingRate: "0.0%",
        noReplyCount: 0, unsubscribedCount: 0,
        funnel: { added: 0, emailsSent: 0, replies: 0, interested: 0, booked: 0, won: 0 },
        leadTrend: []
      });
    }
    return NextResponse.json(
      { error: "Failed to load dashboard metrics", details: error.message },
      { status: 500 }
    );
  }
}
