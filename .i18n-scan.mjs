import { parseTemplate } from './frontend/node_modules/@angular/compiler/fesm2022/compiler.mjs';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const entries = new Map();
function walk(path) {
  for (const item of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, item.name);
    if (item.isDirectory()) { walk(file); continue; }
    if (!file.endsWith('.html')) continue;
    const template = parseTemplate(readFileSync(file, 'utf8'), file, { preserveWhitespaces: true });
    const add = value => { const key = value.replace(/\s+/g, ' ').trim(); if (key.length > 1 && /[a-záéíóúñ]/i.test(key)) { if (!entries.has(key)) entries.set(key, []); entries.get(key).push(file); } };
    function visit(nodes, inSvg = false) {
      for (const node of nodes ?? []) {
        const svg = inSvg || node.name === 'svg';
        if (!svg && node.constructor.name === 'Text') add(node.value);
        if (node.constructor.name === 'BoundText') {
          for (const match of (node.value.source ?? '').matchAll(/'([^']+)'/g)) add(match[1]);
        }
        for (const attr of node.attributes ?? []) if (['placeholder','aria-label','title','alt'].includes(attr.name)) add(attr.value);
        visit(node.children, svg); visit(node.branches, svg);
      }
    }
    visit(template.nodes);
  }
}
walk('frontend/src/app');
const list = [...entries].map(([key, files]) => ({ key, files: [...new Set(files)] }));
writeFileSync('.i18n-inventory.json', JSON.stringify(list, null, 2));
const publicKeys = list.filter(entry => entry.files.some(file => /features\\(home|auth)|shared\\layout\\site-|accessibility-menu/.test(file)));
console.log('All keys:', list.length, 'Public:', publicKeys.length);
console.log(JSON.stringify(publicKeys.map(entry => entry.key), null, 2));
