---
name: Expo Android builds
description: Release requirements for the standalone LPA Android app.
---

Standalone Expo builds do not receive Replit’s development-domain environment variables. Retain the verified production API fallback while allowing `EXPO_PUBLIC_API_BASE_URL` to override it for development or a future production domain change.

**Why:** Without this fallback, an Android release bundle attempts to call `localhost`, which is the device itself rather than the shared LPA API.

**How to apply:** Keep the Expo project rooted at the mobile artifact in the monorepo, retain its Android application identifier and monotonically increasing version code, and use the production App Bundle build profile for Google Play releases.