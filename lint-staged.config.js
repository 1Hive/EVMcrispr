module.exports = {
  // Type check TypeScript files
  "(apps|packages)/**/*.(ts|tsx)": () => "bun run check",

  // Lint then format TypeScript and JavaScript files
  "(apps|packages)/**/*.(ts|tsx|js)": "bun run format --staged",
};
