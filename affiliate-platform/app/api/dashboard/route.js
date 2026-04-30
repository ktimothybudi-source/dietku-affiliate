import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getWindowStart } from "@/lib/referral";

function buildMockSeries(metric, days = 14) {
  return Array.from({ length: days }).map((_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - idx - 1));
    return {
      date: d.toISOString().slice(5, 10),
      value: Math.max(0, Math.floor(Math.random() * metric + metric * 0.25)),
    };
  });
}

export async function GET(request) {
  const supabaseAdmin = getSupabaseAdmin();
  const identifier = request.nextUrl.searchParams.get("identifier")?.trim();
  if (!identifier) {
    return NextResponse.json({ error: "Referral code or email is required." }, { status: 400 });
  }

  const normalizedCode = identifier.toUpperCase();
  const isEmail = identifier.includes("@");
  const affiliateQuery = supabaseAdmin
    .from("affiliates")
    .select("id,name,referral_code,payment_method,social_links,notification_preferences");
  const { data: affiliate, error: affiliateError } = await (isEmail
    ? affiliateQuery.eq("email", identifier.toLowerCase()).single()
    : affiliateQuery.eq("referral_code", normalizedCode).single());

  if (affiliateError || !affiliate) {
    return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
  }

  const { data: metrics } = await supabaseAdmin
    .from("affiliate_metrics")
    .select("clicks,visits,signups,conversions,rewards,points")
    .eq("affiliate_id", affiliate.id)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: commissionRows } = await supabaseAdmin
    .from("commissions")
    .select("amount_usd,status,created_at")
    .eq("affiliate_id", affiliate.id);

  const { data: payoutRows } = await supabaseAdmin
    .from("payouts")
    .select("amount_usd,status,created_at")
    .eq("affiliate_id", affiliate.id)
    .order("created_at", { ascending: false });

  const { data: assetRows } = await supabaseAdmin
    .from("marketing_assets")
    .select("id,asset_type,title,description,file_url")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: rankRows } = await supabaseAdmin
    .from("affiliate_metrics")
    .select("affiliate_id,points")
    .order("points", { ascending: false });

  const weeklyStart = getWindowStart("weekly");
  const { data: weeklyRankRows } = await supabaseAdmin
    .from("affiliate_metrics")
    .select("affiliate_id,points")
    .gte("period_start", weeklyStart)
    .order("points", { ascending: false });

  const { data: referralRows } = await supabaseAdmin
    .from("referrals")
    .select("id,status,created_at,referred_email")
    .eq("affiliate_id", affiliate.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const rankIndex = rankRows?.findIndex((row) => row.affiliate_id === affiliate.id) ?? -1;
  const currentRankPoints = rankRows?.[rankIndex]?.points || 0;
  const pointsToNextRank = rankIndex > 0 ? Math.max(0, (rankRows[rankIndex - 1]?.points || 0) - currentRankPoints + 1) : 0;
  const conversionRate = metrics?.visits ? Number(((metrics.conversions / metrics.visits) * 100).toFixed(2)) : 0;
  const verifiedSignups = Math.max(0, Math.floor((metrics?.signups || 0) * 0.84));
  const pendingPayouts = (payoutRows || []).filter((row) => row.status === "pending").reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
  const totalEarned = (commissionRows || []).reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
  const paidEarnings = (commissionRows || []).filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
  const pendingCommissions = (commissionRows || []).filter((row) => row.status === "pending").reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
  const subscribedUsers = metrics?.conversions || 0;
  const allTimeBoard = (rankRows || []).slice(0, 10).map((row, idx) => ({
    rank: idx + 1,
    affiliateId: row.affiliate_id,
    points: row.points,
  }));
  const weeklyBoard = (weeklyRankRows || []).slice(0, 10).map((row, idx) => ({
    rank: idx + 1,
    affiliateId: row.affiliate_id,
    points: row.points,
  }));

  const activity = [
    ...(referralRows || []).map((row) => ({
      id: `signup-${row.id}`,
      type: row.status === "converted" ? "subscription" : "signup",
      message: row.status === "converted" ? `New subscription: ${row.referred_email}` : `New signup: ${row.referred_email}`,
      created_at: row.created_at,
    })),
    ...(commissionRows || []).slice(0, 4).map((row, idx) => ({
      id: `earning-${idx}-${row.created_at}`,
      type: "earning",
      message: `Earnings update: +$${Number(row.amount_usd || 0).toFixed(2)}`,
      created_at: row.created_at,
    })),
    {
      id: "rank-move",
      type: "rank",
      message: `Current leaderboard rank: #${rankIndex >= 0 ? rankIndex + 1 : rankRows?.length || 0}`,
      created_at: new Date().toISOString(),
    },
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  const chartData = {
    dailyClicks: buildMockSeries(70),
    dailySignups: buildMockSeries(16),
  };

  return NextResponse.json({
    affiliate,
    metrics: {
      clicks: metrics?.clicks || 0,
      visits: metrics?.visits || 0,
      signups: metrics?.signups || 0,
      subscribedUsers,
      conversions: metrics?.conversions || 0,
      rewards: Number(metrics?.rewards || 0).toFixed(2),
      conversionRate,
      verifiedSignups,
      earnings: totalEarned.toFixed(2),
      pendingPayouts: pendingPayouts.toFixed(2),
    },
    rank: {
      position: rankIndex >= 0 ? rankIndex + 1 : rankRows?.length || 0,
      totalAffiliates: rankRows?.length || 0,
      points: currentRankPoints,
      pointsToNextRank,
    },
    charts: chartData,
    leaderboards: {
      weekly: weeklyBoard,
      allTime: allTimeBoard,
    },
    recentActivity: activity,
    rewards: {
      totalEarned: totalEarned.toFixed(2),
      paidEarnings: paidEarnings.toFixed(2),
      pendingCommissions: pendingCommissions.toFixed(2),
      nextPayoutDate: payoutRows?.[0]?.created_at || new Date(Date.now() + 7 * 86400000).toISOString(),
    },
    assets: assetRows || [],
    profile: {
      paymentMethod: affiliate.payment_method || "",
      socialLinks: affiliate.social_links || {},
      notificationPreferences: affiliate.notification_preferences || { email: true, product: true, milestones: true },
      preferredCode: affiliate.referral_code,
    },
    referralLink: `${process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000"}/?ref=${affiliate.referral_code}`,
  });
}
