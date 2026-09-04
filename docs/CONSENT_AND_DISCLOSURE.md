# Familiar Care Consent and Disclosure

## Consent gate

Every preview requires confirmation that:

1. the operator has permission to use the voice or message;
2. the experience uses an approved synthetic voice and does not claim to be a live person;
3. the operator will not impersonate a real person without consent;
4. sensitive details remain in a verified secondary channel; and
5. the recipient can opt out.

The browser disables generation until all checks pass. The TTS route validates the same typed policy independently. Consent is component-session state only and resets when the scenario, language, or approved voice context changes. It is not stored indefinitely.

## Disclosure

The default is **Spoken and displayed**. Medium- and high-risk scenarios cannot use displayed-only disclosure. The delivery preview shows the exact spoken order before execution.

## Sensitive-detail policy

The default is **No sensitive details aloud**. Heuristics flag likely medication names, diagnosis language, government or account identifiers, dates of birth, and detailed balances. A warning requires revision or an explicit elevated policy. Full payment-card numbers and authentication codes are blocked under every policy.

Detection is incomplete by design and is not a substitute for approved templates, privacy review, or authenticated delivery.

## Revocation and fallback

All current scenarios require an opt-out instruction. Medium- and high-risk scenarios also require a verified fallback such as a mobile app, secure portal, text, human callback, or email. A production system must check current recipient preferences before every delivery and provide a human escalation path.
