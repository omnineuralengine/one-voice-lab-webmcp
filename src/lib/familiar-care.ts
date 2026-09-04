import type { TtsVoiceModel } from "@/lib/types";
import type { TtsVoiceLanguageCode } from "@/lib/tts-voices";

export type FamiliarCareRisk = "Low" | "Medium" | "High";
export type FamiliarCareDisclosureStyle =
  | "spoken-beginning"
  | "spoken-end"
  | "spoken-and-displayed"
  | "displayed-only";
export type FamiliarCareSensitiveDetailPolicy =
  | "no-sensitive-details"
  | "recipient-confirmed"
  | "authenticated-session";
export type FamiliarCareFallbackChannel =
  | "verified-mobile-app"
  | "secure-portal"
  | "text-message"
  | "human-callback"
  | "email"
  | "none";

export type FamiliarCareConsent = {
  permission: boolean;
  syntheticVoice: boolean;
  noImpersonation: boolean;
  sensitiveChannel: boolean;
  optOut: boolean;
};

export type FamiliarCareScenario = {
  id: string;
  title: string;
  purpose: string;
  sampleMessage: string;
  recommendedTone: string;
  consentRequirements: string[];
  privacyConsiderations: string;
  disclosureRequirements: string;
  riskLevel: FamiliarCareRisk;
  fallbackChannel: FamiliarCareFallbackChannel;
  recipientContext: string;
  messagePurpose: string;
  institution: string;
  language: TtsVoiceLanguageCode;
  voiceModel: TtsVoiceModel;
};

export type FamiliarCareSensitiveFinding = {
  kind: "warning" | "blocked";
  category: string;
  passage: string;
  explanation: string;
};

export type FamiliarCareRequestPolicy = {
  scenarioId: string;
  riskLevel: FamiliarCareRisk;
  disclosureStyle: FamiliarCareDisclosureStyle;
  sensitiveDetailPolicy: FamiliarCareSensitiveDetailPolicy;
  fallbackChannel: FamiliarCareFallbackChannel;
  optOutInstruction: string;
  consent: FamiliarCareConsent;
};

export const DEFAULT_FAMILIAR_CARE_OPT_OUT =
  "You can change or disable familiar-care messages in your account preferences.";

export const EMPTY_FAMILIAR_CARE_CONSENT: FamiliarCareConsent = {
  permission: false,
  syntheticVoice: false,
  noImpersonation: false,
  sensitiveChannel: false,
  optOut: false,
};

export const FAMILIAR_CARE_SCENARIOS: FamiliarCareScenario[] = [
  {
    id: "family-memory-reminder",
    title: "Family Memory Reminder",
    purpose: "A family-approved reminder for ordinary plans and shared memories.",
    sampleMessage:
      "Hi Maya. This is your family memory reminder. Dinner with Aunt Lena is Sunday at 5 PM. Bring the photo album if you want to scan a few favorites together.",
    recommendedTone: "Warm, gentle, and clearly automated",
    consentRequirements: ["Recipient and voice-use permission", "Clear synthetic disclosure", "Revocable opt-out"],
    privacyConsiderations: "Keep private family history and health details out of an unauthenticated message.",
    disclosureRequirements: "Spoken disclosure is required; never imply that a relative is speaking live.",
    riskLevel: "High",
    fallbackChannel: "human-callback",
    recipientContext: "Adult family member who opted into memory reminders",
    messagePurpose: "Family schedule and memory prompt",
    institution: "Family care circle",
    language: "en",
    voiceModel: "aura-2-helena-en",
  },
  {
    id: "medication-pickup-reminder",
    title: "Medication Pickup Reminder",
    purpose: "A pickup reminder that leaves medication details in a verified channel.",
    sampleMessage:
      "Hi Connor. This is your approved familiar-care reminder. CVS says your prescription is ready for pickup. Please check the CVS app for medication details.",
    recommendedTone: "Calm, warm, and concise",
    consentRequirements: ["Communication permission", "Synthetic disclosure", "Verified details channel"],
    privacyConsiderations: "Do not speak medication names, diagnoses, or other clinical details by default.",
    disclosureRequirements: "The automated synthetic voice must be disclosed aloud.",
    riskLevel: "Medium",
    fallbackChannel: "verified-mobile-app",
    recipientContext: "Person who opted into prescription pickup reminders",
    messagePurpose: "Prescription pickup availability",
    institution: "Pharmacy",
    language: "en",
    voiceModel: "aura-2-helena-en",
  },
  {
    id: "healthcare-appointment-reminder",
    title: "Healthcare Appointment Reminder",
    purpose: "An appointment reminder that directs private details to a secure channel.",
    sampleMessage:
      "Good morning. This is your approved familiar-care reminder. You have an appointment tomorrow at 9:30. Your provider sent the full details by text.",
    recommendedTone: "Calm, clear, and professional",
    consentRequirements: ["Communication permission", "Minimum necessary details", "Verified fallback"],
    privacyConsiderations: "Avoid diagnoses, procedure names, and other sensitive care details in open voice delivery.",
    disclosureRequirements: "The automated synthetic voice must be disclosed aloud.",
    riskLevel: "Medium",
    fallbackChannel: "secure-portal",
    recipientContext: "Person who opted into appointment reminders",
    messagePurpose: "Upcoming appointment reminder",
    institution: "Care provider",
    language: "en",
    voiceModel: "aura-2-harmonia-en",
  },
  {
    id: "financial-fraud-alert",
    title: "Financial Fraud Alert",
    purpose: "A safety alert that routes the recipient to a known, verified banking channel.",
    sampleMessage:
      "Hi Jordan. This is an automated fraud alert delivered using your approved familiar-care voice. Please open your banking app or call the verified number on your card.",
    recommendedTone: "Serious, concise, and non-alarming",
    consentRequirements: ["Transactional notification permission", "No account secrets", "Verified fallback and opt-out"],
    privacyConsiderations: "Never request or speak card numbers, authentication codes, balances, passwords, or account secrets.",
    disclosureRequirements: "Spoken disclosure is mandatory and the message must not resemble a personal caller.",
    riskLevel: "High",
    fallbackChannel: "verified-mobile-app",
    recipientContext: "Customer who enabled automated fraud notifications",
    messagePurpose: "Possible fraud notification",
    institution: "Financial institution",
    language: "en",
    voiceModel: "aura-2-mars-en",
  },
];

export const DEFAULT_FAMILIAR_CARE_SCENARIO = FAMILIAR_CARE_SCENARIOS[1];

export const FAMILIAR_CARE_DISCLOSURE_OPTIONS: Array<{ value: FamiliarCareDisclosureStyle; label: string }> = [
  { value: "spoken-beginning", label: "Spoken at the beginning" },
  { value: "spoken-end", label: "Spoken at the end" },
  { value: "spoken-and-displayed", label: "Spoken and displayed" },
  { value: "displayed-only", label: "Displayed only, marked as restricted" },
];

export const FAMILIAR_CARE_SENSITIVE_POLICY_OPTIONS: Array<{ value: FamiliarCareSensitiveDetailPolicy; label: string }> = [
  { value: "no-sensitive-details", label: "No sensitive details aloud" },
  { value: "recipient-confirmed", label: "Recipient-confirmed details only" },
  { value: "authenticated-session", label: "Authenticated-session details only" },
];

export const FAMILIAR_CARE_FALLBACK_OPTIONS: Array<{ value: FamiliarCareFallbackChannel; label: string }> = [
  { value: "verified-mobile-app", label: "Verified mobile app" },
  { value: "secure-portal", label: "Secure portal" },
  { value: "text-message", label: "Text message" },
  { value: "human-callback", label: "Human callback" },
  { value: "email", label: "Email" },
  { value: "none", label: "None, only for low-risk demos" },
];

export function familiarCareDisclosure(scenarioId: string) {
  return scenarioId === "family-memory-reminder"
    ? "This is an automated family memory reminder using an approved synthetic voice."
    : "This is an automated message delivered using an approved synthetic voice.";
}

export function familiarCareConsentReady(consent: FamiliarCareConsent | null | undefined) {
  return Boolean(
    consent?.permission
    && consent.syntheticVoice
    && consent.noImpersonation
    && consent.sensitiveChannel
    && consent.optOut,
  );
}

export function disclosureIsSpoken(style: FamiliarCareDisclosureStyle) {
  return style !== "displayed-only";
}

export function analyzeFamiliarCareText(text: string): FamiliarCareSensitiveFinding[] {
  const findings: FamiliarCareSensitiveFinding[] = [];
  const rules: Array<{ pattern: RegExp; category: string; kind: "warning" | "blocked"; explanation: string }> = [
    {
      pattern: /\b(?:\d[ -]*?){13,19}\b/g,
      category: "Full payment-card number",
      kind: "blocked",
      explanation: "Full payment-card numbers must never be spoken in this experience.",
    },
    {
      pattern: /\b(?:authentication|verification|security|one[- ]time|login)\s+(?:code|pin)\s*(?:is|:)?\s*\d{4,8}\b/gi,
      category: "Authentication code",
      kind: "blocked",
      explanation: "Authentication and one-time codes must remain in the authenticated channel.",
    },
    {
      pattern: /\b(?:metformin|insulin|lisinopril|atorvastatin|amoxicillin|warfarin|oxycodone)\b/gi,
      category: "Medication name",
      kind: "warning",
      explanation: "A likely medication name was detected. Keep it in a verified app, portal, or text channel by default.",
    },
    {
      pattern: /\b(?:diagnosed with|diagnosis|cancer|diabetes|hypertension|depression|hiv)\b/gi,
      category: "Diagnosis language",
      kind: "warning",
      explanation: "Likely diagnosis language may reveal private health information.",
    },
    {
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      category: "Government identifier",
      kind: "warning",
      explanation: "A number matching a sensitive identifier pattern was detected.",
    },
    {
      pattern: /\b(?:account|member)\s+(?:number|ending in)\s*(?:is|:)?\s*[A-Z0-9-]{4,}\b/gi,
      category: "Account number",
      kind: "warning",
      explanation: "Account identifiers should remain in a verified secondary channel.",
    },
    {
      pattern: /\b(?:date of birth|dob)\s*(?:is|:)?\s*(?:\d{1,2}[/-]){2}\d{2,4}\b/gi,
      category: "Date of birth",
      kind: "warning",
      explanation: "A date of birth should not be spoken in an unauthenticated message.",
    },
    {
      pattern: /\b(?:balance|amount due)\s*(?:is|:)?\s*\$?\d[\d,]*(?:\.\d{2})?\b/gi,
      category: "Financial balance",
      kind: "warning",
      explanation: "Detailed balances should be delivered through a verified financial channel.",
    },
  ];

  for (const rule of rules) {
    for (const match of text.matchAll(rule.pattern)) {
      findings.push({ kind: rule.kind, category: rule.category, passage: match[0], explanation: rule.explanation });
    }
  }

  return findings;
}

export function buildFamiliarCareDeliveryPreview(input: {
  scenarioId: string;
  message: string;
  disclosureStyle: FamiliarCareDisclosureStyle;
  fallbackChannel: FamiliarCareFallbackChannel;
  optOutInstruction: string;
}) {
  const disclosure = familiarCareDisclosure(input.scenarioId);
  const fallback = fallbackInstruction(input.fallbackChannel);
  const trailing = [fallback, input.optOutInstruction.trim()].filter(Boolean).join(" ");
  const spokenParts = input.disclosureStyle === "spoken-end"
    ? [input.message.trim(), trailing, disclosure]
    : input.disclosureStyle === "displayed-only"
      ? [input.message.trim(), trailing]
      : [disclosure, input.message.trim(), trailing];

  return {
    disclosure,
    disclosurePlacement: input.disclosureStyle,
    displayedDisclosure: input.disclosureStyle === "spoken-and-displayed" || input.disclosureStyle === "displayed-only",
    fallback,
    spokenText: spokenParts.filter(Boolean).join(" "),
  };
}

export function validateFamiliarCareRequest(input: {
  text: string;
  policy: FamiliarCareRequestPolicy;
  hosted?: boolean;
}) {
  const errors: string[] = [];
  const scenario = FAMILIAR_CARE_SCENARIOS.find((item) => item.id === input.policy.scenarioId);
  const findings = analyzeFamiliarCareText(input.text);
  const disclosureValues = FAMILIAR_CARE_DISCLOSURE_OPTIONS.map((item) => item.value);
  const policyValues = FAMILIAR_CARE_SENSITIVE_POLICY_OPTIONS.map((item) => item.value);
  const fallbackValues = FAMILIAR_CARE_FALLBACK_OPTIONS.map((item) => item.value);

  if (!scenario) errors.push("Select a recognized Familiar Care scenario.");
  if (scenario && scenario.riskLevel !== input.policy.riskLevel) errors.push("The submitted risk classification does not match the selected scenario.");
  if (!familiarCareConsentReady(input.policy.consent)) errors.push("Every Familiar Care consent confirmation is required.");
  if (!disclosureValues.includes(input.policy.disclosureStyle)) errors.push("Select a recognized disclosure style.");
  if (!policyValues.includes(input.policy.sensitiveDetailPolicy)) errors.push("Select a recognized sensitive-detail policy.");
  if (!fallbackValues.includes(input.policy.fallbackChannel)) errors.push("Select a recognized fallback channel.");
  if ((input.policy.riskLevel === "Medium" || input.policy.riskLevel === "High") && !disclosureIsSpoken(input.policy.disclosureStyle)) {
    errors.push("Medium- and high-risk scenarios require a spoken disclosure.");
  }
  if ((input.policy.riskLevel === "Medium" || input.policy.riskLevel === "High") && input.policy.fallbackChannel === "none") {
    errors.push("Medium- and high-risk scenarios require a verified fallback channel.");
  }
  if (!input.policy.optOutInstruction?.trim()) errors.push("An opt-out instruction is required.");
  if (!input.text.trim()) errors.push("Enter a message before previewing the approved voice.");
  if (input.text.length > (input.hosted ? 500 : 800)) errors.push(`Message exceeds the ${input.hosted ? 500 : 800}-character limit.`);
  if (findings.some((finding) => finding.kind === "blocked")) errors.push("The message contains prohibited sensitive content that must be removed.");
  if (input.policy.sensitiveDetailPolicy === "no-sensitive-details" && findings.some((finding) => finding.kind === "warning")) {
    errors.push("Revise the flagged sensitive text or explicitly choose an elevated sensitive-detail policy.");
  }

  return { ok: errors.length === 0, errors, findings, scenario };
}

export function sanitizeFamiliarCareRequest(input: {
  text: string;
  model?: TtsVoiceModel;
  policy: FamiliarCareRequestPolicy;
}) {
  return {
    model: input.model,
    textLength: input.text.trim().length,
    familiarCare: {
      scenarioId: input.policy.scenarioId,
      riskLevel: input.policy.riskLevel,
      disclosureStyle: input.policy.disclosureStyle,
      sensitiveDetailPolicy: input.policy.sensitiveDetailPolicy,
      fallbackChannel: input.policy.fallbackChannel,
      consentConfirmed: familiarCareConsentReady(input.policy.consent),
      optOutIncluded: Boolean(input.policy.optOutInstruction?.trim()),
    },
    sensitiveRecipientDetails: "***redacted***",
    credentials: "***server-only***",
  };
}

function fallbackInstruction(channel: FamiliarCareFallbackChannel) {
  const label = FAMILIAR_CARE_FALLBACK_OPTIONS.find((option) => option.value === channel)?.label;
  if (!label || channel === "none") return "";
  return `For full details, use the ${label.toLowerCase()}.`;
}
