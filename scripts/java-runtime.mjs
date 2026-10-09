import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
export function findJava21() {
  const executable = process.platform === 'win32' ? 'java.exe' : 'java';
  const candidates = [process.env.JAVA_HOME_21 && path.join(process.env.JAVA_HOME_21, 'bin', executable), process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', executable), executable];
  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE || homedir();
    for (const root of [path.join(home, 'AppData','Local','Programs','Eclipse Adoptium'), 'C:/Program Files/Microsoft', 'C:/Program Files/Eclipse Adoptium', 'C:/Program Files/Java', path.join(home, '.jdks')]) {
      try { for (const item of readdirSync(root, { withFileTypes: true })) if (item.isDirectory()) candidates.push(path.join(root, item.name, 'bin', executable)); } catch {}
    }
  }
  for (const candidate of candidates.filter(Boolean)) {
    const result = spawnSync(candidate, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const major = /version "(\d+)/.exec(`${result.stdout || ''}${result.stderr || ''}`)?.[1];
    if (result.status === 0 && Number(major) === 21) return candidate;
  }
  throw new Error('Java 21 was not found. Set JAVA_HOME_21 to your JDK 21 directory.');
}
