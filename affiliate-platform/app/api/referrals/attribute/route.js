import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  referralCode: z.string().min(6),
  referredUserId: z.string().uuid(),
  referredEmail: z.string().email(),
  ipAddress: z.string().min(3),
  userAgent: z.string().min(3),
});

export async function POST(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const payload = schema.parse(await request.json());

    const { data: affiliate, error: affiliateError } = await supabaseAdmin
      .from("affiliates")
      .select("id,email,referral_code")
      .eq("referral_code", payload.referralCode.toUpperCase())
      .single();

    if (affiliateError || !affiliate) {
      return NextResponse.json({ error: "Invalid referral code." }, { status: 404 });
    }

    if (affiliate.email === payload.referredEmail) {
      return NextResponse.json({ error: "Self-referrals are not allowed." }, { status: 400 });
    }

    const { data: duplicate } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("referred_user_id", payload.referredUserId)
      .maybeSingle();

    if (duplicate) {
      return NextResponse.json({ error: "User already attributed to an affiliate." }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("referrals")
      .insert({
        affiliate_id: affiliate.id,
        referred_user_id: payload.referredUserId,
        referred_email: payload.referredEmail,
        ip_address: payload.ipAddress,
        user_agent: payload.userAgent,
      })
      .select("id,affiliate_id,referred_user_id,status")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ referral: data });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Attribution failed." }, { status: 400 });
  }
}
