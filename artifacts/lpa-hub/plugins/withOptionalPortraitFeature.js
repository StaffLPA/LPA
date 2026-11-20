const { withAndroidManifest } = require("expo/config-plugins");

const PORTRAIT_FEATURE = "android.hardware.screen.portrait";

function ensureOptionalPortraitFeature(manifest) {
  const currentFeatures = manifest["uses-feature"];
  const features = Array.isArray(currentFeatures)
    ? currentFeatures
    : currentFeatures
      ? [currentFeatures]
      : [];
  const portraitFeatures = features.filter(
    (feature) => feature.$?.["android:name"] === PORTRAIT_FEATURE,
  );

  if (portraitFeatures.length === 0) {
    features.push({
      $: {
        "android:name": PORTRAIT_FEATURE,
        "android:required": "false",
      },
    });
  } else {
    for (const feature of portraitFeatures) {
      feature.$ = {
        ...feature.$,
        "android:required": "false",
      };
    }
  }

  manifest["uses-feature"] = features;
  return manifest;
}

function withOptionalPortraitFeature(config) {
  return withAndroidManifest(config, (modConfig) => {
    ensureOptionalPortraitFeature(modConfig.modResults.manifest);
    return modConfig;
  });
}

module.exports = withOptionalPortraitFeature;
module.exports.ensureOptionalPortraitFeature = ensureOptionalPortraitFeature;
