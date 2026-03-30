import fs from 'fs';
import path from 'path';

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file.includes('\\')) {
      console.log(`Found backslash in: ${fullPath}`);
    }
    if (fs.statSync(fullPath).isDirectory() && file !== 'node_modules' && !file.startsWith('.')) {
      walk(fullPath);
    }
  }
}

walk(process.cwd());
