// Tailwind CSS v4 is driven from CSS (`@import "tailwindcss"` in src/index.css)
// and ships its own PostCSS plugin. No tailwind.config.js is required —
// design tokens live in the `@theme` block of src/index.css.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
