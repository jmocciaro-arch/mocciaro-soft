/* eslint-disable @typescript-eslint/no-require-imports */
// electron-builder afterPack hook.
// Copia el output de Next standalone al .app de forma controlada:
//   .next/standalone/*  → Resources/app/   (incluyendo su mini node_modules)
//   .next/static/       → Resources/app/.next/static
//   public/             → Resources/app/public
// Excluye explícitamente .env* para no filtrar secretos al binario distribuible.
//
// Por qué no usamos extraResources de electron-builder:
//   electron-builder trata cualquier subdir llamado "node_modules" de forma
//   especial dentro de extraResources y lo skipea. El standalone de Next
//   trae un node_modules con sus deps mínimas que sí queremos copiar tal cual.

const fs = require("node:fs");
const path = require("node:path");

const FORBIDDEN_FILES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
  ".env.test.local",
]);

function copyDir(src, dest, { skipForbidden = false } = {}) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipForbidden && FORBIDDEN_FILES.has(entry.name)) {
      console.log(`  [afterPack] excluido: ${entry.name}`);
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const link = fs.readlinkSync(srcPath);
      fs.symlinkSync(link, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const projectDir = packager.projectDir;
  const productName = packager.appInfo.productFilename;
  const appResourcesPath = path.join(appOutDir, `${productName}.app`, "Contents", "Resources", "app");

  console.log(`[afterPack] destino: ${appResourcesPath}`);

  const standaloneSrc = path.join(projectDir, ".next", "standalone");
  const staticSrc = path.join(projectDir, ".next", "static");
  const publicSrc = path.join(projectDir, "public");

  if (!fs.existsSync(standaloneSrc)) {
    throw new Error(`No existe ${standaloneSrc}. ¿Corriste 'next build' con ELECTRON_BUILD=1?`);
  }

  // 1) standalone → Resources/app/ (sin .env*)
  copyDir(standaloneSrc, appResourcesPath, { skipForbidden: true });

  // 2) .next/static → Resources/app/.next/static
  if (fs.existsSync(staticSrc)) {
    copyDir(staticSrc, path.join(appResourcesPath, ".next", "static"));
  }

  // 3) public → Resources/app/public
  if (fs.existsSync(publicSrc)) {
    copyDir(publicSrc, path.join(appResourcesPath, "public"));
  }

  // Sanity check: server.js + node_modules tienen que existir, .env* no.
  const serverJs = path.join(appResourcesPath, "server.js");
  const nodeModules = path.join(appResourcesPath, "node_modules");
  if (!fs.existsSync(serverJs)) throw new Error(`Falta server.js en ${appResourcesPath}`);
  if (!fs.existsSync(nodeModules)) throw new Error(`Falta node_modules en ${appResourcesPath}`);
  for (const forbidden of FORBIDDEN_FILES) {
    const p = path.join(appResourcesPath, forbidden);
    if (fs.existsSync(p)) {
      throw new Error(`SEGURIDAD: ${forbidden} terminó en el .app. Abortar build.`);
    }
  }

  console.log("[afterPack] standalone copiado, secretos excluidos, todo OK");
};
