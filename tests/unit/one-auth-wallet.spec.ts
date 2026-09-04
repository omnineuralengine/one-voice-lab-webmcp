import { expect, test } from "@playwright/test";

import sitemap from "@/app/sitemap";
import {
  ONE_WALLETCONNECT_METHODS,
  openOneWalletConnect,
  type WalletConnectInitOptions,
  type WalletConnectProvider,
} from "@/lib/auth/wallet-connect";
import {
  getOneWalletConnectProjectId,
  isOneWalletConnectEnabled,
} from "@/lib/supabase/config";

const ORIGINAL_ENV = {
  web3: process.env.NEXT_PUBLIC_ONE_AUTH_WEB3_ENABLED,
  walletConnect: process.env.NEXT_PUBLIC_ONE_AUTH_WALLETCONNECT_ENABLED,
  projectId: process.env.NEXT_PUBLIC_ONE_WALLETCONNECT_PROJECT_ID,
};

test.afterEach(() => {
  setOptionalEnv("NEXT_PUBLIC_ONE_AUTH_WEB3_ENABLED", ORIGINAL_ENV.web3);
  setOptionalEnv("NEXT_PUBLIC_ONE_AUTH_WALLETCONNECT_ENABLED", ORIGINAL_ENV.walletConnect);
  setOptionalEnv("NEXT_PUBLIC_ONE_WALLETCONNECT_PROJECT_ID", ORIGINAL_ENV.projectId);
});

test("WalletConnect capability fails closed until every public condition is valid", () => {
  process.env.NEXT_PUBLIC_ONE_AUTH_WEB3_ENABLED = "true";
  process.env.NEXT_PUBLIC_ONE_AUTH_WALLETCONNECT_ENABLED = "true";

  for (const projectId of [undefined, "", "too-short", "spaces are not valid", "<script>not-a-project</script>"]) {
    setOptionalEnv("NEXT_PUBLIC_ONE_WALLETCONNECT_PROJECT_ID", projectId);
    expect(getOneWalletConnectProjectId()).toBeNull();
    expect(isOneWalletConnectEnabled()).toBe(false);
  }

  process.env.NEXT_PUBLIC_ONE_WALLETCONNECT_PROJECT_ID = "0123456789abcdef0123456789abcdef";
  expect(getOneWalletConnectProjectId()).toBe("0123456789abcdef0123456789abcdef");
  expect(isOneWalletConnectEnabled()).toBe(true);

  process.env.NEXT_PUBLIC_ONE_AUTH_WEB3_ENABLED = "TRUE";
  expect(isOneWalletConnectEnabled()).toBe(false);
});

test("membership readiness is published without enabling payments", () => {
  expect(sitemap().map((entry) => entry.url)).toContain(
    "https://one-voice-lab.vercel.app/membership",
  );
});

test("WalletConnect initializes only authentication methods and cleans up its relay", async () => {
  const captured: { current?: WalletConnectInitOptions } = {};
  const pairingUris: string[] = [];
  let connected = 0;
  let disconnected = 0;
  let displayUriListener: ((uri: string) => void) | null = null;
  const pairingUri = `wc:${"a".repeat(64)}@2?relay-protocol=irn&symKey=${"b".repeat(64)}`;
  const provider: WalletConnectProvider = {
    address: "0x0000000000000000000000000000000000000001",
    request: async () => null,
    on: ((event: string, listener: (uri: string) => void) => {
      if (event === "display_uri") displayUriListener = listener as (uri: string) => void;
    }) as WalletConnectProvider["on"],
    removeListener: ((event: string) => {
      if (event === "display_uri") displayUriListener = null;
    }) as WalletConnectProvider["removeListener"],
    connect: async () => {
      connected += 1;
      displayUriListener?.(pairingUri);
    },
    disconnect: async () => { disconnected += 1; },
  };

  const session = await openOneWalletConnect("0123456789abcdef0123456789abcdef", {
    origin: "https://one-voice-lab.vercel.app",
    onDisplayUri: (uri) => pairingUris.push(uri),
    loadProvider: async () => ({
      init: async (options) => {
        captured.current = options;
        return provider;
      },
    }),
  });

  expect(connected).toBe(1);
  expect(session.wallet).toBe(provider);
  expect(captured.current).toMatchObject({
    projectId: "0123456789abcdef0123456789abcdef",
    metadata: {
      name: "ONE Voice Lab",
      url: "https://one-voice-lab.vercel.app",
      icons: ["https://one-voice-lab.vercel.app/icon.png"],
    },
    methods: [...ONE_WALLETCONNECT_METHODS],
    chains: [1],
    showQrModal: false,
    telemetryEnabled: false,
  });
  expect(captured.current).not.toHaveProperty("optionalChains");
  expect(captured.current).not.toHaveProperty("optionalMethods");
  expect(captured.current?.methods).toEqual([
    "eth_requestAccounts",
    "eth_chainId",
    "personal_sign",
  ]);
  expect(captured.current?.methods).not.toContain("eth_sendTransaction");
  expect(captured.current?.methods).not.toContain("eth_signTransaction");
  expect(captured.current?.methods).not.toContain("wallet_watchAsset");
  expect(pairingUris).toEqual([pairingUri]);
  expect(displayUriListener).toBeNull();

  await session.disconnect();
  expect(disconnected).toBe(1);
});

test("relay cleanup cannot invalidate an established Supabase session", async () => {
  const provider: WalletConnectProvider = {
    address: "0x0000000000000000000000000000000000000001",
    request: async () => null,
    on: () => undefined,
    removeListener: () => undefined,
    connect: async () => undefined,
    disconnect: async () => { throw new Error("relay already closed"); },
  };
  const session = await openOneWalletConnect("0123456789abcdef0123456789abcdef", {
    origin: "https://one-voice-lab.vercel.app",
    loadProvider: async () => ({ init: async () => provider }),
  });

  await expect(session.disconnect()).resolves.toBeUndefined();
});

function setOptionalEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
