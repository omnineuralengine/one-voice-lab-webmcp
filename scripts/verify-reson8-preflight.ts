import {
  Reson8LivePreflightError,
} from "@/lib/providers/reson8/live-verifier";
import { runReson8OfflinePreflight } from "@/lib/providers/reson8/live-preflight";

async function main(): Promise<void> {
  const result = await runReson8OfflinePreflight();
  console.log("Reson8 live-verification preflight: PASS");
  console.log("Audio available: YES");
  console.log("Manifest verified: YES");
  console.log("SHA-256 verified: YES");
  console.log("PCM WAV verified: YES");
  console.log("Duration within limit: YES");
  console.log(
    `Validated ignored local input: ${result.trustedAudio.durationSeconds}s, `
    + `${result.trustedAudio.sampleRate} Hz, ${result.trustedAudio.channels} channel, `
    + `${result.trustedAudio.bitsPerSample}-bit PCM.`,
  );
  console.log("Credential access: NONE. Provider requests: ZERO. Provider-use report created: NO.");
}

void main().catch((error: unknown) => {
  if (error instanceof Reson8LivePreflightError) {
    console.error(`Reson8 live-verification preflight: FAIL (${error.code}): ${error.message}`);
  } else {
    console.error("Reson8 live-verification preflight: FAIL (unexpected-local-error). No credential or provider request was attempted.");
  }
  process.exitCode = 1;
});
