import type { Config } from "tailwindcss";

// Keyframes from svelte-animations library — adapted for Tailwind
const keyframes = {
  // Emil Kowalski: fast entrance, spring-backed
  "slide-up": {
    "0%":   { opacity: "0", transform: "translateY(6px)" },
    "100%": { opacity: "1", transform: "translateY(0)" },
  },
  "fade-in": {
    "0%":   { opacity: "0" },
    "100%": { opacity: "1" },
  },
  spotlight: {
    "0%":   { opacity: "0", transform: "translateY(4px) scale(0.98)" },
    "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
  },
  // Shimmer — svelte-animations Magic UI pattern
  shimmer: {
    "0%":   { backgroundPosition: "-200% 0" },
    "100%": { backgroundPosition: "200% 0" },
  },
  // Border beam — svelte-animations Aceternity pattern
  "border-beam": {
    "100%": { "offset-distance": "100%" },
  },
  // Gradient shift — svelte-animations background pattern
  "gradient-shift": {
    "0%, 100%": { backgroundPosition: "0% 50%" },
    "50%":       { backgroundPosition: "100% 50%" },
  },
  // Pulse ring — minimal, running state only
  "pulse-ring": {
    "0%":   { opacity: "0.6", transform: "scale(1)" },
    "100%": { opacity: "0", transform: "scale(1.6)" },
  },
  // Spin — loading
  spin: {
    to: { transform: "rotate(360deg)" },
  },
  // Progress fill
  "progress-fill": {
    from: { transform: "scaleX(0)" },
    to:   { transform: "scaleX(1)" },
  },
};

const animation = {
  "slide-up":      "slide-up 200ms cubic-bezier(0.16,1,0.3,1) both",
  "fade-in":       "fade-in 150ms cubic-bezier(0.16,1,0.3,1) both",
  "spotlight":     "spotlight 200ms cubic-bezier(0.16,1,0.3,1) both",
  "shimmer":       "shimmer 2s linear infinite",
  "border-beam":   "border-beam 4s linear infinite",
  "gradient":      "gradient-shift 8s ease infinite",
  "pulse-ring":    "pulse-ring 1.4s cubic-bezier(0.16,1,0.3,1) infinite",
  "spin":          "spin 1s linear infinite",
};

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // taste-skill: strong, intentional brand palette
        purple: {
          "50":  "#f5f3ff",
          "100": "#ede9fe",
          "200": "#ddd6fe",
          "300": "#c4b5fd",
          "400": "#a78bfa",
          "500": "#8b5cf6",
          "600": "#7c3aed",
          "700": "#6d28d9",
          "800": "#5b21b6",
          "900": "#4c1d95",
        },
      },
      keyframes,
      animation,
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Segoe UI", "sans-serif"],
        mono: ["SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
      },
      boxShadow: {
        // taste-skill: purposeful shadows, not decorative
        "purple-sm": "0 4px 16px rgba(124,58,237,0.25)",
        "purple-md": "0 6px 24px rgba(124,58,237,0.35)",
        "inset-top": "0 1px 0 rgba(255,255,255,0.06) inset",
      },
    },
  },
  plugins: [],
};

export default config;
