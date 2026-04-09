/**
 * O ExpoSQLite.podspec copia vendor/sqlite3/* → ios/ durante `pod install`.
 * Se isso não correr (ex.: só `npm install`), o Xcode falha: sqlite3.c not found.
 * Este script garante os ficheiros após instalar dependências npm.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendorDir = path.join(root, 'node_modules', 'expo-sqlite', 'vendor', 'sqlite3');
const iosDir = path.join(root, 'node_modules', 'expo-sqlite', 'ios');

function main() {
  if (!fs.existsSync(vendorDir)) return;
  if (!fs.existsSync(iosDir)) return;
  for (const f of ['sqlite3.c', 'sqlite3.h']) {
    const src = path.join(vendorDir, f);
    const dest = path.join(iosDir, f);
    if (!fs.existsSync(src)) continue;
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
      console.log(`[ensure-expo-sqlite-ios] copied ${f}`);
      continue;
    }
    const stSrc = fs.statSync(src);
    const stDest = fs.statSync(dest);
    if (stSrc.size !== stDest.size || stSrc.mtimeMs > stDest.mtimeMs) {
      fs.copyFileSync(src, dest);
      console.log(`[ensure-expo-sqlite-ios] refreshed ${f}`);
    }
  }
}

main();
