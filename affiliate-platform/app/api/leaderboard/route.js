import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getWindowStart } from "@/lib/referral";

export async function GET(request) {
  const supabaseAdmin = getSupabaseAdmin();
  const windowScope = request.nextUrl.searchParams.get("window") || "all";
  const start = getWindowStart(windowScope);

  let query = supabaseAdmin
    .from("affiliate_metrics")
    .select("affiliate_id,signups,conversions,points,affiliates(name)")
    .order("points", { ascending: false })
    .limit(50);

  if (start) {
    query = query.gte("period_start", start);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data || []).map((item) => ({
    id: item.affiliate_id,
    name: item.affiliates?.name || "Affiliate",
    signups: item.signups ?? 0,
    conversions: item.conversions ?? 0,
    points: item.points ?? 0,
  }));

  return NextResponse.json({ rows });
}
