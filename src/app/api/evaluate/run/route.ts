import { createEvaluationRunHandler } from "@/lib/evaluation/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = createEvaluationRunHandler();
