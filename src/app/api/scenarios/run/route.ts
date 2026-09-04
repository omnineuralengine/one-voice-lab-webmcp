import { createScenarioRunHandler } from "@/lib/scenarios/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createScenarioRunHandler();
