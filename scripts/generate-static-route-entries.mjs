import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const appSource = await readFile(join(projectRoot, "src/App.tsx"), "utf8");
const builtIndex = join(projectRoot, "dist/index.html");
const staticRoutes = new Set();

for (const match of appSource.matchAll(/\bpath="([^"]+)"/g)) {
  const route = match[1];
  if (route === "/" || !route.startsWith("/") || /[:*]/.test(route)) continue;
  staticRoutes.add(route.replace(/\/+$/, ""));
}

await Promise.all([...staticRoutes].map(async (route) => {
  const routeDirectory = join(projectRoot, "dist", route.slice(1));
  await mkdir(routeDirectory, { recursive: true });
  await copyFile(builtIndex, join(routeDirectory, "index.html"));
}));

console.log(`Generated static entries for ${staticRoutes.size} application routes.`);
