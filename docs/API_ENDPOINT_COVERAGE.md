# API Endpoint Coverage

This table is validated against `DEEPGRAM_ENDPOINT_REGISTRY` by the unit test suite. “Fixture-verified” means local construction, policy, reducer, or UI fixtures passed; it does not mean a paid Deepgram call ran.

| Registry ID | Family | Endpoint | Method | Protocol | Status | Execution | Tier | Docs | Tested |
|---|---|---|---|---|---|---|---:|---|---|
| `stt-prerecorded` | Speech to Text | `/v1/listen` | POST | HTTPS | Runnable only with trusted file admission; URL/JSON execution disabled | canonical `ProviderSttAdapter` via compatibility executor | 1 | [reference](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded) | Fixture-verified; live verification not performed |
| `stt-live` | Speech to Text | `/v1/listen` | GET | WSS | Local/fixture handoff; hosted token issuance disabled | provider-specific Live Mic; canonical realtime architecture deferred | 1 | [reference](https://developers.deepgram.com/reference/speech-to-text/listen-streaming) | Fixture-verified; live verification not performed |
| `stt-flux` | Speech to Text | `/v2/listen` | GET | WSS | Local/fixture surface; hosted issuance disabled | provider-specific API Studio and Flux Observatory client; canonical realtime adapter deferred | 1 | [reference](https://developers.deepgram.com/reference/speech-to-text/listen-flux) | Deterministic fixtures only; live verification not performed |
| `tts-rest` | Text to Speech | `/v1/speak` | POST | HTTPS | Runnable only after exact-operation policy/admission | canonical `ProviderTtsAdapter` via compatibility executor | 1 | [reference](https://developers.deepgram.com/reference/text-to-speech/speak-request) | Fixture-verified; live verification not performed |
| `tts-streaming` | Text to Speech | `/v1/speak` | GET | WSS | Local/fixture surface; hosted issuance disabled | provider-specific browser WebSocket; canonical realtime adapter deferred | 1 | [reference](https://developers.deepgram.com/reference/text-to-speech/speak-streaming) | Manual verification required; no live verification performed |
| `text-intelligence` | Intelligence | `/v1/read` | POST | HTTPS | Runnable | server REST | 1 | [reference](https://developers.deepgram.com/reference/text-intelligence/analyze-text) | Fixture-verified |
| `voice-agent-converse` | Voice Agent | `/v1/agent/converse` | GET | WSS | Local/fixture surface; hosted issuance disabled | provider-specific browser WebSocket; canonical session adapter deferred | 1 | [reference](https://developers.deepgram.com/reference/voice-agent/voice-agent) | Manual verification required; no live verification performed |
| `auth-token-grant` | Authentication | `/v1/auth/grant` | POST | HTTPS | Hosted disabled; local operator only where separately permitted | dedicated server route outside canonical batch adapters | 1 | [reference](https://developers.deepgram.com/reference/auth/tokens/grant) | Fixture-only boundary; provider replay/session semantics unverified |
| `models-public-list` | Models | `/v1/models` | GET | HTTPS | Read-only compatibility ID | canonical static/network-free discovery | 2 | [reference](https://developers.deepgram.com/reference/manage/models/list) | Fixture-verified; no provider request |
| `models-public-get` | Models | `/v1/models/{model_id}` | GET | HTTPS | Read-only compatibility ID | canonical static/network-free discovery | 2 | [reference](https://developers.deepgram.com/reference/manage/models/get) | Fixture-verified; no provider request |
| `models-project-list` | Models | `/v1/projects/{project_id}/models` | GET | HTTPS | Read-only | denied/deferred | 2 | [reference](https://developers.deepgram.com/reference/manage/projects/models/list) | Denied before provider transport; no live verification |
| `models-project-get` | Models | `/v1/projects/{project_id}/models/{model_id}` | GET | HTTPS | Read-only | denied/deferred | 2 | [reference](https://developers.deepgram.com/reference/manage/projects/models/get) | Denied before provider transport; no live verification |
| `projects-list` | Projects | `/v1/projects` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/projects/list) | Fixture-verified |
| `projects-get` | Projects | `/v1/projects/{project_id}` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/projects/get) | Fixture-verified |
| `projects-update` | Projects | `/v1/projects/{project_id}` | PATCH | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/manage/projects/update) | Locked by design |
| `projects-delete` | Projects | `/v1/projects/{project_id}` | DELETE | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/manage/projects/delete) | Locked by design |
| `projects-leave` | Projects | `/v1/projects/{project_id}/leave` | DELETE | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/manage/projects/leave) | Locked by design |
| `requests-list` | Requests | `/v1/projects/{project_id}/requests` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/requests/list) | Fixture-verified |
| `requests-get` | Requests | `/v1/projects/{project_id}/requests/{request_id}` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/requests/get) | Fixture-verified |
| `usage-summary` | Usage | `/v1/projects/{project_id}/usage` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/usage/summary/get) | Fixture-verified |
| `usage-fields` | Usage | `/v1/projects/{project_id}/usage/fields` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/usage/fields/list) | Fixture-verified |
| `usage-breakdown` | Usage | `/v1/projects/{project_id}/usage/breakdown` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/usage/breakdown/get) | Fixture-verified |
| `billing-balances` | Billing | `/v1/projects/{project_id}/balances` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/billing/list) | Fixture-verified |
| `billing-balance-get` | Billing | `/v1/projects/{project_id}/balances/{balance_id}` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/billing/get) | Fixture-verified |
| `billing-breakdown` | Billing | `/v1/projects/{project_id}/billing/breakdown` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/billing/breakdown/get) | Fixture-verified |
| `billing-fields` | Billing | `/v1/projects/{project_id}/billing/fields` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/billing/fields/list) | Fixture-verified |
| `keys-list` | Administration | `/v1/projects/{project_id}/keys` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/keys/list) | Fixture-verified |
| `keys-get` | Administration | `/v1/projects/{project_id}/keys/{key_id}` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/keys/get) | Fixture-verified |
| `keys-create` | Administration | `/v1/projects/{project_id}/keys` | POST | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/manage/keys/create) | Locked by design |
| `keys-delete` | Administration | `/v1/projects/{project_id}/keys/{key_id}` | DELETE | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/manage/keys/delete) | Locked by design |
| `members-list` | Administration | `/v1/projects/{project_id}/members` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/members/list) | Fixture-verified |
| `member-scopes-list` | Administration | `/v1/projects/{project_id}/members/{member_id}/scopes` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/members/scopes/list) | Fixture-verified |
| `member-scopes-update` | Administration | `/v1/projects/{project_id}/members/{member_id}/scopes` | PUT | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/manage/members/scopes/update) | Locked by design |
| `members-delete` | Administration | `/v1/projects/{project_id}/members/{member_id}` | DELETE | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/manage/members/delete) | Locked by design |
| `invitations-list` | Administration | `/v1/projects/{project_id}/invites` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/manage/invites/list) | Fixture-verified |
| `invitations-create` | Administration | `/v1/projects/{project_id}/invites` | POST | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/manage/invites/create) | Locked by design |
| `invitations-delete` | Administration | `/v1/projects/{project_id}/invites/{email}` | DELETE | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/manage/invites/delete) | Locked by design |
| `agent-configurations-list` | Voice Agent | `/v1/projects/{project_id}/agents` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/voice-agent/agent-configurations/list) | Fixture-verified |
| `agent-configurations-get` | Voice Agent | `/v1/projects/{project_id}/agents/{agent_id}` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/voice-agent/agent-configurations/get) | Fixture-verified |
| `agent-configurations-create` | Voice Agent | `/v1/projects/{project_id}/agents` | POST | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/voice-agent/agent-configurations/create) | Locked by design |
| `agent-configurations-update` | Voice Agent | `/v1/projects/{project_id}/agents/{agent_id}` | PUT | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/voice-agent/agent-configurations/update) | Locked by design |
| `agent-configurations-delete` | Voice Agent | `/v1/projects/{project_id}/agents/{agent_id}` | DELETE | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/voice-agent/agent-configurations/delete) | Locked by design |
| `agent-variables-list` | Voice Agent | `/v1/projects/{project_id}/agent-variables` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/voice-agent/agent-variables/list) | Fixture-verified |
| `agent-variables-get` | Voice Agent | `/v1/projects/{project_id}/agent-variables/{variable_id}` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/voice-agent/agent-variables/get) | Fixture-verified |
| `agent-variables-create` | Voice Agent | `/v1/projects/{project_id}/agent-variables` | POST | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/voice-agent/agent-variables/create) | Locked by design |
| `agent-variables-update` | Voice Agent | `/v1/projects/{project_id}/agent-variables/{variable_id}` | PATCH | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/voice-agent/agent-variables/update) | Locked by design |
| `agent-variables-delete` | Voice Agent | `/v1/projects/{project_id}/agent-variables/{variable_id}` | DELETE | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/voice-agent/agent-variables/delete) | Locked by design |
| `distribution-credentials-list` | Administration | `/v1/projects/{project_id}/self-hosted/distribution/credentials` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/self-hosted/distribution-credentials/list) | Fixture-verified |
| `distribution-credentials-get` | Administration | `/v1/projects/{project_id}/self-hosted/distribution/credentials/{distribution_credentials_id}` | GET | HTTPS | Read-only | server REST | 2 | [reference](https://developers.deepgram.com/reference/self-hosted/distribution-credentials/get) | Fixture-verified |
| `distribution-credentials-create` | Administration | `/v1/projects/{project_id}/self-hosted/distribution/credentials` | POST | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/self-hosted/distribution-credentials/create) | Locked by design |
| `distribution-credentials-delete` | Administration | `/v1/projects/{project_id}/self-hosted/distribution/credentials/{distribution_credentials_id}` | DELETE | HTTPS | Advanced mutation | locked | 3 | [reference](https://developers.deepgram.com/reference/self-hosted/distribution-credentials/delete) | Locked by design |

## Cross-cutting `/v1/listen` redaction coverage

The `stt-prerecorded` and `stt-live` operation metadata expose repeatable `redact` query values. API Studio serializes arrays with one query key per value and preserves them in URL, cURL, JavaScript/TypeScript, Python, and raw-parameter views.

Flux is intentionally excluded from the current project surface: the verified `stt-flux` registry does not expose `redact`. This is Manual verification required, not an assertion that Deepgram can never support the combination.

Compatibility and source verification are documented in [REDACTION_API_CONFIGURATION.md](REDACTION_API_CONFIGURATION.md) and [STREAMING_REDACTION.md](STREAMING_REDACTION.md).

## Canonical-provider boundary

The table is an API Studio registry inventory, not the canonical provider
capability declaration. the Deepgram provider integration makes public model/voice discovery,
prerecorded STT, and batch TTS canonical core operations. Project/account model
operations remain bounded API Studio compatibility surfaces and are not
projected as public provider discovery. Streaming/session entries remain outside
the batch adapters, and hosted temporary-token issuance remains disabled. See
[Deepgram core convergence](providers/DEEPGRAM.md) and the
[realtime architecture boundary](providers/DEEPGRAM_REALTIME_ARCHITECTURE.md).
