export {
  RESON8_ADAPTER_VERSION,
  RESON8_PROVIDER_ID,
  MAX_RESON8_NORMALIZED_RESPONSE_BYTES,
  Reson8ProtocolError,
  asReson8ProtocolError,
  normalizeReson8Transcript,
  normalizeReson8Words,
  parseReson8EventContext,
  parseReson8JsonBody,
  reson8WordSchema,
  type Reson8ProtocolErrorCode,
  type Reson8Word,
} from "@/lib/providers/reson8/protocol";

export {
  createReson8PrerecordedSttAdapter,
  normalizeReson8PrerecordedResponse,
  reson8PrerecordedOptionsSchema,
  reson8PrerecordedResponseSchema,
  type Reson8PrerecordedOptions,
  type Reson8PrerecordedResponse,
  type Reson8PrerecordedResult,
  type Reson8PrerecordedSttAdapter,
  type Reson8PrerecordedTransport,
  type Reson8PrerecordedTransportRequest,
  type Reson8PrerecordedTransportResponse,
} from "@/lib/providers/reson8/prerecorded";

export {
  normalizeReson8RealtimeEvent,
  reson8FlushConfirmationSchema,
  reson8RealtimeSttEventAdapter,
  reson8RealtimeTranscriptSchema,
  type Reson8RealtimeMessage,
} from "@/lib/providers/reson8/realtime";

export {
  createReson8TurnAwareSttEventAdapter,
  reson8TurnEndCandidateSchema,
  reson8TurnEndSchema,
  reson8TurnStartSchema,
  type Reson8TurnMessage,
} from "@/lib/providers/reson8/turns";

export {
  RESON8_CONTRACT_CANDIDATE,
  RESON8_FIXTURE_ADAPTERS,
  RESON8_PROTOCOL_FIXTURES,
  buildReson8RealtimeFixtureEvents,
  buildReson8TurnFixtureEvents,
  createReson8PcmWavFixture,
} from "@/lib/providers/reson8/fixtures";
