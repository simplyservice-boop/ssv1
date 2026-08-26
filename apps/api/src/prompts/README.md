# Simply Service AI prompts

This folder contains the platform prompt definitions used by the backend AI service.

Primary prompt groups in `platformPrompts.ts`:

- `system`: global behavior and response policy for in-app assistant guidance.
- `onboarding`, `finance`, `support`, `map`, `workOrder`, `billing`, `device`: domain prompts used across platform workflows.
- `roleOnboarding`: role-specific onboarding prompts for every supported role.
- `taskFlows`: step-by-step task walkthrough prompts for common user actions.

Expected assistant behavior:

- Give page-level instructions (where to navigate in the platform).
- Give form-level instructions (what details to enter).
- Give outcome-level instructions (what to expect after submitting).
- Keep responses concise, actionable, and role-aware.

The runtime AI service imports and applies these prompts from `platformPrompts.ts`.
