// Static server for a published wmn site with the isolation headers wmd-web needs.
//   bun serve.ts <site dir> <port>
import { join, normalize } from "node:path";
const [dir, port] = [process.argv[2], Number(process.argv[3])];
Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req) {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = Bun.file(join(dir, normalize(p)));
    if (!(await f.exists())) return new Response("not found", { status: 404 });
    return new Response(f, {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
        ...(p.endsWith(".wasm") ? { "Content-Type": "application/wasm" } : {}),
      },
    });
  },
});
console.log(`serving ${dir} on http://127.0.0.1:${port}/`);
