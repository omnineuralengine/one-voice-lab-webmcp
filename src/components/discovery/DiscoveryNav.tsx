import Link from "next/link";

const LINKS = [
  ["Providers", "/providers"],
  ["Evaluations", "/evals"],
  ["Methodology", "/methodology"],
  ["For agents", "/for-agents"],
  ["Public API", "/api/public/v1/lab"],
  ["OpenAPI", "/openapi.json"],
] as const;

export function DiscoveryNav() {
  return (
    <nav aria-label="Evidence and machine interfaces" className="rounded-xl border border-white/10 bg-black/20 p-3">
      <ul className="flex flex-wrap gap-2">
        {LINKS.map(([label, href]) => (
          <li key={href}>
            <Link
              className="inline-flex min-h-10 items-center rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-200/30 hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 motion-reduce:transition-none"
              data-agent-action={`voice-lab.navigate-${href.replace(/^\//, "").replace(/[^a-z0-9]+/g, "-")}`}
              href={href}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
