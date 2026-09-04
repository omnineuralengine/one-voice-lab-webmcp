import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const minimum = [20, 9, 0];
const current = process.versions.node.split(".").map(Number);
const nodeSupported = current.some((value, index) => value > minimum[index] && current.slice(0, index).every((part, partIndex) => part === minimum[partIndex]))
  || current.every((value, index) => value === minimum[index]);
const envPath = resolve(process.cwd(), ".env.local");
const envExists = existsSync(envPath);
const envText = envExists ? readFileSync(envPath, "utf8") : "";
const keyConfigured = /^DEEPGRAM_API_KEY\s*=\s*(?!replace_me\s*$|your_deepgram_api_key_here\s*$)\S+/m.test(envText);

console.log(`Node.js: ${process.versions.node} (${nodeSupported ? "supported" : "requires 20.9.0 or newer"})`);
console.log(`.env.local: ${envExists ? "present" : "missing; copy .env.example"}`);
console.log(`DEEPGRAM_API_KEY: ${keyConfigured ? "configured (value not displayed)" : "not configured"}`);
console.log("Browsers: current Chrome or Edge recommended; current Firefox and Safari may use fallback paths.");
console.log("Security: .env.local remains local and temporary browser tokens are used where applicable.");

if (!nodeSupported) process.exitCode = 1;
