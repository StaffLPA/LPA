---
name: Metro image-size remediation
description: Metro compatibility constraint when remediating image-size security advisories.
---

When remediating the archived `image-size` dependency for Metro, retain the 1.x
path-string API through the maintained compatible fork rather than forcing the
upstream 2.x release.

**Why:** Metro passes filesystem paths to `image-size`; upstream 2.x expects
binary input and breaks Expo web asset bundling. The upstream package is
archived and has no vendor-published patch for the affected advisories.

**How to apply:** Keep the workspace alias on the fork's legacy-compatible
release. For any future change to that resolution, run `expo export --platform
web` as well as the dependency audit before accepting the update.