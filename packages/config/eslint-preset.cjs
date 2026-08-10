/** Shared ESLint preset for Tripme apps/packages. */
module.exports = {
  root: false,
  extends: ["next/core-web-vitals", "eslint:recommended"],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "no-unused-vars": "off"
  }
};
