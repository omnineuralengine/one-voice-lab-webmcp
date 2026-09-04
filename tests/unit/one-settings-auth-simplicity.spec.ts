import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const settingsSource = readFileSync(
  resolve(process.cwd(), "src/components/one/OneSettings.tsx"),
  "utf8",
);
const passwordlessRouteSource = readFileSync(
  resolve(process.cwd(), "src/app/api/auth/passwordless/route.ts"),
  "utf8",
);

test.describe("ONE Identity guest sign-in", () => {
  test("makes the passwordless email path primary", () => {
    const magicLinkAction = settingsSource.indexOf("Continue with email");
    const passwordDisclosure = settingsSource.indexOf("<details");
    const passwordInput = settingsSource.indexOf('id="one-identity-password"');

    expect(settingsSource).toContain('className="one-settings-primary w-full"');
    expect(settingsSource).toContain('fetch("/api/auth/passwordless"');
    expect(passwordlessRouteSource).toContain("auth.signInWithOtp");
    expect(passwordlessRouteSource).toContain("shouldCreateUser: true");
    expect(passwordlessRouteSource).toContain("isSameSiteRequest");
    expect(passwordlessRouteSource).toContain("does not reveal whether an account already existed");
    expect(settingsSource).toContain('aria-describedby="one-email-sign-in-help"');
    expect(magicLinkAction).toBeGreaterThan(-1);
    expect(magicLinkAction).toBeLessThan(passwordDisclosure);
    expect(passwordDisclosure).toBeLessThan(passwordInput);
  });

  test("keeps password actions in a semantic disclosure", () => {
    expect(settingsSource).toContain("<details");
    expect(settingsSource).toContain("<summary");
    expect(settingsSource).toContain("Use a password</summary>");
    expect(settingsSource).toContain("auth.signInWithPassword");
    expect(settingsSource).toContain("auth.signUp");
  });

  test("preserves the settings identity anchor", () => {
    expect(settingsSource).toContain('<SettingsSection id="identity"');
    expect(settingsSource).toContain('<OneIdentityPanel key={one.user?.id ?? "guest"} onNotice={setNotice} />');
    expect(settingsSource).toContain("<OneAccountControls onNotice={onNotice} />");
  });

  test("renders only configured social and wallet choices", () => {
    expect(settingsSource).toContain("enabledProviders.length > 0 ? (");
    expect(settingsSource).toContain("walletAuthenticationAvailable ? (");
    expect(settingsSource).toContain("Continue with {provider.label}");
    expect(settingsSource).toContain("Continue with {wallet.name}");
    expect(settingsSource).toContain("Continue with WalletConnect");
    expect(settingsSource).not.toContain("No social OAuth provider is enabled");
    expect(settingsSource).not.toContain("Wallet authentication stays hidden");
    expect(settingsSource).not.toContain("No compatible wallet is configured");
  });
});
