---
name: Expo Go 57 preview sessions
description: Account matching requirements for opening LPA Hub in physical iOS Expo Go 57.
---

For physical iOS Expo Go 57 previews, run both the Replit session login and Expo start with `EXPO_TOKEN` removed from those command environments.

**Why:** A workspace-level Expo token can silently force the CLI onto a different account than the private account used by Expo Go. Expo Go then refuses to open the project even though Metro and the SDK 57 manifest are healthy.

**How to apply:** Preserve the guarded `REPLIT_EXPO_SESSION_SECRET` login before Metro startup, but use `env -u EXPO_TOKEN` for both commands. Confirm the login message names the same private account shown by Expo Go.