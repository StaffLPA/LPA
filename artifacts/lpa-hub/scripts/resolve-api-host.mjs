function firstNonEmpty(...values) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0);
}

export function resolveApiBaseUrl({
  apiBaseUrl,
  deploymentDomain,
  devDomain,
  configuredDomains,
  publicDomain,
} = {}) {
  const domain = firstNonEmpty(
    apiBaseUrl,
    deploymentDomain,
    devDomain,
    configuredDomains,
    publicDomain,
  ) ?? 'localhost';

  const normalizedDomain = domain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return `https://${normalizedDomain}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(
    resolveApiBaseUrl({
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
      deploymentDomain: process.env.REPLIT_INTERNAL_APP_DOMAIN,
      devDomain: process.env.REPLIT_DEV_DOMAIN,
      configuredDomains: process.env.REPLIT_DOMAINS,
      publicDomain: process.env.EXPO_PUBLIC_DOMAIN,
    }),
  );
}