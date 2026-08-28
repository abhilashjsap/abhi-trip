export default function RegenerateButton({ onClick, loading, label = "Regenerate" }) {
  return (
    <button
      type="button"
      className="regenerate-btn"
      onClick={onClick}
      disabled={loading}
    >
      <span className={loading ? "regenerate-icon spinning" : "regenerate-icon"} aria-hidden="true">
        ↻
      </span>
      {loading ? "Regenerating…" : label}
    </button>
  );
}
