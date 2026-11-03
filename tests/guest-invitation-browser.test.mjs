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
const SESSION='pumpkin-person-invite',REMEMBER='pumpkin-person-invite-remembered-v1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('invitation recovery keeps the remembered person through failed replacement links', {skip:!browser&&'No Chromium-compatible browser found',timeout:120000},async()=>{
 let aStatus=200,bStatus=401,holdB=false,releaseB;const calls=[];
 const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/functions/v1/pumpkin-profile-invites'){
   let body='';for await(const chunk of req)body+=chunk;
   const request=JSON.parse(body);calls.push(request.token);
   if(request.token===B&&holdB)await new Promise(resolve=>{releaseB=resolve;});
   const status=request.token===A?aStatus:request.token===C?200:request.token===B?bStatus:401;
   res.writeHead(status,{'Content-Type':'application/json'});
   if(status!==200){res.end(JSON.stringify({error:status===401?'Revoked':'Temporary outage'}));return;}
   const id=request.token===A?'a':request.token===B?'b':'c';
   const name={a:'Alice',b:'Bella',c:'Casey'}[id];
   res.end(JSON.stringify({personId:id,name,expiresAt:'2099-01-01T00:00:00Z',people:[{id,name}],familyChoices:[],imports:[],ideas:[]}));return;
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
 let socket,otherSocket;
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
  const go=async hash=>{
   const count=calls.length;
   // Simulate opening the link from Messages, not a same-document hash change.
   await send('Page.navigate',{url:'about:blank'});
   await send('Page.navigate',{url:`${origin}/guest.html${hash}`});
   await wait(()=>calls.length>count,'invitation API request');
  };
  const app=()=>evaluate("!!document.getElementById('guest-app')&&!document.getElementById('guest-app').hidden");
  const help=()=>evaluate("!!document.getElementById('access-required')&&!document.getElementById('access-required').hidden");
  const stored=()=>evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(REMEMBER)})||'null')?.token||null`);
  const session=()=>evaluate(`sessionStorage.getItem(${JSON.stringify(SESSION)})`);
  const remember=async()=>{await evaluate("document.getElementById('remember-device').click()");};
  await send('Page.enable');
  await go(`#invite=${A}`);await wait(app,'Alice opens');await remember();
  assert.equal(await stored(),A);assert.equal(await session(),A);
  assert.equal(await evaluate('location.hash'),'','private fragment is removed');
  await go(`#invite=${B}`);await wait(help,'revoked replacement shows help');
  assert.equal(await stored(),A,'revoked B must not erase remembered A');assert.equal(await session(),null);
  await go('');await wait(app,'remembered A reopens');assert.equal(calls.at(-1),A);
  bStatus=503;
  await go(`#invite=${B}`);await wait(help,'offline replacement shows retry help');
  assert.equal(await stored(),A,'offline B must not erase remembered A');assert.equal(await session(),B);
  bStatus=200;
  await go('');await wait(app,'B validates after an offline reload');assert.equal(calls.at(-1),B);
  assert.equal(await stored(),null,'successful replacement must stop restoring A on a later session');
  await remember();assert.equal(await stored(),B,'B can opt in to being remembered');
  await evaluate('sessionStorage.clear()');await go('');await wait(app,'remembered B opens in a new session');assert.equal(calls.at(-1),B);
  bStatus=401;await go('');await wait(help,'revoked remembered B shows help');
  assert.equal(await stored(),null,'revocation clears the rejected remembered token');assert.equal(await session(),null);
  // A second tab can remember a newer person while B is waiting to reconnect.
  await go(`#invite=${A}`);await wait(app,'Alice reopens');await remember();
  bStatus=503;await go(`#invite=${B}`);await wait(help,'B waits for connection');assert.equal(await stored(),A);
  const second=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  otherSocket=new WebSocket(second.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{otherSocket.addEventListener('open',resolve,{once:true});otherSocket.addEventListener('error',reject,{once:true});});
  let secondId=0;const secondPending=new Map();
  otherSocket.addEventListener('message',event=>{const message=JSON.parse(event.data),entry=secondPending.get(message.id);if(!entry)return;secondPending.delete(message.id);message.error?entry.reject(new Error(message.error.message)):entry.resolve(message.result);});
  const sendOther=(method,params={})=>new Promise((resolve,reject)=>{const id=++secondId;secondPending.set(id,{resolve,reject});otherSocket.send(JSON.stringify({id,method,params}));});
  const evalOther=async expression=>{const result=await sendOther('Runtime.evaluate',{expression,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
  await sendOther('Page.navigate',{url:`${origin}/guest.html#invite=${C}`});
  await wait(()=>evalOther("!!document.getElementById('guest-app')&&!document.getElementById('guest-app').hidden"),'Casey opens in another tab');
  await evalOther("document.getElementById('remember-device').click()");
  await wait(async()=>(await stored())===C,'second tab remembers C');
  assert.equal(await stored(),C,'second tab remembers C');
  bStatus=200;await go('');await wait(app,'B succeeds after C is remembered elsewhere');
  assert.equal(await stored(),C,'confirming B must preserve the newer C saved in another tab');
  // Opening another invite at the same URL may only change the fragment.
  await go(`#invite=${A}`);await wait(app,'Alice opens before same-page switch');
  await evaluate("document.getElementById('preview-dialog').showModal()");
  assert.equal(await evaluate("document.getElementById('preview-dialog').open"),true);
  holdB=true;const countBeforeHashSwitch=calls.length;
  await evaluate(`location.hash=${JSON.stringify('#invite='+B)}`);
  await wait(()=>calls.length>countBeforeHashSwitch&&!!releaseB,'B is being validated after same-page switch');
  assert.equal(await app(),false,'previous gallery stays hidden while B is validated');
  assert.equal(await evaluate("document.getElementById('preview-dialog').open"),false,'previous preview closes during validation');
  holdB=false;releaseB();await wait(app,'B opens after same-page fragment change');
  assert.equal(await evaluate("document.getElementById('person-view').value"),'b');
  assert.equal(await evaluate('location.hash'),'','the new fragment is scrubbed without a reload loop');
  // A revocation may happen after the family member is already browsing.
  await go(`#invite=${A}`);await wait(app,'Alice opens before revocation');await remember();
  assert.equal(await stored(),A,'Alice is remembered before revocation');
  await evaluate("document.getElementById('preview-dialog').showModal()");
  assert.equal(await evaluate("document.getElementById('preview-dialog').open"),true);
  aStatus=503;await evaluate("document.getElementById('sync-status').click()");
  await wait(()=>evaluate("document.getElementById('sync-status').textContent.includes('Sync paused')"),'temporary refresh outage');
  assert.equal(await app(),true,'temporary refresh outage leaves the gallery open');
  assert.equal(await stored(),A,'temporary refresh outage preserves remembered access');
  aStatus=401;await evaluate("document.getElementById('sync-status').click()");
  await wait(help,'revocation on refresh shows access help');
  assert.equal(await app(),false,'revocation hides the open gallery');
  assert.equal(await evaluate("document.getElementById('preview-dialog').open"),false,'revocation closes a dialog in the top layer');
  assert.equal(await stored(),null,'revocation clears remembered access');
  assert.equal(await session(),null,'revocation clears session access');
 }finally{otherSocket?.close();socket?.close();child.kill();server.close();await sleep(100);try{rmSync(profile,{recursive:true,force:true});}catch{}}
});
