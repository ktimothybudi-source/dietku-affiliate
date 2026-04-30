import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function DELETE(_request, { params }) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from("affiliates").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
