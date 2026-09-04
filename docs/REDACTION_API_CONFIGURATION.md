# Redaction API Configuration

## Exact syntax

Use one `redact` query key per profile or entity:

```text
redact=pii
redact=pci&redact=pii
redact=phone_number&redact=email_address
```

Multiple values are serialized as repeated query parameters. The lab must not emit comma-separated, JSON-array, or URL-encoded comma forms.

```text
https://api.deepgram.com/v1/listen?model=nova-3&redact=pci&redact=pii
```

Safe cURL example:

```bash
curl -X POST "https://api.deepgram.com/v1/listen?model=nova-3&redact=pci&redact=pii" \
  -H "Authorization: Token YOUR_DEEPGRAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"YOUR_AUDIO_URL"}'
```

The permanent key is a server-only environment value in this application. Generated examples use a placeholder.

## Profiles and individual entities

Profiles (`pii`, `pci`, `phi`, `numbers`, `aggressive_numbers`) may be combined. Individual supported entities may be selected instead. If a selected profile already inherits an explicit entity, the serializer removes the redundant entity value while preserving the profile.

## Route behavior

- JSON prerecorded URL requests accept `redact: string[]`.
- Multipart file requests use repeated `redact` form fields.
- Server request construction uses `URLSearchParams.append` for each value.
- API Studio arrays are rendered as repeated query keys in the URL and generated snippets.
- Live Mic appends every validated value to `/v1/listen` before the WebSocket opens.

Changing a policy never starts a request.

## `no_delay`

When streaming redaction is enabled, `no_delay=true` prioritizes lower-latency interim delivery and may reduce redaction performance. The lab warns rather than silently changing an advanced request. Redaction-priority guidance is to use `false` or omit the parameter, based on the verified documentation; no numerical accuracy or latency claim is made.

## Transcript scope

Typed placeholders apply to transcript output. They say nothing about whether the source audio was retained, played, logged, exported, or deleted.
