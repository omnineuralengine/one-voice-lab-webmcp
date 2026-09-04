import type { EthereumWallet } from "@supabase/supabase-js";

export const ONE_WALLETCONNECT_METHODS = [
  "eth_requestAccounts",
  "eth_chainId",
  "personal_sign",
] as const;

const ONE_WALLETCONNECT_EVENTS = [
  "accountsChanged",
  "chainChanged",
] as const;

export type WalletConnectProvider = EthereumWallet & {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

export type WalletConnectInitOptions = {
  projectId: string;
  metadata: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
  showQrModal: false;
  chains: number[];
  methods: string[];
  events: string[];
  telemetryEnabled: false;
};

export type WalletConnectProviderFactory = {
  init: (options: WalletConnectInitOptions) => Promise<WalletConnectProvider>;
};

type WalletConnectDisplayEvents = {
  on: (event: "display_uri", listener: (uri: unknown) => void) => void;
  removeListener: (event: "display_uri", listener: (uri: unknown) => void) => void;
};

type OpenWalletConnectOptions = {
  origin?: string;
  loadProvider?: () => Promise<WalletConnectProviderFactory>;
  onDisplayUri?: (uri: string) => void;
};

export type OneWalletConnectSession = {
  wallet: EthereumWallet;
  disconnect: () => Promise<void>;
};

async function loadWalletConnectProvider(): Promise<WalletConnectProviderFactory> {
  const providerModule = await import("@walletconnect/ethereum-provider");
  return providerModule.EthereumProvider as unknown as WalletConnectProviderFactory;
}

function isWalletConnectPairingUri(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 2_048
    && /^wc:[a-f0-9]{64}@2\?[^\s\u0000-\u001f]+$/i.test(value);
}

export async function openOneWalletConnect(
  projectId: string,
  options: OpenWalletConnectOptions = {},
): Promise<OneWalletConnectSession> {
  const origin = options.origin ?? (typeof window === "undefined" ? null : window.location.origin);
  if (!origin) throw new Error("WalletConnect is available only in a browser.");

  const Provider = await (options.loadProvider ?? loadWalletConnectProvider)();
  const provider = await Provider.init({
    projectId,
    metadata: {
      name: "ONE Voice Lab",
      description: "Sign in to ONE Voice Lab. Authentication never authorizes a payment.",
      url: origin,
      icons: [new URL("/icon.png", origin).toString()],
    },
    // Reown AppKit's bundled modal emits mandatory vendor analytics. ONE renders
    // the pairing URI locally so this authentication path can keep telemetry off.
    showQrModal: false,
    chains: [1],
    methods: [...ONE_WALLETCONNECT_METHODS],
    events: [...ONE_WALLETCONNECT_EVENTS],
    telemetryEnabled: false,
  });

  const handleDisplayUri = (uri: unknown) => {
    if (isWalletConnectPairingUri(uri)) options.onDisplayUri?.(uri);
  };
  const displayEvents = provider as unknown as WalletConnectDisplayEvents;
  displayEvents.on("display_uri", handleDisplayUri);
  try {
    await provider.connect();
  } finally {
    displayEvents.removeListener("display_uri", handleDisplayUri);
  }
  return {
    wallet: provider,
    disconnect: async () => {
      try {
        await provider.disconnect();
      } catch {
        // Supabase owns the resulting identity session. Relay cleanup is best-effort.
      }
    },
  };
}
