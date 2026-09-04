# Redaction Entity Catalog

The canonical registry is [src/lib/redaction.ts](../src/lib/redaction.ts). It contains 55 unique values verified against Deepgram’s supported-entity table on 2026-07-16.

Every record includes:

- API value and human-readable display name;
- description and category (`PII`, `PHI`, `PCI`, or `Other`);
- inherited profile groups;
- an enterprise scenario and caution;
- hosted/self-hosted support metadata;
- official source URL and verification date.

## Catalog values

```text
account_number, age, bank_account, cardinal, credit_card,
credit_card_expiration, cvv, date, date_interval, dob,
email_address, event, filename, gender_sexuality, healthcare_number,
ip_address, location, location_address, location_city,
location_coordinate, location_country, location_state, location_zip,
money, name, name_given, name_family, name_medical_professional,
numerical_pii, occupation, ordinal, origin, passport_number, password,
percent, phone_number, physical_attribute, ssn, time, url, username,
vehicle_id, condition, drug, injury, blood_type, medical_process,
statistics, language, marital_status, organization, political_affiliation,
religion, routing_number, zodiac_sign
```

This list must not be extended from memory. New values require current official documentation verification, a source, date, serializer test, and compatibility review.

## Profiles are not categories

An entity’s display category is for workbench navigation. Profile membership is the actual verified Deepgram grouping and can cross display categories. For example, numeric handling can include identifiers across personal, health, and payment contexts.

Detection is contextual. Catalog inclusion is not a promise that every spoken instance will be detected, and selection is not a compliance certification.
