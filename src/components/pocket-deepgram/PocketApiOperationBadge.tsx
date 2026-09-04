import { classifyPocketApiOperation } from "@/lib/pocket-api-lab";
import type { DeepgramEndpointDefinition } from "@/types/deepgram-endpoint-registry";

export function PocketApiOperationBadge({ endpoint }: { endpoint: DeepgramEndpointDefinition }) {
  const kind = classifyPocketApiOperation(endpoint);
  return <span className={`pocket-api-operation is-${kind}`}>{kind}</span>;
}
