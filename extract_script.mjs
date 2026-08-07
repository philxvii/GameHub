import fs from 'fs';
const html = fs.readFileSync('banqueroll.html', 'utf8');
const match = html.match(/<script[^>]*type="module"[^>]*>([\s\S]*)<\/script>/i);
if (!match) {
  console.error('Script module not found');
  process.exit(1);
}
fs.writeFileSync('banqueroll_extracted.mjs', match[1], 'utf8');
console.log('extracted');
