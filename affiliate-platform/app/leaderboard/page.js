"use client";

import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";

export default function LeaderboardPage() {
  const [windowScope, setWindowScope] = useState("all");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch(`/api/leaderboard?window=${windowScope}`)
      .then((res) => res.json())
      .then((data) => setRows(data.rows || []));
  }, [windowScope]);

  return (
    <>
      <SiteHeader />
      <main className="container">
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Public Leaderboard</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {["weekly", "monthly", "all"].map((item) => (
              <button
                key={item}
                className={`btn ${item === windowScope ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setWindowScope(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left">Rank</th>
                  <th align="left">Affiliate</th>
                  <th align="left">Sign-ups</th>
                  <th align="left">Conversions</th>
                  <th align="left">Points</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id}>
                    <td style={{ padding: "0.5rem 0" }}>#{index + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.signups}</td>
                    <td>{row.conversions}</td>
                    <td>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
