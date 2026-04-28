export default function MetricCard({ title, value, subtitle }) {
  return (
    <div className="card">
      <p className="muted" style={{ margin: 0 }}>{title}</p>
      <p style={{ margin: "0.4rem 0", fontSize: 28, fontWeight: 800 }}>{value}</p>
      {subtitle ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{subtitle}</p>
      ) : null}
    </div>
  );
}
