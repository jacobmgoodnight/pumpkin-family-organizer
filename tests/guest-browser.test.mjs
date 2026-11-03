import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This is deliberately optional: npm test also runs on machines without a
// browser. Set PUMPKIN_TEST_BROWSER to a Chromium-compatible executable.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = [process.env.PUMPKIN_TEST_BROWSER,
  process.platform === 'win32' && 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  process.platform === 'win32' && 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'
].find(p => p && existsSync(p));

// Exercise the shipped page and scripts with a fake API, never production data.
const setup = `<script>
window.PUMPKIN_CLOUD_CONFIG={url:location.origin,publishableKey:'test'};
const originalFetch=window.fetch.bind(window);
const catalog=[
 {id:'cat',name:'Cat Face',category:'Animals',difficulty:'Easy',source:'zombie',tags:[]},
 {id:'ghost',name:'Ghost Face',category:'Spooky',difficulty:'Hard',source:'additional',tags:[]}
];
const household=JSON.parse(sessionStorage.getItem('__mockHousehold')||'null')||{personId:'me',name:'Charlotte',expiresAt:'2099-01-01T00:00:00Z',people:[{id:'me',name:'Charlotte'}],familyChoices:[{personId:'me',templateId:'cat',favorite:true,finalPick:true}],imports:[],ideas:[]};
window.__searchQueries=[];
window.__choiceRequests=[];
window.confirm=()=>true;
window.open=()=>{const popup={location:{href:''},close(){}};window.__popup=popup;return popup;};
window.fetch=async (url,opts={})=>{
 if(String(url).includes('guest-catalog.json'))return new Response(JSON.stringify(catalog),{status:200});
 if(String(url).includes('/functions/v1/pumpkin-profile-invites')){
  const body=JSON.parse(opts.body);let data;
  if(body.action==='guest'){
   data=structuredClone(household);
   if(window.__deferRefresh){window.__deferRefresh=false;if(window.__staleChange)data.people.push({id:'other',name:'Other'});await new Promise(resolve=>window.__resolveRefresh=resolve);}
  }else if(body.action==='choice'){
   window.__choiceRequests.push(body);
   if(window.__deferChoice){window.__deferChoice=false;await new Promise(resolve=>window.__resolveChoice=resolve);}
   household.familyChoices=household.familyChoices.filter(x=>x.templateId!==body.templateId);
   household.familyChoices.push({personId:'me',templateId:body.templateId,favorite:body.favorite,finalPick:body.finalPick});
   sessionStorage.setItem('__mockHousehold',JSON.stringify(household));
   data={favorite:body.favorite,finalPick:body.finalPick};
  }else if(body.action==='import'){
   const imported={id:'import-1',name:'Owl Lantern',category:'Family imports',tags:[],thumbnail_path:'private/owl.png',original_path:'private/owl.png'};
   household.imports.push(imported);sessionStorage.setItem('__mockHousehold',JSON.stringify(household));data={imported};
  }else if(body.action==='print'){window.__printed=body.importId;data={url:'https://example.com/signed-print'};}
  else data=body.action==='search'?(window.__searchQueries.push(body.query),{results:[{title:'Owl Lantern',source:'Example',sourceUrl:'https://example.com/owl',thumbnail:'https://example.com/owl.png',importTicket:'ticket'}]}):{links:{}};
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 }
 return originalFetch(url,opts);
};
</script>`;

const importDriver = `<script>
(async()=>{
 const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for page');};
 const $=id=>document.getElementById(id);
 const card=()=>[...$('grid').querySelectorAll('article')].find(x=>x.textContent.includes('Owl Lantern'));
 const action=(name)=>[...card().querySelectorAll('button')].find(b=>b.textContent.includes(name));
 try{
  await wait(()=>!$('guest-app').hidden && $('grid').children.length);
  if(!sessionStorage.getItem('__importStage')){
   $('online-search').value='owl';$('online-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
   await wait(()=>$('online-results').querySelector('.web-import'));
   window.__deferRefresh=true;window.__staleChange=true;$('sync-status').click();await wait(()=>window.__resolveRefresh);
   $('online-results').querySelector('.web-import').click();
   await wait(()=>card() && $('online-results').textContent.includes('In family library'));
   check('confirmed import appears while a refresh is in flight',!!card());
   window.__resolveRefresh();await new Promise(r=>setTimeout(r,30));
   check('stale refresh keeps the imported design visible',!!card());
   action('Save').click();await wait(()=>action('Saved')&&!action('Saved').disabled);
   action('Pick').click();await wait(()=>action('Picked')&&!action('Picked').disabled);
   check('import can be saved and picked',!!action('Saved')&&!!action('Picked'));
   action('Open / print').click();await wait(()=>window.__popup?.location.href);
   check('print opens the imported original',window.__printed==='import-1'&&window.__popup.location.href==='https://example.com/signed-print');
   sessionStorage.setItem('__importChecks',JSON.stringify(checks));sessionStorage.setItem('__importStage','reloaded');location.reload();return;
  }
  checks.push(...JSON.parse(sessionStorage.getItem('__importChecks')));
  $('quick-picks').click();
  check('import and final pick survive a reload',!!card()&&!!action('Picked'));
  action('Open / print').click();await wait(()=>window.__popup?.location.href);
  check('print still works after reload',window.__printed==='import-1');
 }catch(e){checks.push({name:String(e.stack||e),ok:false});}
 const output=document.createElement('pre');output.id='browser-test-output';output.textContent=JSON.stringify(checks);document.body.append(output);
})();
</script>`;
const driver = `<script>
(async()=>{
 const checks=[]; const check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for page');};
 const $=id=>document.getElementById(id);
 try{
  await wait(()=>!$('guest-app').hidden && $('grid').children.length);
  const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('change',{bubbles:true}));};
  for(const [id,expected] of [['quick-favorites','cat'],['quick-picks','cat'],['quick-all','ghost']]){
   change('theme','Spooky');change('difficulty','Hard');$(id).click();
   check(id+' resets filters', $('theme').value==='all' && $('difficulty').value==='all');
   check(id+' shows expected design', $('grid').textContent.includes(expected==='cat'?'Cat Face':'Ghost Face'));
  }
  const ghost=()=>[...$('grid').querySelectorAll('article')].find(x=>x.textContent.includes('Ghost Face'));
  const action=(name)=>[...ghost().querySelectorAll('button')].find(b=>b.textContent.includes(name));
  window.__deferChoice=true;action('Save').click();await wait(()=>window.__resolveChoice);
  check('pending choice disables both selection controls',action('Saved').disabled && action('Pick').disabled);
  action('Pick').click();check('pending choice prevents overlapping write',window.__choiceRequests.length===1);
  window.__resolveChoice();await wait(()=>action('Saved') && !action('Saved').disabled);
  window.__deferRefresh=true;$('sync-status').click();await wait(()=>window.__resolveRefresh);
  action('Pick').click();await wait(()=>window.__choiceRequests.length===2 && action('Picked') && !action('Picked').disabled);
  window.__resolveRefresh();await new Promise(r=>setTimeout(r,20));
  check('stale refresh does not undo confirmed pick',!!action('Picked') && $('quick-picks-count').textContent==='2');
  check('stale refresh offers a retry instead of remaining in progress',$('sync-status').textContent==='Updates may be out of date · tap to refresh');
  if($('celebrate-dialog').open)$('celebrate-dialog').close();
  const search=$('search');search.scrollIntoView();search.focus();search.value='ca';search.dispatchEvent(new Event('input',{bubbles:true}));
  await wait(()=>$('guest-search-suggestions') && !$('guest-search-suggestions').hidden);
  $('guest-search-suggestions').querySelector('button').click();
  check('suggestion applies and dismisses focus',search.value==='Cat Face' && document.activeElement!==search);
  search.focus();search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  check('Enter dismisses search focus',document.activeElement!==search);
  $('browse-online').click();await wait(()=>window.__searchQueries.length);
  check('one-tap online search uses current term',window.__searchQueries[0]==='Cat Face' && $('online-results-panel').open);
 }catch(e){checks.push({name:String(e.stack||e),ok:false});}
 const output=document.createElement('pre');output.id='browser-test-output';output.textContent=JSON.stringify(checks);document.body.append(output);
})();
</script>`;

function fixtureServer(driverScript='') {
 return createServer((req,res)=>{
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(root, pathname === '/' ? 'guest.html' : pathname.slice(1));
  try {
   let content = readFileSync(file);
   if (pathname === '/guest.html') content = Buffer.from(content.toString().replace(/<script type="module" src="guest\.js/, setup+'<script type="module" src="guest.js').replace('</body>',driverScript+'</body>'));
   res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : pathname.endsWith('.json') ? 'application/json' : 'text/html');
   res.end(content);
  } catch { res.writeHead(404);res.end(); }
 });
}

async function runJourney(script) {
 const server = fixtureServer(script);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const profile=mkdtempSync(path.join(tmpdir(),'pumpkin-browser-'));
 try {
  const url=`http://127.0.0.1:${server.address().port}/guest.html#invite=${'a'.repeat(43)}`;
  const args=['--headless','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check','--no-sandbox','--window-size=375,812','--virtual-time-budget=6000',`--user-data-dir=${profile}`,'--dump-dom',url];
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(browser,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='';
   const timer=setTimeout(()=>{child.kill();reject(new Error('Browser did not exit in time'));},30000);
   child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.on('error',error=>{clearTimeout(timer);reject(error);});
   child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
  });
  assert.equal(result.code,0,result.stderr);
  const match=result.stdout.match(/<pre id="browser-test-output">([^<]+)<\/pre>/);
  assert.ok(match,`Browser did not finish the journey: ${result.stderr}`);
  const checks=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>'));
  assert.deepEqual(checks.filter(c=>!c.ok),[]);
 } finally {server.close();try{rmSync(profile,{recursive:true,force:true});}catch{}}
}

test('participant shortcuts and search work in a browser', { skip: !browser && 'No Chromium-compatible browser found', timeout: 45000 }, () => runJourney(driver));
test('imported designs remain usable through a stale refresh and page reload', { skip: !browser && 'No Chromium-compatible browser found', timeout: 45000 }, () => runJourney(importDriver));

test('participant controls fit emulated mobile and desktop viewports', { skip: !browser && 'No Chromium-compatible browser found', timeout: 45000 }, async () => {
 const server=fixtureServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const profile=mkdtempSync(path.join(tmpdir(),'pumpkin-layout-'));
 const child=spawn(browser,['--headless','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check','--no-sandbox','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let socket;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 try {
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<200&&!existsSync(portFile);i++)await pause(25);
  assert.ok(existsSync(portFile),'Browser did not open a debugging port');
  const port=readFileSync(portFile,'utf8').split(/\r?\n/)[0];
  const target=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let nextId=0;const pending=new Map();
  socket.addEventListener('message',event=>{
   const message=JSON.parse(event.data),entry=pending.get(message.id);if(!entry)return;
   pending.delete(message.id);if(message.error)entry.reject(new Error(message.error.message));else entry.resolve(message.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{
   const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
   if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
   return result.result.value;
  };
  await send('Page.enable');
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/guest.html#invite=${'a'.repeat(43)}`});
  for(let i=0;i<200;i++){if(await evaluate("!!document.getElementById('guest-app') && !document.getElementById('guest-app').hidden"))break;await pause(25);}
  assert.ok(await evaluate("!!document.getElementById('guest-app') && !document.getElementById('guest-app').hidden"),'Guest page did not load');
  await evaluate("document.getElementById('guest-advanced').open=true;document.getElementById('search').value='cat';document.getElementById('search').dispatchEvent(new Event('input',{bubbles:true}));true");
  for(const width of [320,375,390,430,768,1440]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
   const layout=await evaluate(`(()=>{
    const ids=['greeting','identity-heading','person-view','quick-all','quick-favorites','quick-picks','family-lineup','compare-open','search','filter','theme','difficulty','sort','surprise','clear-guest-filters','browse-online','online-search','online-search-button'];
    const rect=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {id,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};};
    const controls=ids.map(rect);return {viewport:window.innerWidth,available:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,controls};
   })()`);
   assert.equal(layout.viewport,width,`Expected ${width}px viewport`);
   const overflowing=layout.controls.filter(r=>r.width<=0||r.left < -1||r.right > layout.available+1);
   assert.deepEqual(overflowing,[],`${width}px controls overflow: ${JSON.stringify(overflowing)}`);
   assert.ok(layout.scrollWidth<=layout.available+1,`${width}px page scrolls horizontally (${layout.scrollWidth}px)`);
   for(const group of [['quick-all','quick-favorites','quick-picks'],['family-lineup','compare-open'],['surprise','clear-guest-filters']]){
    const boxes=layout.controls.filter(r=>group.includes(r.id));
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
     const a=boxes[i],b=boxes[j];
     assert.ok(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1,`${width}px ${a.id} overlaps ${b.id}`);
    }
   }
  }
 } finally {
  socket?.close();child.kill();server.close();
  await pause(100);try{rmSync(profile,{recursive:true,force:true});}catch{}
 }
});
