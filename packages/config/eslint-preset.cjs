/** Shared ESLint preset for SabiDrive apps/packages. */
module.exports = {
  root: false,
  extends: ["next/core-web-vitals", "eslint:recommended"],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "no-unused-vars": "off"
  }
};
