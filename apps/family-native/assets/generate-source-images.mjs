import sharp from "sharp";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(resolve(__dirname, "../../family/public/icons/icon.svg"));

await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile(resolve(__dirname, "icon.png"));

const iconBuffer = await sharp(svg, { density: 384 }).resize(1200, 1200).png().toBuffer();
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: "#f7f8fa" }
})
  .composite([{ input: iconBuffer, gravity: "center" }])
  .png()
  .toFile(resolve(__dirname, "splash.png"));

console.log("done");
