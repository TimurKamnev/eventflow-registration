import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function PageHeader({
  title,
  subtitle,
  backTo,
  backLabel,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div>
      {backTo && (
        <Link to={backTo} className="back-link">
          ← {backLabel ?? "Назад"}
        </Link>
      )}
      <div className="page-header">
        <div className="page-header-titles">
          <h1>{title}</h1>
          {subtitle && <p style={{ color: "var(--text-muted)", marginTop: 4 }}>{subtitle}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Banner({ tone, children }: { tone: "error" | "success" | "neutral"; children: ReactNode }) {
  return <div className={`banner banner-${tone}`}>{children}</div>;
}
