/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0a1128',
          light: '#111a3a',
          lighter: '#1a2347'
        },
        spiderblue: '#2196f3',
        spiderred: '#e53935'
      },
      fontFamily: {
        display: ['Bangers', 'sans-serif'],
        mono: ['"Courier New"', 'monospace']
      }
    }
  },
  plugins: []
}
