import fs from 'node:fs/promises';
import path from 'node:path';

const packagePath = path.resolve(
  process.cwd(),
  'node_modules/@solana/spl-name-service/package.json'
);

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
  const esmDir = path.resolve(
    process.cwd(),
    'node_modules/@solana/spl-name-service/lib/esm'
  );

  try {
    const entries = await fs.readdir(esmDir, { withFileTypes: true });
    const targets = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => path.join(esmDir, entry.name));

    for (const filePath of targets) {
      const raw = await fs.readFile(filePath, 'utf8');
      const patched = raw.replace(
        /(from\s+['"]\.\/(?!.*\.(?:js|cjs|mjs|json)$)[^'"]+)(['"])/g,
        '$1.js$2'
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
