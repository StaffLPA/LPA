const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const sharedPackages = ['react', 'react-dom', '@tanstack/react-query'];

// Workspace and standalone installs can coexist. Context-bearing packages must
// resolve from one origin, including imports made by the vendored API client.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isShared = sharedPackages.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  return context.resolveRequest(
    isShared ? { ...context, originModulePath: __filename } : context,
    moduleName,
    platform,
  );
};

module.exports = config;
