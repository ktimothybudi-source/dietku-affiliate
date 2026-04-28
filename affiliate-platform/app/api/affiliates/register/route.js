import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateReferralCode } from "@/lib/referral";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  customCode: z.string().min(4).max(12).regex(/^[a-zA-Z0-9]+$/),
});

export async function POST(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await request.json();
    const { email, name, username, customCode } = schema.parse(body);
    const referralCode = customCode.toUpperCase() || generateReferralCode(email);

    const { data: existingCode } = await supabaseAdmin
      .from("affiliates")
      .select("id")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (existingCode) {
      return NextResponse.json({ error: "Code already taken. Please choose another." }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("affiliates")
      .insert({
        email,
        name,
        username,
        referral_code: referralCode,
        role: "affiliate",
      })
      .select("id,name,username,email,referral_code")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ affiliate: data });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Registration failed." }, { status: 400 });
  }
}
