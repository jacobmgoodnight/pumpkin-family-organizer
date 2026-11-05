import {findBrowser} from "./browser-executable.mjs";
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
const browser=findBrowser();

// Exercise the shipped page and scripts with a fake API, never production data.
const setup = `<script>
window.PUMPKIN_CLOUD_CONFIG={url:location.origin,publishableKey:'test'};
const originalFetch=window.fetch.bind(window);
const catalog=[
 {id:'cat',name:'Cat Face',category:'Animals',difficulty:'Easy',source:'zombie',tags:[]},
 {id:'ghost',name:'Ghost Face',category:'Spooky',difficulty:'Hard',source:'additional',tags:[]},
 {id:'unrated',name:'Owl Face',category:'Animals',source:'extra',tags:[]},
 {id:'0123456789abcdef',name:'Mystery Shape',category:'Animals',source:'zombie',tags:[]}
];
const household=JSON.parse(sessionStorage.getItem('__mockHousehold')||'null')||{personId:'me',name:'Charlotte',expiresAt:'2099-01-01T00:00:00Z',people:[{id:'me',name:'Charlotte'}],familyChoices:[{personId:'me',templateId:'cat',favorite:true,finalPick:true}],imports:[{id:'preview-only',name:'Preview Only Pumpkin',category:'Family imports',thumbnail_path:'private/preview.png',original_path:null}],ideas:[]};
window.__searchQueries=[];
window.__choiceRequests=[];
window.__feedbackRequests=[];
window.confirm=message=>{window.__confirmMessage=message;return window.__confirmChoice!==false;};
window.open=()=>{const popup={location:{href:''},close(){}};window.__popup=popup;return popup;};
window.fetch=async (url,opts={})=>{
 if(String(url).includes('guest-catalog.json'))return new Response(JSON.stringify(catalog),{status:200});
 if(String(url).includes('guest-search-metadata.json'))return new Response(JSON.stringify({'0123456789abcdef':{visual:{description:'A bird',tags:['bird']},keywords:['bird']}}),{status:200});
 if(String(url).includes('guest-pattern-details.json')){
  if(location.search.includes('delayDetails'))await new Promise(resolve=>window.__resolveDetails=resolve);
  if(location.search.includes('failDetails'))throw Error('Details unavailable');
  return new Response(JSON.stringify({unrated:{difficulty:'Level 3',theme:'Wildlife'}}),{status:200});
 }
 if(String(url).includes('/functions/v1/pumpkin-profile-invites')){
  const body=JSON.parse(opts.body);let data;
  if(body.action==='guest'){
   data=structuredClone(household);
   if(window.__deferRefresh){window.__deferRefresh=false;if(window.__staleChange)data.people.push({id:'other',name:'Other'});await new Promise(resolve=>window.__resolveRefresh=resolve);}
  }else if(body.action==='feedback'){
   window.__feedbackRequests.push(body);
   if(window.__failFeedback)return new Response(JSON.stringify({error:'Please try again'}),{status:503});
   data={ok:true};
  }else if(body.action==='choice'){
   window.__choiceRequests.push(body);
   if(window.__failChoice)return new Response(JSON.stringify({error:'Unavailable'}),{status:503});
   if(window.__deferChoice){window.__deferChoice=false;await new Promise(resolve=>window.__resolveChoice=resolve);}
   household.familyChoices=household.familyChoices.filter(x=>x.templateId!==body.templateId);
   household.familyChoices.push({personId:'me',templateId:body.templateId,favorite:body.favorite,finalPick:body.finalPick});
   sessionStorage.setItem('__mockHousehold',JSON.stringify(household));
   if(window.__lostChoice)throw Error('Response lost after server commit');
   data={favorite:body.favorite,finalPick:body.finalPick};
  }else if(body.action==='import'){
   const imported={id:'import-1',name:'Owl Lantern',category:'Family imports',difficulty:'Medium',tags:[],thumbnail_path:'private/owl.png',original_path:'private/owl.png'};
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
  $('guest-advanced').querySelector('summary').click();
  check('participant more filters opens', $('guest-advanced').open && getComputedStyle($('theme')).display!=='none');
  $('guest-advanced').querySelector('summary').click();
  check('participant more filters closes', !$('guest-advanced').open);
  const previewOnly=[...$('grid').querySelectorAll('article')].find(x=>x.textContent.includes('Preview Only Pumpkin'));
  check('preview-only import has no print action',!!previewOnly&&!previewOnly.textContent.includes('Open / print')&&previewOnly.textContent.includes('Preview only'));
  previewOnly.querySelector('.image-open').click();
  check('preview-only detail explains missing original',$('preview-description').textContent.includes('Preview only')&&$('preview-description').textContent.includes('organizer')&&!$('preview-actions').textContent.includes('Open / print'));
  $('preview-close').click();
  if(!sessionStorage.getItem('__importStage')){
   $('online-search').value='owl';$('online-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
   await wait(()=>$('online-results').querySelector('.web-import'));
   window.__deferRefresh=true;window.__staleChange=true;$('sync-status').click();await wait(()=>window.__resolveRefresh);
   $('online-results').querySelector('.web-import').click();
   await wait(()=>card() && $('online-results').textContent.includes('In family library'));
   check('confirmed import appears while a refresh is in flight',!!card());
   card().querySelector('.image-open').click();
   check('family difficulty is attributed to family entry',$('preview-details').textContent.includes('Family-entered difficulty')&&$('preview-details').textContent.includes('Medium'));
   $('preview-close').click();
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

const feedbackDriver = `<script>
(async()=>{
 const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out');};
 const $=id=>document.getElementById(id);
 try{
  await wait(()=>!$('guest-app').hidden&&$('grid').children.length);
  const card=()=>[...$('grid').querySelectorAll('article')].find(x=>x.textContent.includes('Mystery Shape'));
  card().querySelector('.image-open').click();
  await wait(()=>$('search-feedback-current').textContent.includes('bird'));
  $('search-feedback').open=true;$('search-feedback-note').value='This is a bat';
  window.__failFeedback=true;$('search-feedback-form').requestSubmit();
  await wait(()=>$('search-feedback-status').textContent.includes('try again'));
  check('failed report keeps the note for retry',$('search-feedback-note').value==='This is a bat');
  window.__failFeedback=false;$('search-feedback-form').requestSubmit();
  await wait(()=>$('search-feedback-status').textContent.includes('Sent'));
  check('report uses the invited user and chosen template',window.__feedbackRequests.at(-1).templateId==='0123456789abcdef'&&window.__feedbackRequests.at(-1).note==='This is a bat'&&window.__feedbackRequests.at(-1).token==='a'.repeat(43));
  household.searchOverrides=[{templateId:'0123456789abcdef',description:'A bat',tags:['bat']}];
  $('sync-status').click();await wait(()=>$('search-feedback-current').textContent.includes('bat'));
  check('approved correction appears in preview',!$('search-feedback-current').textContent.includes('bird'));
  $('preview-close').click();$('search').value='bat';$('search').dispatchEvent(new Event('input',{bubbles:true}));
  check('approved correction changes search',!!card());
  $('search').value='bird';$('search').dispatchEvent(new Event('input',{bubbles:true}));
  check('approved correction removes erroneous inferred keywords',!card());
  $('search').value='bat';$('search').dispatchEvent(new Event('input',{bubbles:true}));
  household.searchOverrides=null;$('sync-status').click();await new Promise(r=>setTimeout(r,30));
  check('failed optional override read preserves corrections',!!card());
  household.searchOverrides=[];$('sync-status').click();await wait(()=>!card());
  $('search').value='bird';$('search').dispatchEvent(new Event('input',{bubbles:true}));
  check('deleting override restores published visual metadata',!!card());
 }catch(e){checks.push({name:String(e.stack||e),ok:false});}
 const output=document.createElement('pre');output.id='browser-test-output';output.textContent=JSON.stringify(checks);document.body.append(output);
})();
</script>`;

const emptyRecoveryDriver = `<script>
(async()=>{
 const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out');};
 const $=id=>document.getElementById(id);
 const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('change',{bubbles:true}));};
 const search=value=>{$('search').value=value;$('search').dispatchEvent(new Event('input',{bubbles:true}));};
 const action=name=>[...$('empty-actions').querySelectorAll('button')].find(x=>x.textContent===name);
 try{
  await wait(()=>!$('guest-app').hidden&&$('grid').children.length);
  search('cat');change('theme','Spooky');
  check('theme recovery offered only when useful',!!action('Clear theme')&&!$('empty-results').hidden);
  action('Clear theme').click();
  check('theme recovery preserves search and displays matching result',$('search').value==='cat'&&$('theme').value==='all'&&$('grid').textContent.includes('Cat Face'));
  change('difficulty','Hard');check('difficulty recovery is offered when useful',!!action('Clear difficulty'));
  action('Clear difficulty').click();
  check('difficulty recovery keeps the query and matching design',$('search').value==='cat'&&$('difficulty').value==='all'&&$('grid').textContent.includes('Cat Face'));
  change('theme','Spooky');change('difficulty','Hard');
  check('combined recovery appears when both filters block results',!!action('Clear filters and keep search')&&!action('Clear theme')&&!action('Clear difficulty'));
  action('Clear filters and keep search').click();
  check('combined recovery keeps search and clears both filters',$('search').value==='cat'&&$('theme').value==='all'&&$('difficulty').value==='all'&&$('grid').textContent.includes('Cat Face'));
  search('ghost');change('filter','favorite');
  check('favorite recovery offers to search all designs',!!action('Search all designs'));
  action('Search all designs').click();
  check('favorite recovery preserves query and opens the catalog',$('search').value==='ghost'&&$('filter').value==='all'&&$('grid').textContent.includes('Ghost Face'));
  search('nothingmatchesxyz');change('theme','Animals');
  check('unmatched query suggests another word without promising useless filter changes',$('empty-message').textContent.includes('another word')&&!$('empty-actions').children.length&&$('search').value==='nothingmatchesxyz');
  household.people.push({id:'other',name:'Other'});
  household.familyChoices.push({personId:'other',templateId:'ghost',favorite:true,finalPick:false});
  $('sync-status').click();await wait(()=>$('person-view').querySelector('option[value="other"]'));
  change('person-view','other');$('other-picks').click();
  check('other person offers only their saved designs',!!action('Show all saved designs'));
  action('Show all saved designs').click();
  check('recovery respects other person shortlist and read-only mode',$('grid').textContent.includes('Ghost Face')&&!$('grid').textContent.includes('Cat Face')&&!$('read-only').hidden);
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
   if (pathname === '/index.html') content = Buffer.from(content.toString().replace('</body>',driverScript+'</body>'));
   res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : pathname.endsWith('.json') ? 'application/json' : 'text/html');
   res.end(content);
  } catch { res.writeHead(404);res.end(); }
 });
}

async function runJourney(script, page='guest.html', query='') {
 const server = fixtureServer(script);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const profile=mkdtempSync(path.join(tmpdir(),'pumpkin-browser-'));
 try {
  const url=`http://127.0.0.1:${server.address().port}/${page}${query}#invite=${'a'.repeat(43)}`;
  const args=['--headless','--disable-gpu','--disable-extensions','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-sandbox','--window-size=375,812','--virtual-time-budget=6000',`--user-data-dir=${profile}`,'--dump-dom',url];
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(browser,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='';
   const timer=setTimeout(()=>{child.kill();reject(new Error('Browser did not exit within 60 seconds. Browser stderr:\n'+stderr.slice(-32768)));},60000);
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

const choiceDriver = `<script>
(async()=>{
 const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out');};
 const $=id=>document.getElementById(id);
 const card=name=>[...$('grid').querySelectorAll('article')].find(x=>x.textContent.includes(name));
 const action=(element,name)=>[...element.querySelectorAll('button')].find(b=>b.textContent.includes(name));
 try{
  await wait(()=>!$('guest-app').hidden&&card('Cat Face'));
  window.__confirmChoice=false;action(card('Cat Face'),'Saved').click();
  check('canceling removal leaves the final pick intact',window.__choiceRequests.length===0&&!!action(card('Cat Face'),'Picked')&&window.__confirmMessage.includes('final picks'));
  window.__confirmChoice=true;action(card('Cat Face'),'Saved').click();
  await wait(()=>$('choice-notice').textContent.includes('Undo'));
  check('confirmed removal updates both selections',!window.__choiceRequests.at(-1).favorite&&!window.__choiceRequests.at(-1).finalPick);
  action($('choice-notice'),'Undo').click();await wait(()=>action(card('Cat Face'),'Picked')&&!action(card('Cat Face'),'Picked').disabled);
  check('undo restores favorite and final pick',window.__choiceRequests.at(-1).favorite&&window.__choiceRequests.at(-1).finalPick);
  card('Cat Face').querySelector('.image-open').click();action($('preview-actions'),'Saved').click();
  await wait(()=>action($('preview-actions'),'Undo'));
  action($('preview-actions'),'Undo').click();await wait(()=>action($('preview-actions'),'Picked')&&!action($('preview-actions'),'Picked').disabled);
  check('undo works inside the open preview dialog',window.__choiceRequests.at(-1).favorite&&window.__choiceRequests.at(-1).finalPick);
  $('preview-close').click();
  $('quick-picks').click();action(card('Cat Face'),'Saved').click();
  await wait(()=>$('choice-notice').textContent.includes('Undo'));
  check('removed final pick leaves the filtered results',!card('Cat Face')&&!$('empty-results').hidden);
  action($('choice-notice'),'Undo').click();await wait(()=>card('Cat Face')&&action(card('Cat Face'),'Picked'));
  check('undo restores the filtered final-pick result',!!card('Cat Face'));$('quick-all').click();
  window.__failChoice=true;action(card('Ghost Face'),'Save').click();
  await wait(()=>card('Ghost Face').querySelector('.choice-error'));
  check('failure shows local retry and rolls back optimistic state',!!action(card('Ghost Face'),'Try again')&&!!action(card('Ghost Face'),'Save')&&!action(card('Ghost Face'),'Saved'));
  check('failure also remains visible when card is offscreen',$('choice-notice').textContent.includes('Ghost Face')&&!!action($('choice-notice'),'Try again'));
  card('Ghost Face').querySelector('.image-open').click();
  check('preview offers the same retry',!!action($('preview-actions'),'Try again'));
  window.__failChoice=false;action($('preview-actions'),'Try again').click();
  await wait(()=>action($('preview-actions'),'Saved')&&!action($('preview-actions'),'Saved').disabled);
  check('retry sends the desired favorite state',window.__choiceRequests.at(-1).favorite&&!window.__choiceRequests.at(-1).finalPick&&!$('preview-actions').textContent.includes('Not saved'));
  window.__failChoice=true;action($('preview-actions'),'Pick').click();await wait(()=>action($('preview-actions'),'Try again'));
  $('preview-close').click();
  household.people.push({id:'other',name:'Other'});
  household.familyChoices.find(x=>x.templateId==='ghost').finalPick=true;
  $('sync-status').click();await wait(()=>$('person-view').options.length===2&&!!action(card('Ghost Face'),'Picked'));
  $('person-view').value='other';$('person-view').dispatchEvent(new Event('change',{bubbles:true}));
  check('own recovery control is hidden while viewing another person',$('choice-notice').hidden);
  $('person-view').value='me';$('person-view').dispatchEvent(new Event('change',{bubbles:true}));
  const requestCount=window.__choiceRequests.length;action($('choice-notice'),'Try again').click();
  check('stale retry cannot overwrite refreshed choices',window.__choiceRequests.length===requestCount&&$('alert').textContent.includes('changed'));
  action($('choice-notice'),'Dismiss').click();
  window.__failChoice=true;action(card('Cat Face'),'Picked').click();await wait(()=>card('Cat Face').querySelector('.choice-error'));
  action(card('Ghost Face'),'Picked').click();await wait(()=>$('choice-notice').textContent.includes('Ghost Face'));
  window.__failChoice=false;action($('choice-notice'),'Try again').click();
  await wait(()=>$('choice-notice').textContent.includes('Cat Face'));
  check('earlier failed selections stay recoverable after retrying the latest',!!action($('choice-notice'),'Try again'));
  action($('choice-notice'),'Try again').click();await wait(()=>$('choice-notice').hidden);
  window.__lostChoice=true;action(card('Owl Face'),'Pick').click();
  await wait(()=>card('Owl Face').querySelector('.choice-error'));
  const lostRequest=window.__choiceRequests.at(-1);
  check('lost response does not falsely assert failure',card('Owl Face').textContent.includes('not confirmed'));
  window.__lostChoice=false;action(card('Owl Face'),'Try again').click();
  await wait(()=>action(card('Owl Face'),'Picked')&&!action(card('Owl Face'),'Picked').disabled);
  check('retry after a lost response repeats the same intended state',window.__choiceRequests.at(-1).favorite===lostRequest.favorite&&window.__choiceRequests.at(-1).finalPick===lostRequest.finalPick);
  if($('celebrate-dialog').open)$('celebrate-dialog').close();
  action(card('Owl Face'),'Picked').click();await wait(()=>action(card('Owl Face'),'Pick')&&!action(card('Owl Face'),'Pick').disabled);
  window.__lostChoice=true;action(card('Owl Face'),'Pick').click();await wait(()=>card('Owl Face').querySelector('.choice-error'));
  window.__lostChoice=false;$('sync-status').click();await wait(()=>action(card('Owl Face'),'Picked'));
  const beforeReview=window.__choiceRequests.length;action(card('Owl Face'),'Try again').click();
  check('refresh after a lost response protects the committed selection',window.__choiceRequests.length===beforeReview&&card('Owl Face').textContent.includes('Selection changed'));
  action(card('Owl Face'),'Dismiss').click();action(card('Owl Face'),'Saved').click();
  await wait(()=>$('choice-notice').textContent.includes('Undo'));
  $('choice-notice').querySelector('[aria-label="Dismiss undo message"]').click();
  check('undo notice can be dismissed without covering the gallery',$('choice-notice').hidden&&!action(card('Owl Face'),'Undo'));
  action(card('Owl Face'),'Pick').click();await wait(()=>action(card('Owl Face'),'Picked')&&!action(card('Owl Face'),'Picked').disabled);
  if($('celebrate-dialog').open)$('celebrate-dialog').close();
  window.__failChoice=true;action(card('Ghost Face'),'Saved').click();await wait(()=>card('Ghost Face').querySelector('.choice-error'));
  window.__failChoice=false;$('quick-picks').click();action(card('Owl Face'),'Saved').click();
  await wait(()=>$('choice-notice').textContent.includes('Undo'));
  check('a filtered-out pick can be undone even with another save to retry',!card('Owl Face')&&!!action($('choice-notice'),'Try again')&&!!action($('choice-notice'),'Undo'));
  action($('choice-notice'),'Try again').click();await wait(()=>!$('choice-notice').textContent.includes('Try again'));
  check('retrying a different design keeps Undo available',!!action($('choice-notice'),'Undo'));
  action($('choice-notice'),'Undo').click();await wait(()=>card('Owl Face')&&action(card('Owl Face'),'Picked'));
  check('Undo still restores the filtered pick after another retry',!!card('Owl Face'));
 }catch(e){checks.push({name:String(e.stack||e),ok:false});}
 const output=document.createElement('pre');output.id='browser-test-output';output.textContent=JSON.stringify(checks);document.body.append(output);
})();
</script>`;
test('final picks are protected and failed saves can be retried', { skip: !browser && 'No Chromium-compatible browser found', timeout: 90000 }, () => runJourney(choiceDriver));
test('participant shortcuts and search work in a browser', { skip: !browser && 'No Chromium-compatible browser found', timeout: 90000 }, () => runJourney(driver));
test('imported designs remain usable through a stale refresh and page reload', { skip: !browser && 'No Chromium-compatible browser found', timeout: 90000 }, () => runJourney(importDriver));
test('family reports and approved corrections work in the private gallery', { skip: !browser && 'No Chromium-compatible browser found', timeout: 90000 }, () => runJourney(feedbackDriver));

const favoritesVisibilityDriver = `<script>
(async()=>{
 const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for page');};
 const $=id=>document.getElementById(id);
 // Configure before the deferred module reads the first household snapshot.
 household.familyChoices=[];household.people.push({id:'other',name:'Other'});
 try{
  await wait(()=>!$('guest-app').hidden&&$('grid').children.length);
  const favorite=$('quick-favorites'),search=$('search');
  const input=value=>{search.value=value;search.dispatchEvent(new Event('input',{bubbles:true}));};
  const cardButtons=()=>[...$('grid').querySelectorAll('article')].find(x=>x.textContent.includes('Cat Face'))?.querySelectorAll('button');
  const cardButton=name=>[...(cardButtons()||[])].find(b=>b.textContent.includes(name));
  check('empty shortlist is initially hidden',favorite.hidden);
  const home=document.querySelector('.guest-home').getBoundingClientRect(), searchBox=$('guest-search').getBoundingClientRect(), nav=$('guest-views').getBoundingClientRect();
  const all=$('quick-all').getBoundingClientRect(),picks=$('quick-picks').getBoundingClientRect();
  check('search appears before shortcut controls',home.bottom<=searchBox.top&&searchBox.bottom<=nav.top);
  check('remaining shortcuts fill the row when favorites is hidden',Math.abs(all.left-nav.left)<2&&Math.abs(picks.right-nav.right)<2&&Math.abs(all.width-picks.width)<2);
  input('   ');check('whitespace alone does not show favorites',favorite.hidden);
  input('cat');check('typing a search reveals favorites',!favorite.hidden);
  favorite.click();check('empty active favorites remains visible after search clears',!favorite.hidden&&favorite.getAttribute('aria-pressed')==='true'&&search.value==='');
  $('quick-all').click();check('leaving the empty shortlist hides its shortcut',favorite.hidden);
  window.__deferChoice=true;cardButton('Save').click();await wait(()=>window.__resolveChoice);
  check('saving reveals shortcut immediately',!favorite.hidden&&$('quick-favorites-count').textContent==='1');
  window.__resolveChoice();await wait(()=>cardButton('Saved')&&!cardButton('Saved').disabled);
  favorite.click();cardButton('Saved').click();await wait(()=>$('quick-favorites-count').textContent==='0');
  check('removing last favorite does not hide active view',!favorite.hidden&&favorite.getAttribute('aria-pressed')==='true');
  $('quick-all').click();check('shortcut hides after leaving an emptied view',favorite.hidden);
  await wait(()=>cardButton('Save')&&!cardButton('Save').disabled);
  household.familyChoices=[{personId:'me',templateId:'ghost',favorite:true,finalPick:false}];
  $('sync-status').click();await wait(()=>$('quick-favorites-count').textContent==='1');
  check('family refresh reveals newly saved favorite',!favorite.hidden);
  $('person-view').value='other';$('person-view').dispatchEvent(new Event('change',{bubbles:true}));
  check('other-person view hides personal shortcuts and search',$('guest-views').hidden&&$('guest-search').hidden);
  $('back-to-me').click();check('returning restores personal search and favorite shortcut',!$('guest-search').hidden&&!favorite.hidden);
  household.familyChoices=[];$('sync-status').click();await wait(()=>$('quick-favorites-count').textContent==='0');
  check('family refresh removes shortcut when last favorite disappears',favorite.hidden);
 }catch(e){checks.push({name:String(e.stack||e),ok:false});}
 const output=document.createElement('pre');output.id='browser-test-output';output.textContent=JSON.stringify(checks);document.body.append(output);
})();
</script>`;
test('favorites shortcut follows searches and live family choices', { skip: !browser && 'No Chromium-compatible browser found', timeout: 90000 }, () => runJourney(favoritesVisibilityDriver));

const detailsDriver = `<script>
(async()=>{
 const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for page');};
 const $=id=>document.getElementById(id);
 try{
  await wait(()=>!$('guest-app').hidden && $('grid').children.length);
  const card=[...$('grid').querySelectorAll('article')].find(x=>x.textContent.includes('Owl Face'));
  card.querySelector('.image-open').click();
  const details=()=>$('preview-details').textContent;
  check('unknown ratings and techniques are labeled',details().includes('Not rated')&&details().includes('Not specified'));
  check('source and theme are visible',details().includes('Additional collection')&&details().includes('Animals'));
  if(location.search.includes('delayDetails')){
   await wait(()=>window.__resolveDetails);window.__resolveDetails();
   await wait(()=>details().includes('Level 3'));
   check('late rating updates an open preview',details().includes('Level 3'));
   check('collection level is attributed to the folder',details().includes('Collection level')&&details().includes('source folder'));
   check('late theme updates an open preview',details().includes('Wildlife'));
   check('late rating updates filter options',[...$('difficulty').options].some(x=>x.value==='Level 3'));
   $('preview-close').click();$('difficulty').value='Level 3';$('difficulty').dispatchEvent(new Event('change',{bubbles:true}));
   check('verified rating can be filtered',$('grid').textContent.includes('Owl Face')&&!$('grid').textContent.includes('Ghost Face'));
  }else{
   check('metadata failure does not block the gallery',!$('guest-app').hidden&&details().includes('Not rated'));
  }
  $('online-search').value='owl';$('online-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>$('online-results').querySelector('.image-open'));
  $('online-results').querySelector('.image-open').click();
  check('online preview replaces previous details',details().includes('Example')&&details().includes('Online idea')&&!details().includes('Level 3')&&!details().includes('Additional collection'));
  $('preview-close').click();$('quick-all').click();
  [...$('grid').querySelectorAll('article')].find(x=>x.textContent.includes('Cat Face')).querySelector('.image-open').click();
  check('catalog rating is labeled unverified',details().includes('Catalog difficulty')&&details().includes('Easy')&&details().includes('source not verified'));
 }catch(e){checks.push({name:String(e.stack||e),ok:false});}
 const output=document.createElement('pre');output.id='browser-test-output';output.textContent=JSON.stringify(checks);document.body.append(output);
})();
</script>`;
test('late source ratings update the private gallery and open preview', { skip: !browser && 'No Chromium-compatible browser found', timeout: 90000 }, () => runJourney(detailsDriver,'guest.html','?delayDetails'));
test('private gallery remains usable if ratings fail to load', { skip: !browser && 'No Chromium-compatible browser found', timeout: 90000 }, () => runJourney(detailsDriver,'guest.html','?failDetails'));

const organizerDriver = `<script>
(async()=>{
 const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for organizer');};
 const $=id=>document.getElementById(id);
 try{
  await wait(()=>$('advanced-filters').title);
  // The fixture has no family session; show the organizer controls without using production credentials.
  document.body.classList.remove('cloud-gated');
  $('filter-toggle').click();
  check('more filters opens and exposes controls '+JSON.stringify({open:$('advanced-filters').open,aria:$('filter-toggle').getAttribute('aria-expanded'),height:$('category').getBoundingClientRect().height,hidden:$('catalog-area').hidden,dialogs:[...document.querySelectorAll('dialog[open]')].map(x=>x.id)}),$('advanced-filters').open && $('filter-toggle').getAttribute('aria-expanded')==='true' && $('category').getBoundingClientRect().height>0);
  $('filter-toggle').click();
  check('more filters closes',$('advanced-filters').open===false && $('filter-toggle').getAttribute('aria-expanded')==='false');
  const familyItem={id:'family:correction-test',cloud_id:'correction-test',source:'family',name:'Mysterious Figure',category:'Summer Spirits',theme:'Summer Spirits',tags:[],keywords:['ghost'],visual:{description:'A ghost',tags:['ghost']},thumbnail:'app-icon.svg',path:''};
  const bridge=window.PUMPKIN_FAMILY_BRIDGE;bridge.setCloudImports([familyItem]);$('source').value='';$('category').value='';
  const matches=query=>{ $('search').value=query;return findVisible().some(item=>item.id===familyItem.id); };
  check('original keyword is searchable',matches('ghost'));
  bridge.setSearchOverrides([{templateId:familyItem.id,description:'A cat',tags:['cat']}]);
  check('approved correction hides obsolete keyword',!matches('ghost'));
  check('approved correction makes corrected tags searchable',matches('cat'));
  check('collection name remains searchable',matches('summer spirits'));
  bridge.setSearchOverrides([]);
  check('removing correction restores original keyword',matches('ghost'));
  $('search').value='';
  for(const id of ['search','sticky-search']){
   // Keep the compact field visible while testing its handler independently of scroll timing.
   if(id==='sticky-search')$('search').parentElement.append($('sticky-search'));
   const input=$(id);input.focus({preventScroll:true});
   input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));
   await new Promise(r=>setTimeout(r,10));
   check(id+' keeps focus while composing '+JSON.stringify({active:document.activeElement?.id,hidden:input.offsetParent===null,dialogs:[...document.querySelectorAll('dialog[open]')].map(x=>x.id)}),document.activeElement===input);
   input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
   await new Promise(r=>setTimeout(r,10));
   check(id+' dismisses focus on Enter',document.activeElement!==input);
  }
 }catch(e){checks.push({name:String(e.stack||e),ok:false});}
 const output=document.createElement('pre');output.id='browser-test-output';output.textContent=JSON.stringify(checks);document.body.append(output);
})();
</script>`;
test('organizer filters and Return key work in a browser', { skip: !browser && 'No Chromium-compatible browser found', timeout: 90000 }, () => runJourney(organizerDriver,'index.html'));

test('empty searches offer useful recovery without losing the query or exposing another catalog', { skip: !browser && 'No Chromium-compatible browser found', timeout: 90000 }, () => runJourney(emptyRecoveryDriver));

test('participant controls fit emulated mobile and desktop viewports', { skip: !browser && 'No Chromium-compatible browser found', timeout: 90000 }, async () => {
 const server=fixtureServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const profile=mkdtempSync(path.join(tmpdir(),'pumpkin-layout-'));
 const child=spawn(browser,['--headless','--disable-gpu','--disable-extensions','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-sandbox','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
 let socket,browserError=null,browserStderr='';
 child.on('error',error=>{browserError=error;});
 child.stderr.on('data',chunk=>{browserStderr=(browserStderr+chunk.toString()).slice(-32768);});
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 try {
  const portFile=path.join(profile,'DevToolsActivePort'),deadline=Date.now()+25000;
  let port='';
  while(Date.now()<deadline&&!browserError&&child.exitCode===null&&child.signalCode===null){
   if(existsSync(portFile)){
    port=readFileSync(portFile,'utf8').split(/\r?\n/)[0].trim();
    if(/^\d+$/.test(port))break;
   }
   await pause(50);
  }
  if(!/^\d+$/.test(port))throw Error(`Browser debugging port unavailable (executable: ${browser}, exit: ${child.exitCode}, signal: ${child.signalCode}, error: ${browserError?.message||'none'}). Browser stderr:\n${browserStderr||'(empty)'}`);
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
   const searchBox=layout.controls.find(x=>x.id==='search');
   for(const id of ['quick-all','family-lineup','filter']){
    const control=layout.controls.find(x=>x.id===id);
    assert.ok(searchBox.bottom<=control.top,`${width}px search should precede ${id}`);
   }
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
