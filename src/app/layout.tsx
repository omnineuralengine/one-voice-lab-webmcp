import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Suspense } from "react";

import { ViewerAnalytics } from "@/components/analytics/ViewerAnalytics";
import { VoiceLabActionProvider } from "@/components/actions/VoiceLabActionProvider";
import { OneConciergeProvider } from "@/components/concierge/OneConciergeProvider";
import { JsonLd } from "@/components/discovery/JsonLd";
import { AppliedVoiceCopilot } from "@/components/ai/AppliedVoiceCopilot";
import { PocketDeepgram } from "@/components/pocket-deepgram/PocketDeepgram";
import {
  TelephonyReadinessGlobalActivity,
  TelephonyReadinessProvider,
} from "@/components/telephony-readiness/TelephonyReadinessProvider";
import { OpenLabStatus } from "@/components/open-lab/OpenLabStatus";
import { OneExperienceProvider } from "@/components/one/OneExperienceProvider";
import {
  OneWebMcpProvider,
  OneWebMcpProviderFallback,
} from "@/components/one-webmcp/OneWebMcpProvider";
import { isOpenLabDeepgramEnabled, isOpenLabMode } from "@/lib/open-lab";
import { isLabAiEnabled } from "@/lib/ai/models";
import { createOneWebMcpProviderSnapshot } from "@/lib/one-webmcp/provider-data";
import { getCanonicalOrigin, getCanonicalUrl } from "@/lib/public-evidence/canonical-url";
import { getPublicProviders } from "@/lib/public-evidence/registry";
import { getWebApplicationJsonLd, getWebSiteJsonLd } from "@/lib/public-evidence/structured-data";
import { getViewerAnalyticsSupabaseConfig } from "@/lib/supabase/config";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getCanonicalOrigin()),
  title: {
    default: "ONE Voice Lab",
    template: "%s | ONE Voice Lab",
  },
  description:
    "A human-centered, provider-neutral lab for exploring, comparing, evaluating, and building with voice systems.",
  applicationName: "ONE Voice Lab",
  alternates: { canonical: getCanonicalUrl("/") },
  openGraph: {
    type: "website",
    title: "ONE Voice Lab",
    description: "Explore, compare, evaluate, and build with voice systems in an independent Omni Neural Engine lab.",
    url: getCanonicalUrl("/"),
    siteName: "ONE Voice Lab",
  },
  twitter: {
    card: "summary",
    title: "ONE Voice Lab",
    description: "Explore, compare, evaluate, and build with voice systems in an independent Omni Neural Engine lab.",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ONE Voice Lab",
  },
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#03060a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const openLabMode = isOpenLabMode();
  const openLabDeepgramEnabled = isOpenLabDeepgramEnabled();
  const analyticsEnabled = process.env.PLAYWRIGHT_E2E !== "1";
  const viewerAnalyticsEnabled = analyticsEnabled && Boolean(getViewerAnalyticsSupabaseConfig());
  // Global site tools receive a policy-neutral evidence snapshot. Credential,
  // health, and live-readiness overlays stay server-side and are not serialized.
  const oneWebMcpProviders = createOneWebMcpProviderSnapshot(getPublicProviders({}, []));

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a className="one-skip-link" href="#one-main-content">Skip to main content</a>
        <OneExperienceProvider>
          <OneConciergeProvider>
          <VoiceLabActionProvider>
            <TelephonyReadinessProvider>
            <JsonLd data={getWebApplicationJsonLd()} />
            <JsonLd data={getWebSiteJsonLd()} />
            <div id="one-main-content" tabIndex={-1}><div id="learning-lab-shell">{children}</div></div>

            <div aria-label="Lab utilities" className="one-global-utility-dock" role="region">
              <div className="one-global-utility-status">
                {openLabMode ? <OpenLabStatus liveEnabled={openLabDeepgramEnabled} /> : null}
                <TelephonyReadinessGlobalActivity />
              </div>
              <div className="one-global-utility-actions">
                <Suspense fallback={<OneWebMcpProviderFallback />}>
                  <OneWebMcpProvider providers={oneWebMcpProviders} />
                </Suspense>
                <AppliedVoiceCopilot enabled={isLabAiEnabled()} />
                <PocketDeepgram
                  apiConfigured={Boolean(process.env.DEEPGRAM_API_KEY?.trim())}
                  pwaEnabled={
                    process.env.NODE_ENV === "production" ||
                    process.env.PLAYWRIGHT_E2E === "1"
                  }
                  openLabMode={openLabMode}
                  openLabDeepgramEnabled={openLabDeepgramEnabled}
                />
              </div>
            </div>

            {viewerAnalyticsEnabled ? <ViewerAnalytics /> : null}
            {analyticsEnabled ? <Analytics /> : null}
            </TelephonyReadinessProvider>
          </VoiceLabActionProvider>
          </OneConciergeProvider>
        </OneExperienceProvider>
      </body>
    </html>
  );
}
