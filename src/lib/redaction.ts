export const REDACTION_DOCS_URL = "https://developers.deepgram.com/docs/redaction";
export const REDACTION_ENTITIES_DOCS_URL = "https://developers.deepgram.com/docs/supported-entity-types";
export const REDACTION_VERIFIED_AT = "2026-07-16";

export type RedactionProfile = "pii" | "pci" | "phi" | "numbers" | "aggressive_numbers";
export type RedactionCategory = "PII" | "PHI" | "PCI" | "Other";

export type RedactionEntity = {
  value: string;
  displayName: string;
  description: string;
  category: RedactionCategory;
  includedProfiles: RedactionProfile[];
  enterpriseScenario: string;
  cautions: string;
  support: {
    hostedPrerecorded: boolean;
    hostedStreamingEnglishOnly: boolean;
    selfHostedEnglishOnly: boolean;
  };
  source: string;
  verifiedAt: string;
};

const entityRows: ReadonlyArray<readonly [string, RedactionCategory, readonly RedactionProfile[]]> = [
  ["account_number", "PII", ["numbers", "pii"]], ["age", "PII", ["numbers", "pii"]],
  ["bank_account", "PII", ["numbers"]], ["cardinal", "Other", []],
  ["credit_card", "PCI", ["numbers", "pci"]], ["credit_card_expiration", "PCI", ["numbers", "pci"]],
  ["cvv", "PCI", ["numbers", "pci"]], ["date", "PII", ["numbers", "pii"]],
  ["date_interval", "PII", ["numbers", "pii"]], ["dob", "PII", ["numbers", "pii"]],
  ["email_address", "PII", ["pii"]], ["event", "PII", ["pii"]], ["filename", "PII", ["pii"]],
  ["gender_sexuality", "PII", ["pii"]], ["healthcare_number", "PII", ["numbers", "pii"]],
  ["ip_address", "PII", ["numbers", "pii"]], ["location", "PII", ["numbers", "pii"]],
  ["location_address", "PII", ["numbers", "pii"]], ["location_city", "PII", ["pii"]],
  ["location_coordinate", "PII", ["numbers", "pii"]], ["location_country", "PII", ["pii"]],
  ["location_state", "PII", ["pii"]], ["location_zip", "PII", ["numbers", "pii"]],
  ["money", "PII", ["numbers", "pii"]], ["name", "PII", ["pii"]],
  ["name_given", "PII", ["pii"]], ["name_family", "PII", ["pii"]],
  ["name_medical_professional", "PII", ["pii"]], ["numerical_pii", "PII", ["numbers", "pii"]],
  ["occupation", "PII", ["pii"]], ["ordinal", "Other", []], ["origin", "PII", ["pii"]],
  ["passport_number", "PII", ["numbers", "pii"]], ["password", "PII", ["numbers", "pii"]],
  ["percent", "Other", []], ["phone_number", "PII", ["numbers", "pii"]],
  ["physical_attribute", "PII", ["pii"]], ["ssn", "PII", ["numbers", "pii"]],
  ["time", "PII", ["numbers", "pii"]], ["url", "PII", ["pii"]], ["username", "PII", ["pii"]],
  ["vehicle_id", "PII", ["numbers", "pii"]], ["condition", "PHI", ["phi"]],
  ["drug", "PHI", ["phi"]], ["injury", "PHI", ["phi"]], ["blood_type", "PHI", ["phi"]],
  ["medical_process", "PHI", ["phi"]], ["statistics", "PHI", ["numbers", "phi"]],
  ["language", "Other", ["pii"]], ["marital_status", "Other", ["pii"]],
  ["organization", "Other", ["pii"]], ["political_affiliation", "Other", ["pii"]],
  ["religion", "Other", ["pii"]], ["routing_number", "Other", ["numbers"]], ["zodiac_sign", "Other", ["pii"]],
] as const;

function displayName(value: string) {
  return value.split("_").map((part) => part === "cvv" || part === "ssn" ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)).join(" ");
}

const categoryCopy: Record<RedactionCategory, Pick<RedactionEntity, "description" | "enterpriseScenario" | "cautions">> = {
  PII: {
    description: "A personal or identifying entity supported by Deepgram transcript redaction.",
    enterpriseScenario: "Customer-support, identity, or account-service transcripts.",
    cautions: "Detection is contextual and may under-redact or over-redact; validate representative audio.",
  },
  PHI: {
    description: "A health-related entity supported by Deepgram transcript redaction.",
    enterpriseScenario: "Healthcare scheduling, pharmacy, insurance, or care-support transcripts.",
    cautions: "This transcript control is not a compliance guarantee and does not change source audio.",
  },
  PCI: {
    description: "A payment-related entity supported by Deepgram transcript redaction.",
    enterpriseScenario: "Financial-services and payment contact-center transcripts.",
    cautions: "Keep cardholder data out of fixtures and independently govern audio, logs, and retention.",
  },
  Other: {
    description: "A supported entity that may be selected individually or inherited by a profile.",
    enterpriseScenario: "Application-specific transcript governance and analytics pipelines.",
    cautions: "Confirm business meaning and utility impact before using this entity in production.",
  },
};

export const REDACTION_ENTITIES: readonly RedactionEntity[] = entityRows.map(([value, category, profiles]) => ({
  value,
  displayName: displayName(value),
  category,
  includedProfiles: [...profiles],
  ...categoryCopy[category],
  support: { hostedPrerecorded: true, hostedStreamingEnglishOnly: true, selfHostedEnglishOnly: true },
  source: REDACTION_ENTITIES_DOCS_URL,
  verifiedAt: REDACTION_VERIFIED_AT,
}));

const entityValues = new Set(REDACTION_ENTITIES.map((entity) => entity.value));
const PROFILE_ORDER: readonly RedactionProfile[] = ["pii", "pci", "phi", "numbers", "aggressive_numbers"];

export type RedactionPolicy = {
  profiles: RedactionProfile[];
  entities: string[];
};

export type RedactionPresetId =
  | "off" | "general-pii" | "payment-data" | "health-information" | "numeric-identifiers"
  | "aggressive-numeric" | "financial-contact-center" | "healthcare-contact-center" | "custom";

export type RedactionPreset = {
  id: RedactionPresetId;
  name: string;
  summary: string;
  policy: RedactionPolicy;
  caution: string;
};

export const REDACTION_PRESETS: readonly RedactionPreset[] = [
  { id: "off", name: "Off", summary: "No Deepgram transcript-redaction values are sent.", policy: { profiles: [], entities: [] }, caution: "Downstream transcript handling remains the application’s responsibility." },
  { id: "general-pii", name: "General PII", summary: "Privacy-oriented starting point for broadly identifying information.", policy: { profiles: ["pii"], entities: [] }, caution: "Requires representative validation and organizational review." },
  { id: "payment-data", name: "Payment Data", summary: "Application-specific configuration for payment-card transcript entities.", policy: { profiles: ["pci"], entities: [] }, caution: "Not a PCI DSS compliance claim." },
  { id: "health-information", name: "Health Information", summary: "Privacy-oriented starting point for health-related transcript entities.", policy: { profiles: ["phi"], entities: [] }, caution: "Not a HIPAA compliance claim." },
  { id: "numeric-identifiers", name: "Numeric Identifiers", summary: "Entity-aware numeric redaction plus generic masking for longer numeral sequences.", policy: { profiles: ["numbers"], entities: [] }, caution: "May replace useful numeric content." },
  { id: "aggressive-numeric", name: "Aggressive Numeric Masking", summary: "Masks numeral sequences including one- and two-digit values.", policy: { profiles: ["aggressive_numbers"], entities: [] }, caution: "High over-redaction risk; evaluate transcript utility." },
  { id: "financial-contact-center", name: "Financial Contact Center", summary: "Recommended demonstration policy combining payment and personal entities.", policy: { profiles: ["pci", "pii"], entities: [] }, caution: "Does not sanitize source audio or establish compliance." },
  { id: "healthcare-contact-center", name: "Healthcare Contact Center", summary: "Recommended demonstration policy combining health and personal entities.", policy: { profiles: ["phi", "pii"], entities: [] }, caution: "Audio, access, logs, and retention require separate governance." },
  { id: "custom", name: "Custom Policy", summary: "One or more explicitly selected supported entity values.", policy: { profiles: [], entities: [] }, caution: "Review potential gaps and utility impact." },
] as const;

export const EMPTY_REDACTION_POLICY: RedactionPolicy = Object.freeze({ profiles: [], entities: [] });

export function normalizeRedactionPolicy(policy: RedactionPolicy): RedactionPolicy {
  const profiles = PROFILE_ORDER.filter((profile) => policy.profiles.includes(profile));
  const entities = Array.from(new Set(policy.entities.map((value) => value.trim()).filter(Boolean)));
  const unsupported = entities.filter((value) => !entityValues.has(value));
  if (unsupported.length) throw new Error(`Unsupported Deepgram redaction entity: ${unsupported.join(", ")}.`);
  return { profiles, entities };
}

export function inheritedRedactionEntities(policy: RedactionPolicy) {
  const normalized = normalizeRedactionPolicy(policy);
  return REDACTION_ENTITIES.filter((entity) => entity.includedProfiles.some((profile) => normalized.profiles.includes(profile))).map((entity) => entity.value);
}

export function serializeRedactionValues(policy: RedactionPolicy) {
  const normalized = normalizeRedactionPolicy(policy);
  const inherited = new Set(inheritedRedactionEntities(normalized));
  return [...normalized.profiles, ...normalized.entities.filter((entity) => !inherited.has(entity))];
}

export function appendRedactionQuery(searchParams: URLSearchParams, policyOrValues: RedactionPolicy | readonly string[]) {
  const values = Array.isArray(policyOrValues) ? policyOrValues : serializeRedactionValues(policyOrValues as RedactionPolicy);
  for (const value of values) searchParams.append("redact", value);
  return searchParams;
}

export function redactionQueryString(policy: RedactionPolicy) {
  return appendRedactionQuery(new URLSearchParams(), policy).toString();
}

export function parseRedactionValues(values: unknown): RedactionPolicy {
  const list = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const strings = list.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean);
  return normalizeRedactionPolicy({
    profiles: strings.filter((value): value is RedactionProfile => PROFILE_ORDER.includes(value as RedactionProfile)),
    entities: strings.filter((value) => !PROFILE_ORDER.includes(value as RedactionProfile)),
  });
}

export type RedactionCompatibilityInput = {
  deployment: "hosted" | "self-hosted";
  mode: "prerecorded" | "streaming";
  language: string;
  projectSurface?: "listen" | "flux";
};

export function evaluateRedactionCompatibility(input: RedactionCompatibilityInput) {
  if (input.projectSurface === "flux") return { supported: false, reason: "The project’s verified Flux operation metadata does not expose redact. Manual verification is required before enabling it." };
  if (input.deployment === "hosted" && input.mode === "prerecorded") return { supported: true, reason: "Hosted prerecorded redaction is documented across available languages, subject to model support." };
  if (input.language.toLowerCase().split("-")[0] !== "en") return { supported: false, reason: `${input.deployment === "hosted" ? "Hosted streaming" : "Self-hosted"} redaction is currently documented for English only.` };
  return { supported: true, reason: `${input.deployment === "hosted" ? "Hosted streaming" : "Self-hosted"} redaction is documented for English.` };
}

export function redactionNoDelayWarning(enabled: boolean, noDelay: boolean) {
  return enabled && noDelay ? "no_delay=true prioritizes low latency and may reduce redaction performance. Omit it or use false when prioritizing stabilized redaction." : null;
}

export type SyntheticFinding = { entity: string; placeholder: string; selectedBy: string };
export type SyntheticRedactionFixture = {
  id: string;
  name: string;
  purpose: string;
  original: string;
  redacted: string;
  findings: SyntheticFinding[];
  synthetic: true;
};

export const SYNTHETIC_REDACTION_FIXTURES: readonly SyntheticRedactionFixture[] = [
  { id: "financial", name: "Financial Support Call", purpose: "Payment and contact-center policy evaluation", original: "Hello, my demo name is Casey Example. My intentionally invalid card digits are 0000 0000 0000 0001 and my fictional phone is 000 000 0199.", redacted: "Hello, my demo name is [NAME_1]. My intentionally invalid card digits are [CREDIT_CARD_1] and my fictional phone is [PHONE_NUMBER_1].", synthetic: true, findings: [{ entity: "name", placeholder: "[NAME_1]", selectedBy: "pii" }, { entity: "credit_card", placeholder: "[CREDIT_CARD_1]", selectedBy: "pci" }, { entity: "phone_number", placeholder: "[PHONE_NUMBER_1]", selectedBy: "pii" }] },
  { id: "pharmacy", name: "Pharmacy Pickup Call", purpose: "Health and personal entity policy evaluation", original: "Demo patient Maya Example takes the fictional medicine Novalexa for fictional Northwind syndrome.", redacted: "Demo patient [NAME_1] takes the fictional medicine [DRUG_1] for fictional [CONDITION_1].", synthetic: true, findings: [{ entity: "name", placeholder: "[NAME_1]", selectedBy: "pii" }, { entity: "drug", placeholder: "[DRUG_1]", selectedBy: "phi" }, { entity: "condition", placeholder: "[CONDITION_1]", selectedBy: "phi" }] },
  { id: "scheduling", name: "Healthcare Scheduling", purpose: "Scheduling and clinician-name policy evaluation", original: "Demo patient Taylor Example has an appointment with Doctor Demo on Friday at nine thirty.", redacted: "Demo patient [NAME_1] has an appointment with [NAME_MEDICAL_PROFESSIONAL_1] on [DATE_1] at [TIME_1].", synthetic: true, findings: [{ entity: "name", placeholder: "[NAME_1]", selectedBy: "pii" }, { entity: "name_medical_professional", placeholder: "[NAME_MEDICAL_PROFESSIONAL_1]", selectedBy: "pii" }, { entity: "date", placeholder: "[DATE_1]", selectedBy: "pii" }, { entity: "time", placeholder: "[TIME_1]", selectedBy: "pii" }] },
  { id: "insurance", name: "Insurance Claim", purpose: "Claim and injury policy evaluation", original: "Demo claimant Avery Example reports a fictional wrist injury under invalid account 000-EXAMPLE.", redacted: "Demo claimant [NAME_1] reports a fictional [INJURY_1] under invalid account [ACCOUNT_NUMBER_1].", synthetic: true, findings: [{ entity: "name", placeholder: "[NAME_1]", selectedBy: "pii" }, { entity: "injury", placeholder: "[INJURY_1]", selectedBy: "phi" }, { entity: "account_number", placeholder: "[ACCOUNT_NUMBER_1]", selectedBy: "pii" }] },
  { id: "recovery", name: "Account Recovery", purpose: "Authentication-sensitive policy evaluation", original: "Demo user example_user should never share password demo-only-password or authentication codes.", redacted: "Demo user [USERNAME_1] should never share password [PASSWORD_1] or authentication codes.", synthetic: true, findings: [{ entity: "username", placeholder: "[USERNAME_1]", selectedBy: "pii" }, { entity: "password", placeholder: "[PASSWORD_1]", selectedBy: "pii" }] },
  { id: "support", name: "General Customer Support", purpose: "General personal-information policy evaluation", original: "Demo customer Riley Example can be contacted at riley@example.test about the fictional support case.", redacted: "Demo customer [NAME_1] can be contacted at [EMAIL_ADDRESS_1] about the fictional support case.", synthetic: true, findings: [{ entity: "name", placeholder: "[NAME_1]", selectedBy: "pii" }, { entity: "email_address", placeholder: "[EMAIL_ADDRESS_1]", selectedBy: "pii" }] },
] as const;

export const STREAMING_REDACTION_FIXTURE = [
  { at: "00:00.000", label: "Audio started", placeholder: null, phase: "client" },
  { at: "00:01.220", label: "Interim transcript received", placeholder: null, phase: "interim" },
  { at: "00:01.221", label: "Generic placeholder emitted", placeholder: "[REDACTED]", phase: "interim" },
  { at: "00:01.870", label: "Entity context updated", placeholder: "[REDACTED]", phase: "interim" },
  { at: "00:02.030", label: "Placeholder classified", placeholder: "[PHONE_NUMBER_1]", phase: "interim" },
  { at: "00:02.500", label: "Final transcript received", placeholder: "[PHONE_NUMBER_1]", phase: "final" },
] as const;

export function fixtureUtility(fixture: SyntheticRedactionFixture) {
  const originalTokens = fixture.original.trim().split(/\s+/).length;
  const replacedTokens = fixture.findings.length;
  return {
    placeholderCount: fixture.findings.length,
    distinctEntityClasses: new Set(fixture.findings.map((finding) => finding.entity)).size,
    preservedWordCount: Math.max(0, originalTokens - replacedTokens),
    transcriptUtilityIndicator: Math.max(0, Math.round(((originalTokens - replacedTokens) / originalTokens) * 100)),
  };
}
export function sanitizeRedactionDiagnostics(input: {
  policy: RedactionPolicy;
  fixture?: SyntheticRedactionFixture;
  mode: "fixture" | "live";
}) {
  return {
    mode: input.mode,
    requestValues: serializeRedactionValues(input.policy),
    profiles: normalizeRedactionPolicy(input.policy).profiles,
    entityTypes: input.fixture?.findings.map((finding) => finding.entity) ?? [],
    placeholderTypes: input.fixture?.findings.map((finding) => finding.placeholder.replace(/_\d+\]$/, "]")) ?? [],
    rawSensitiveValuesIncluded: false,
    credentialsIncluded: false,
    audioIncluded: false,
  };
}
