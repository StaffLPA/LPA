/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#FFFFFF',
    tint: '#AB562B',

    // Core surfaces
    background: '#050505',
    foreground: '#FFFFFF',

    // Cards / elevated surfaces
    card: '#121212',
    cardForeground: '#FFFFFF',

    // Primary action color (buttons, links, active states)
    primary: '#AB562B',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#1B1B1B',
    secondaryForeground: '#FFFFFF',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#1A1A1A',
    mutedForeground: '#A9AAA6',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#9BC7BD',
    accentForeground: '#050505',

    // Destructive actions (delete, error states)
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#2E2E2C',
    input: '#2E2E2C',
  },

  dark: {
    text: '#FFFFFF',
    tint: '#C66A3B',
    background: '#050505',
    foreground: '#FFFFFF',
    card: '#121212',
    cardForeground: '#FFFFFF',
    primary: '#AB562B',
    primaryForeground: '#FFFFFF',
    secondary: '#1B1B1B',
    secondaryForeground: '#FFFFFF',
    muted: '#1A1A1A',
    mutedForeground: '#A9AAA6',
    accent: '#9BC7BD',
    accentForeground: '#050505',
    destructive: '#DB4D42',
    destructiveForeground: '#FFFFFF',
    border: '#2E2E2C',
    input: '#2E2E2C',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
