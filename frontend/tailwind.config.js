/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F1EC",
        ink: "#12232E",
        accent: "#E8622C",
      },
    },
  },
  plugins: [],
};
