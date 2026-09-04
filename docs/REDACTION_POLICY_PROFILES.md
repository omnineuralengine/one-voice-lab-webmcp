# Redaction Policy Profiles

Profiles are privacy-oriented starting points and demonstration policies—not compliance labels.

| Lab profile | Exact request values | Intended starting point | Main caution |
| --- | --- | --- | --- |
| General PII | `redact=pii` | Personal and identifying transcript content | Contextual misses and over-redaction remain possible |
| Payment Data | `redact=pci` | Payment-card transcript entities | Not a PCI DSS claim; govern audio separately |
| Health Information | `redact=phi` | Health-related transcript entities | Not a HIPAA claim |
| Numeric Identifiers | `redact=numbers` | Entity-aware numeric masking and longer numeral sequences | Useful numbers may be removed |
| Aggressive Numeric Masking | `redact=aggressive_numbers` | One-, two-, and longer numeral sequences | Material transcript utility loss is possible |
| Financial Contact Center | `redact=pci&redact=pii` | Combined payment and personal information | Requires organizational review |
| Healthcare Contact Center | `redact=phi&redact=pii` | Combined health and personal information | Audio, access, logs, and retention remain separate |
| Custom Policy | repeated individual entity values | Application-specific coverage | Review inherited gaps and utility impact |

For `numbers`, Deepgram documents generic `[REDACTED]` behavior for sequences of three or more consecutive numerals when no more specific entity is classified. `aggressive_numbers` extends numeric masking to one- and two-digit sequences and can remove ordinary times, quantities, or short numbers.

## Evaluation checklist

- representative recordings, accents, dialects, and noise;
- interruptions, code-switching, and spoken digit grouping;
- domain terminology and regional identifier formats;
- interim and final application handling;
- downstream logs, exports, and audio retention;
- false positives, false negatives, utility, and policy drift.
