"use client";

import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import MetricCard from "@/components/MetricCard";

export default function AdminPage() {
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [overview, setOverview] = useState(null);

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

  async function loadOverview() {
    const res = await fetch("/api/admin/overview");
    const payload = await res.json();
    if (res.ok) setOverview(payload.totals);
  }

  return (
    <>
      <SiteHeader />
      <main className="container" style={{ display: "grid", gap: 12 }}>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Admin Controls</h2>
          <button className="btn btn-primary" onClick={loadOverview}>Refresh Growth Metrics</button>
          {overview ? (
            <div className="dashboard-grid" style={{ marginTop: 12 }}>
              <MetricCard title="Affiliates" value={overview.affiliates} />
              <MetricCard title="Referrals" value={overview.referrals} />
              <MetricCard title="Payout Records" value={overview.payouts} />
              <MetricCard title="Total Clicks" value={overview.totalClicks} />
              <MetricCard title="Conversions" value={overview.totalConversions} />
              <MetricCard title="Total Rewards" value={`$${overview.totalRewards}`} />
            </div>
          ) : null}
        </section>

        <section className="card" style={{ maxWidth: 640 }}>
          <h2 style={{ marginTop: 0 }}>Admin Panel</h2>
          <p className="muted">Manage affiliates, payouts, and fraud checks from one place.</p>
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
