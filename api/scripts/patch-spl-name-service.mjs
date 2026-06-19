import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@solana/spl-name-service';

const findPackageRoot = async (startDir) => {
  let dir = startDir;

  while (true) {
    const candidate = path.join(dir, 'node_modules', PACKAGE_NAME);
    try {
      await fs.access(path.join(candidate, 'package.json'));
      return candidate;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }

    dir = parent;
  }
};

const packageRoot = await findPackageRoot(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
);

if (!packageRoot) {
  process.exit(0);
}

const packagePath = path.join(packageRoot, 'package.json');

const ensureRelativeExport = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.startsWith('./') || value.startsWith('../')) {
    return value;
  }

  return `./${value}`;
};

const normalizeExports = (exportsField) => {
  if (typeof exportsField === 'string') {
    return ensureRelativeExport(exportsField);
  }

  if (!exportsField || typeof exportsField !== 'object') {
    return exportsField;
  }

  const normalized = Array.isArray(exportsField) ? [...exportsField] : { ...exportsField };

  for (const [key, value] of Object.entries(normalized)) {
    normalized[key] = normalizeExports(value);
  }

  return normalized;
};

const patchEsmBindings = async () => {
  const esmDir = path.join(packageRoot, 'lib/esm');

  try {
    const entries = await fs.readdir(esmDir, { withFileTypes: true });
    const targets = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => path.join(esmDir, entry.name));

    for (const filePath of targets) {
      const raw = await fs.readFile(filePath, 'utf8');
      const deduplicated = raw.replace(/(from\s+['"]\.\/[^'"]+?)(?:\.js){2,}(['"])/g, '$1.js$2');
      const patched = deduplicated.replace(
        /(from\s+['"])(\.\/[^'"]+)(['"])/g,
        (match, prefix, specifier, quote) =>
          /\.(?:js|cjs|mjs|json)$/.test(specifier) ? match : `${prefix}${specifier}.js${quote}`
      );

      if (raw !== patched) {
        await fs.writeFile(filePath, patched, 'utf8');
      }
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }

    throw error;
  }
};

const patchPackage = async () => {
  try {
    const raw = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(raw);

    const nextPkg = { ...pkg };
    nextPkg.types = ensureRelativeExport(pkg.types);
    nextPkg.exports = normalizeExports(pkg.exports);

    if (JSON.stringify(pkg) !== JSON.stringify(nextPkg)) {
      await fs.writeFile(packagePath, `${JSON.stringify(nextPkg, null, 2)}\n`, 'utf8');
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }

    throw error;
  }
};

await patchPackage();
await patchEsmBindings();
