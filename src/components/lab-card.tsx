import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { AsyncStatus } from "@/lib/types";

type LabCardProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  status?: AsyncStatus;
  statusText?: string;
  children: ReactNode;
};

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function LabCard({ title, description, icon, status = "idle", statusText, children }: LabCardProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#0b1117]/92 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.03]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">{icon}</div> : null}
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6 text-white">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
          </div>
        </div>
        {statusText ? <StatusBadge status={status}>{statusText}</StatusBadge> : null}
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({ status, children }: { status: AsyncStatus | "configured" | "missing"; children: ReactNode }) {
  const styles = {
    idle: "border-white/10 bg-white/[0.05] text-slate-300",
    loading: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
    success: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    error: "border-rose-300/25 bg-rose-300/10 text-rose-100",
    configured: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    missing: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  }[status];

  return (
    <span className={`inline-flex h-7 shrink-0 items-center rounded-md border px-2.5 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}

export function ActionButton({ variant = "primary", className = "", ...props }: ActionButtonProps) {
  const styles =
    variant === "primary"
      ? "border-cyan-200/35 bg-cyan-200 text-slate-950 hover:bg-white disabled:bg-cyan-200/40"
      : "border-white/12 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1] disabled:text-slate-500";

  return (
    <button
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-200/60 disabled:cursor-not-allowed disabled:border-white/10 ${styles} ${className}`}
      {...props}
    />
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{children}</label>;
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-5 text-slate-500">{children}</p>;
}

export function InlineMessage({ status, children }: { status: AsyncStatus; children: ReactNode }) {
  if (!children) {
    return null;
  }

  const styles = {
    idle: "border-white/10 bg-white/[0.04] text-slate-400",
    loading: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    success: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    error: "border-rose-300/20 bg-rose-300/10 text-rose-100",
  }[status];

  return <div className={`rounded-lg border px-3 py-2 text-sm leading-6 ${styles}`}>{children}</div>;
}
