import { sveltekit } from "@sveltejs/kit/vite";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    sveltekit(),
    {
      name: "base64-loader",
      transform(_: any, id: string) {
        const [path, query] = id.split("?");
        if (query != "base64") return null;

        const data = readFileSync(path);
        const base64 = data.toString("base64");

        return `export default '${base64}';`;
      },
    },
  ],
  server: { port: 15474 },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
