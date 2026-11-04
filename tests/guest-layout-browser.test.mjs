import { findBrowser } from './browser-executable.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = findBrowser();

function checkLayout(width) {
 const directory = mkdtempSync(path.join(tmpdir(), 'pumpkin-layout-'));
 try {
  const fixture = path.join(directory, 'layout.html');
  const driver = `<script>
   const $=id=>document.getElementById(id);
   $('guest-app').hidden=false;
   const rect=id=>$(id).getBoundingClientRect();
   const checks={searchFirst:rect('search').bottom<=rect('guest-views').top,
    searchAnchor:getComputedStyle($('search').parentElement).position==='relative'};
   $('quick-favorites').hidden=true;
   const all=rect('quick-all'), picks=rect('quick-picks'), nav=rect('guest-views');
   checks.twoTabsFillRow=Math.abs(all.left-nav.left)<1 && Math.abs(picks.right-nav.right)<1 && Math.abs(all.width-picks.width)<1;
   const filter=rect('filter'), surprise=rect('surprise'), advanced=rect('guest-advanced');
   checks.toolbar=innerWidth<=600 ? surprise.top>=filter.bottom && advanced.top>=surprise.bottom : surprise.left>filter.right && advanced.top>=surprise.bottom;
   const result=document.createElement('pre');result.id='layout-result';result.textContent=JSON.stringify(checks);document.body.append(result);
  </script>`;
  const html=readFileSync(path.join(root,'guest.html'),'utf8')
   .replace('<head>','<head><base href="'+pathToFileURL(root+path.sep).href+'">')
   .replace(/<script\b[^>]*><\/script>/g,'')
   .replace('</body>',driver+'</body>');
  writeFileSync(fixture,html);
  const result=spawnSync(browser,['--headless','--disable-gpu','--no-sandbox','--allow-file-access-from-files',`--window-size=${width},900`,`--user-data-dir=${path.join(directory,'profile')}`,'--dump-dom',pathToFileURL(fixture).href],{encoding:'utf8',timeout:30000,windowsHide:true});
  assert.equal(result.status,0,result.stderr);
  const match=result.stdout.match(/<pre id="layout-result">([^<]+)<\/pre>/);
  assert.ok(match,'Browser did not produce layout results');
  const checks=JSON.parse(match[1].replaceAll('&quot;','"'));
  assert.deepEqual(Object.entries(checks).filter(([,ok])=>!ok),[]);
 } finally { rmSync(directory,{recursive:true,force:true}); }
}

for (const width of [375, 1000]) {
 test(`private gallery discovery layout at ${width}px`,{skip:!browser && 'No Chromium-compatible browser found',timeout:40000},()=>checkLayout(width));
}
