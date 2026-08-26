import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const context = vm.createContext({ console });
new vm.Script(fs.readFileSync(path.join(root, '01_CORE_BrandingService.gs'), 'utf8'), { filename: '01_CORE_BrandingService.gs' }).runInContext(context);

const fileId = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
context.__values = vm.runInContext(`[
  institutionDriveFileId_('https://drive.google.com/file/d/${fileId}/view?usp=sharing'),
  institutionDriveFileId_('https://drive.google.com/open?id=${fileId}'),
  institutionDriveFileId_('${fileId}'),
  institutionDriveFileId_('https://example.com/brasao.png')
]`, context);

assert.deepEqual(Array.from(context.__values), [fileId, fileId, fileId, '']);
console.log('OK: link compartilhado e ID direto do brasão no Google Drive validados.');
