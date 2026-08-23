/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1C4A3D', light: '#2E6B57', dark: '#12332A' },
        paper: { DEFAULT: '#F7F8F6', dark: '#12140F' },
        surface: { DEFAULT: '#FFFFFF', dark: '#1B211E' },
        textprimary: { DEFAULT: '#1A1F1C', dark: '#E8ECEA' },
        textsecondary: { DEFAULT: '#6B7280', dark: '#9CA8A3' },
        critical: { bg: '#FBEAEA', text: '#A9382F', border: '#A9382F', dbg: '#3A1F1C', dtext: '#F0918A' },
        urgent:   { bg: '#FBF3E1', text: '#8C6117', border: '#B8811F', dbg: '#3A2E14', dtext: '#F0C57A' },
        routine:  { bg: '#E9EFF2', text: '#42606F', border: '#5B7A8C', dbg: '#1E2A2F', dtext: '#9DBBC7' },
        elective: { bg: '#E9F0EC', text: '#3F5B4E', border: '#6B9080', dbg: '#1E2B25', dtext: '#9DC2AC' },
        footergreen: '#0E2620',
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
