import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        panel: '0 1px 2px rgba(15, 23, 42, 0.03), 0 12px 32px rgba(15, 23, 42, 0.05)'
      }
    }
  },
  plugins: []
};

export default config;
