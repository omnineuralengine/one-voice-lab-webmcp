import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { ModuleEvolutionAffordance } from "@/components/lab-evolution/ModuleEvolutionAffordance";
import { OmniWatermark } from "@/components/one/OmniWatermark";

export type OneStatusTone = "neutral" | "purple" | "green" | "amber" | "red";

export interface ModuleStatusItem {
  label: string;
  value: string;
  tone?: OneStatusTone;
}

function joinClassNames(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

export function ModulePageShell({
  as: Element = "main",
  children,
  className,
  evolutionModuleId,
  watermarkEnabled = false,
  ...props
}: Omit<ComponentPropsWithoutRef<"main">, "children"> & {
  as?: "main" | "section" | "div";
  children: ReactNode;
  evolutionModuleId?: string;
  watermarkEnabled?: boolean;
}) {
  return (
    <Element {...props} className={joinClassNames("one-module-shell", className)}>
      <OmniWatermark enabled={watermarkEnabled} />
      <div className="one-module-shell-content">
        {evolutionModuleId ? (
          <div className="one-module-evolution-entry">
            <ModuleEvolutionAffordance moduleId={evolutionModuleId} />
          </div>
        ) : null}
        {children}
      </div>
    </Element>
  );
}

export function ModuleHero({
  eyebrow,
  title,
  outcome,
  status,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  outcome: string;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={joinClassNames("one-module-hero", className)}>
      <div className="one-module-hero-copy">
        {eyebrow ? <p className="one-module-eyebrow">{eyebrow}</p> : null}
        <div className="one-module-title-row">
          <h1>{title}</h1>
          {status}
        </div>
        <p className="one-module-outcome">{outcome}</p>
      </div>
      {actions ? <div className="one-module-actions">{actions}</div> : null}
    </header>
  );
}

export function ModuleStatusStrip({
  items,
  label = "Module status",
  className,
}: {
  items: ModuleStatusItem[];
  label?: string;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={joinClassNames("one-module-status-strip", className)}
    >
      <ul>
        {items.map((item) => (
          <li className={`one-status-item one-status-item--${item.tone ?? "neutral"}`} key={`${item.label}:${item.value}`}>
            <span aria-hidden="true" className="one-status-marker" />
            <span className="one-status-label">{item.label}</span>
            <strong>{item.value}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ModuleWorkspace({
  children,
  layout = "single",
  className,
}: {
  children: ReactNode;
  layout?: "single" | "split" | "inspector";
  className?: string;
}) {
  return (
    <div
      className={joinClassNames("one-module-workspace", className)}
      data-layout={layout}
    >
      {children}
    </div>
  );
}

export function ModulePanel({
  children,
  title,
  description,
  actions,
  className,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={joinClassNames("one-module-panel", className)}>
      {title || description || actions ? (
        <div className="one-module-panel-heading">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="one-module-panel-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="one-module-panel-body">{children}</div>
    </section>
  );
}

export function LiveConnectionBadge({
  label,
  detail,
  state = "offline",
  className,
}: {
  label: string;
  detail?: string;
  state?: "live" | "connecting" | "verified" | "offline" | "disabled" | "error";
  className?: string;
}) {
  const stateLabel = {
    live: "Live",
    connecting: "Connecting",
    verified: "Verified",
    offline: "Offline",
    disabled: "Disabled",
    error: "Error",
  }[state];

  return (
    <span
      className={joinClassNames("one-live-badge", `one-live-badge--${state}`, className)}
      data-connection-state={state}
      role="status"
    >
      <span aria-hidden="true" className="one-live-badge-dot" />
      <span>{label}</span>
      <span className="one-live-badge-detail">{detail ?? stateLabel}</span>
    </span>
  );
}

export function InspectorDock({
  children,
  title = "Inspector",
  description,
  className,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <aside aria-label={title} className={joinClassNames("one-inspector-dock", className)}>
      <div className="one-inspector-dock-heading">
        <p>{title}</p>
        {description ? <span>{description}</span> : null}
      </div>
      <div className="one-inspector-dock-body">{children}</div>
    </aside>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={joinClassNames("one-empty-state", className)}>
      <span aria-hidden="true" className="one-empty-state-mark" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="one-empty-state-action">{action}</div> : null}
    </div>
  );
}
