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

  async function approvePayout(id) {
    const res = await fetch(`/api/admin/payouts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    if (res.ok) {
      setStatus("Payout approved.");
      loadOverview();
    }
  }

  async function removeFraudAffiliate(id) {
    const res = await fetch(`/api/admin/affiliates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setStatus("Affiliate removed.");
      loadOverview();
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="container" style={{ display: "grid", gap: 12 }}>
        <section className="card">
          <h2 className="page-headline">Admin Controls</h2>
          <p className="page-subtitle">Monitor growth, payouts, and platform health in one command center.</p>
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

        {overview ? (
          <>
            <section className="card">
              <h3 className="page-headline" style={{ fontSize: "1.2rem" }}>Manage Affiliates</h3>
              <div className="stack">
                {overview.affiliates?.slice(0, 12).map((item) => (
                  <div key={item.id} className="inline-row" style={{ justifyContent: "space-between" }}>
                    <span>{item.name} ({item.referral_code})</span>
                    <button className="btn btn-ghost" onClick={() => removeFraudAffiliate(item.id)}>Remove Fraud User</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <h3 className="page-headline" style={{ fontSize: "1.2rem" }}>Track Referrals</h3>
              <div className="stack">
                {overview.referrals?.slice(0, 12).map((row) => (
                  <div key={row.id} className="inline-row" style={{ justifyContent: "space-between" }}>
                    <span>{row.referred_email}</span>
                    <span className="muted">{row.status}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <h3 className="page-headline" style={{ fontSize: "1.2rem" }}>Approve Payouts</h3>
              <div className="stack">
                {overview.pendingPayouts?.length ? overview.pendingPayouts.slice(0, 12).map((payout) => (
                  <div key={payout.id} className="inline-row" style={{ justifyContent: "space-between" }}>
                    <span>${Number(payout.amount_usd || 0).toFixed(2)}</span>
                    <button className="btn btn-primary" onClick={() => approvePayout(payout.id)}>Approve</button>
                  </div>
                )) : <p className="muted">No pending payouts.</p>}
              </div>
            </section>
          </>
        ) : null}

        <section className="card" style={{ maxWidth: 640 }}>
          <h2 className="page-headline">Admin Panel</h2>
          <p className="page-subtitle">Manage affiliates, payouts, and fraud checks from one place.</p>
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
