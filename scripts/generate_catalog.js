const fs = require('fs');
const path = require('path');

const rawData = fs.readFileSync(path.join(__dirname, 'temp_products.txt'), 'utf8');

const catalog = {};
rawData.split(/\r?\n/).forEach(line => {
  const match = line.trim().match(/^(\d+)\s+(.+)$/);
  if (match) {
    const [, code, desc] = match;
    if (!catalog[code]) {
      catalog[code] = desc.trim();
    }
  }
});

const entries = Object.entries(catalog)
  .sort(([a], [b]) => Number(a) - Number(b));

const lines = entries.map(([code, desc]) => {
  const escaped = desc.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `  "${code}": "${escaped}"`;
});

const output = `// Auto-generated product catalog from user data
// ${entries.length} unique products

export const PRODUCT_CATALOG: Record<string, string> = {
${lines.join(',\n')}
};

/**
 * Returns the product description for a given code.
 * Falls back to the code itself if not found.
 */
export function getProductName(code: string): string {
  return PRODUCT_CATALOG[code] || code;
}

/**
 * Returns formatted label: "[CODE] DESCRIPTION"
 */
export function getProductLabel(code: string): string {
  const name = PRODUCT_CATALOG[code];
  return name ? \`[\${code}] \${name}\` : code;
}
`;

const outPath = path.join(__dirname, '..', 'src', 'data', 'productCatalog.ts');
fs.writeFileSync(outPath, output, 'utf8');
console.log(`✅ Generated productCatalog.ts with ${entries.length} products.`);
