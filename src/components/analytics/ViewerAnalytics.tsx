"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import {
  createViewerEventInput,
  type ViewerEventInput,
  type ViewerProviderId,
} from "@/lib/analytics/viewer-events";

function postViewerEvent(input: ViewerEventInput) {
  if (process.env.NODE_ENV !== "production") return;
  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {
    // Analytics is best-effort and must never interrupt the Lab experience.
  });
}

export function ViewerAnalytics() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const currentPath = useRef(pathname);

  useEffect(() => {
    currentPath.current = pathname;
    if (!pathname || lastPath.current === pathname) return;
    lastPath.current = pathname;
    postViewerEvent(createViewerEventInput("page_view", pathname));
  }, [pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const origin = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-viewer-event]")
        : null;
      if (!origin) return;

      const eventName = origin.dataset.viewerEvent;
      const providerId = origin.dataset.providerId as ViewerProviderId | undefined;
      const anchor = origin instanceof HTMLAnchorElement ? origin : origin.closest<HTMLAnchorElement>("a");
      const path = origin.dataset.analyticsPath
        ?? (anchor ? new URL(anchor.href, window.location.origin).pathname : currentPath.current);

      if ((eventName === "provider_profile_open" || eventName === "provider_module_open") && providerId && path) {
        postViewerEvent(createViewerEventInput(eventName, path, providerId));
      }
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
