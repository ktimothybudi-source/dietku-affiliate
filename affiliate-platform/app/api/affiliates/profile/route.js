import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  code: z.string().min(4),
  username: z.string().min(3).max(24).optional(),
  preferredCode: z.string().min(4).max(12).regex(/^[a-zA-Z0-9]+$/).optional(),
  paymentMethod: z.string().optional(),
  paymentDetails: z.string().optional(),
  socialLinks: z.object({
    instagram: z.string().optional(),
    tiktok: z.string().optional(),
    youtube: z.string().optional(),
    x: z.string().optional(),
  }).optional(),
  notificationPreferences: z.object({
    email: z.boolean().optional(),
    product: z.boolean().optional(),
    milestones: z.boolean().optional(),
  }).optional(),
});

export async function PATCH(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = schema.parse(await request.json());
    const currentCode = body.code.toUpperCase();
    const preferredCode = body.preferredCode?.toUpperCase();

    const { data: affiliate } = await supabaseAdmin
      .from("affiliates")
      .select("id,referral_code")
      .eq("referral_code", currentCode)
      .single();

    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }

    if (preferredCode && preferredCode !== affiliate.referral_code) {
      const { data: existingCode } = await supabaseAdmin
        .from("affiliates")
        .select("id")
        .eq("referral_code", preferredCode)
        .maybeSingle();
      if (existingCode) {
        return NextResponse.json({ error: "Preferred code already taken." }, { status: 409 });
      }
    }

    const payload = {
      username: body.username,
      referral_code: preferredCode || affiliate.referral_code,
      payment_method: body.paymentMethod,
      payment_details: body.paymentDetails,
      social_links: body.socialLinks,
      notification_preferences: body.notificationPreferences,
    };

    const { data, error } = await supabaseAdmin
      .from("affiliates")
      .update(payload)
      .eq("id", affiliate.id)
      .select("id,name,username,email,referral_code,payment_method,social_links,notification_preferences")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Profile update failed." }, { status: 400 });
  }
}
