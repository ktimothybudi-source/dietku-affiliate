import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingBottom: "2rem" }}>
        <section className="card" style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <h1 className="page-headline">Affiliate Platform</h1>
          <p className="page-subtitle">Simple dashboard to track referrals and payouts.</p>
          <div className="inline-row" style={{ justifyContent: "center", marginTop: 14 }}>
            <Link className="btn btn-primary" href="/dashboard">Go to Dashboard</Link>
            <Link className="btn btn-ghost" href="/register">Create Affiliate Account</Link>
          </div>
        </section>
      </main>
    </>
  );
}
