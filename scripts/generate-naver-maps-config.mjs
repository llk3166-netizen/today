import { mkdirSync, writeFileSync } from "node:fs";

const clientId = process.env.NAVER_MAPS_CLIENT_ID;

if (!clientId) {
  throw new Error("NAVER_MAPS_CLIENT_ID is required to build the map configuration.");
}

mkdirSync("dist", { recursive: true });
writeFileSync(
  "dist/naver-maps-config.js",
  `window.NAVER_MAPS_CLIENT_ID = ${JSON.stringify(clientId)};\n`,
  "utf8",
);
