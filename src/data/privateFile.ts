import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
type PrivateFile = { name: string; contentType: string } & ({ text: string; base64?: never } | { base64: string; text?: never });
const cacheDirectory = 'allgo-private-exports', cacheLifetime = 3600000;
export async function cleanupExpiredPrivateFiles() {
  if (!Capacitor.isNativePlatform()) return;
  try { await Filesystem.stat({ path: cacheDirectory, directory: Directory.Cache }); }
  catch { await Filesystem.mkdir({ path: cacheDirectory, directory: Directory.Cache, recursive: true }); }
  const entries = await Filesystem.readdir({ path: cacheDirectory, directory: Directory.Cache });
  for (const file of entries.files) {
    const match = /^(\d{13,16})-[0-9a-f-]{36}-[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.exec(file.name);
    if (file.type === 'file' && match && Date.now() - Number(match[1]) >= cacheLifetime) await Filesystem.deleteFile({ path: `${cacheDirectory}/${file.name}`, directory: Directory.Cache });
  }
}
export async function savePrivateFile(file: PrivateFile) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(file.name)) throw new Error('The file name is invalid.');
  if (Capacitor.isNativePlatform()) {
    if (!(await Share.canShare()).value) throw new Error('File sharing is unavailable on this device.');
    await cleanupExpiredPrivateFiles();
    const path = `${cacheDirectory}/${Date.now()}-${crypto.randomUUID()}-${file.name}`;
    let created = false;
    try {
      const saved = await Filesystem.writeFile({ path, directory: Directory.Cache, recursive: true, data: file.text ?? file.base64, ...(file.text !== undefined ? { encoding: Encoding.UTF8 } : {}) }); created = true;
      await Share.share({ title: 'Save or share your AllGo file', files: [saved.uri], dialogTitle: 'Choose where to save or share this private file' });
    } finally {
      // Android may resolve its chooser before the receiving app reads the file.
      // Keep its temporary grant usable; remove old copies on a timer or next startup.
      if (created) setTimeout(() => { void Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => console.warn('Temporary private file cleanup requires retry.')); }, cacheLifetime);
    }
    return;
  }
  const bytes = file.base64 !== undefined ? Uint8Array.from(atob(file.base64), character => character.charCodeAt(0)) : file.text;
  const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType })), link = document.createElement('a');
  try { link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
