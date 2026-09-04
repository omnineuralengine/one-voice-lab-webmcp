export type PocketMode = "collapsed" | "compact" | "expanded";
export type PocketTargetId = "api-lab" | "pre-sales" | "architecture" | "live-mic" | "tts" | "voice-agent" | "latency";
export type PocketActionKind = "billable" | "destructive" | "administrative";
export type PocketConnectionState = "unchecked" | "checking" | "connected" | "unavailable";

export interface PocketTarget {
  id: PocketTargetId;
  label: string;
  shortLabel: string;
  description: string;
  href: string;
  category: "design" | "build" | "run" | "observe";
}

export interface PocketPreferences {
  schemaVersion: 1;
  mode: PocketMode;
  docked: boolean;
  demoMode: boolean;
}

export interface PocketRecentAction {
  targetId: PocketTargetId;
  openedAt: string;
}

export interface PocketStoredState {
  preferences: PocketPreferences;
  recentActions: PocketRecentAction[];
}

export interface PocketGuardedAction {
  kind: PocketActionKind;
  label: string;
  element: HTMLElement;
}

export interface PocketInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}
