import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0B", // near-black bg
        panel: "#141418", // panel bg
        edge: "#26262E", // borders
        muted: "#8A8A99", // muted text
        chalk: "#EDEDF0", // primary text
        volt: "#D6FB4F", // primary / live
        ember: "#FF5A36", // panic / hyped
        ice: "#5AC8FF", // dropping soon
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "glow-volt": "0 0 0 1px rgba(214,251,79,0.35), 0 0 24px -6px rgba(214,251,79,0.45)",
        "glow-ember": "0 0 0 1px rgba(255,90,54,0.4), 0 0 26px -6px rgba(255,90,54,0.5)",
      },
      keyframes: {
        pulseRed: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-2px)" },
          "40%": { transform: "translateX(2px)" },
          "60%": { transform: "translateX(-1.5px)" },
          "80%": { transform: "translateX(1.5px)" },
        },
        slideUp: {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 0 1px rgba(255,90,54,0.25), 0 0 14px -6px rgba(255,90,54,0.35)" },
          "50%": { boxShadow: "0 0 0 1px rgba(255,90,54,0.5), 0 0 26px -4px rgba(255,90,54,0.6)" },
        },
      },
      animation: {
        pulseRed: "pulseRed 1s ease-in-out infinite",
        shake: "shake 0.5s ease-in-out infinite",
        slideUp: "slideUp 0.25s ease-out",
        glowPulse: "glowPulse 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
