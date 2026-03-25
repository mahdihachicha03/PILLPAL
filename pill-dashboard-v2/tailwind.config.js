/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        indigo: {
          950: "#1e1b4b",
        }
      }
    }
  },
  plugins: [],
}
