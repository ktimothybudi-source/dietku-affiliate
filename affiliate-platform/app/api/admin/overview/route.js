import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();

  const [{ count: affiliates }, { count: referrals }, { count: payouts }, { data: metricsRows }, { data: affiliatesRows }, { data: referralRows }, { data: pendingPayouts }] = await Promise.all([
    supabaseAdmin.from("affiliates").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("referrals").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("payouts").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("affiliate_metrics").select("clicks,conversions,rewards"),
    supabaseAdmin.from("affiliates").select("id,name,email,referral_code,created_at").order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("referrals").select("id,affiliate_id,referred_email,status,created_at").order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("payouts").select("id,affiliate_id,amount_usd,status,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(50),
  ]);

  const totalClicks = (metricsRows || []).reduce((sum, row) => sum + Number(row.clicks || 0), 0);
  const totalConversions = (metricsRows || []).reduce((sum, row) => sum + Number(row.conversions || 0), 0);
  const totalRewards = (metricsRows || []).reduce((sum, row) => sum + Number(row.rewards || 0), 0).toFixed(2);

  return NextResponse.json({
    totals: {
      affiliates: affiliates || 0,
      referrals: referrals || 0,
      payouts: payouts || 0,
      totalClicks,
      totalConversions,
      totalRewards,
    },
    affiliates: affiliatesRows || [],
    referrals: referralRows || [],
    pendingPayouts: pendingPayouts || [],
  });
}
