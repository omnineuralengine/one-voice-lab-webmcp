"use client";

import type { UserIdentity } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

import { useOneExperience } from "@/components/one/OneExperienceProvider";
import {
  clearMigratedGuestState,
  collectGuestMigrationSnapshot,
  guestSnapshotHasState,
} from "@/lib/auth/guest-state";
import { ONE_GUEST_THEME_STORAGE_KEY } from "@/lib/one/theme";
import { getOneSupabaseBrowserClient } from "@/lib/supabase/client";

export function OneAccountControls({ onNotice }: { onNotice: (value: string) => void }) {
  const one = useOneExperience();
  const client = useMemo(() => getOneSupabaseBrowserClient(), []);
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [guestStateAvailable, setGuestStateAvailable] = useState(readGuestStateAvailability);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  useEffect(() => {
    if (!client || !one.user) return;
    let active = true;
    void client.auth.getUserIdentities().then(({ data }) => {
      if (active) setIdentities(data?.identities ?? []);
    });
    return () => { active = false; };
  }, [client, one.user]);

  if (!one.user) return null;

  async function importGuestState() {
    setMigrationBusy(true);
    try {
      const snapshot = collectGuestMigrationSnapshot(window.localStorage, ONE_GUEST_THEME_STORAGE_KEY);
      if (!guestSnapshotHasState(snapshot)) {
        setGuestStateAvailable(false);
        onNotice("No eligible guest state remains on this device.");
        return;
      }
      const response = await fetch("/api/account/migrate-guest", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(snapshot),
      });
      const body = await readJsonObject(response);
      if (!response.ok) {
        if (readErrorCode(body) === "claimed-by-another-account") {
          clearMigratedGuestState(window.localStorage, ONE_GUEST_THEME_STORAGE_KEY);
          setGuestStateAvailable(false);
          onNotice("The prior device guest state belonged to another account and was cleared instead of being imported.");
          return;
        }
        onNotice(readErrorMessage(body) ?? "Guest state could not be imported. The local copy is unchanged.");
        return;
      }
      clearMigratedGuestState(window.localStorage, ONE_GUEST_THEME_STORAGE_KEY);
      setGuestStateAvailable(false);
      onNotice("Eligible guest preferences and simulations were imported once. Existing account preferences were preserved.");
      window.location.assign("/settings?migration=complete#identity");
    } catch {
      onNotice("Guest state could not be imported. The local copy is unchanged.");
    } finally {
      setMigrationBusy(false);
    }
  }

  async function exportAccount() {
    setExportBusy(true);
    try {
      const response = await fetch("/api/account/export", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const body = await readJsonObject(response);
        onNotice(readErrorMessage(body) ?? "Account data could not be exported right now.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "one-account-export.json";
      link.click();
      URL.revokeObjectURL(url);
      onNotice("A private, bounded ONE account export was downloaded to this device.");
    } catch {
      onNotice("Account data could not be exported right now.");
    } finally {
      setExportBusy(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirmation !== "DELETE MY ONE ACCOUNT") return;
    setDeleteBusy(true);
    try {
      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation, acknowledgePermanent: true }),
      });
      const body = await readJsonObject(response);
      if (!response.ok) {
        onNotice(readErrorMessage(body) ?? "The account was not deleted.");
        return;
      }
      clearMigratedGuestState(window.localStorage, ONE_GUEST_THEME_STORAGE_KEY);
      await clearOneCaches();
      onNotice("The ONE account and its cascade-owned application data were deleted.");
      window.location.replace("/settings?account=deleted#identity");
    } catch {
      onNotice("The account was not deleted.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="one-account-controls">
      {guestStateAvailable ? (
        <section aria-labelledby="guest-import-title" className="one-account-control-card">
          <h3 id="guest-import-title">Bring this device&apos;s guest work with you</h3>
          <p>Import only bounded theme, Lab, notification, provider-presentation, update-read, and synthetic Simulation Lab state. Existing account preferences win; credentials, audio, transcripts, customer material, and arbitrary browser storage are never imported.</p>
          <button disabled={migrationBusy} type="button" onClick={() => void importGuestState()}>
            {migrationBusy ? "Importing…" : "Import eligible guest state"}
          </button>
        </section>
      ) : null}

      <section aria-labelledby="identity-methods-title" className="one-account-control-card">
        <h3 id="identity-methods-title">Authentication methods</h3>
        {identities.length ? <ul>{identities.map((identity) => <li key={identity.id}>{identityProviderLabel(identity.provider)}</li>)}</ul> : <p>No additional identity method was returned.</p>}
        <p>Automatic account merging and browser-side link/unlink controls are deferred until recent-authentication and provider-collision behavior are production-verified.</p>
      </section>

      <section aria-labelledby="account-export-title" className="one-account-control-card">
        <h3 id="account-export-title">Export account-owned data</h3>
        <p>The versioned export includes your profile, preferences, notification state, and saved synthetic simulations. It excludes credentials, tokens, system/security records, and private benchmark artifacts.</p>
        <button disabled={exportBusy} type="button" onClick={() => void exportAccount()}>{exportBusy ? "Preparing…" : "Download account export"}</button>
      </section>

      <details className="one-account-control-card one-account-danger">
        <summary>Delete ONE account</summary>
        <p>This permanently deletes the Supabase authentication identity and cascade-owned profile, preference, notification, saved-simulation, trust, and usage rows. Some bounded operational records and submitted feedback text may remain for their documented retention period after the database removes the account link; that text is not guaranteed to be deidentified. Historical benchmark records retain their existing policy. A fresh sign-in is required.</p>
        <label className="one-settings-field" htmlFor="one-delete-confirmation"><span>Type DELETE MY ONE ACCOUNT</span><input autoComplete="off" id="one-delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label>
        <button disabled={deleteBusy || deleteConfirmation !== "DELETE MY ONE ACCOUNT"} type="button" onClick={() => void deleteAccount()}>{deleteBusy ? "Deleting…" : "Permanently delete account"}</button>
      </details>
    </div>
  );
}

async function readJsonObject(response: Response) {
  const value: unknown = await response.json().catch(() => null);
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function readErrorCode(value: Record<string, unknown> | null) {
  const error = value?.error;
  return error && typeof error === "object" && typeof (error as Record<string, unknown>).code === "string"
    ? (error as Record<string, unknown>).code as string
    : null;
}

function readErrorMessage(value: Record<string, unknown> | null) {
  const error = value?.error;
  const message = error && typeof error === "object" ? (error as Record<string, unknown>).message : null;
  return typeof message === "string" && message.length <= 300 ? message : null;
}

async function clearOneCaches() {
  if (!("caches" in window)) return;
  const keys = await window.caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("pocket-deepgram-") || key.startsWith("one-voice-lab-")).map((key) => window.caches.delete(key)));
}

function readGuestStateAvailability() {
  if (typeof window === "undefined") return false;
  try {
    return guestSnapshotHasState(collectGuestMigrationSnapshot(window.localStorage, ONE_GUEST_THEME_STORAGE_KEY));
  } catch {
    return false;
  }
}

function identityProviderLabel(provider: string) {
  const bounded = provider.trim().slice(0, 48).replace(/[^a-z0-9._ -]/gi, "");
  if (!bounded) return "Verified identity";
  return bounded.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
