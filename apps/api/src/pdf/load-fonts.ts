import { readFileSync } from "node:fs";
import { join } from "node:path";

type FontFace = {
  family: string;
  weight: number;
  file: string;
  unicodeRange: string;
};

const CYRILLIC =
  "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

const FACES: FontFace[] = [
  {
    family: "Inter",
    weight: 400,
    file: "inter-cyrillic-400-normal.woff2",
    unicodeRange: CYRILLIC,
  },
  {
    family: "Inter",
    weight: 400,
    file: "inter-latin-400-normal.woff2",
    unicodeRange: LATIN,
  },
  {
    family: "Inter",
    weight: 600,
    file: "inter-cyrillic-600-normal.woff2",
    unicodeRange: CYRILLIC,
  },
  {
    family: "Inter",
    weight: 600,
    file: "inter-latin-600-normal.woff2",
    unicodeRange: LATIN,
  },
  {
    family: "JetBrains Mono",
    weight: 400,
    file: "jetbrains-mono-cyrillic-400-normal.woff2",
    unicodeRange: CYRILLIC,
  },
  {
    family: "JetBrains Mono",
    weight: 400,
    file: "jetbrains-mono-latin-400-normal.woff2",
    unicodeRange: LATIN,
  },
];

let cachedCss: string | undefined;

function fontsDir(): string {
  return join(__dirname, "fonts");
}

export function loadEmbeddedFontCss(): string {
  if (cachedCss) {
    return cachedCss;
  }

  const rules = FACES.map((face) => {
    const bytes = readFileSync(join(fontsDir(), face.file));
    const b64 = bytes.toString("base64");
    return `@font-face {
  font-family: '${face.family}';
  font-style: normal;
  font-weight: ${face.weight};
  font-display: swap;
  src: url(data:font/woff2;base64,${b64}) format('woff2');
  unicode-range: ${face.unicodeRange};
}`;
  });

  cachedCss = rules.join("\n\n");
  return cachedCss;
}
