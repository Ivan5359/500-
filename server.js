const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = process.env.PORT || 3000;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let target = path.join(root, normalized);
  if (!target.startsWith(root)) target = path.join(root, "index.html");
  return target;
}

const server = http.createServer((req, res) => {
  let target = safePath(req.url === "/" ? "/index.html" : req.url);

  fs.stat(target, (statError, stat) => {
    if (!statError && stat.isDirectory()) target = path.join(target, "index.html");

    fs.readFile(target, (readError, data) => {
      if (readError) {
        fs.readFile(path.join(root, "index.html"), (fallbackError, fallback) => {
          if (fallbackError) {
            res.writeHead(404);
            res.end("Not found");
            return;
          }
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(fallback);
        });
        return;
      }

      const type = types[path.extname(target).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": type.includes("text/html") ? "no-cache" : "public, max-age=3600"
      });
      res.end(data);
    });
  });
});

server.listen(port, () => {
  console.log(`RevenueSprint 48 running on port ${port}`);
});
