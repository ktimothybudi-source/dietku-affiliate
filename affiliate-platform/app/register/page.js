"use client";

import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("Creating account...");
    const res = await fetch("/api/affiliates/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
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
          <p className="muted">Get a unique referral code and dashboard access.</p>
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
            <button type="submit" className="btn btn-primary">Register Affiliate</button>
          </form>
          {status ? <p style={{ marginTop: 14 }}>{status}</p> : null}
        </section>
      </main>
    </>
  );
}
