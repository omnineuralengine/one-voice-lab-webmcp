import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const pdf = await readFile(path.join(process.cwd(), "docs", "vision", "AVS.pdf"));
    return new Response(pdf, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline; filename=Applied-Voice-Systems-Observatory.pdf",
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("The local AVS whitepaper was not found.", { status: 404 });
  }
}
