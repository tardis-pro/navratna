
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
      },
      keyframes: {
        thinking: {
          "0%, 100%": { opacity: "0.2" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config

export default config
