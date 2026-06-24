/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: "#0B0F19",
        glassBg: "rgba(17, 24, 39, 0.7)",
        glassBorder: "rgba(255, 255, 255, 0.08)",
        neonGreen: "#2ed573",
        neonIndigo: "#5352ed",
        neonRed: "#ff4757"
      },
      boxShadow: {
        glowGreen: "0 0 15px rgba(46, 213, 115, 0.3)",
        glowIndigo: "0 0 15px rgba(83, 82, 237, 0.3)",
        glassCard: "0 8px 32px 0 rgba(0, 0, 0, 0.37)"
      },
      backdropBlur: {
        glass: "12px"
      }
    },
  },
  plugins: [],
}
