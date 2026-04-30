export default function MetricCard({ title, value, subtitle }) {
  return (
    <div className="card metric-card">
      <p className="muted metric-title">{title}</p>
      <p className="metric-value">{value}</p>
      {subtitle ? (
        <p className="muted metric-subtitle">{subtitle}</p>
      ) : null}
    </div>
  );
}
