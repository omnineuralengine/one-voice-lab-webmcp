"use client";

import type { EthereumWallet, Provider } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { HumanDepthControl } from "@/components/one/AdaptiveInterface";
import { useOneExperience } from "@/components/one/OneExperienceProvider";
import { OneAccountControls } from "@/components/one/OneAccountControls";
import { clearAccountOutcomeParams, readAccountOutcomeMessage } from "@/lib/auth/account-outcome";
import { humanAuthMessage, normalizedAuthErrorCode } from "@/lib/auth/errors";
import {
  GUEST_LAB_PREFERENCES_KEY,
  GUEST_NOTIFICATION_PREFERENCES_KEY,
  type GuestNotificationPreferences,
} from "@/lib/auth/guest-state";
import { openOneWalletConnect } from "@/lib/auth/wallet-connect";
import { DEFAULT_ONE_THEME, hasUsablePairContrast, normalizeOneHex, type OneThemePreferences } from "@/lib/one/theme";
import { getOneSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getOneWalletConnectProjectId,
  isOneWalletConnectEnabled,
  isOneWeb3Enabled,
  ONE_OAUTH_PROVIDERS,
} from "@/lib/supabase/config";

type NotificationPreferences = GuestNotificationPreferences;

const DEFAULT_NOTIFICATIONS: NotificationPreferences = { inAppEnabled: true, emailEnabled: false, newLabs: true, providerUpdates: true, simulationUpdates: true, securityUpdates: true };

type BrowserEthereumWallet = EthereumWallet & { isMetaMask?: boolean };

type DiscoveredEthereumWallet = {
  id: string;
  name: string;
  provider: BrowserEthereumWallet;
};

type Eip6963ProviderDetail = {
  info?: { name?: string; rdns?: string; uuid?: string };
  provider?: BrowserEthereumWallet;
};

type WalletConnectPairing = {
  uri: string;
  qrDataUrl: string | null;
};

function parseLocalObject<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value && value.length < 4_096 ? { ...fallback, ...JSON.parse(value) } : fallback;
  } catch {
    return fallback;
  }
}

export function OneSettings() {
  const one = useOneExperience();
  if (!one.authReady) {
    return (
      <div aria-busy="true" aria-live="polite" className="one-auth-unavailable" role="status">
        <strong>Checking your ONE account…</strong>
        <p>Account-scoped controls remain paused until this browser session is verified.</p>
      </div>
    );
  }
  return <OneSettingsForIdentity key={one.user?.id ?? "guest"} />;
}

function OneSettingsForIdentity() {
  const one = useOneExperience();
  const preferenceClient = useMemo(() => getOneSupabaseBrowserClient(), []);
  const [primaryInput, setPrimaryInput] = useState(one.theme.primaryHex);
  const [secondaryInput, setSecondaryInput] = useState(one.theme.secondaryHex);
  const [notice, setNotice] = useState("");
  const [defaultModule, setDefaultModule] = useState(() => typeof window === "undefined" ? "/" : parseLocalObject(GUEST_LAB_PREFERENCES_KEY, { defaultModule: "/" }).defaultModule);
  const [notifications, setNotifications] = useState(() => typeof window === "undefined" ? DEFAULT_NOTIFICATIONS : parseLocalObject(GUEST_NOTIFICATION_PREFERENCES_KEY, DEFAULT_NOTIFICATIONS));

  useEffect(() => {
    const current = new URL(window.location.href);
    const outcome = readAccountOutcomeMessage(current.searchParams);
    const timer = outcome ? window.setTimeout(() => setNotice(outcome), 0) : null;
    if (["account", "auth", "migration"].some((key) => current.searchParams.has(key))) {
      window.history.replaceState(window.history.state, "", clearAccountOutcomeParams(current));
    }
    return () => { if (timer !== null) window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPrimaryInput(one.theme.primaryHex);
      setSecondaryInput(one.theme.secondaryHex);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [one.theme.primaryHex, one.theme.secondaryHex]);

  useEffect(() => {
    if (!one.authReady) return;
    if (!one.user) {
      const timer = window.setTimeout(() => {
        setDefaultModule(parseLocalObject(GUEST_LAB_PREFERENCES_KEY, { defaultModule: "/" }).defaultModule);
        setNotifications(parseLocalObject(GUEST_NOTIFICATION_PREFERENCES_KEY, DEFAULT_NOTIFICATIONS));
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!preferenceClient) return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setDefaultModule("/");
      setNotifications(DEFAULT_NOTIFICATIONS);
    }, 0);
    void Promise.all([
      preferenceClient.from("user_preferences").select("default_module").eq("user_id", one.user.id).maybeSingle(),
      preferenceClient.from("notification_preferences").select("in_app_enabled,email_enabled,new_labs,provider_updates,simulation_updates,security_updates").eq("user_id", one.user.id).maybeSingle(),
    ]).then(([preference, notification]) => {
      if (!active) return;
      if (typeof preference.data?.default_module === "string") setDefaultModule(preference.data.default_module);
      if (notification.data) setNotifications({
        inAppEnabled: notification.data.in_app_enabled,
        emailEnabled: notification.data.email_enabled,
        newLabs: notification.data.new_labs,
        providerUpdates: notification.data.provider_updates,
        simulationUpdates: notification.data.simulation_updates,
        securityUpdates: notification.data.security_updates,
      });
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [one.authReady, one.user, preferenceClient]);

  const previewTheme = useMemo(() => {
    const primary = normalizeOneHex(primaryInput);
    const secondary = normalizeOneHex(secondaryInput);
    if (!primary.success || !secondary.success) return null;
    return { ...one.theme, primaryHex: primary.data, secondaryHex: secondary.data } satisfies OneThemePreferences;
  }, [one.theme, primaryInput, secondaryInput]);

  function applyColors() {
    if (!previewTheme || !one.updateTheme(previewTheme)) {
      setNotice("Use normalized six-digit colors such as #9966CC.");
      return;
    }
    setNotice(hasUsablePairContrast(previewTheme)
      ? one.user ? "Theme draft applied. Sync it to save it to your account." : "Theme applied locally."
      : "Theme applied with accessible foreground fallbacks because the two accents have low contrast.");
  }

  function swapColors() {
    setPrimaryInput(secondaryInput.toUpperCase());
    setSecondaryInput(primaryInput.toUpperCase());
  }

  function updateAppearance(appearance: OneThemePreferences["appearance"]) {
    one.updateTheme({ ...one.theme, appearance });
  }

  function setNotification<K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) {
    const next = { ...notifications, [key]: value };
    setNotifications(next);
    if (!one.user) window.localStorage.setItem(GUEST_NOTIFICATION_PREFERENCES_KEY, JSON.stringify(next));
  }

  async function savePreferences() {
    if (!one.user) {
      window.localStorage.setItem(GUEST_LAB_PREFERENCES_KEY, JSON.stringify({ defaultModule }));
      window.localStorage.setItem(GUEST_NOTIFICATION_PREFERENCES_KEY, JSON.stringify(notifications));
      setNotice("Preferences saved locally on this device.");
      return;
    }
    const client = getOneSupabaseBrowserClient();
    if (!client) return;
    const [{ error: labError }, { error: notificationError }] = await Promise.all([
      client.from("user_preferences").upsert({ user_id: one.user.id, primary_hex: one.theme.primaryHex, secondary_hex: one.theme.secondaryHex, appearance: one.theme.appearance, reduced_motion: one.theme.reducedMotion, interface_depth: one.interfaceDepth, default_module: defaultModule, updated_at: new Date().toISOString() }, { onConflict: "user_id" }),
      client.from("notification_preferences").upsert({ user_id: one.user.id, in_app_enabled: notifications.inAppEnabled, email_enabled: notifications.emailEnabled, new_labs: notifications.newLabs, provider_updates: notifications.providerUpdates, simulation_updates: notifications.simulationUpdates, security_updates: notifications.securityUpdates, updated_at: new Date().toISOString() }, { onConflict: "user_id" }),
    ]);
    setNotice(labError || notificationError ? "Cloud sync failed; unsaved changes remain on this screen." : "Preferences synced to your ONE identity.");
  }

  return (
    <div className="one-settings-grid">
      <section aria-labelledby="one-account-state-title" className="one-account-context">
        <p>{one.user ? "Account-owned state" : "Guest · local-only state"}</p>
        <h2 id="one-account-state-title">{one.user ? "You are signed in to ONE" : "You can explore ONE without an account"}</h2>
        <span>{one.user
          ? "Owned preferences load from this verified account. Browser-supplied identity never establishes ownership."
          : "Your eligible preferences stay on this device. Signing in can add ownership and explicit synchronization later."}</span>
        <Link href="#identity">{one.user ? "Manage account" : "Why sign in?"}</Link>
      </section>

      <SettingsSection id="interface-depth" eyebrow="Presentation, not permission" title="Information depth" description="Choose how much context ONE shows by default. You can still open a deeper explanation for one result without changing this preference.">
        <HumanDepthControl compact heading="Default information depth" />
      </SettingsSection>

      <SettingsSection id="appearance" eyebrow="Make it yours" title="Appearance" description={`Current persistence: ${one.themeSource === "synced" ? "SYNCED" : one.user ? "ACCOUNT DRAFT" : "LOCAL"}. Custom values are validated before becoming CSS variables.`}>
        <div className="one-theme-fields">
          <ColorField label="Primary" value={primaryInput} onChange={setPrimaryInput} />
          <ColorField label="Secondary" value={secondaryInput} onChange={setSecondaryInput} />
        </div>
        <div className="one-theme-preview" style={previewTheme ? { "--preview-primary": previewTheme.primaryHex, "--preview-secondary": previewTheme.secondaryHex } as React.CSSProperties : undefined}><span>ONE</span><strong>Human-controlled voice systems</strong><small>Live preview · accessible text fallback</small></div>
        <div className="one-settings-actions"><button type="button" onClick={applyColors}>Apply locally</button><button type="button" onClick={swapColors}>Swap colors</button><button type="button" onClick={() => { one.resetTheme(); setPrimaryInput(DEFAULT_ONE_THEME.primaryHex); setSecondaryInput(DEFAULT_ONE_THEME.secondaryHex); }}>Reset to ONE</button>{one.user ? <button type="button" onClick={() => void one.saveThemeToAccount().then((result) => setNotice(result.message))}>Sync theme</button> : null}</div>
        <fieldset><legend>Appearance mode</legend><div className="one-settings-options">{(["dark", "light", "system"] as const).map((mode) => <label key={mode}><input checked={one.theme.appearance === mode} name="appearance" type="radio" onChange={() => updateAppearance(mode)} /> {mode}</label>)}</div></fieldset>
        <label className="one-settings-toggle"><span><strong>Reduced motion</strong><small>Disables non-essential ONE motion in addition to operating-system preferences.</small></span><input checked={one.theme.reducedMotion} type="checkbox" onChange={(event) => one.updateTheme({ ...one.theme, reducedMotion: event.target.checked })} /></label>
      </SettingsSection>

      <SettingsSection id="lab-experience" eyebrow="Guest-first" title="Lab Experience" description="Guest preferences stay in bounded local storage. They do not include transcripts, audio, credentials, customer cases, or raw logs.">
        <label className="one-settings-field"><span>Default landing Lab</span><select value={defaultModule} onChange={(event) => setDefaultModule(event.target.value)}><option value="/">ONE Home</option><option value="/simulation-lab">Simulation Lab</option><option value="/build">Build</option><option value="/learn">Learn</option></select></label>
        <p className="one-settings-note">Experimental Lab visibility is explicit in each registry and card; changing this preference never upgrades an evidence status.</p>
      </SettingsSection>

      <SettingsSection id="notifications" eyebrow="Agency, not surveillance" title="Notifications" description="These are preference and in-app controls. Email delivery is not implemented or claimed.">
        <PreferenceToggle label="In-app updates" detail="Show the ONE notification center." checked={notifications.inAppEnabled} onChange={(value) => setNotification("inAppEnabled", value)} />
        <PreferenceToggle label="Email preference" detail="Stored preference only. No outbound mail provider is configured by this feature." checked={notifications.emailEnabled} onChange={(value) => setNotification("emailEnabled", value)} />
        <PreferenceToggle label="New ONE Labs" checked={notifications.newLabs} onChange={(value) => setNotification("newLabs", value)} />
        <PreferenceToggle label="Provider updates" checked={notifications.providerUpdates} onChange={(value) => setNotification("providerUpdates", value)} />
        <PreferenceToggle label="Simulation Lab updates" checked={notifications.simulationUpdates} onChange={(value) => setNotification("simulationUpdates", value)} />
        <PreferenceToggle label="Important / security updates" checked={notifications.securityUpdates} onChange={(value) => setNotification("securityUpdates", value)} />
        <button className="one-settings-primary" type="button" onClick={() => void savePreferences()}>Save preferences</button>
      </SettingsSection>

      <SettingsSection id="identity" eyebrow="Optional" title="ONE Identity" description="The Lab remains open. Identity adds cloud-synced preferences, saved experiments, a larger protected usage allowance, and member preview Labs such as Bench.">
        <OneIdentityPanel key={one.user?.id ?? "guest"} onNotice={setNotice} />
      </SettingsSection>

      <SettingsSection id="privacy" eyebrow="Clear boundaries" title="Privacy" description="Cloud persistence is intentionally narrow.">
        <dl className="one-privacy-list"><div><dt>LOCAL</dt><dd>Guest theme, information depth, Lab preference, notification state, and guest Simulation Lab presets.</dd></div><div><dt>SYNCED</dt><dd>Identity, profile, account information depth, preferences, notification state, and simulations you explicitly save to your account.</dd></div><div><dt>NOT STORED HERE</dt><dd>Provider credentials, wallet secrets, seed phrases, raw microphone audio, private customer material, and arbitrary Lab state.</dd></div></dl>
      </SettingsSection>
      <p className="one-settings-notice" role="status" aria-live="polite">{notice}</p>
    </div>
  );
}

function OneIdentityPanel({ onNotice }: { onNotice: (value: string) => void }) {
  const one = useOneExperience();
  const client = useMemo(() => getOneSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [wallets, setWallets] = useState<DiscoveredEthereumWallet[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [walletConnectPairing, setWalletConnectPairing] = useState<WalletConnectPairing | null>(null);

  useEffect(() => {
    if (!isOneWeb3Enabled()) return;
    const rememberWallet = (candidate: DiscoveredEthereumWallet) => {
      setWallets((current) => {
        if (current.some((wallet) => wallet.provider === candidate.provider)) return current;
        const id = current.some((wallet) => wallet.id === candidate.id) ? `${candidate.id}-${current.length + 1}` : candidate.id;
        return [...current, { ...candidate, id }].slice(0, 8);
      });
    };
    const announce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (!detail?.provider) return;
      const announcedName = detail.info?.name?.trim().slice(0, 48);
      rememberWallet({
        id: detail.info?.uuid?.trim().slice(0, 128) || detail.info?.rdns?.trim().slice(0, 128) || announcedName || "browser-wallet",
        name: announcedName || (detail.provider.isMetaMask ? "MetaMask" : "Browser wallet"),
        provider: detail.provider,
      });
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const injected = (window as Window & { ethereum?: BrowserEthereumWallet }).ethereum;
    const timer = injected ? window.setTimeout(() => rememberWallet({
      id: injected.isMetaMask ? "io.metamask" : "injected-wallet",
      name: injected.isMetaMask ? "MetaMask" : "Browser wallet",
      provider: injected,
    }), 200) : null;
    return () => {
      window.removeEventListener("eip6963:announceProvider", announce);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!client || !one.user) return;
    let active = true;
    void client.from("profiles").select("display_name").eq("id", one.user.id).maybeSingle().then(({ data }) => {
      if (active && typeof data?.display_name === "string") setDisplayName(data.display_name);
    });
    return () => { active = false; };
  }, [client, one.user]);

  if (!one.authConfigured || !client) return <div className="one-auth-unavailable"><strong>Guest Mode is active</strong><p>Accounts are not available on this installation yet. Local customization and Simulation Lab still work on this device.</p></div>;
  const authClient = client;
  if (one.user) return (
    <div className="one-auth-user">
      <p><strong>Signed in</strong><span>{one.user.email ?? "Wallet-backed ONE identity"}</span></p>
      <ul><li>Cloud-synced preference center</li><li>Larger finite protected usage allowance</li><li>Owned simulations and member-only Bench previews</li></ul>
      <label className="one-settings-field"><span>Display name</span><input autoComplete="name" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <div className="one-settings-actions">
        <button type="button" onClick={() => void client.from("profiles").upsert({ id: one.user!.id, display_name: displayName.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "id" }).then(({ error }) => onNotice(error ? "Profile update failed." : "ONE profile saved."))}>Save profile</button>
        <Link href="/bench">Open Bench</Link><Link href="/membership">Membership</Link>
        <button type="button" onClick={() => void one.signOut().then((result) => { if (!result.ok) onNotice(result.message); })}>Sign out</button>
      </div>
      <OneAccountControls onNotice={onNotice} />
    </div>
  );

  async function run(action: () => Promise<{ error: unknown }>, success: string) {
    setBusy(true);
    try {
      const { error } = await action();
      onNotice(error ? humanAuthMessage(normalizedAuthErrorCode(error)) : success);
    } catch (error) {
      onNotice(humanAuthMessage(normalizedAuthErrorCode(error)));
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordlessSignIn() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/passwordless", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, next: "/settings#identity" }),
      });
      const body: unknown = await response.json().catch(() => null);
      const message = readBoundedApiMessage(body);
      onNotice(message ?? (response.ok
        ? "If the address can receive ONE sign-in mail, a secure link is on its way."
        : "Sign-in is temporarily unavailable. Guest Mode still works on this device."));
    } catch {
      onNotice("Sign-in is temporarily unavailable. Guest Mode still works on this device.");
    } finally {
      setBusy(false);
    }
  }

  function signInWithEthereumWallet(wallet: EthereumWallet) {
    return authClient.auth.signInWithWeb3({
      chain: "ethereum",
      statement: "Sign in to ONE Voice Lab. This authentication signature does not authorize a payment.",
      wallet,
      options: { url: `${window.location.origin}/settings` },
    });
  }

  async function signInWithWalletConnect() {
    const projectId = getOneWalletConnectProjectId();
    if (!projectId) {
      onNotice("WalletConnect is not configured for this deployment.");
      return;
    }
    await run(async () => {
      try {
        const session = await openOneWalletConnect(projectId, {
          onDisplayUri: (uri) => void renderWalletConnectPairing(uri),
        });
        try {
          return await signInWithEthereumWallet(session.wallet);
        } finally {
          await session.disconnect();
        }
      } finally {
        setWalletConnectPairing(null);
      }
    }, "Wallet authentication complete.");
  }

  async function renderWalletConnectPairing(uri: string) {
    setWalletConnectPairing({ uri, qrDataUrl: null });
    try {
      const { toDataURL } = await import("qrcode");
      const qrDataUrl = await toDataURL(uri, {
        color: { dark: "#111827", light: "#FFFFFF" },
        errorCorrectionLevel: "M",
        margin: 2,
        width: 256,
      });
      setWalletConnectPairing((current) => current?.uri === uri ? { uri, qrDataUrl } : current);
    } catch {
      onNotice("The local pairing image could not be drawn. Use the same-device wallet link instead.");
    }
  }

  const enabledProviders = ONE_OAUTH_PROVIDERS.filter((provider) => provider.enabled);
  const walletConnectEnabled = isOneWalletConnectEnabled();
  const walletAuthenticationAvailable = isOneWeb3Enabled() && (wallets.length > 0 || walletConnectEnabled);
  return (
    <div aria-busy={busy} className="one-auth-panel">
      <div className="one-auth-choice">
        <strong>Sign in to save your Lab</strong>
        <p id="one-email-sign-in-help">No password needed. This signs you in or creates a ONE account, then offers to import only eligible on-device guest state.</p>
      </div>
      <label className="one-settings-field" htmlFor="one-identity-email">
        <span>Email</span>
        <input
          aria-describedby="one-email-sign-in-help"
          autoComplete="email"
          id="one-identity-email"
          inputMode="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <button
        className="one-settings-primary w-full"
        disabled={busy || !email}
        type="button"
        onClick={() => void requestPasswordlessSignIn()}
      >
        Continue with email
      </button>

      <details className="rounded-xl border border-[color:var(--one-border)] px-3 py-2">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-[color:var(--one-text)]">Use a password</summary>
        <div className="pb-2 pt-3">
          <label className="one-settings-field" htmlFor="one-identity-password">
            <span>Password</span>
            <input
              autoComplete="current-password"
              id="one-identity-password"
              minLength={8}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="one-settings-actions">
            <button disabled={busy || !email || password.length < 8} type="button" onClick={() => void run(() => authClient.auth.signInWithPassword({ email, password }), "Signed in.")}>Sign in with password</button>
            <button disabled={busy || !email || password.length < 8} type="button" onClick={() => void run(() => authClient.auth.signUp({ email, password, options: { emailRedirectTo: oneAuthCallbackUrl() } }), "Check your email to confirm the account.")}>Create account with password</button>
          </div>
        </div>
      </details>

      {enabledProviders.length > 0 ? (
        <section className="one-auth-providers" aria-labelledby="social-auth-title">
          <h3 id="social-auth-title">Other ways to sign in</h3>
          {enabledProviders.map((provider) => <button key={provider.id} disabled={busy} type="button" onClick={() => void run(() => authClient.auth.signInWithOAuth({ provider: provider.id as Provider, options: { redirectTo: oneAuthCallbackUrl() } }), `Continue sign-in with ${provider.label}.`)}>Continue with {provider.label}</button>)}
        </section>
      ) : null}

      {walletAuthenticationAvailable ? (
        <section className="one-auth-wallet" aria-labelledby="wallet-auth-title">
          <h3 id="wallet-auth-title">Continue with a wallet</h3>
          <p>ONE asks for an authentication signature only. It never authorizes a payment, requests token approval, reads balances, or asks for a seed phrase.</p>
          <div className="one-settings-actions">
            {wallets.map((wallet) => <button disabled={busy} key={wallet.id} type="button" onClick={() => void run(() => signInWithEthereumWallet(wallet.provider), "Wallet authentication complete.")}>Continue with {wallet.name}</button>)}
            {walletConnectEnabled ? <button disabled={busy} type="button" onClick={() => void signInWithWalletConnect()}>Continue with WalletConnect</button> : null}
          </div>
          {walletConnectPairing ? <section aria-labelledby="walletconnect-pairing-title" className="mt-4 rounded-2xl border border-purple-300/20 bg-black/20 p-4"><h4 className="font-semibold text-white" id="walletconnect-pairing-title">Pair a WalletConnect wallet</h4><p className="mt-2 text-sm text-slate-300">Scan on another device or open the same short-lived pairing request on this device.</p>{walletConnectPairing.qrDataUrl ? <Image alt="WalletConnect pairing QR code" className="mt-4 h-64 w-64 max-w-full rounded-xl bg-white p-2" height={256} src={walletConnectPairing.qrDataUrl} unoptimized width={256} /> : <p aria-live="polite" className="mt-4 text-sm text-slate-300">Drawing the pairing code locally…</p>}<a className="mt-4 inline-flex min-h-12 items-center rounded-xl border border-white/15 px-4 font-semibold text-white" href={walletConnectPairing.uri}>Open wallet on this device</a><p className="mt-3 text-xs leading-5 text-slate-400">The pairing URI stays in this tab, is not logged or saved by ONE, and disappears when sign-in finishes.</p></section> : null}
          <p><Link href="/membership">How wallet sign-in and future USDC payments stay separate</Link></p>
        </section>
      ) : null}
    </div>
  );
}

function oneAuthCallbackUrl() {
  return `${window.location.origin}/auth/callback?next=/settings`;
}

function readBoundedApiMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.message === "string" && candidate.message.length <= 300) return candidate.message;
  if (!candidate.error || typeof candidate.error !== "object") return null;
  const message = (candidate.error as Record<string, unknown>).message;
  return typeof message === "string" && message.length <= 300 ? message : null;
}

function SettingsSection({ id, eyebrow, title, description, children }: { id: string; eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="one-settings-section" id={id} aria-labelledby={`${id}-title`}><header><p>{eyebrow}</p><h2 id={`${id}-title`}>{title}</h2><span>{description}</span></header>{children}</section>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="one-settings-field"><span>{label}</span><div><input aria-label={`${label} color picker`} type="color" value={normalizeOneHex(value).success ? value : "#000000"} onChange={(event) => onChange(event.target.value.toUpperCase())} /><input aria-label={`${label} hex color`} maxLength={7} spellCheck={false} value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} /></div></label>;
}

function PreferenceToggle({ label, detail, checked, onChange }: { label: string; detail?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="one-settings-toggle"><span><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</span><input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)} /></label>;
}
