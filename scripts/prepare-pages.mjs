import { copyFile, mkdir } from "node:fs/promises";

await copyFile("dist/index.html", "dist/404.html");
await mkdir("dist/rabbit-editor", { recursive: true });
await copyFile("dist/index.html", "dist/rabbit-editor/index.html");
