/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        discord: {
          darkest: "#1e1f22",
          darker: "#2b2d31",
          dark: "#313338",
          light: "#383a40",
          lighter: "#4e5058",
          blurple: "#5865F2",
          "blurple-hover": "#4752C4",
          green: "#57F287",
          yellow: "#FEE75C",
          fuchsia: "#EB459E",
          red: "#ED4245",
          text: "#F2F3F5",
          muted: "#949BA4",
        },
      },
    },
  },
  plugins: [],
};
