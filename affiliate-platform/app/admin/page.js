"use client";

import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";

export default function AdminPage() {
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");

  async function createPayout(e) {
    e.preventDefault();
    setStatus("Processing...");
    const res = await fetch("/api/admin/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, amount: Number(amount) }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setStatus(payload.error || "Failed to create payout.");
      return;
    }
    setStatus(`Payout queued for ${payload.payout.amount_usd} USD.`);
  }

  return (
    <>
      <SiteHeader />
      <main className="container">
        <section className="card" style={{ maxWidth: 640 }}>
          <h2 style={{ marginTop: 0 }}>Admin Panel</h2>
          <p className="muted">Manage payouts and rankings from one place.</p>
          <form onSubmit={createPayout} style={{ display: "grid", gap: 10 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Affiliate code"
              required
              style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)" }}
            />
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              min="1"
              placeholder="Payout amount (USD)"
              required
              style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)" }}
            />
            <button className="btn btn-primary" type="submit">Queue Payout</button>
          </form>
          {status ? <p>{status}</p> : null}
        </section>
      </main>
    </>
  );
}
