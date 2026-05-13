import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8080);
const publicUrl =
  process.env.PUBLIC_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;

const publicDir = path.join(__dirname, "public");
const scramjetDir = path.join(
  __dirname,
  "node_modules",
  "@mercuryworkshop",
  "scramjet",
  "dist"
);
const controllerDir = path.join(
  __dirname,
  "node_modules",
  "@mercuryworkshop",
  "scramjet-controller",
  "dist"
);
const epoxyClientPath = path.join(
  __dirname,
  "node_modules",
  "@mercuryworkshop",
  "epoxy-transport",
  "dist",
  "index.js"
);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm"
};

function safeResolve(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (resolved !== root && !resolved.startsWith(normalizedRoot)) {
    throw new Error("Path traversal blocked");
  }

  return resolved;
}

function extraHeadersForPath(pathname) {
  if (pathname === "/controller/controller.sw.js") {
    return {
      "Service-Worker-Allowed": "/"
    };
  }

  return {};
}

async function serveFile(res, filePath, pathname) {
  try {
    const body = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[extension] || "application/octet-stream";
    res.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": contentType,
      ...extraHeadersForPath(pathname)
    });
    res.end(body);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    console.error("Static file error:", error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal server error");
  }
}

function localAssetPath(pathname) {
  if (pathname === "/") {
    return path.join(publicDir, "index.html");
  }

  if (pathname === "/vendor/epoxy-transport.js") {
    return epoxyClientPath;
  }

  if (pathname.startsWith("/scramjet/")) {
    return safeResolve(scramjetDir, pathname.slice("/scramjet/".length));
  }

  if (pathname.startsWith("/controller/")) {
    return safeResolve(controllerDir, pathname.slice("/controller/".length));
  }

  return safeResolve(publicDir, pathname.slice(1));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/wisp/") {
    res.writeHead(426, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Upgrade required");
    return;
  }

  const filePath = localAssetPath(url.pathname);
  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  await serveFile(res, filePath, url.pathname);
});

server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;

  if (pathname === "/wisp/") {
    wisp.routeRequest(req, socket, head);
    return;
  }

  socket.destroy();
});

server.listen(port, host, () => {
  const publicWispUrl = new URL("/wisp/", publicUrl);
  publicWispUrl.protocol = publicWispUrl.protocol === "https:" ? "wss:" : "ws:";

  console.log(`Scramjet host listening on ${publicUrl}`);
  console.log(`Bound internally on ${host}:${port}`);
  console.log(`Wisp endpoint available at ${publicWispUrl.toString()}`);
});
