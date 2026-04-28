"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SiteHeader from "@/components/SiteHeader";
import MetricCard from "@/components/MetricCard";

export default function DashboardPage() {
  const [affiliateCode, setAffiliateCode] = useState("");
  const [leaderboardTab, setLeaderboardTab] = useState("weekly");
  const [savingProfile, setSavingProfile] = useState(false);
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

  async function updateProfile(e) {
    e.preventDefault();
    if (!data) return;
    setSavingProfile(true);
    const res = await fetch("/api/affiliates/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: data.affiliate.referral_code,
        username: data.profile.username,
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

  const leaderboardRows = data?.leaderboards?.[leaderboardTab] || [];

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
            <section className="dashboard-grid">
              <MetricCard title="Clicks" value={data.metrics.clicks} />
              <MetricCard title="Unique Visitors" value={data.metrics.visits} />
              <MetricCard title="Sign-ups" value={data.metrics.signups} />
              <MetricCard title="Verified Sign-ups" value={data.metrics.verifiedSignups} />
              <MetricCard title="Conversion Rate" value={`${data.metrics.conversionRate}%`} />
              <MetricCard title="Earnings" value={`$${data.metrics.earnings}`} />
              <MetricCard title="Pending Payouts" value={`$${data.metrics.pendingPayouts}`} />
              <MetricCard title="Your Rank" value={`#${data.rank.position}`} subtitle={`of ${data.rank.totalAffiliates} affiliates`} />
            </section>

            <section className="card dashboard-two-col">
              <div>
                <h3 style={{ marginTop: 0 }}>Referral Tools</h3>
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
                    <button className="btn btn-primary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(data.referralLink)}`, "_blank")}>WhatsApp</button>
                    <button className="btn btn-ghost" onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(data.referralLink)}`, "_blank")}>X</button>
                    <button className="btn btn-ghost" onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.referralLink)}`, "_blank")}>Facebook</button>
                  </div>
                  <div className="qr-wrap">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(data.referralLink)}`}
                      alt="Referral QR"
                    />
                  </div>
                </div>
              </div>
              <div>
                <h3 style={{ marginTop: 0 }}>Live Rank Status</h3>
                <p className="muted">Distance to next rank</p>
                <p style={{ fontSize: 32, margin: "0 0 1rem", fontWeight: 800 }}>{data.rank.pointsToNextRank} pts</p>
                <p className="muted">Current points: {data.rank.points}</p>
              </div>
            </section>

            <section className="card">
              <h3 style={{ marginTop: 0 }}>Analytics</h3>
              <div className="analytics-grid">
                <div className="chart-card">
                  <p className="muted">Daily Clicks</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={data.charts.dailyClicks}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="value" stroke="#22C55E" fill="#22C55E33" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-card">
                  <p className="muted">Daily Sign-ups</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data.charts.dailySignups}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="#6366F1" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-card">
                  <p className="muted">Conversion Rate Over Time</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data.charts.conversionRate}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="#F59E0B" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-card">
                  <p className="muted">Earnings Over Time</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={data.charts.earnings}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="value" stroke="#06B6D4" fill="#06B6D433" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="card dashboard-two-col">
              <div>
                <h3 style={{ marginTop: 0 }}>Leaderboard</h3>
                <div className="inline-row" style={{ marginBottom: 10 }}>
                  {["weekly", "monthly", "allTime"].map((scope) => (
                    <button
                      key={scope}
                      className={`btn ${leaderboardTab === scope ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setLeaderboardTab(scope)}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rank</th><th>Points</th><th>Badge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardRows.map((row) => (
                      <tr key={`${leaderboardTab}-${row.rank}-${row.affiliateId}`}>
                        <td>#{row.rank}</td>
                        <td>{row.points}</td>
                        <td><span className="badge">{row.badge}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 style={{ marginTop: 0 }}>Recent Activity Feed</h3>
                <div className="stack">
                  {data.recentActivity.length ? data.recentActivity.map((item) => (
                    <div key={item.id} className="activity-item">
                      <p style={{ margin: 0, fontWeight: 600 }}>{item.message}</p>
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  )) : (
                    <p className="muted">No activity yet.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="card dashboard-three-col">
              <div>
                <h3 style={{ marginTop: 0 }}>Rewards & Payouts</h3>
                <p className="muted">Total earned: ${data.rewards.totalEarned}</p>
                <p className="muted">Paid earnings: ${data.rewards.paidEarnings}</p>
                <p className="muted">Pending commissions: ${data.rewards.pendingCommissions}</p>
                <p className="muted">Next payout date: {new Date(data.rewards.nextPayoutDate).toLocaleDateString()}</p>
              </div>
              <div>
                <h3 style={{ marginTop: 0 }}>Milestones</h3>
                {data.rewards.milestones.map((m) => {
                  const pct = Math.min(100, Math.round((m.progress / m.goal) * 100));
                  return (
                    <div key={m.name} style={{ marginBottom: 12 }}>
                      <p style={{ margin: "0 0 6px", fontSize: 13 }}>{m.name}</p>
                      <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
              <div>
                <h3 style={{ marginTop: 0 }}>Marketing Assets</h3>
                <div className="stack">
                  {data.assets.map((asset) => (
                    <a key={asset.id} className="asset-link" href={asset.file_url} target="_blank">
                      <strong>{asset.title}</strong>
                      <span className="muted">{asset.asset_type}</span>
                    </a>
                  ))}
                </div>
              </div>
            </section>

            <section className="card">
              <h3 style={{ marginTop: 0 }}>Profile Settings</h3>
              <form className="settings-grid" onSubmit={updateProfile}>
                <input
                  className="input"
                  placeholder="Username"
                  value={data.profile.username || ""}
                  onChange={(e) => setData((prev) => ({ ...prev, profile: { ...prev.profile, username: e.target.value } }))}
                />
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
