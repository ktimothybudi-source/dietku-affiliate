import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="container" style={{ padding: "1rem 0" }}>
      <nav
        className="card"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div style={{ fontSize: 24, fontWeight: 800 }}>DietKu Affiliates</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/">Home</Link>
          <Link href="/register">Register</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/admin">Admin</Link>
        </div>
      </nav>
    </header>
  );
}
