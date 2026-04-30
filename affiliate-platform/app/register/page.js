"use client";

import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [codeAvailability, setCodeAvailability] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState("");

  function getErrorMessage(errorPayload) {
    if (!errorPayload) return "Failed to register.";
    if (typeof errorPayload.error === "string") return errorPayload.error;
    if (Array.isArray(errorPayload.error) && errorPayload.error[0]?.message) {
      return errorPayload.error[0].message;
    }
    return "Please check your input and try again.";
  }

  async function checkCodeAvailability(code) {
    if (!code || code.length < 4) {
      setCodeAvailability(null);
      return;
    }
    const res = await fetch(`/api/affiliates/code-availability?code=${encodeURIComponent(code)}`);
    const payload = await res.json();
    setCodeAvailability(Boolean(payload.available));
    setSuggestions(payload.suggestions || []);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("Creating account...");
    const res = await fetch("/api/affiliates/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, customCode }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setStatus(getErrorMessage(payload));
      return;
    }
    setStatus(`Registered. Your referral code: ${payload.affiliate.referral_code}`);
  }

  return (
    <>
      <SiteHeader />
      <main className="container">
        <section className="card" style={{ maxWidth: 620, margin: "0 auto" }}>
          <h2 className="page-headline">Affiliate Registration</h2>
          <p className="page-subtitle">Create your account and lock in a unique code for your referral campaigns.</p>
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
              <>
                <p className="muted" style={{ margin: 0, color: codeAvailability ? "var(--primary)" : "var(--danger)" }}>
                  {codeAvailability ? "Code available." : "Code unavailable."}
                </p>
                {!codeAvailability && suggestions.length ? (
                  <div className="inline-row">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          setCustomCode(suggestion);
                          setCodeAvailability(true);
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            <button type="submit" className="btn btn-primary">Register Affiliate</button>
          </form>
          {status ? <p style={{ marginTop: 14 }}>{status}</p> : null}
        </section>
      </main>
    </>
  );
}
