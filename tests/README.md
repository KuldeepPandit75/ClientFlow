# Test Strategy

Tests are grouped by responsibility:

- `unit/`: pure permission, validation, rendering, condition, and policy behavior.
- `integration/`: MongoDB-backed tenancy, invitations, inbox, automation, jobs, billing, and webhook processing.
- `contract/`: Evolution API request/response fixtures.
- `e2e/`: browser-visible owner and agent workflows.

The current lightweight parameter suite remains at `feature-params.test.mjs`. New production behavior must include negative tenant and permission cases, not only happy paths.
