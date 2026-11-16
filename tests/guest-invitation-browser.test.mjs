import {findBrowser} from "./browser-executable.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=findBrowser();
const A='a'.repeat(43),B='b'.repeat(43),C='c'.repeat(43);
const SESSION='pumpkin-person-invite',REMEMBERED='pumpkin-person-invites-remembered-v2';
const PEOPLE={[A]:{id:'a',name:'Alice'},[B]:{id:'b',name:'Bella'},[C]:{id:'c',name:'Casey'}};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('private links are remembered per person, never guessed, and recover from failed links', {skip:!browser&&'No Chromium-compatible browser found',timeout:120000},async()=>{
 const status={[A]:200,[B]:401,[C]:200},reason={};let holdB=false,releaseB,choiceStatus=0;const calls=[];
 const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/functions/v1/pumpkin-invite-renewal'){
   let body='';for await(const chunk of req)body+=chunk;
   const request=JSON.parse(body);
   const code=status[request.token]??401;
   res.writeHead(200,{'Content-Type':'application/json'});
   res.end(JSON.stringify(code===200&&!choiceStatus?{reason:'active'}:code===200?{reason:'unknown'}:code===401?(reason[request.token]||{reason:'unknown'}):{reason:'unknown'}));return;
  }
  if(pathname==='/functions/v1/pumpkin-profile-invites'){
   let body='';for await(const chunk of req)body+=chunk;
   const request=JSON.parse(body);calls.push(request.token);
   const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
   if(request.token===B&&holdB)await new Promise(resolve=>{releaseB=resolve;});
   const code=status[request.token]??401;
   if(code===401){json(401,{error:'Invitation invalid or expired'});return;}
   if(code!==200){json(code,{error:'Temporary outage'});return;}
   if(request.action==='search'){json(200,{results:[{title:'Cat stencil',source:'Example',thumbnail:'https://pumpkin-test.invalid/cat.jpg',sourceUrl:'https://pumpkin-test.invalid/cat',importTicket:'expired.ticket'}]});return;}
   if(request.action==='import'){json(401,{error:'Import link expired. Run the image search again.'});return;}
   if(request.action==='choice'){
    if(choiceStatus){json(choiceStatus,{error:'Invitation invalid or expired'});return;}
    json(200,{ok:true,templateId:request.templateId,favorite:request.favorite||request.finalPick,finalPick:request.finalPick});return;
   }
   const person=PEOPLE[request.token];
   json(200,{personId:person.id,name:person.name,expiresAt:'2099-01-01T00:00:00Z',people:[{id:person.id,name:person.name}],familyChoices:[],imports:[],ideas:[]});return;
  }
  if(pathname==='/guest-catalog.json'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify([{id:'cat',name:'Cat',category:'Animals',source:'zombie',tags:[]}]));return;}
  if(pathname==='/guest-search-metadata.json'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;}
  try{
   let data=readFileSync(path.join(root,pathname==='/'?'guest.html':pathname.slice(1)));
   if(pathname==='/guest.html')data=Buffer.from(data.toString().replace('<script type="module" src="guest.js','<script>window.PUMPKIN_CLOUD_CONFIG={url:location.origin,publishableKey:"test"};</script><script type="module" src="guest.js'));
   res.writeHead(200,{'Content-Type':pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html'});res.end(data);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const profile=mkdtempSync(path.join(tmpdir(),'pumpkin-invitation-'));
 const child=spawn(browser,['--headless','--disable-gpu','--disable-extensions','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-sandbox','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
 let browserError=null,browserStderr='';
 child.on('error',error=>{browserError=error;});
 child.stderr.on('data',chunk=>{browserStderr=(browserStderr+chunk.toString()).slice(-32768);});
 let socket;
 try{
  const portFile=path.join(profile,'DevToolsActivePort'),deadline=Date.now()+25000;
  let port='';
  // Concurrent browser launches on shared CI runners can take longer than a
  // few seconds. Detect early exit separately from a slow startup and keep
  // the browser's diagnostics if it never becomes ready.
  while(Date.now()<deadline&&!browserError&&child.exitCode===null&&child.signalCode===null){
   if(existsSync(portFile)){
    port=readFileSync(portFile,'utf8').split(/\r?\n/)[0].trim();
    if(/^\d+$/.test(port))break;
   }
   await sleep(50);
  }
  if(!/^\d+$/.test(port))throw Error(`Browser debugging port unavailable (executable: ${browser}, exit: ${child.exitCode}, signal: ${child.signalCode}, error: ${browserError?.message||'none'}). Browser stderr:\n${browserStderr||'(empty)'}`);
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let nextId=0;const pending=new Map();
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data),entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);message.error?entry.reject(new Error(message.error.message)):entry.resolve(message.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
  const wait=async(predicate,description)=>{for(let i=0;i<300;i++){try{if(await predicate())return;}catch{}await sleep(25);}throw Error(`Timed out: ${description}`);};
  const visible=id=>evaluate(`!!document.getElementById(${JSON.stringify(id)})&&!document.getElementById(${JSON.stringify(id)}).hidden`);
  const app=()=>visible('guest-app'),help=()=>visible('access-required'),chooser=()=>visible('who-is-picking');
  const text=id=>evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const stored=()=>evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(REMEMBERED)})||'[]').map(x=>x.token)`);
  const session=()=>evaluate(`sessionStorage.getItem(${JSON.stringify(SESSION)})`);
  const names=()=>evaluate("[...document.querySelectorAll('#who-people button')].map(b=>b.textContent)");
  // Clicks that navigate run after the evaluation returns.
  const tap=expression=>evaluate(`setTimeout(()=>(${expression}).click(),0);true`);
  const choose=name=>tap(`[...document.querySelectorAll('#who-people button')].find(b=>b.textContent.includes(${JSON.stringify(name)}))`);
  const go=async(hash,expectRequest=true)=>{
   const count=calls.length;
   // Simulate opening the link from Messages, not a same-document hash change.
   await send('Page.navigate',{url:'about:blank'});
   await send('Page.navigate',{url:`${origin}/guest.html${hash}`});
   if(expectRequest)await wait(()=>calls.length>count,'invitation API request');
  };
  await send('Page.enable');

  // Opening a link remembers that person automatically and removes the secret from the address.
  await go(`#invite=${A}`);await wait(app,'Alice opens');
  await wait(async()=>(await stored()).length===1,'Alice is remembered');
  assert.deepEqual(await stored(),[A],'remembered without tapping anything');
  assert.equal(await evaluate('location.hash'),'','private fragment is removed');
  assert.equal(await text('switch-person'),'Not Alice?');

  // A rejected link for someone else never disturbs a remembered person.
  await go(`#invite=${B}`);await wait(help,'revoked link shows help');
  assert.deepEqual(await stored(),[A],'a rejected link never erases a remembered person');
  assert.equal(await session(),null);
  await go('');await wait(app,'Alice reopens without her link');assert.equal(calls.at(-1),A);

  // An offline link waits for a retry; once it works, both people are remembered.
  status[B]=503;
  await go(`#invite=${B}`);await wait(help,'offline link shows retry help');
  assert.equal(await visible('retry-access'),true);
  assert.deepEqual(await stored(),[A],'an offline link does not erase Alice');assert.equal(await session(),B);
  status[B]=200;
  await go('');await wait(app,'Bella validates after an offline reload');assert.equal(calls.at(-1),B);
  assert.deepEqual((await stored()).sort(),[A,B].sort(),'both family members are remembered');
  assert.equal(await text('switch-person'),'Switch person');

  // With two people remembered, a new visit asks who is picking instead of guessing.
  await evaluate('sessionStorage.clear()');await go('',false);await wait(chooser,'chooser appears');
  assert.deepEqual((await names()).sort(),['🎃 Alice','🎃 Bella']);
  let count=calls.length;
  await choose('Alice');await wait(app,'Alice chosen');
  assert.ok(calls.length>count&&calls.at(-1)===A);
  assert.equal(await text('identity-heading'),'Choosing as Alice');
  await tap("document.getElementById('switch-person')");await wait(chooser,'Switch person returns to the chooser');

  // A replaced link is forgotten and explained; the other person stays available.
  status[B]=401;reason[B]={reason:'replaced'};
  await choose('Bella');await wait(help,'replaced link is explained');
  assert.match(await text('access-required-heading'),/replaced/);
  assert.deepEqual(await stored(),[A],'only the replaced link is forgotten');
  assert.equal(await visible('choose-saved'),true,'someone else can still be chosen');
  await go('');await wait(app,'the only remembered person opens directly');assert.equal(calls.at(-1),A);

  // An expired link is explained and kept, so a parent's Extend revives the same link.
  status[B]=200;delete reason[B];
  await go(`#invite=${B}`);await wait(app,'Bella opens her link again');
  status[B]=401;reason[B]={reason:'expired',name:'Bella',expiredAt:'2026-11-01T12:00:00Z'};
  await evaluate("document.getElementById('sync-status').click()");
  await wait(help,'expired link is explained');
  assert.match(await text('access-required-heading'),/refresh/);
  assert.match(await text('access-required-message'),/Bella, your pumpkin link stopped working[\s\S]*Extend/);
  assert.ok((await stored()).includes(B),'an expired link is kept for Extend');
  status[B]=200;delete reason[B];
  await evaluate("document.getElementById('retry-access').click()");await wait(app,'the same link works again after Extend');

  // Opening another invite at the same URL may only change the fragment.
  await go(`#invite=${A}`);await wait(app,'Alice opens before same-page switch');
  await evaluate("document.getElementById('preview-dialog').showModal()");
  assert.equal(await evaluate("document.getElementById('preview-dialog').open"),true);
  holdB=true;count=calls.length;
  await evaluate(`location.hash=${JSON.stringify('#invite='+B)}`);
  await wait(()=>calls.length>count&&!!releaseB,'B is being validated after same-page switch');
  assert.equal(await app(),false,'previous gallery stays hidden while B is validated');
  assert.equal(await evaluate("document.getElementById('preview-dialog').open"),false,'previous preview closes during validation');
  holdB=false;releaseB();await wait(app,'B opens after same-page fragment change');
  assert.equal(await evaluate("document.getElementById('person-view').value"),'b');
  assert.equal(await evaluate('location.hash'),'','the new fragment is scrubbed without a reload loop');

  // A revocation may happen after the family member is already browsing.
  await go(`#invite=${A}`);await wait(app,'Alice opens before revocation');
  await evaluate("document.getElementById('preview-dialog').showModal()");
  status[A]=503;await evaluate("document.getElementById('sync-status').click()");
  await wait(()=>evaluate("document.getElementById('sync-status').textContent.includes('Sync paused')"),'temporary refresh outage');
  assert.equal(await app(),true,'temporary refresh outage leaves the gallery open');
  assert.ok((await stored()).includes(A),'temporary refresh outage keeps Alice remembered');
  status[A]=401;await evaluate("document.getElementById('sync-status').click()");
  await wait(help,'revocation on refresh shows access help');
  assert.equal(await app(),false,'revocation hides the open gallery');
  assert.equal(await evaluate("document.getElementById('preview-dialog').open"),false,'revocation closes a dialog in the top layer');
  assert.ok(!(await stored()).includes(A),'revocation forgets Alice');
  assert.equal(await session(),null,'revocation clears session access');

  // Revocation can also be discovered by an ordinary action rather than the
  // background refresh. It must close the gallery instead of offering an
  // endless "Try again" for a link that will never work again.
  status[A]=200;await go(`#invite=${A}`);await wait(app,'Alice opens before an action-time revocation');
  // An expired 20-minute import ticket is not a revoked invitation.
  await evaluate("document.getElementById('online-search').value='cat';document.getElementById('online-form').requestSubmit()");
  await wait(()=>evaluate("!!document.querySelector('#online-results .web-import:not([disabled])')"),'online result offers an import');
  await evaluate("window.confirm=()=>true;document.querySelector('#online-results .web-import').click()");
  await wait(()=>evaluate("document.getElementById('online-status').textContent.includes('Import link expired')"),'expired import ticket is explained');
  assert.equal(await app(),true,'an expired import ticket keeps the gallery open');
  assert.ok((await stored()).includes(A),'an expired import ticket keeps remembered access');
  choiceStatus=401;
  await evaluate("[...document.querySelectorAll('#grid button')].find(b=>/Save/.test(b.textContent)).click()");
  await wait(help,'revocation discovered by a Save tap shows access help');
  assert.equal(await app(),false,'action-time revocation hides the gallery');
  assert.match(await text('access-required-message'),/expired or was revoked/);
  assert.equal(await text('alert'),'','no stale save-failure message remains');
  assert.ok(!(await stored()).includes(A),'action-time revocation forgets Alice');
  assert.equal(await session(),null,'action-time revocation clears session access');

  // Forgetting yourself on a shared device asks who is picking; it never opens someone else.
  choiceStatus=0;
  await go(`#invite=${A}`);await wait(app,'Alice opens before forgetting');
  await evaluate("window.confirm=()=>true;document.getElementById('forget').click()");
  await wait(chooser,'chooser after forgetting');
  assert.deepEqual(await names(),['🎃 Bella']);
  assert.ok(!(await stored()).includes(A),'Alice is forgotten on this device');
 }finally{socket?.close();child.kill();server.close();await sleep(100);try{rmSync(profile,{recursive:true,force:true});}catch{}}
});
