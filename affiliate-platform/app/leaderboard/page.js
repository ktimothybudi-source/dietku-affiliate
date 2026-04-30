"use client";

import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";

export default function LeaderboardPage() {
  const [windowScope, setWindowScope] = useState("all");
  const [rows, setRows] = useState([]);
  const [myCode, setMyCode] = useState("");
  const [myRank, setMyRank] = useState(null);

  useEffect(() => {
    fetch(`/api/leaderboard?window=${windowScope}`)
      .then((res) => res.json())
      .then((data) => setRows(data.rows || []));
  }, [windowScope]);

  function checkMyRank() {
    const idx = rows.findIndex((row) => row.code === myCode.toUpperCase());
    if (idx < 0) {
      setMyRank(null);
      return;
    }
    const next = rows[idx - 1];
    setMyRank({
      position: idx + 1,
      points: rows[idx].points,
      distance: next ? next.points - rows[idx].points + 1 : 0,
    });
  }

  return (
    <>
      <SiteHeader />
      <main className="container">
        <section className="card">
          <h2 className="page-headline">Public Leaderboard</h2>
          <p className="page-subtitle">See top performers and measure how far you are from the next tier.</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {["weekly", "all"].map((item) => (
              <button
                key={item}
                className={`btn ${item === windowScope ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setWindowScope(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="inline-row" style={{ marginBottom: 12 }}>
            <input
              className="input"
              placeholder="Enter your affiliate code to check rank"
              value={myCode}
              onChange={(e) => setMyCode(e.target.value)}
            />
            <button className="btn btn-primary" onClick={checkMyRank}>Check Rank</button>
          </div>
          {myRank ? (
            <p className="muted">
              You are #{myRank.position} with {myRank.points} points. {myRank.distance} points to next rank.
            </p>
          ) : null}

          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th align="left">Rank</th>
                  <th align="left">Affiliate</th>
                  <th align="left">Code</th>
                  <th align="left">Sign-ups</th>
                  <th align="left">Conversions</th>
                  <th align="left">Points</th>
                  <th align="left">Badge</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id}>
                    <td style={{ padding: "0.5rem 0" }}>#{index + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.code}</td>
                    <td>{row.signups}</td>
                    <td>{row.conversions}</td>
                    <td>{row.points}</td>
                    <td><span className="badge">{index === 0 ? "Legend" : index < 3 ? "Elite" : "Pro"}</span></td>
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
