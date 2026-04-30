"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function SiteHeader() {
  const [mode, setMode] = useState("dark");

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  return (
    <header className="container" style={{ padding: "1rem 0" }}>
      <nav
        className="card"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}
      >
        <div>
          <div style={{ fontSize: 23, fontWeight: 800 }}>DietKu Affiliates</div>
          <p className="page-subtitle" style={{ marginTop: 2 }}>Referral dashboard</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/">Home</Link>
          <Link href="/register">Register</Link>
          <Link href="/dashboard">Dashboard</Link>
          <button className="btn btn-ghost" onClick={() => setMode((m) => (m === "light" ? "dark" : "light"))}>
            {mode === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </nav>
    </header>
  );
}
