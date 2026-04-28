import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { generateReferralCode } from "@/lib/referral";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, name } = schema.parse(body);
    const referralCode = generateReferralCode(email);

    const { data, error } = await supabaseAdmin
      .from("affiliates")
      .insert({
        email,
        name,
        referral_code: referralCode,
        role: "affiliate",
      })
      .select("id,name,email,referral_code")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ affiliate: data });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Registration failed." }, { status: 400 });
  }
}
