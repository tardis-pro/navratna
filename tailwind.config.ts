
import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        llama1: "#3b82f6", // Blue for the first LLaMA model
        llama2: "#ef4444", // Red for the second LLaMA model
        debateBg: "#0f172a", // Dark blue background for the debate arena
      },
      animation: {
        "thinking-1": "thinking 1s ease-in-out infinite",
        "thinking-2": "thinking 1s ease-in-out 0.2s infinite",
        "thinking-3": "thinking 1s ease-in-out 0.4s infinite",
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "pulse": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "ping": "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
      keyframes: {
        thinking: {
          "0%, 100%": { opacity: "0.2" },
          "50%": { opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        ping: {
          "75%, 100%": { transform: "scale(2)", opacity: "0" },
        },
      },
      transitionProperty: {
        "width": "width",
        "height": "height",
      },
    },
  },
  plugins: [],
} satisfies Config

export default config
