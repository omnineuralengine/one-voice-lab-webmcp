import { createEvaluationCatalogHandler } from "@/lib/evaluation/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createEvaluationCatalogHandler();
