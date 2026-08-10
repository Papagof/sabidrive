/**
 * Tripme calm-palette source of truth.
 * `critical` is reserved for true SOS / emergency alerts only — never use it
 * for ordinary warnings, delays, or destructive-but-routine UI (use `caution`).
 */
export const colors = {
  brand: {
    50: "#eef4ff",
    100: "#d9e6ff",
    200: "#b3ccff",
    300: "#84acf7",
    400: "#5b8def",
    500: "#3866d6",
    600: "#2b4fb0",
    700: "#233f8c",
    800: "#1d3370",
    900: "#192b5c"
  },
  calm: {
    50: "#eefaf3",
    100: "#d3f2e0",
    200: "#a6e4c2",
    300: "#78d3a2",
    400: "#4dbd85",
    500: "#33a06c",
    600: "#277f56",
    700: "#216646",
    800: "#1c5138",
    900: "#17422f"
  },
  neutral: {
    50: "#f7f8fa",
    100: "#eef0f3",
    200: "#dfe3e8",
    300: "#c3c9d1",
    400: "#9aa2ae",
    500: "#707887",
    600: "#535b69",
    700: "#3d4451",
    800: "#292e38",
    900: "#181b21"
  },
  caution: {
    50: "#fff8eb",
    100: "#ffecc2",
    200: "#ffd685",
    300: "#f9bd4a",
    400: "#f0a324",
    500: "#d1860f",
    600: "#a8690c",
    700: "#7f4f0b",
    800: "#5c3a0c",
    900: "#402a0c"
  },
  critical: {
    50: "#fef2f2",
    100: "#fde0df",
    400: "#f2554d",
    500: "#dc2f27",
    600: "#b7211b",
    700: "#8f1a16"
  }
} as const;

export type ColorScale = keyof typeof colors;
