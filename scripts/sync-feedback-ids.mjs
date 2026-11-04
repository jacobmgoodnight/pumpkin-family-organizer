// Keep the invite service's feedback allowlist aligned with the published catalog.
import {readFile,writeFile} from 'node:fs/promises';
const catalogUrl=new URL('../guest-catalog.json',import.meta.url);
const edgeUrl=new URL('../supabase/functions/pumpkin-profile-invites/index.ts',import.meta.url);
const catalog=JSON.parse(await readFile(catalogUrl,'utf8'));
const ids=catalog.map(item=>item.id);
if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^(?:[a-f0-9]{16}|extra:[a-z0-9-]{1,100})$/.test(id)))throw Error('Catalog has invalid or duplicate builtin IDs');
const source=await readFile(edgeUrl,'utf8');
const pattern=/const BUILTIN_TEMPLATE_IDS=new Set\(\[[^\n]*\]\);/;
if(!pattern.test(source))throw Error('Could not find the generated feedback allowlist');
await writeFile(edgeUrl,source.replace(pattern,`const BUILTIN_TEMPLATE_IDS=new Set(${JSON.stringify(ids)});`));
