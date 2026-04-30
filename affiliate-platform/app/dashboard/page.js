"use client";

import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import MetricCard from "@/components/MetricCard";

export default function DashboardPage() {
  const [identifier, setIdentifier] = useState("");
  const [rankingScope, setRankingScope] = useState("weekly");
  const [savingProfile, setSavingProfile] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function loadDashboard(e) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/dashboard?identifier=${encodeURIComponent(identifier)}`);
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || "Unable to load dashboard.");
      return;
    }
    setData(payload);
  }

  async function updateProfile(e) {
    e.preventDefault();
    if (!data) return;
    setSavingProfile(true);
    const res = await fetch("/api/affiliates/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: data.affiliate.referral_code,
        preferredCode: data.profile.preferredCode,
        paymentMethod: data.profile.paymentMethod,
      }),
    });
    const payload = await res.json();
    setSavingProfile(false);
    if (!res.ok) {
      setError(payload.error || "Failed to update profile.");
      return;
    }
    setData((prev) => ({ ...prev, profile: { ...prev.profile, ...payload.profile } }));
  }

  function copy(text) {
    navigator.clipboard.writeText(text);
  }

  const leaderboardRows = data?.leaderboards?.[rankingScope] || [];

  return (
    <>
      <SiteHeader />
      <main className="container" style={{ display: "grid", gap: "1rem", paddingBottom: "2rem" }}>
        <section className="card">
          <h2 className="page-headline">Affiliate Dashboard</h2>
          <p className="page-subtitle">Track performance, optimize your link, and climb the leaderboard.</p>
          <form onSubmit={loadDashboard} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Login with referral code or email"
              style={{ flex: 1, minWidth: 220, padding: 12, borderRadius: 12, border: "1px solid var(--border)" }}
              required
            />
            <button className="btn btn-primary" type="submit">Load Dashboard</button>
          </form>
          {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        </section>

        {data ? (
          <>
            <section className="dashboard-grid">
              <MetricCard title="Clicks" value={data.metrics.clicks} />
              <MetricCard title="Sign-ups" value={data.metrics.signups} />
              <MetricCard title="Subscribed Users" value={data.metrics.subscribedUsers} />
              <MetricCard title="Conversion Rate" value={`${data.metrics.conversionRate}%`} />
              <MetricCard title="Earnings" value={`$${data.metrics.earnings}`} />
              <MetricCard title="Current Rank" value={`#${data.rank.position}`} subtitle={`of ${data.rank.totalAffiliates}`} />
            </section>

            <section className="card dashboard-two-col">
              <div>
                <h3 className="page-headline" style={{ fontSize: "1.25rem" }}>Referral Tools</h3>
                <div className="stack">
                  <label className="muted">Custom code</label>
                  <input
                    value={data.profile.preferredCode}
                    onChange={(e) =>
                      setData((prev) => ({ ...prev, profile: { ...prev.profile, preferredCode: e.target.value.toUpperCase() } }))
                    }
                    className="input"
                  />
                  <label className="muted">Personal link</label>
                  <div className="inline-row">
                    <input value={data.referralLink} readOnly className="input" />
                    <button className="btn btn-ghost" onClick={() => copy(data.referralLink)}>Copy</button>
                  </div>
                  <div className="inline-row">
                    <button className="btn btn-primary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(data.referralLink)}`, "_blank")}>Share WhatsApp</button>
                    <button className="btn btn-ghost" onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(data.referralLink)}`, "_blank")}>Share X</button>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="page-headline" style={{ fontSize: "1.25rem" }}>Live Rank Status</h3>
                <p className="muted">Distance to next rank</p>
                <p style={{ fontSize: 32, margin: "0 0 1rem", fontWeight: 800 }}>{data.rank.pointsToNextRank} pts</p>
                <p className="muted">Current points: {data.rank.points}</p>
              </div>
            </section>

            <section className="card dashboard-two-col">
              <div>
                <h3 className="page-headline" style={{ fontSize: "1.25rem" }}>Leaderboard</h3>
                <div className="inline-row" style={{ marginBottom: 12 }}>
                  {["weekly", "allTime"].map((scope) => (
                    <button
                      key={scope}
                      className={`btn ${rankingScope === scope ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setRankingScope(scope)}
                    >
                      {scope === "allTime" ? "All-time" : "Weekly"}
                    </button>
                  ))}
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rank</th><th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardRows.map((row) => (
                      <tr key={`${rankingScope}-${row.rank}-${row.affiliateId}`}>
                        <td>#{row.rank}</td>
                        <td>{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="page-headline" style={{ fontSize: "1.25rem" }}>Recent Activity</h3>
                <div className="stack">
                  {data.recentActivity.map((item) => (
                    <div className="activity-item" key={item.id}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{item.message}</p>
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="card dashboard-two-col">
              <div>
                <h3 className="page-headline" style={{ fontSize: "1.25rem" }}>Rewards & Payouts</h3>
                <p className="muted">Total earned: ${data.rewards.totalEarned}</p>
                <p className="muted">Paid earnings: ${data.rewards.paidEarnings}</p>
                <p className="muted">Pending commissions: ${data.rewards.pendingCommissions}</p>
                <p className="muted">Pending payouts: ${data.metrics.pendingPayouts}</p>
                <p className="muted">Next payout date: {new Date(data.rewards.nextPayoutDate).toLocaleDateString()}</p>
              </div>
              <div>
                <h3 className="page-headline" style={{ fontSize: "1.25rem" }}>Quick Trend</h3>
                <p className="muted">Daily clicks snapshot</p>
                <div className="stack">
                  {data.charts.dailyClicks.slice(-6).map((row) => (
                    <div key={row.date} className="inline-row" style={{ justifyContent: "space-between" }}>
                      <span className="muted">{row.date}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="card">
              <h3 className="page-headline" style={{ fontSize: "1.25rem" }}>Profile Settings</h3>
              <form className="settings-grid" onSubmit={updateProfile}>
                <input
                  className="input"
                  placeholder="Preferred custom code"
                  value={data.profile.preferredCode || ""}
                  onChange={(e) =>
                    setData((prev) => ({ ...prev, profile: { ...prev.profile, preferredCode: e.target.value.toUpperCase() } }))
                  }
                />
                <input
                  className="input"
                  placeholder="Payment method"
                  value={data.profile.paymentMethod || ""}
                  onChange={(e) => setData((prev) => ({ ...prev, profile: { ...prev.profile, paymentMethod: e.target.value } }))}
                />
                <button className="btn btn-primary" type="submit">{savingProfile ? "Saving..." : "Save Settings"}</button>
              </form>
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}
