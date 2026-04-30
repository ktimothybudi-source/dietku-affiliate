import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

function buildSuggestions(base) {
  const clean = base.replace(/[^A-Z0-9]/g, "").slice(0, 8) || "AFFILIATE";
  return [
    `${clean}VIP`,
    `${clean}PRO`,
    `${clean}01`,
    `${clean}${Math.floor(Math.random() * 90 + 10)}`,
  ];
}

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

  const available = !data;
  return NextResponse.json({
    available,
    suggestions: available ? [] : buildSuggestions(code),
  });
}
