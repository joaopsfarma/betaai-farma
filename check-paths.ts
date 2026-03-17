import fs from 'fs';

console.log('cwd:', process.cwd());
console.log('/src exists:', fs.existsSync('/src'));
console.log('./src exists:', fs.existsSync('./src'));
