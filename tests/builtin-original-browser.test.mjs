import {findBrowser} from './browser-executable.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=findBrowser();
const organizerDriver=`<script>
(async()=>{
 const checks=[],check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async f=>{for(let i=0;i<300;i++){if(f())return;await new Promise(r=>setTimeout(r,10))}throw Error('Timed out')};
 try{
  await wait(()=>document.getElementById('pumpkin-original-locator')&&window.PUMPKIN_HAS_BUILTIN_ORIGINAL);
  document.body.classList.remove('cloud-gated');
  const items=normalizedZombie.filter(x=>x.path).slice(0,2),dialog=document.getElementById('pumpkin-original-locator');
  const open=(item)=>{const a=document.createElement('a');a.href='#';a.dataset.originalId=item.id;document.body.append(a);a.click();a.remove()};
  open(items[0]);check('first original dialog names the first design',dialog.textContent.includes(items[0].name));
  const file=dialog.querySelector('input[type=file]'),rights=dialog.querySelector('input[type=checkbox]'),save=dialog.querySelector('[data-save]');
  const transfer=new DataTransfer();transfer.items.add(new File(['PDF'],'private.pdf',{type:'application/pdf'}));file.files=transfer.files;rights.checked=true;
  dialog.close();open(items[1]);
  check('opening another design clears the selected file',file.files.length===0);
  check('opening another design clears the permission confirmation',!rights.checked);
  check('open and remove actions do not retain the previous design',dialog.querySelector('[data-open]').hidden&&dialog.querySelector('[data-remove]').hidden);
  save.disabled=false;save.click();check('saving without a new file and permission is refused',dialog.querySelector('[data-status]').textContent.includes('confirm permission'));
 }catch(e){checks.push({name:String(e.stack||e),ok:false})}
 const out=document.createElement('pre');out.id='browser-test-output';out.textContent=JSON.stringify(checks);document.body.append(out);
})();
</script>`;
const guestSetup=`<script>
window.PUMPKIN_CLOUD_CONFIG={url:location.origin,publishableKey:'test'};
window.__prints=[];window.open=()=>{const tab={location:{href:''},close(){}};window.__tab=tab;return tab};
const realFetch=window.fetch.bind(window);
window.fetch=async(url,opts={})=>{
 if(String(url).includes('guest-catalog.json'))return Response.json([{id:'ccd5c6ea6de81bc1',name:'Built-in Owl',category:'Animals',source:'zombie',tags:[]}]);
 if(String(url).includes('guest-search-metadata.json')||String(url).includes('guest-pattern-details.json'))return Response.json({});
 if(String(url).includes('/functions/v1/pumpkin-profile-invites')){
  const body=JSON.parse(opts.body);
  if(body.action==='guest')return Response.json({personId:'me',name:'Me',expiresAt:'2099-01-01T00:00:00Z',people:[{id:'me',name:'Me'}],familyChoices:[],builtinOriginals:['ccd5c6ea6de81bc1'],imports:[{id:'00000000-0000-4000-8000-000000000001',name:'Family Owl',category:'Family imports',original_path:'owner/imports/file.pdf'}],ideas:[]});
  if(body.action==='print'){window.__prints.push(body);return Response.json({url:'https://example.test/signed-original'})}
  return Response.json({links:{}});
 }
 return realFetch(url,opts);
};
</script>`;
const guestDriver=`<script>
(async()=>{
 const checks=[],check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async f=>{for(let i=0;i<300;i++){if(f())return;await new Promise(r=>setTimeout(r,10))}throw Error('Timed out')};
 try{
  await wait(()=>!document.getElementById('guest-app').hidden&&document.querySelectorAll('#grid article').length>=2);
  const card=name=>[...document.querySelectorAll('#grid article')].find(x=>x.textContent.includes(name));
  const print=name=>[...card(name).querySelectorAll('button')].find(b=>b.textContent.includes('Open / print'));
  check('built-in design exposes its saved original',!!print('Built-in Owl'));
  print('Built-in Owl').click();await wait(()=>window.__prints.length===1&&window.__tab.location.href);
  check('built-in print requests its design ID',window.__prints[0].templateId==='ccd5c6ea6de81bc1'&&!window.__prints[0].importId);
  check('built-in opens the signed original',window.__tab.location.href==='https://example.test/signed-original');
  check('existing imported original remains available',!!print('Family Owl'));
  print('Family Owl').click();await wait(()=>window.__prints.length===2&&window.__tab.location.href);
  check('family import print still requests its import ID',window.__prints[1].importId==='00000000-0000-4000-8000-000000000001'&&!window.__prints[1].templateId);
 }catch(e){checks.push({name:String(e.stack||e),ok:false})}
 const out=document.createElement('pre');out.id='browser-test-output';out.textContent=JSON.stringify(checks);document.body.append(out);
})();
</script>`;
const conflictDriver=`<script>
(async()=>{
 const checks=[],check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async f=>{for(let i=0;i<300;i++){if(f())return;await new Promise(r=>setTimeout(r,10))}throw Error('Timed out')};
 try{
  window.confirm=()=>true;window.__originalError='conflict';
  await wait(()=>document.getElementById('pumpkin-original-locator')&&window.PUMPKIN_HAS_BUILTIN_ORIGINAL);
  document.body.classList.remove('cloud-gated');const item=normalizedZombie.find(x=>x.path),dialog=document.getElementById('pumpkin-original-locator');
  const a=document.createElement('a');a.href='#';a.dataset.originalId=item.id;document.body.append(a);a.click();a.remove();
  const file=dialog.querySelector('input[type=file]'),rights=dialog.querySelector('input[type=checkbox]'),save=dialog.querySelector('[data-save]'),remove=dialog.querySelector('[data-remove]'),status=dialog.querySelector('[data-status]');
  const transfer=new DataTransfer();transfer.items.add(new File(['PDF'],'private.pdf',{type:'application/pdf'}));file.files=transfer.files;rights.checked=true;
  await wait(()=>!save.disabled&&!remove.hidden);save.click();await wait(()=>status.textContent.includes('another window'));
  check('save conflict explains how to recover',status.textContent==='The saved original changed in another window. Review it and try again.');
  status.textContent='';remove.click();await wait(()=>status.textContent.includes('another window'));
  check('remove conflict explains how to recover',status.textContent==='The saved original changed in another window. Review it and try again.');
  window.__originalError='unexpected';status.textContent='';save.click();await wait(()=>status.textContent.includes('Could not save'));
  check('unexpected errors stay generic and hide backend details',status.textContent==='Could not save the original. Check your connection and sign-in, then try again.');
 }catch(e){checks.push({name:String(e.stack||e),ok:false})}
 const out=document.createElement('pre');out.id='browser-test-output';out.textContent=JSON.stringify(checks);document.body.append(out);
})();
</script>`;
const accountSwitchDriver=`<script>
(async()=>{
 const checks=[],check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async f=>{for(let i=0;i<300;i++){if(f())return;await new Promise(r=>setTimeout(r,10))}throw Error('Timed out')};
 try{
  window.__originalError='defer';
  await wait(()=>document.getElementById('pumpkin-original-locator')&&window.PUMPKIN_HAS_BUILTIN_ORIGINAL);
  document.body.classList.remove('cloud-gated');const item=normalizedZombie.find(x=>x.path),dialog=document.getElementById('pumpkin-original-locator');
  const open=()=>{const a=document.createElement('a');a.href='#';a.dataset.originalId=item.id;document.body.append(a);a.click();a.remove()};
  const file=dialog.querySelector('input[type=file]'),rights=dialog.querySelector('input[type=checkbox]'),save=dialog.querySelector('[data-save]'),status=dialog.querySelector('[data-status]');
  const choose=()=>{const transfer=new DataTransfer();transfer.items.add(new File(['PDF'],'private.pdf',{type:'application/pdf'}));file.files=transfer.files;rights.checked=true};
  open();await wait(()=>!save.disabled);choose();save.click();await wait(()=>window.__resolveOriginalSave);
  window.dispatchEvent(new Event('pumpkin:cloudownerchange'));
  check('account change closes the dialog',!dialog.open);
  check('account change discards file and permission',file.files.length===0&&!rights.checked);
  open();choose();window.__resolveOriginalSave({cleanupFailed:false});await wait(()=>!save.disabled);
  check('old save completion does not clear new account choice',file.files.length===1&&rights.checked);
  check('old save completion does not claim success for new account',!status.textContent.includes('Saved'));
  window.dispatchEvent(new Event('pumpkin:cloudsignedout'));
  check('sign-out closes the dialog',!dialog.open);
  check('sign-out discards file and permission',file.files.length===0&&!rights.checked);
 }catch(e){checks.push({name:String(e.stack||e),ok:false})}
 const out=document.createElement('pre');out.id='browser-test-output';out.textContent=JSON.stringify(checks);document.body.append(out);
})();
</script>`;

async function journey(page,driver,variant=''){
 const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  try{
   if(pathname==='/mock-supabase.js'){res.setHeader('Content-Type','text/javascript');res.end(variant?"export const createClient=()=>({auth:{getSession:()=>new Promise(()=>{}),onAuthStateChange(){}}});":"export const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){}}});");return}
   if(pathname==='/mock-builtin.js'){res.setHeader('Content-Type','text/javascript');res.end("export const createBuiltinOriginals=()=>({refresh:async()=>{},has:()=>true,save:async()=>{if(window.__originalError==='defer')return await new Promise(resolve=>window.__resolveOriginalSave=resolve);throw Object.assign(Error('secret backend detail'),{code:window.__originalError==='conflict'?'ORIGINAL_CONFLICT':'OTHER'})},remove:async()=>{throw Object.assign(Error('secret backend detail'),{code:'ORIGINAL_CONFLICT'})}});");return}
   let data=readFileSync(path.join(root,pathname.slice(1)));
   if(pathname==='/index.html')data=Buffer.from(data.toString().replace('</body>',driver+'</body>'));
   if(pathname==='/guest.html')data=Buffer.from(data.toString().replace('<script type="module" src="guest.js',guestSetup+'<script type="module" src="guest.js').replace('</body>',driver+'</body>'));
   if(pathname==='/family-sync.js'){
    let source=data.toString().replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm','./mock-supabase.js');
    if(variant)source=source.replace('let client=null,owner=null','let client=null,owner="test-owner"').replace(/\.\/builtin-originals\.js\?v=[a-z0-9]+/,'./mock-builtin.js');
    data=Buffer.from(source);
   }
   res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html');res.end(data);
  }catch{res.writeHead(404);res.end()}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const profile=mkdtempSync(path.join(tmpdir(),'pumpkin-builtins-'));
 try{
  const url=`http://127.0.0.1:${server.address().port}/${page}${page==='guest.html'?'#invite='+('a'.repeat(43)):''}`;
  const args=['--headless','--disable-gpu','--disable-extensions','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-sandbox','--window-size=375,812','--virtual-time-budget=10000',`--user-data-dir=${profile}`,'--dump-dom',url];
  const result=await new Promise((resolve,reject)=>{const child=spawn(browser,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('Browser timeout: '+stderr.slice(-2000)))},60000);child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})});
  assert.equal(result.code,0,result.stderr);const m=result.stdout.match(/<pre id="browser-test-output">([^<]+)<\/pre>/);assert.ok(m,'Missing browser result: '+result.stderr);
  const checks=JSON.parse(m[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>'));assert.deepEqual(checks.filter(x=>!x.ok),[]);
 }finally{server.close();try{rmSync(profile,{recursive:true,force:true})}catch{}}
}
test('organizer clears a chosen file and permission when changing designs',{skip:!browser&&'No Chromium-compatible browser found',timeout:90000},()=>journey('index.html',organizerDriver));
test('private guest opens built-in and existing imported originals',{skip:!browser&&'No Chromium-compatible browser found',timeout:90000},()=>journey('guest.html',guestDriver));
test('organizer explains save and removal conflicts without exposing backend errors',{skip:!browser&&'No Chromium-compatible browser found',timeout:90000},()=>journey('index.html',conflictDriver,'conflict'));
test('switching or signing out clears selected originals and invalidates old save feedback',{skip:!browser&&'No Chromium-compatible browser found',timeout:90000},()=>journey('index.html',accountSwitchDriver,'account-switch'));
