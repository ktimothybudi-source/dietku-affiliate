import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingBottom: "2rem" }}>
        <section className="card" style={{ padding: "2rem", textAlign: "center" }}>
          <h1 style={{ marginTop: 0, fontSize: 42 }}>Grow DietKu with affiliates</h1>
          <p className="muted" style={{ maxWidth: 700, margin: "0 auto 1.5rem" }}>
            A dedicated affiliate platform with referral links, tracked conversions, anti-fraud rules,
            rewards, and public competition through live leaderboards.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link className="btn btn-primary" href="/register">Become an Affiliate</Link>
            <Link className="btn btn-ghost" href="/leaderboard">View Public Leaderboard</Link>
          </div>
        </section>
      </main>
    </>
  );
}
