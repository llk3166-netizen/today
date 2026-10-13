import { mkdirSync, writeFileSync } from "node:fs";

// Keys stay in the server function; the UI opens Google Maps links from Places.
mkdirSync("dist", { recursive: true });
writeFileSync("dist/google-maps-config.js", "window.RESTAURANT_DATA_PROVIDER = 'Google Places API (New)';\n", "utf8");
