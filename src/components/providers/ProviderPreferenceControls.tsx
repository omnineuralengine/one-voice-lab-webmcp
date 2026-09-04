"use client";

import { useEffect, useMemo, useState } from "react";

import { useOneExperience } from "@/components/one/OneExperienceProvider";
import { GUEST_PROVIDER_PREFERENCES_KEY } from "@/lib/auth/guest-state";
import {
  parseCanonicalProviderPreferences,
  PROVIDER_PREFERENCE_DEPLOYMENT_CLASSES,
  type ProviderPreferences,
} from "@/lib/providers/preference-schema";

export type ProviderPreferenceOption = Readonly<{
  id: string;
  name: string;
  supportsStt: boolean;
  supportsTts: boolean;
}>;

export function ProviderPreferenceControls({
  options,
  preferences,
  onChange,
}: {
  options: readonly ProviderPreferenceOption[];
  preferences: ProviderPreferences;
  onChange: (preferences: ProviderPreferences) => void;
}) {
  const one = useOneExperience();
  const [source, setSource] = useState<"loading" | "local" | "account">("loading");
  const [message, setMessage] = useState("Loading provider preferences…");
  const [saving, setSaving] = useState(false);
  const optionMap = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);

  useEffect(() => {
    if (!one.authReady) return;
    let active = true;
    const local = readGuestPreferences();
    if (!one.user && local) onChange(local);
    void fetch("/api/providers/preferences", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      const body: unknown = await response.json().catch(() => null);
      if (!active) return;
      const accountPreferences = readResponsePreferences(body);
      if (response.ok && accountPreferences) {
        onChange(accountPreferences);
        setSource("account");
        setMessage("Synced to your ONE identity. Preferences never enable providers or bypass access controls.");
        return;
      }
      setSource("local");
      setMessage(one.user
        ? "Sync is temporarily unavailable. Changes stay on this device until you retry."
        : "Guest preferences stay only on this device. Sign in to sync them.");
    }).catch(() => {
      if (!active) return;
      setSource("local");
      setMessage("Provider preferences are using private on-device storage.");
    });
    return () => { active = false; };
  }, [one.authReady, one.user, onChange]);

  const addToList = (field: "favoriteProviderIds" | "hiddenProviderIds" | "preferredComparisonProviderIds", id: string) => {
    if (!optionMap.has(id) || preferences[field].includes(id)) return;
    const maximum = field === "preferredComparisonProviderIds" ? 4 : 32;
    if (preferences[field].length >= maximum) {
      setMessage(field === "preferredComparisonProviderIds" ? "Comparison sets support up to four providers." : "That preference list is full.");
      return;
    }
    const next: ProviderPreferences = {
      ...preferences,
      [field]: [...preferences[field], id],
      ...(field === "favoriteProviderIds" ? { hiddenProviderIds: preferences.hiddenProviderIds.filter((item) => item !== id) } : {}),
      ...(field === "hiddenProviderIds" ? {
        favoriteProviderIds: preferences.favoriteProviderIds.filter((item) => item !== id),
        preferredComparisonProviderIds: preferences.preferredComparisonProviderIds.filter((item) => item !== id),
        defaultSttProviderId: preferences.defaultSttProviderId === id ? null : preferences.defaultSttProviderId,
        defaultTtsProviderId: preferences.defaultTtsProviderId === id ? null : preferences.defaultTtsProviderId,
      } : {}),
    };
    onChange(next);
  };

  const removeFromList = (field: "favoriteProviderIds" | "hiddenProviderIds" | "preferredComparisonProviderIds", id: string) => {
    onChange({ ...preferences, [field]: preferences[field].filter((item) => item !== id) });
  };

  const moveFavorite = (id: string, offset: -1 | 1) => {
    const order = preferences.preferredProviderOrder.filter((item) => preferences.favoriteProviderIds.includes(item));
    for (const favorite of preferences.favoriteProviderIds) if (!order.includes(favorite)) order.push(favorite);
    const index = order.indexOf(id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    onChange({ ...preferences, preferredProviderOrder: order });
  };

  const save = async () => {
    setSaving(true);
    if (!one.user) {
      writeGuestPreferences(preferences);
      setSource("local");
      setMessage("Saved privately on this device. These choices do not enable providers.");
      setSaving(false);
      return;
    }
    if (source !== "account") {
      setMessage("Account sync is unavailable. Signed-in choices were not copied into shared guest storage.");
      setSaving(false);
      return;
    }
    const { revision, ...preferenceValues } = preferences;
    try {
      const response = await fetch("/api/providers/preferences", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...preferenceValues, expectedRevision: revision }),
      });
      const body: unknown = await response.json().catch(() => null);
      const saved = readResponsePreferences(body);
      if (!response.ok || !saved) {
        setMessage(readResponseMessage(body) ?? "Preferences could not be synced. Your current view is unchanged.");
      } else {
        onChange(saved);
        setMessage("Provider preferences synced. Administrative policy remains server-authoritative.");
      }
    } catch {
      setMessage("Preferences could not be synced. Your current view is unchanged.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="rounded-2xl border border-white/10 bg-black/20" data-provider-preferences>
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300">
        Personalize this Provider Hub
      </summary>
      <div className="border-t border-white/10 p-4">
        <p className="text-sm leading-6 text-slate-400">Favorites, visibility, defaults, and comparison order affect only your presentation. They cannot configure, enable, or invoke a provider.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <PreferenceList id="favorite-provider" label="Favorite providers" items={preferences.favoriteProviderIds} options={options.filter((option) => !preferences.favoriteProviderIds.includes(option.id))} optionMap={optionMap} onAdd={(id) => addToList("favoriteProviderIds", id)} onRemove={(id) => removeFromList("favoriteProviderIds", id)} onMove={moveFavorite} />
          <PreferenceList id="hidden-provider" label="Hidden providers" items={preferences.hiddenProviderIds} options={options.filter((option) => !preferences.hiddenProviderIds.includes(option.id))} optionMap={optionMap} onAdd={(id) => addToList("hiddenProviderIds", id)} onRemove={(id) => removeFromList("hiddenProviderIds", id)} />
          <PreferenceList id="comparison-provider" label="Preferred comparison set" items={preferences.preferredComparisonProviderIds} options={options.filter((option) => !preferences.preferredComparisonProviderIds.includes(option.id))} optionMap={optionMap} onAdd={(id) => addToList("preferredComparisonProviderIds", id)} onRemove={(id) => removeFromList("preferredComparisonProviderIds", id)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <ProviderSelect id="default-stt-provider" label="Default STT" value={preferences.defaultSttProviderId ?? ""} options={options.filter((option) => option.supportsStt && !preferences.hiddenProviderIds.includes(option.id))} onChange={(id) => onChange({ ...preferences, defaultSttProviderId: id || null })} />
            <ProviderSelect id="default-tts-provider" label="Default TTS" value={preferences.defaultTtsProviderId ?? ""} options={options.filter((option) => option.supportsTts && !preferences.hiddenProviderIds.includes(option.id))} onChange={(id) => onChange({ ...preferences, defaultTtsProviderId: id || null })} />
            <label className="text-sm text-slate-300 sm:col-span-2" htmlFor="preferred-deployment-class">
              <span className="mb-1 block font-semibold">Preferred deployment class</span>
              <select className="min-h-11 w-full rounded-lg border border-white/15 bg-[#091017] px-3 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300" id="preferred-deployment-class" onChange={(event) => onChange({ ...preferences, preferredDeploymentClass: (event.target.value || null) as ProviderPreferences["preferredDeploymentClass"] })} value={preferences.preferredDeploymentClass ?? ""}>
                <option value="">No preference</option>
                {PROVIDER_PREFERENCE_DEPLOYMENT_CLASSES.map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-xs leading-5 text-slate-400" role="status">{message}</p>
          <button className="inline-flex min-h-11 items-center rounded-lg bg-[var(--one-purple)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none" disabled={saving} onClick={() => void save()} type="button">
            {saving ? "Saving…" : source === "account" ? "Sync preferences" : "Save on this device"}
          </button>
        </div>
      </div>
    </details>
  );
}

function PreferenceList({ id, label, items, options, optionMap, onAdd, onRemove, onMove }: {
  id: string;
  label: string;
  items: readonly string[];
  options: readonly ProviderPreferenceOption[];
  optionMap: ReadonlyMap<string, ProviderPreferenceOption>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onMove?: (id: string, offset: -1 | 1) => void;
}) {
  return (
    <fieldset className="min-w-0 rounded-xl border border-white/10 p-3">
      <legend className="px-1 text-sm font-semibold text-white">{label}</legend>
      <select aria-label={`Add to ${label.toLowerCase()}`} className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-[#091017] px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300" id={id} onChange={(event) => { if (event.target.value) onAdd(event.target.value); event.target.value = ""; }} value="">
        <option value="">Add provider…</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      {items.length ? (
        <ul className="mt-2 space-y-2">
          {items.map((idValue, index) => (
            <li className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-3" key={idValue}>
              <span className="truncate text-sm text-slate-200">{optionMap.get(idValue)?.name ?? idValue}</span>
              <span className="flex shrink-0 gap-1">
                {onMove ? <button aria-label={`Move ${optionMap.get(idValue)?.name ?? idValue} earlier`} className="min-h-11 min-w-11 rounded text-slate-300 focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-30" disabled={index === 0} onClick={() => onMove(idValue, -1)} type="button">↑</button> : null}
                {onMove ? <button aria-label={`Move ${optionMap.get(idValue)?.name ?? idValue} later`} className="min-h-11 min-w-11 rounded text-slate-300 focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-30" disabled={index === items.length - 1} onClick={() => onMove(idValue, 1)} type="button">↓</button> : null}
                <button aria-label={`Remove ${optionMap.get(idValue)?.name ?? idValue} from ${label.toLowerCase()}`} className="min-h-11 min-w-11 rounded text-slate-300 focus-visible:outline-2 focus-visible:outline-violet-300" onClick={() => onRemove(idValue)} type="button">×</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-xs text-slate-500">None selected.</p>}
    </fieldset>
  );
}

function ProviderSelect({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: readonly ProviderPreferenceOption[]; onChange: (id: string) => void }) {
  return (
    <label className="text-sm text-slate-300" htmlFor={id}>
      <span className="mb-1 block font-semibold">{label}</span>
      <select className="min-h-11 w-full rounded-lg border border-white/15 bg-[#091017] px-3 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300" id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">No default</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </label>
  );
}

function readGuestPreferences(): ProviderPreferences | null {
  try {
    const raw = window.localStorage.getItem(GUEST_PROVIDER_PREFERENCES_KEY);
    if (!raw || raw.length > 8_192) return null;
    return parseCanonicalProviderPreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeGuestPreferences(preferences: ProviderPreferences) {
  const parsed = parseCanonicalProviderPreferences({ ...preferences, revision: 0 });
  if (parsed) window.localStorage.setItem(GUEST_PROVIDER_PREFERENCES_KEY, JSON.stringify(parsed));
}

function readResponsePreferences(value: unknown): ProviderPreferences | null {
  if (!value || typeof value !== "object") return null;
  return parseCanonicalProviderPreferences((value as Record<string, unknown>).preferences);
}

function readResponseMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return null;
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" && message.length <= 300 ? message : null;
}

function labelFor(value: string) {
  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
