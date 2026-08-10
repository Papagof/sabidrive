import type { Config } from "tailwindcss";
import { colors } from "./tokens/colors";

/** Shared Tailwind preset — apps extend this so the calm palette stays one source of truth. */
const preset: Partial<Config> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: colors.brand,
        calm: colors.calm,
        neutral: colors.neutral,
        caution: colors.caution,
        critical: colors.critical
      },
      fontSize: {
        base: ["1rem", "1.5rem"],
        lg: ["1.125rem", "1.75rem"]
      },
      minHeight: {
        control: "2.75rem"
      },
      minWidth: {
        control: "2.75rem"
      }
    }
  }
};

export default preset;
