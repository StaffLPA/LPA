const test = require("node:test");
const assert = require("node:assert/strict");
const { ensureOptionalPortraitFeature } = require("../plugins/withOptionalPortraitFeature");

const portraitFeature = "android.hardware.screen.portrait";

test("marks an existing portrait feature as optional without changing other features", () => {
  const manifest = {
    "uses-feature": [
      { $: { "android:name": "android.hardware.camera", "android:required": "true" } },
      {
        $: {
          "android:name": portraitFeature,
          "android:required": "true",
          "android:glEsVersion": "0x30000",
        },
      },
    ],
  };

  ensureOptionalPortraitFeature(manifest);

  assert.equal(manifest["uses-feature"][0].$["android:required"], "true");
  assert.equal(manifest["uses-feature"][1].$["android:required"], "false");
  assert.equal(manifest["uses-feature"][1].$["android:glEsVersion"], "0x30000");
});

test("adds the portrait feature as optional when it is not declared", () => {
  const manifest = {
    "uses-feature": [{ $: { "android:name": "android.hardware.camera" } }],
  };

  ensureOptionalPortraitFeature(manifest);

  const portrait = manifest["uses-feature"].filter(
    (feature) => feature.$["android:name"] === portraitFeature,
  );
  assert.equal(portrait.length, 1);
  assert.equal(portrait[0].$["android:required"], "false");
});
