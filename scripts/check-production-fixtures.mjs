import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (/\.(js|html)$/.test(file) && /DEMO SANDBOX|Demo Kitchen|demo-paneer-wrap|DEMO-ORDER-001/.test(readFileSync(file, 'utf8'))) throw new Error(`Demo fixture detected in live artifact: ${file}`);
  }
}
inspect('dist');
console.log('Live bundle contains no demo fixtures.');
