import "server-only";

import { lstat, mkdir, open, realpath, rename, rm, type FileHandle } from "node:fs/promises";
import path from "node:path";

import type { Reson8ServerCredential } from "@/lib/providers/reson8/live-credential";
import {
  serializeSafeReson8LiveReport,
  type Reson8LiveVerificationReport,
} from "@/lib/providers/reson8/live-verifier";

export const RESON8_LIVE_REPORT_FILENAME = "report.json" as const;
export const RESON8_LIVE_LEASE_FILENAME = "verification.lock" as const;

export async function readBoundedRegularFile(
  filePath: string,
  maxBytes: number,
  testHooks: Readonly<{ afterOpen?: () => Promise<void> }> = {},
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("The manual Reson8 file bound is invalid.");
  }
  const initial = await lstat(filePath);
  if (!initial.isFile() || initial.isSymbolicLink() || initial.size < 1 || initial.size > maxBytes) {
    throw new Error("The manual Reson8 input is not a bounded regular file.");
  }
  const resolved = await realpath(filePath);
  if (path.resolve(resolved).toLocaleLowerCase("en-US") !== path.resolve(filePath).toLocaleLowerCase("en-US")) {
    throw new Error("The manual Reson8 input cannot be a link.");
  }

  const handle = await open(filePath, "r");
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile()
      || opened.dev !== initial.dev
      || opened.ino !== initial.ino
      || opened.size !== initial.size
      || opened.size < 1
      || opened.size > maxBytes
    ) {
      throw new Error("The manual Reson8 input changed during validation.");
    }
    await testHooks.afterOpen?.();

    const buffer = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, offset);
      if (bytesRead < 1) throw new Error("The manual Reson8 input changed during reading.");
      offset += bytesRead;
    }
    const probe = Buffer.alloc(1);
    const extra = await handle.read(probe, 0, 1, opened.size);
    const completed = await handle.stat();
    if (
      extra.bytesRead !== 0
      || completed.dev !== opened.dev
      || completed.ino !== opened.ino
      || completed.size !== opened.size
    ) {
      throw new Error("The manual Reson8 input changed during reading.");
    }
    return buffer;
  } finally {
    await handle.close();
  }
}

export async function acquireReson8LiveFileLease(
  directory: string,
): Promise<Readonly<{ release(): Promise<void> }>> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const leasePath = path.join(directory, RESON8_LIVE_LEASE_FILENAME);
  let handle;
  try {
    handle = await open(leasePath, "wx", 0o600);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error("A Reson8 live verification lease already exists.");
    }
    throw error;
  }
  await handle.close();
  let released = false;
  return Object.freeze({
    async release() {
      if (released) return;
      await rm(leasePath, { force: true });
      released = true;
    },
  });
}

export async function writeReson8LiveReportAtomic(input: Readonly<{
  directory: string;
  report: Reson8LiveVerificationReport;
  credential: Reson8ServerCredential;
}>): Promise<string> {
  // Validate and scan before touching the final or temporary report files.
  const serialized = serializeSafeReson8LiveReport(input.report, input.credential);
  await mkdir(input.directory, { recursive: true, mode: 0o700 });
  const reportPath = path.join(input.directory, RESON8_LIVE_REPORT_FILENAME);
  const temporaryPath = path.join(input.directory, `report.${process.pid}.tmp`);
  let temporaryHandle: FileHandle | undefined;
  try {
    temporaryHandle = await open(temporaryPath, "wx", 0o600);
    await temporaryHandle.writeFile(serialized, { encoding: "utf8" });
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    await rename(temporaryPath, reportPath);
  } finally {
    await temporaryHandle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
  }
  return reportPath;
}
