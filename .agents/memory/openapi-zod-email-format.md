---
name: OpenAPI Zod format compatibility
description: Contract generation limitations for formats that emit newer Zod helpers.
---

Avoid OpenAPI formats that Orval maps to newer Zod helpers (`email`, `uri`, and integer schemas) while the generated Zod package remains on its current version.

**Why:** The current Orval output uses `zod.email()`, `zod.url()`, or `zod.int()` for those schemas, but the installed Zod API does not provide them, causing the generated library build to fail.

**How to apply:** Keep those fields as compatible primitive schemas and enforce stricter validation in route code until the generator/Zod versions are upgraded together and code generation succeeds.