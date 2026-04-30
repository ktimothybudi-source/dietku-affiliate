import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateReferralCode } from "@/lib/referral";

const schema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  name: z
    .string()
    .trim()
    .min(2, "Please enter your full name.")
    .max(80, "Name is too long.")
    .regex(/^[A-Za-z][A-Za-z\s'.-]*$/, "Name can only contain letters, spaces, apostrophes, periods, and hyphens."),
  customCode: z
    .string()
    .trim()
    .min(4, "Affiliate code must be at least 4 characters.")
    .max(12, "Affiliate code must be at most 12 characters.")
    .regex(/^[a-zA-Z0-9]+$/, "Affiliate code can only contain letters and numbers."),
});

function getReadableValidationError(error) {
  const issue = error.issues?.[0];
  if (!issue) {
    return "Invalid registration data.";
  }

  const field = issue.path?.[0];
  if (field === "name" && issue.code === "invalid_string") {
    return "Name can only contain letters, spaces, apostrophes, periods, and hyphens.";
  }
  if (field === "customCode" && issue.code === "invalid_string") {
    return "Affiliate code can only contain letters and numbers.";
  }
  return issue.message || "Invalid registration data.";
}

export async function POST(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await request.json();
    const { email, name, customCode } = schema.parse(body);
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
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: getReadableValidationError(error) }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || "Registration failed." }, { status: 400 });
  }
}
