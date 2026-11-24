/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Brand-facing tokens (primary, accent, secondary, destructive, foregrounds)
 * are drawn from the Legendary Prep Academy palette in BRAND below.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

/**
 * Legendary Prep Academy brand palette — the source of truth for brand colors.
 * Theme tokens below are mapped onto these values; prefer `colors.<token>` via
 * useColors() in components, and import BRAND only for fixed brand accents.
 */
export const BRAND = {
  outlawRed: '#B43733', // RGB 180, 55, 51
  copper: '#A5500A', // RGB 165, 80, 10
  texasOrange: '#9D4D2C', // RGB 157, 77, 44
  charcoal: '#202020', // RGB 32, 32, 32
  seafoam: '#43B8A8', // RGB 67, 184, 168
  white: '#FFFFFF', // RGB 255, 255, 255
} as const;

export type BrandColor = keyof typeof BRAND;

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: BRAND.white,
    tint: BRAND.copper,

    // Core surfaces
    background: '#050505',
    foreground: BRAND.white,

    // Cards / elevated surfaces
    card: '#121212',
    cardForeground: BRAND.white,

    // Primary action color (buttons, links, active states)
    primary: BRAND.texasOrange,
    primaryForeground: BRAND.white,

    // Secondary / less-emphasis interactive surfaces
    secondary: BRAND.charcoal,
    secondaryForeground: BRAND.white,

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#1A1A1A',
    mutedForeground: '#A9AAA6',

    // Accent highlights (badges, selected items, focus rings)
    accent: BRAND.seafoam,
    accentForeground: '#050505',
    success: '#7CCB97',
    warning: '#E5B64B',

    // Destructive actions (delete, error states)
    destructive: BRAND.outlawRed,
    destructiveForeground: BRAND.white,

    // Borders and input outlines
    border: '#2E2E2C',
    input: '#2E2E2C',
  },

  dark: {
    text: BRAND.white,
    tint: BRAND.copper,
    background: '#050505',
    foreground: BRAND.white,
    card: '#121212',
    cardForeground: BRAND.white,
    primary: BRAND.texasOrange,
    primaryForeground: BRAND.white,
    secondary: BRAND.charcoal,
    secondaryForeground: BRAND.white,
    muted: '#1A1A1A',
    mutedForeground: '#A9AAA6',
    accent: BRAND.seafoam,
    accentForeground: '#050505',
    success: '#7CCB97',
    warning: '#E5B64B',
    destructive: BRAND.outlawRed,
    destructiveForeground: BRAND.white,
    border: '#2E2E2C',
    input: '#2E2E2C',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
