import { readFileSync, writeFileSync } from 'fs';

const csv = readFileSync('C:/Users/Admin/Downloads/nova_base_equivalencias.csv', 'latin1');
const lines = csv.split('\n').slice(1); // skip header

const map = {}; // id_principal -> Set of equiv ids
const names = {}; // id_principal -> description

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  // Format: ID;"DESC";"EQUIV_ID";"EQUIV_DESC"
  const parts = trimmed.split(';');
  if (parts.length < 3) continue;

  const principalId = parts[0].trim().replace(/"/g, '');
  const desc = parts[1].trim().replace(/"/g, '');
  const equivIdsRaw = parts[2].trim().replace(/"/g, '');

  if (!principalId || !equivIdsRaw) continue;

  // equivIdsRaw may have multiple IDs separated by commas or spaces
  const equivIds = equivIdsRaw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);

  if (!map[principalId]) {
    map[principalId] = new Set();
    names[principalId] = desc;
  }

  for (const eid of equivIds) {
    if (eid !== principalId) {
      map[principalId].add(eid);
    }
  }
}

// Build output
const entries = Object.entries(map)
  .filter(([, equivSet]) => equivSet.size > 0)
  .sort(([a], [b]) => Number(a) - Number(b));

let output = `/**
 * Global Equivalency Map - Maps a Product ID to its similar/generic item IDs.
 * Generated from nova_base_equivalencias.csv
 */

export const EQUIVALENCE_MAP: Record<string, string[]> = {\n`;

for (const [id, equivSet] of entries) {
  const equivArr = JSON.stringify([...equivSet]);
  const name = names[id] || '';
  output += `  "${id}": ${equivArr},  // ${name}\n`;
}

output += `};\n`;

writeFileSync('C:/Users/Admin/Desktop/Projeto Claude/src/data/equivalenceMap.ts', output, 'utf8');
console.log(`Done! Generated ${entries.length} entries.`);
