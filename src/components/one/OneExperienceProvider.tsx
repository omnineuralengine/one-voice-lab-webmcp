"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { clearMigratedGuestState, GUEST_NOTIFICATION_STATE_KEY } from "@/lib/auth/guest-state";
import { isOneHumanAuthSubject } from "@/lib/auth/human-subject";
import { setAuthOutcomeParam } from "@/lib/auth/account-outcome";
import { endBrowserAuthSession } from "@/lib/auth/browser-session";
import { ONE_LAB_UPDATES, type OneLabUpdate } from "@/lib/one/updates";
import {
  DEFAULT_INTERFACE_DEPTH,
  ONE_GUEST_INTERFACE_DEPTH_STORAGE_KEY,
  createInterfaceDepthWriteQueue,
  interfaceDepthSchema,
  parseAccountInterfaceDepth,
  parseStoredInterfaceDepth,
  serializeInterfaceDepth,
  type InterfaceDepth,
} from "@/lib/one/interface-depth";
import {
  DEFAULT_ONE_THEME,
  ONE_GUEST_THEME_STORAGE_KEY,
  hexToRgb,
  oneThemePreferencesSchema,
  parseStoredOneTheme,
  readableForeground,
  type OneThemePreferences,
} from "@/lib/one/theme";
import { getOneSupabaseBrowserClient } from "@/lib/supabase/client";

export type OneHuman = Readonly<{
  id: string;
  email: string | null;
}>;

type OneExperienceValue = {
  authConfigured: boolean;
  authReady: boolean;
  user: OneHuman | null;
  theme: OneThemePreferences;
  themeSource: "local" | "synced" | "account-default";
  interfaceDepth: InterfaceDepth;
  interfaceDepthSource: "guest-local" | "account-synced" | "account-default" | "account-draft";
  updateInterfaceDepth: (depth: InterfaceDepth) => Promise<{ ok: boolean; message: string }>;
  updateTheme: (theme: OneThemePreferences) => boolean;
  resetTheme: () => void;
  saveThemeToAccount: () => Promise<{ ok: boolean; message: string }>;
  signOut: () => Promise<{ ok: boolean; message: string }>;
  updates: readonly OneLabUpdate[];
  unreadCount: number;
  isUpdateRead: (id: string) => boolean;
  markUpdateRead: (id: string) => Promise<void>;
  markAllUpdatesRead: () => Promise<void>;
};

const OneExperienceContext = createContext<OneExperienceValue | null>(null);

function parseReadIds(value: string | null) {
  if (!value || value.length > 4_096) return new Set<string>();
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return new Set<string>();
    const known = new Set(ONE_LAB_UPDATES.map((item) => item.id));
    return new Set(parsed.filter((id): id is string => typeof id === "string" && known.has(id)).slice(0, 100));
  } catch {
    return new Set<string>();
  }
}

function applyTheme(theme: OneThemePreferences) {
  const root = document.documentElement;
  const primaryRgb = hexToRgb(theme.primaryHex).join(" ");
  const secondaryRgb = hexToRgb(theme.secondaryHex).join(" ");
  root.style.setProperty("--one-primary", theme.primaryHex);
  root.style.setProperty("--one-secondary", theme.secondaryHex);
  root.style.setProperty("--one-primary-rgb", primaryRgb);
  root.style.setProperty("--one-secondary-rgb", secondaryRgb);
  root.style.setProperty("--one-primary-foreground", readableForeground(theme.primaryHex));
  root.style.setProperty("--one-secondary-foreground", readableForeground(theme.secondaryHex));
  root.style.setProperty("--one-purple", theme.primaryHex);
  root.style.setProperty("--one-green", theme.secondaryHex);
  const resolvedAppearance = theme.appearance === "system"
    ? window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
    : theme.appearance;
  root.dataset.oneAppearance = resolvedAppearance;
  root.dataset.oneReducedMotion = String(theme.reducedMotion);
}

export function OneExperienceProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => getOneSupabaseBrowserClient(), []);
  const [authReady, setAuthReady] = useState(() => !client);
  const [user, setUser] = useState<OneHuman | null>(null);
  const [theme, setTheme] = useState<OneThemePreferences>(DEFAULT_ONE_THEME);
  const [themeSource, setThemeSource] = useState<"local" | "synced" | "account-default">("local");
  const [interfaceDepth, setInterfaceDepth] = useState<InterfaceDepth>(DEFAULT_INTERFACE_DEPTH);
  const [interfaceDepthSource, setInterfaceDepthSource] = useState<OneExperienceValue["interfaceDepthSource"]>("guest-local");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const accountLoadGeneration = useRef(0);
  const interfaceDepthWriteGeneration = useRef(0);
  const interfaceDepthWrites = useRef(createInterfaceDepthWriteQueue());

  const loadGuestState = useCallback(() => {
    accountLoadGeneration.current += 1;
    interfaceDepthWriteGeneration.current += 1;
    setTheme(parseStoredOneTheme(window.localStorage.getItem(ONE_GUEST_THEME_STORAGE_KEY)) ?? DEFAULT_ONE_THEME);
    setThemeSource("local");
    setInterfaceDepth(parseStoredInterfaceDepth(window.localStorage.getItem(ONE_GUEST_INTERFACE_DEPTH_STORAGE_KEY)) ?? DEFAULT_INTERFACE_DEPTH);
    setInterfaceDepthSource("guest-local");
    setReadIds(parseReadIds(window.localStorage.getItem(GUEST_NOTIFICATION_STATE_KEY)));
  }, []);

  useEffect(() => {
    if (client) return;
    const timer = window.setTimeout(loadGuestState, 0);
    return () => window.clearTimeout(timer);
  }, [client, loadGuestState]);

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    document.documentElement.dataset.oneInterfaceDepth = interfaceDepth;
  }, [interfaceDepth]);

  const loadAccountState = useCallback(async (nextUser: OneHuman) => {
    if (!client) return;
    const generation = ++accountLoadGeneration.current;
    interfaceDepthWriteGeneration.current += 1;
    setTheme(DEFAULT_ONE_THEME);
    setThemeSource("account-default");
    setInterfaceDepth(DEFAULT_INTERFACE_DEPTH);
    setInterfaceDepthSource("account-default");
    setReadIds(new Set());
    const [{ data: preference }, { data: depthPreference }, { data: notificationState }] = await Promise.all([
      client.from("user_preferences").select("primary_hex,secondary_hex,appearance,reduced_motion").eq("user_id", nextUser.id).maybeSingle(),
      client.from("user_preferences").select("interface_depth").eq("user_id", nextUser.id).maybeSingle(),
      client.from("user_notification_state").select("update_id").eq("user_id", nextUser.id),
    ]);
    if (generation !== accountLoadGeneration.current) return;
    const parsedTheme = oneThemePreferencesSchema.safeParse(preference ? {
      primaryHex: preference.primary_hex,
      secondaryHex: preference.secondary_hex,
      appearance: preference.appearance,
      reducedMotion: preference.reduced_motion,
    } : null);
    if (parsedTheme.success) {
      setTheme(parsedTheme.data);
      setThemeSource("synced");
    }
    if (depthPreference?.interface_depth) {
      setInterfaceDepth(parseAccountInterfaceDepth(depthPreference.interface_depth));
      setInterfaceDepthSource("account-synced");
    }
    setReadIds(new Set((notificationState ?? []).map((row) => row.update_id).filter((id): id is string => typeof id === "string")));
  }, [client]);

  useEffect(() => {
    if (!client) return;
    let active = true;
    let transitionGeneration = 0;

    const applyAuthTransition = async () => {
      const generation = ++transitionGeneration;
      accountLoadGeneration.current += 1;
      setUser(null);
      setAuthReady(false);
      setInterfaceDepth(DEFAULT_INTERFACE_DEPTH);
      setInterfaceDepthSource("account-default");

      let nextUser: OneHuman | null = null;
      let verificationUnavailable = false;
      try {
        const verified = await client.auth.getUser();
        if (!verified.error) nextUser = toOneHuman(verified.data.user);
        else verificationUnavailable = true;
      } catch {
        // Cached browser session data is never accepted as ownership authority.
        verificationUnavailable = true;
      }
      if (!active || generation !== transitionGeneration) return;
      if (!nextUser) {
        if (verificationUnavailable) {
          window.history.replaceState(
            window.history.state,
            "",
            setAuthOutcomeParam(new URL(window.location.href), "unavailable"),
          );
        }
        setAuthReady(true);
        loadGuestState();
        return;
      }

      const claimStatus = await claimGuestReceiptForCurrentSession(nextUser.id);
      if (!active || generation !== transitionGeneration) return;
      if (claimStatus === "unavailable") {
        window.history.replaceState(
          window.history.state,
          "",
          setAuthOutcomeParam(new URL(window.location.href), "claim-unavailable"),
        );
        await client.auth.signOut({ scope: "local" }).catch(() => undefined);
        if (!active || generation !== transitionGeneration) return;
        setUser(null);
        setAuthReady(true);
        loadGuestState();
        return;
      }
      if (claimStatus === "belongs-to-another-account") {
        clearMigratedGuestState(window.localStorage, ONE_GUEST_THEME_STORAGE_KEY);
      }
      await loadAccountState(nextUser);
      if (!active || generation !== transitionGeneration) return;
      setUser(nextUser);
      setAuthReady(true);
    };

    void applyAuthTransition();
    const { data: subscription } = client.auth.onAuthStateChange(() => {
      if (active) void applyAuthTransition();
    });
    return () => {
      active = false;
      accountLoadGeneration.current += 1;
      subscription.subscription.unsubscribe();
    };
  }, [client, loadAccountState, loadGuestState]);

  const updateTheme = useCallback((nextTheme: OneThemePreferences) => {
    const parsed = oneThemePreferencesSchema.safeParse(nextTheme);
    if (!parsed.success) return false;
    setTheme(parsed.data);
    if (user) setThemeSource("account-default");
    else {
      setThemeSource("local");
      window.localStorage.setItem(ONE_GUEST_THEME_STORAGE_KEY, JSON.stringify(parsed.data));
    }
    return true;
  }, [user]);

  const resetTheme = useCallback(() => {
    setTheme(DEFAULT_ONE_THEME);
    if (user) setThemeSource("account-default");
    else {
      setThemeSource("local");
      window.localStorage.setItem(ONE_GUEST_THEME_STORAGE_KEY, JSON.stringify(DEFAULT_ONE_THEME));
    }
  }, [user]);

  const updateInterfaceDepth = useCallback(async (nextDepth: InterfaceDepth) => {
    const parsed = interfaceDepthSchema.safeParse(nextDepth);
    if (!parsed.success) return { ok: false, message: "Choose one of ONE's four presentation depths." };
    if (!authReady) {
      return { ok: false, message: "Wait until ONE verifies the current account before changing this preference." };
    }
    setInterfaceDepth(parsed.data);

    if (!user) {
      try {
        window.localStorage.setItem(
          ONE_GUEST_INTERFACE_DEPTH_STORAGE_KEY,
          serializeInterfaceDepth(parsed.data),
        );
        setInterfaceDepthSource("guest-local");
        return { ok: true, message: `${labelForDepth(parsed.data)} view saved on this device.` };
      } catch {
        return { ok: false, message: `${labelForDepth(parsed.data)} view is active for this tab but could not be saved.` };
      }
    }

    setInterfaceDepthSource("account-draft");
    if (!client) return { ok: false, message: "The view changed, but account sync is unavailable." };
    const generation = accountLoadGeneration.current;
    const writeGeneration = ++interfaceDepthWriteGeneration.current;
    const userId = user.id;

    return interfaceDepthWrites.current.enqueue(async () => {
      if (generation !== accountLoadGeneration.current) {
        return { ok: false, message: "The account changed before this view preference could be confirmed." };
      }

      try {
        const { error } = await client.from("user_preferences").upsert({
          user_id: userId,
          interface_depth: parsed.data,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (generation !== accountLoadGeneration.current) {
          return { ok: false, message: "The account changed before this view preference could be confirmed." };
        }
        if (error) return { ok: false, message: "The view changed, but account sync failed." };
        if (writeGeneration === interfaceDepthWriteGeneration.current) {
          setInterfaceDepthSource("account-synced");
        }
        return { ok: true, message: `${labelForDepth(parsed.data)} view synced to this ONE account.` };
      } catch {
        return { ok: false, message: "The view changed, but account sync failed." };
      }
    });
  }, [authReady, client, user]);

  const saveThemeToAccount = useCallback(async () => {
    if (!client || !user) return { ok: false, message: "Sign in before syncing this theme." };
    const parsed = oneThemePreferencesSchema.safeParse(theme);
    if (!parsed.success) return { ok: false, message: "Fix the theme values before syncing." };
    const { error } = await client.from("user_preferences").upsert({
      user_id: user.id,
      primary_hex: parsed.data.primaryHex,
      secondary_hex: parsed.data.secondaryHex,
      appearance: parsed.data.appearance,
      reduced_motion: parsed.data.reducedMotion,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) return { ok: false, message: "The theme could not be synced. Your local theme is unchanged." };
    setThemeSource("synced");
    return { ok: true, message: "Theme synced to your ONE identity." };
  }, [client, theme, user]);

  const signOut = useCallback(async () => {
    if (client) {
      window.history.replaceState(
        window.history.state,
        "",
        setAuthOutcomeParam(new URL(window.location.href), "signed-out"),
      );
      const outcome = await endBrowserAuthSession((options) => client.auth.signOut(options));
      if (outcome === "unavailable") {
        window.history.replaceState(
          window.history.state,
          "",
          setAuthOutcomeParam(new URL(window.location.href), "logout-failed"),
        );
        return {
          ok: false,
          message: "Sign-out could not be confirmed. Your account remains active in this browser; try again before leaving the device.",
        };
      }
    }
    setUser(null);
    loadGuestState();
    return {
      ok: true,
      message: "Signed out. Account-scoped memory and session access were cleared; Guest Mode is active.",
    };
  }, [client, loadGuestState]);

  const persistReadIds = useCallback((next: Set<string>) => {
    setReadIds(next);
    if (!user) window.localStorage.setItem(GUEST_NOTIFICATION_STATE_KEY, JSON.stringify([...next]));
  }, [user]);

  const markUpdateRead = useCallback(async (id: string) => {
    if (!ONE_LAB_UPDATES.some((item) => item.id === id)) return;
    const next = new Set(readIds).add(id);
    persistReadIds(next);
    if (client && user) await client.from("user_notification_state").upsert({ user_id: user.id, update_id: id, read_at: new Date().toISOString() }, { onConflict: "user_id,update_id" });
  }, [client, persistReadIds, readIds, user]);

  const markAllUpdatesRead = useCallback(async () => {
    const next = new Set(ONE_LAB_UPDATES.map((item) => item.id));
    persistReadIds(next);
    if (client && user) await client.from("user_notification_state").upsert(ONE_LAB_UPDATES.map((item) => ({ user_id: user.id, update_id: item.id, read_at: new Date().toISOString() })), { onConflict: "user_id,update_id" });
  }, [client, persistReadIds, user]);

  const value = useMemo<OneExperienceValue>(() => ({
    authConfigured: Boolean(client), authReady, user, theme, themeSource, updateTheme, resetTheme,
    interfaceDepth, interfaceDepthSource, updateInterfaceDepth,
    saveThemeToAccount, signOut, updates: ONE_LAB_UPDATES,
    unreadCount: ONE_LAB_UPDATES.filter((item) => !readIds.has(item.id)).length,
    isUpdateRead: (id) => readIds.has(id), markUpdateRead, markAllUpdatesRead,
  }), [authReady, client, interfaceDepth, interfaceDepthSource, markAllUpdatesRead, markUpdateRead, readIds, resetTheme, saveThemeToAccount, signOut, theme, themeSource, updateInterfaceDepth, updateTheme, user]);

  return <OneExperienceContext.Provider value={value}>{children}</OneExperienceContext.Provider>;
}

export function useOneExperience() {
  const value = useContext(OneExperienceContext);
  if (!value) throw new Error("useOneExperience must be used within OneExperienceProvider");
  return value;
}

function labelForDepth(depth: InterfaceDepth) {
  return `${depth.charAt(0).toUpperCase()}${depth.slice(1)}`;
}

function toOneHuman(user: User | null): OneHuman | null {
  if (!isOneHumanAuthSubject(user)) return null;
  return { id: user.id, email: user.email ?? null };
}

async function claimGuestReceiptForCurrentSession(
  expectedHumanId: string,
): Promise<"bound" | "belongs-to-another-account" | "unavailable"> {
  try {
    const response = await fetch("/api/account/claim-guest", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const body: unknown = await response.json().catch(() => null);
      if (
        body
        && typeof body === "object"
        && (body as { humanId?: unknown }).humanId === expectedHumanId
      ) return "bound";
      return "unavailable";
    }
    if (response.status === 409) {
      const body: unknown = await response.json().catch(() => null);
      if (
        body
        && typeof body === "object"
        && (body as { humanId?: unknown }).humanId === expectedHumanId
        && "error" in body
      ) {
        const error = (body as { error?: unknown }).error;
        if (error && typeof error === "object" && (error as { code?: unknown }).code === "claimed-by-another-account") {
          return "belongs-to-another-account";
        }
      }
    }
  } catch {
    // A verified auth session is not exposed to account state until the guest
    // receipt is bound, preventing later same-device account leakage.
  }
  return "unavailable";
}
