import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory=await mkdtemp(join(tmpdir(),'cities-road-checks-'));
try {
  await build({configFile:false,logLevel:'error',build:{ssr:'scripts/check-roads.ts',outDir:directory,rollupOptions:{output:{entryFileNames:'check.mjs'}}}});
  await import(pathToFileURL(join(directory,'check.mjs')).href);
} finally {await rm(directory,{recursive:true,force:true});}
