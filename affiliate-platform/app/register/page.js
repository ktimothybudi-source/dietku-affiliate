"use client";

import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [codeAvailability, setCodeAvailability] = useState(null);
  const [status, setStatus] = useState("");

  async function checkCodeAvailability(code) {
    if (!code || code.length < 4) {
      setCodeAvailability(null);
      return;
    }
    const res = await fetch(`/api/affiliates/code-availability?code=${encodeURIComponent(code)}`);
    const payload = await res.json();
    setCodeAvailability(Boolean(payload.available));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("Creating account...");
    const res = await fetch("/api/affiliates/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, username, customCode }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setStatus(payload.error || "Failed to register.");
      return;
    }
    setStatus(`Registered. Your referral code: ${payload.affiliate.referral_code}`);
  }

  return (
    <>
      <SiteHeader />
      <main className="container">
        <section className="card" style={{ maxWidth: 620, margin: "0 auto" }}>
          <h2>Affiliate Registration</h2>
          <p className="muted">Pick your own custom affiliate code and build your referral leaderboard streak.</p>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              style={{ padding: 12, borderRadius: 14, border: "1px solid var(--border)" }}
              required
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              style={{ padding: 12, borderRadius: 14, border: "1px solid var(--border)" }}
              required
            />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              style={{ padding: 12, borderRadius: 14, border: "1px solid var(--border)" }}
              required
            />
            <input
              value={customCode}
              onChange={(e) => {
                const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                setCustomCode(value);
                checkCodeAvailability(value);
              }}
              placeholder="Custom affiliate code (e.g. JOHNVIP)"
              style={{ padding: 12, borderRadius: 14, border: "1px solid var(--border)" }}
              required
            />
            {customCode ? (
              <p className="muted" style={{ margin: 0, color: codeAvailability ? "var(--primary)" : "var(--danger)" }}>
                {codeAvailability ? "Code available." : "Code unavailable or not valid yet."}
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary">Register Affiliate</button>
          </form>
          {status ? <p style={{ marginTop: 14 }}>{status}</p> : null}
        </section>
      </main>
    </>
  );
}
