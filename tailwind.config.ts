import type { Config } from 'tailwindcss';

/** Colours come from CSS variables so the whole app can switch to a dark theme. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        /** main text colour — light on dark theme, dark on light theme */
        fg: v('fg'),
        /** page background */
        paper: v('paper'),
        /** cards, menus, modals */
        surface: v('surface'),
        line: v('line'),
        /** modal backdrop */
        scrim: v('scrim'),
        /** always-dark navy: sidebar, toasts, code blocks */
        ink: { DEFAULT: '#14162b', 2: '#1d2040', 3: '#2a2e57' },
        ember: { DEFAULT: '#ff5a36', dark: v('ember-dark'), soft: v('ember-soft') },
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / .06), 0 1px 1px rgb(var(--shadow) / .04)',
        pop: '0 12px 40px rgb(var(--shadow) / .18)',
      },
    },
  },
  plugins: [],
};
export default config;
