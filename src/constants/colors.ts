export interface ColorPalette {
  background: string;
  primary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  card: string;
  cardDark: string;
  border: string;
  borderDark: string;
  borderLight: string;
  success: string;
  danger: string;
  warning: string;
  error: string;
  overlay: string;
  warningBackground: string;
  warningBorder: string;
  dangerBackground: string;
  dangerBorder: string;
  tintedBackground: string;
  black: string;
  white: string;
  // Text/icon color for content sitting on top of a `primary`-colored
  // background (i.e. filled/primary buttons) — NOT the same in both themes,
  // unlike most other tokens. White on light theme, black on dark theme —
  // this is a deliberate, explicit design rule, not a coincidence of the
  // values chosen. For buttons WITHOUT a primary-colored background (white,
  // gray, outline, etc.), use `primary` itself for the text/icon color —
  // that one's already theme-correct without needing a separate token.
  onPrimary: string;
}

// Unchanged — this is the palette the whole app already uses today.
export const darkColors: ColorPalette = {
  background: '#121212',
  primary: '#FF6501',
  text: '#fff',
  textSecondary: '#999',
  textTertiary: '#666',
  textDisabled: '#555',
  card: '#1E1E1E',
  cardDark: '#2C2C2C',
  border: '#333',
  borderDark: '#2A2A2A',
  borderLight: '#1E1E1E',
  success: '#4CAF50',
  danger: '#FF3B30',
  warning: '#FF9500',
  error: '#FF6B6B',
  overlay: 'rgba(0, 0, 0, 0.7)',
  warningBackground: 'rgba(255, 149, 0, 0.1)',
  warningBorder: 'rgba(255, 149, 0, 0.3)',
  dangerBackground: 'rgba(255, 59, 48, 0.1)',
  dangerBorder: 'rgba(255, 59, 48, 0.3)',
  tintedBackground: 'rgba(30, 144, 255, 0.1)',
  black: '#000',
  white: '#fff',
  // Matches the convention already used throughout the existing dark-theme
  // screens (button text set to colors.black on primary-colored buttons) —
  // this token just makes that convention explicit and centrally defined
  // rather than repeated ad-hoc in every file.
  onPrimary: '#000',
};

// Extracted from the WDK RN starter wallet prototype's :root CSS variables.
// Values marked "derived" below aren't in the prototype directly — it only
// defines one tier of secondary text and one warning-adjacent color family,
// so a couple of fields needed a reasonable interpolation rather than a
// direct source value. Everything else is copied exactly.
export const lightColors: ColorPalette = {
  background: '#FFFFFF',        // --bg-primary
  primary: '#FF4E00',           // --brand (prototype's own brand orange, distinct from the dark theme's #FF6501 — kept faithful to the reference rather than forced to match)
  text: '#171717',              // --text-primary
  textSecondary: 'rgba(23, 23, 23, 0.6)',  // --text-secondary
  textTertiary: 'rgba(23, 23, 23, 0.45)',  // derived — prototype only defines a 0.6 and a 0.3 tier; this sits between them
  textDisabled: 'rgba(23, 23, 23, 0.3)',   // --text-disabled
  card: '#FAF7F5',              // --bg-secondary
  cardDark: '#F4F4F4',          // derived — prototype's own outer shell background (.proto-shell), used here as the "deeper" surface tier
  border: '#EBE4E1',            // --border
  borderDark: '#D9D9D9',        // --border-strong
  borderLight: '#FAF7F5',       // derived — mirrors the dark theme's pattern of borderLight matching the card color
  success: '#27AE60',           // --success
  danger: '#EB5757',            // --error
  warning: '#FF9500',           // derived — prototype defines no warning color; kept the dark theme's value since it reads fine on white
  error: '#E57373',             // --error-light
  overlay: 'rgba(0, 0, 0, 0.5)',           // derived — lighter than the dark theme's 0.7, appropriate for dimming over a white background
  warningBackground: 'rgba(255, 149, 0, 0.08)',  // derived, same source color as warning
  warningBorder: 'rgba(255, 149, 0, 0.25)',      // derived
  dangerBackground: 'rgba(235, 87, 87, 0.08)',   // derived from --error
  dangerBorder: 'rgba(235, 87, 87, 0.25)',       // derived
  tintedBackground: 'rgba(255, 78, 0, 0.16)',    // --brand-tint — note this replaces the dark theme's blue tint with the prototype's brand-consistent orange one
  black: '#000',
  white: '#fff',
  onPrimary: '#FFFFFF',  // per explicit design rule: white text on orange buttons in light theme
};

// Static default export, unchanged in shape and value from before this file
// was extended — any screen that hasn't been updated to consume the theme
// reactively (via useTheme() in ThemeProvider.tsx) continues to import this
// directly and gets the dark palette exactly as it always has. Nothing
// breaks by this file gaining light-mode support.
export const colors: ColorPalette = darkColors;
