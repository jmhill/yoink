// Apply dark mode class based on system preference
// This runs before React to prevent flash of wrong theme
// Must be an external script due to Manifest V3 CSP restrictions
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}
