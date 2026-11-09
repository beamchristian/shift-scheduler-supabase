import type { Config } from "tailwindcss";

// The color shades the app uses, from lightest (50) to darkest (950).
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// The accent colors: indigo for actions, amber for warnings, emerald for good news, rose for errors.
const ACCENT_NAMES = ["indigo", "amber", "emerald", "rose"];

// Returns a color that reads a variable from app/globals.css and still accepts transparency (bg-white/90).
const fromVariable = (variableName: string) =>
  `rgb(var(--${variableName}) / <alpha-value>)`;

// Builds one color family, such as { 50: ..., 100: ... }, from variables named prefix + shade.
// Returns the family, ready for the Tailwind theme.
function shadesFromVariables(variablePrefix: string): Record<number, string> {
  const shades: Record<number, string> = {};
  for (const shade of SHADES) shades[shade] = fromVariable(`${variablePrefix}-${shade}`);
  return shades;
}

// Builds every accent family from one kind of variable: "" for text, "bg-" for fills, "line-" for borders.
// Returns the families keyed by color name.
function accentFamilies(kindPrefix: string): Record<string, Record<number, string>> {
  const families: Record<string, Record<number, string>> = {};
  for (const accentName of ACCENT_NAMES)
    families[accentName] = shadesFromVariables(`${kindPrefix}${accentName}`);
  return families;
}

// Colors shared by every kind of class. Text colors use these as they are.
const baseColors = {
  inherit: "inherit",
  current: "currentColor",
  transparent: "transparent",
  black: "#000000",
  // White stays white for text on colored buttons; white backgrounds are swapped below.
  white: "#ffffff",
  slate: shadesFromVariables("slate"),
  ...accentFamilies(""),
};

// Line colors: borders, rings, dividers and outlines.
const lineColors = { ...baseColors, ...accentFamilies("line-") };

// Tailwind's own defaults for a plain "border" or "ring" point at grey and blue, which this theme leaves out,
// so they are set to the closest colors here to keep plain borders and focus rings looking the same.
const DEFAULT_BORDER_COLOR = fromVariable("slate-200");
const DEFAULT_RING_COLOR = "rgb(var(--indigo-500) / 0.5)";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    // Every color points at a variable in app/globals.css, which has a light and a dark value.
    // Text, backgrounds and lines each get their own set, because a color that works as a pale fill
    // in the light (amber-50) needs a different dark value than the same name used as text.
    colors: baseColors,
    backgroundColor: {
      ...baseColors,
      // Cards and inputs: white in the light, dark blue-grey in the dark.
      white: fromVariable("surface"),
      // Solid colored button fills keep their color in the dark; only the pale tints change.
      ...accentFamilies("bg-"),
      slate: {
        ...shadesFromVariables("slate"),
        // bg-slate-900 is only the dimmed backdrop behind pop-ups, so it stays dark in both themes.
        900: fromVariable("backdrop"),
      },
    },
    borderColor: { ...lineColors, DEFAULT: DEFAULT_BORDER_COLOR },
    divideColor: { ...lineColors, DEFAULT: DEFAULT_BORDER_COLOR },
    ringColor: { ...lineColors, DEFAULT: DEFAULT_RING_COLOR },
    outlineColor: lineColors,
    extend: {},
  },
  plugins: [],
};
export default config;
