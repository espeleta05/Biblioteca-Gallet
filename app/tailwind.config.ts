export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        atkinsonHyperlegible: ["--font-atkinson-hyperlegible"],
      },
    },
  },
  plugins: [],
};