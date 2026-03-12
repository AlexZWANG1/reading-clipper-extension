# Project Operating Rules

## Supabase-First Policy (Mandatory)

- All data-model and enum/check changes must be aligned with Supabase cloud schema first.
- Do not introduce local backend compatibility fallbacks to bypass cloud constraints unless explicitly approved by the user.
- If code and Supabase schema diverge, preferred order is:
  1. create migration
  2. apply migration to cloud
  3. deploy/apply code using the new schema

## Change Safety Requirements

- Any write path touching constrained columns (e.g. `status`, `message_type`, enum-like fields) must be validated against live Supabase constraints.
- After migration + code update, run end-to-end verification:
  - login
  - same-conversation multi-turn chat
  - no backend constraint errors in logs

## Operational Notes

- Treat PAT tokens as temporary secrets and rotate/revoke after use.
- Report clearly whether a migration was only created locally or actually executed in cloud.
