---
name: Reaction-user API contract
description: Generator-safe contract shape for fetching people who used a message reaction
---

Use a path parameter for the selected reaction emoji when defining the reaction-user lookup endpoint instead of a required query parameter.

**Why:** The installed Orval/Zod generation setup can export the same parameter type name from both generated API and generated types when this operation uses a query parameter, causing library typecheck failures.

**How to apply:** Keep the route and OpenAPI contract aligned as `.../reactions/{emoji}` and regenerate the API client/Zod packages together after contract changes.