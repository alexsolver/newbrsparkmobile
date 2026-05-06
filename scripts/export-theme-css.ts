import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { webCssVariableMap } from '../src/theme/colors';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '../admin-panel/css/aria-tokens.css');

const lines = Object.entries(webCssVariableMap).map(([k, v]) => `  --${k}: ${v};`);
const body = `/* Gerado por npm run theme:export-css — não editar à mão */\n:root {\n${lines.join('\n')}\n}\n`;
writeFileSync(out, body, 'utf8');
console.log('Wrote', out);
