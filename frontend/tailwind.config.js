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

        // --- Roktim (Phase 6E). Additive only: nothing above changes, and
        // deleting this block is part of removing the module.
        //
        // These were computed against Roktim's dark surface with the dataviz
        // palette validator, not picked by eye, and the result changed the
        // design: `brand` clears #141220 at only 2.48:1, below the 3:1 floor
        // for a data mark. So brand is identity only (gradient, mark, glow)
        // and data marks start at `mark`. A chart that uses `brand` for a line
        // is a bug.
        //
        // The urgency palette above is deliberately off-limits to Roktim.
        // Critical red and urgent amber carry reserved meaning in RoktoNet,
        // and a user who has learned them must never read a Roktim caution as
        // a tier. Roktim encodes intensity as position along the violet ramp.
        roktim: {
          void: '#0B0912',      // page ground
          surface: '#141220',   // card surface
          raised: '#1D1A2E',    // elevated / hover
          hairline: '#2A2640',  // 1px borders, grid lines
          brand: '#574B90',     // identity ONLY, never a data mark, never text
          mark: '#8474CE',      // default data mark
          hi: '#A493E6',        // emphasis / hover
          ink: '#E8E3FB',       // primary text
          muted: '#9A93B8',     // secondary text, axis labels
          dim: '#6E6790',       // tertiary, mono captions
          // Sequential ramp for demand intensity. Single hue, monotone
          // lightness, 4 degrees of hue spread; passes all four ordinal
          // checks. r1 clears the surface at only 2.01:1, so it is
          // de-emphasised fill and never a mark read on its own.
          r1: '#4A3F7A', r2: '#6455A8', r3: '#8474CE', r4: '#A493E6', r5: '#C4B8F5',
        },
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
