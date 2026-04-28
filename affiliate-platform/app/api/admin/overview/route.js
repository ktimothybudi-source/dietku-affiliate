import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();

  const [{ count: affiliates }, { count: referrals }, { count: payouts }, { data: metricsRows }] = await Promise.all([
    supabaseAdmin.from("affiliates").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("referrals").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("payouts").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("affiliate_metrics").select("clicks,conversions,rewards"),
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
  });
}
