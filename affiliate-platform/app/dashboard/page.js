"use client";

import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import MetricCard from "@/components/MetricCard";

export default function DashboardPage() {
  const [affiliateCode, setAffiliateCode] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function loadDashboard(e) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/dashboard?code=${encodeURIComponent(affiliateCode)}`);
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || "Unable to load dashboard.");
      return;
    }
    setData(payload);
  }

  return (
    <>
      <SiteHeader />
      <main className="container" style={{ display: "grid", gap: "1rem", paddingBottom: "2rem" }}>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Affiliate Dashboard</h2>
          <form onSubmit={loadDashboard} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={affiliateCode}
              onChange={(e) => setAffiliateCode(e.target.value.toUpperCase())}
              placeholder="Enter your referral code"
              style={{ flex: 1, minWidth: 220, padding: 12, borderRadius: 12, border: "1px solid var(--border)" }}
              required
            />
            <button className="btn btn-primary" type="submit">Load Dashboard</button>
          </form>
          {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        </section>

        {data ? (
          <>
            <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <MetricCard title="Clicks" value={data.metrics.clicks} />
              <MetricCard title="Visits" value={data.metrics.visits} />
              <MetricCard title="Sign-ups" value={data.metrics.signups} />
              <MetricCard title="Conversions" value={data.metrics.conversions} />
              <MetricCard title="Rewards" value={`$${data.metrics.rewards}`} />
              <MetricCard title="Your Rank" value={`#${data.rank.position}`} subtitle={`of ${data.rank.totalAffiliates} affiliates`} />
            </section>

            <section className="card">
              <h3 style={{ marginTop: 0 }}>Your Referral Link</h3>
              <p className="muted">
                {data.referralLink}
              </p>
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}
