const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, "src");

if (!fs.existsSync(srcRoot)) {
  console.error("src directory not found");
  process.exit(1);
}

const allFiles = new Set();

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else {
      allFiles.add(fullPath);
    }
  }
}

walk(srcRoot);

const visited = new Set();
const used = new Set();
const queue = [];
const missingRefs = new Map();

function enqueue(filePath) {
  if (!allFiles.has(filePath)) {
    return;
  }
  if (!visited.has(filePath)) {
    visited.add(filePath);
    queue.push(filePath);
  }
  used.add(filePath);
}

const EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".module.css", ".scss", ".sass", ".less", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"];

function resolveRelative(importer, specifier) {
  const importerDir = path.dirname(importer);
  const basePath = path.resolve(importerDir, specifier);
  const candidates = [];

  candidates.push(basePath);
  for (const ext of EXTENSIONS) {
    candidates.push(basePath + ext);
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const idx = path.join(basePath, "index" + ext);
      if (fs.existsSync(idx) && fs.statSync(idx).isFile()) {
        return idx;
      }
    }
  }

  return null;
}

function trackMissing(importer, specifier) {
  if (!missingRefs.has(importer)) {
    missingRefs.set(importer, new Set());
  }
  missingRefs.get(importer).add(specifier);
}

function extractImports(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();
  const specs = new Set();

  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) {
    const importRegex = /import\s+(?:[^"'`]*?from\s+)?["'`]([^"'`]+)["'`]/g;
    const dynamicImportRegex = /import\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    const requireRegex = /require\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    const exportFromRegex = /export\s+\*\s+from\s+["'`]([^"'`]+)["'`]/g;

    let match;
    while ((match = importRegex.exec(code)) !== null) {
      specs.add(match[1]);
    }
    while ((match = dynamicImportRegex.exec(code)) !== null) {
      specs.add(match[1]);
    }
    while ((match = requireRegex.exec(code)) !== null) {
      specs.add(match[1]);
    }
    while ((match = exportFromRegex.exec(code)) !== null) {
      specs.add(match[1]);
    }
  } else if ([".css", ".scss", ".sass", ".less"].includes(ext)) {
    const importRegex = /@import\s+["'`]([^"'`]+)["'`]/g;
    const urlRegex = /url\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      specs.add(match[1]);
    }
    while ((match = urlRegex.exec(code)) !== null) {
      if (match[1].startsWith("data:")) {
        continue;
      }
      specs.add(match[1]);
    }
  }

  return Array.from(specs);
}

enqueue(path.join(srcRoot, "index.js"));

while (queue.length > 0) {
  const current = queue.shift();
  const imports = extractImports(current);
  for (const spec of imports) {
    if (!spec.startsWith(".")) {
      continue;
    }
    const resolved = resolveRelative(current, spec);
    if (resolved) {
      enqueue(resolved);
    } else {
      trackMissing(current, spec);
    }
  }
}

const unused = Array.from(allFiles).filter((filePath) => !used.has(filePath));

console.log("Unused files relative to src (reachable from index.js):");
if (unused.length === 0) {
  console.log("(none)");
} else {
    unused
      .sort()
      .forEach((filePath) => {
        console.log(path.relative(srcRoot, filePath));
      });
}

if (missingRefs.size > 0) {
  console.log("\nUnresolved relative imports:");
  for (const [importer, specs] of missingRefs.entries()) {
    console.log(`- ${path.relative(srcRoot, importer)}`);
    for (const spec of specs) {
      console.log(`  -> ${spec}`);
    }
  }
}
