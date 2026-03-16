import fs from 'fs';
import path from 'path';

const dir = './src';
const files = fs.readdirSync(dir);
for (const file of files) {
  const stat = fs.statSync(path.join(dir, file));
  console.log(`${file}: ${stat.mtime}`);
}
