import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request) {
  const code = request.nextUrl.searchParams.get("code")?.toUpperCase();
  if (!code) {
    return NextResponse.json({ available: false, error: "Code is required." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("affiliates")
    .select("id")
    .eq("referral_code", code)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ available: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ available: !data });
}
