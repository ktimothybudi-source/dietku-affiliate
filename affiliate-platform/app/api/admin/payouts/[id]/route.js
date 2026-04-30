import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(request, { params }) {
  const supabaseAdmin = getSupabaseAdmin();
  const body = await request.json();
  const status = body?.status;

  if (!["pending", "approved", "paid", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "Invalid payout status." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("payouts")
    .update({ status })
    .eq("id", params.id)
    .select("id,status,amount_usd")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ payout: data });
}
