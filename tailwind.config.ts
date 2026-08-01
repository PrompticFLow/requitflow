import type { Config } from "tailwindcss";

/**
 * Brand theme
 *   Primary    #5B7CFF   Secondary  #7C3AED
 *   Background #0B1020   Surface    #141B2D
 *   Success    #22C55E   Warning    #F59E0B   Error #EF4444
 *   Text       #F8FAFC
 *
 * The ramps below are the single source of truth. Utility families that used to
 * be separate accents are aliased onto them (cyan/sky/teal/indigo -> primary,
 * violet/fuchsia/pink -> secondary, emerald -> success, yellow -> warning,
 * rose -> error) so the whole UI resolves to the brand palette.
 */

// Neutral ramp, anchored on Background (#0B1020), Surface (#141B2D) and Text (#F8FAFC)
const neutral = {
  50: "#F8FAFC", // text
  100: "#F1F5F9",
  200: "#E2E8F0",
  300: "#C8D2E4", // bright secondary text
  400: "#94A3BE", // secondary text
  500: "#7887A3", // muted text (AA on both background and surface)
  600: "#33405C", // strong border
  700: "#222C45", // main border
  800: "#141B2D", // surface / card background
  900: "#0B1020", // background / panel + input background
  950: "#080C18", // deepest inset / sidebar background
};

// Primary ramp, #5B7CFF at 500
const primary = {
  50: "#EEF2FF",
  100: "#E0E7FF",
  200: "#C7D2FE",
  300: "#A5B4FF",
  400: "#8298FF", // readable primary text on dark
  500: "#5B7CFF", // primary
  600: "#4361E8",
  700: "#3149C4",
  800: "#26389A",
  900: "#1E2C78",
  950: "#131B4D",
};

// Secondary ramp, #7C3AED at 500
const secondary = {
  50: "#F5F3FF",
  100: "#EDE9FE",
  200: "#DDD6FE",
  300: "#C4B5FD",
  400: "#A78BFA", // readable secondary text on dark
  500: "#7C3AED", // secondary
  600: "#6D28D9",
  700: "#5B21B6",
  800: "#4C1D95",
  900: "#3B1477",
  950: "#250B4D",
};

// Success ramp, #22C55E at 500
const success = {
  50: "#F0FDF4",
  100: "#DCFCE7",
  200: "#BBF7D0",
  300: "#86EFAC",
  400: "#4ADE80",
  500: "#22C55E",
  600: "#16A34A",
  700: "#15803D",
  800: "#166534",
  900: "#14532D",
  950: "#052E16",
};

// Warning ramp, #F59E0B at 500
const warning = {
  50: "#FFFBEB",
  100: "#FEF3C7",
  200: "#FDE68A",
  300: "#FCD34D",
  400: "#FBBF24",
  500: "#F59E0B",
  600: "#D97706",
  700: "#B45309",
  800: "#92400E",
  900: "#78350F",
  950: "#451A03",
};

// Error ramp, #EF4444 at 500
const error = {
  50: "#FEF2F2",
  100: "#FEE2E2",
  200: "#FECACA",
  300: "#FCA5A5",
  400: "#F87171",
  500: "#EF4444",
  600: "#DC2626",
  700: "#B91C1C",
  800: "#991B1B",
  900: "#7F1D1D",
  950: "#450A0A",
};

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens
        background: "#0B1020",
        surface: "#141B2D",
        foreground: "#F8FAFC",
        primary,
        secondary,

        // `text-white` is used pervasively as the body text colour, so point it
        // at the Text token rather than pure white.
        white: "#F8FAFC",

        // Neutrals
        slate: neutral,
        gray: neutral,
        zinc: neutral,
        neutral: neutral,
        stone: neutral,

        // Primary family
        blue: primary,
        indigo: primary,
        sky: primary,
        cyan: primary,
        teal: primary,

        // Secondary family
        purple: secondary,
        violet: secondary,
        fuchsia: secondary,
        pink: secondary,

        // Status families
        green: success,
        emerald: success,
        amber: warning,
        yellow: warning,
        red: error,
        rose: error,

        success: success[500],
        warning: warning[500],
        danger: error[500],
        error: error[500],
        info: primary[500],
      },
    },
  },
  plugins: [],
};
export default config;
