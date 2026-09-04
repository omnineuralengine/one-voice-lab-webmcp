# Familiar Care Design

## Product purpose

Routine care and service messages can feel less impersonal when delivered by an approved synthetic voice, provided the recipient is never misled about who or what is speaking. Familiar Care makes consent, disclosure, privacy, fallback, and revocation part of the delivery design rather than optional copy.

## Non-goals

- No real voice cloning or custom speaker enrollment.
- No claim that a living or deceased person is calling.
- No automated medical, legal, financial, or compliance conclusion.
- No automatic TTS generation or playback.
- No recipient data, transcript text, or audio in diagnostic exports.

## Smallest viable architecture

```text
Institution event
→ approved message template
→ sensitive-detail policy
→ consent and preference check
→ Deepgram Aura TTS
→ disclosure
→ delivery channel
→ fallback and opt-out
→ audit event
```

The current lab implements the policy and TTS preview portions. A production design would also require idempotency, preference lookup, locale handling, approved-template versioning, delivery failure handling, model fallback, TTS timeouts, retention controls, observability, audit logging, and human escalation.

## Grief-sensitive boundary

Exact voice replication is outside this demo. Posthumous or memory-related voice experiences require careful human review and must not be treated as generally approved or safe. Documented permission, clear synthetic disclosure, revocation, recipient expectations, and grief-sensitive research would be prerequisites for any separate real-world design.
