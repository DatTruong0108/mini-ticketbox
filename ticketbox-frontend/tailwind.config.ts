import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: "#34A99D",
        secondary: "#458393",
        cream: "#FFF3C8",
        sand: "#E5CB90",
      },
      fontFamily: {
        sans: ["var(--font-nunito-sans)", "sans-serif"],
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulse_ring: {
          "0%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(52,169,157,0.5)" },
          "70%": { transform: "scale(1)", boxShadow: "0 0 0 12px rgba(52,169,157,0)" },
          "100%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(52,169,157,0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.6s ease-out both",
        shimmer: "shimmer 2s linear infinite",
        pulse_ring: "pulse_ring 2s ease infinite",
      },
    },
  },
  plugins: [],
};

export default config;
