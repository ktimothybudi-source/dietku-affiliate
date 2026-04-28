import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request) {
  const supabaseAdmin = getSupabaseAdmin();
  const code = request.nextUrl.searchParams.get("code")?.toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "Code is required." }, { status: 400 });
  }

  const { data: affiliate, error: affiliateError } = await supabaseAdmin
    .from("affiliates")
    .select("id,name,referral_code")
    .eq("referral_code", code)
    .single();

  if (affiliateError || !affiliate) {
    return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
  }

  const { data: metrics } = await supabaseAdmin
    .from("affiliate_metrics")
    .select("clicks,visits,signups,conversions,rewards")
    .eq("affiliate_id", affiliate.id)
    .single();

  const { data: rankRows } = await supabaseAdmin
    .from("affiliate_metrics")
    .select("affiliate_id,points")
    .order("points", { ascending: false });

  const rankIndex = rankRows?.findIndex((row) => row.affiliate_id === affiliate.id) ?? -1;

  return NextResponse.json({
    affiliate,
    metrics: metrics || { clicks: 0, visits: 0, signups: 0, conversions: 0, rewards: 0 },
    rank: {
      position: rankIndex >= 0 ? rankIndex + 1 : rankRows?.length || 0,
      totalAffiliates: rankRows?.length || 0,
    },
    referralLink: `${process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000"}/?ref=${affiliate.referral_code}`,
  });
}
