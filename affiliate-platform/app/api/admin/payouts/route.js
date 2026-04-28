import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  code: z.string().min(6),
  amount: z.number().positive(),
});

export async function POST(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = schema.parse(await request.json());
    const { data: affiliate, error: affiliateError } = await supabaseAdmin
      .from("affiliates")
      .select("id")
      .eq("referral_code", body.code.toUpperCase())
      .single();

    if (affiliateError || !affiliate) {
      return NextResponse.json({ error: "Affiliate code not found." }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from("payouts")
      .insert({
        affiliate_id: affiliate.id,
        amount_usd: body.amount,
        status: "pending",
      })
      .select("id,amount_usd,status")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ payout: data });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Payout creation failed." }, { status: 400 });
  }
}
