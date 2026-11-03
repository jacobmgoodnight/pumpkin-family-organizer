import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=[process.env.PUMPKIN_TEST_BROWSER,process.platform==='win32'&&'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',process.platform==='win32'&&'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(p=>p&&existsSync(p));
const fixture=`<script>
window.PUMPKIN_CLOUD_CONFIG={url:location.origin,publishableKey:'test'};
const realFetch=window.fetch.bind(window);
const rows=[{id:'one',name:'Hidden Grin',category:'Other',source:'zombie',tags:[]},{id:'two',name:'Moon Mask',category:'Other',source:'zombie',tags:[]}];
window.__household={personId:'me',name:'Taylor',expiresAt:'2099-01-01T00:00:00Z',people:[{id:'me',name:'Taylor'}],familyChoices:[],imports:[{id:'imp',name:'Family Pumpkin',category:'Family imports',tags:[]}],ideas:[{id:'idea',title:'Online Pumpkin',source_url:'https://example.com/design'}]};
window.fetch=async(url,options={})=>{
 const target=String(url);
 if(target.includes('guest-catalog.json'))return new Response(JSON.stringify(rows));
 if(target.includes('guest-search-metadata.json'))return await new Promise(resolve=>window.releaseMetadata=()=>resolve(new Response(JSON.stringify({one:{visual:{description:'A floating apparition',tags:['apparition']}},two:{visual:{description:'A smiling apparition',tags:['apparition']}}}))));
 if(target.includes('/functions/v1/pumpkin-profile-invites'))return new Response(JSON.stringify(window.__household));
 return realFetch(url,options);
};
</script>`;
const driver=`<script>
(async()=>{
 const checks=[];const check=(label,value)=>checks.push({label,ok:!!value});
 const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out');};
 const $=id=>document.getElementById(id);
 const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('change',{bubbles:true}));};
 const search=value=>{$('search').value=value;$('search').dispatchEvent(new Event('input',{bubbles:true}));};
 try{
  await wait(()=>window.releaseMetadata&&!$('guest-app').hidden&&$('grid').children.length);
  check('gallery opens while metadata is pending',!$('guest-app').hidden);
  change('filter','family');check('family import loaded before metadata',$('grid').textContent.includes('Family Pumpkin'));
  change('filter','web');check('saved idea loaded before metadata',$('grid').textContent.includes('Online Pumpkin'));
  window.__household.imports.push({id:'new',name:'New Family Pumpkin',category:'Family imports',tags:[]});
  window.__household.ideas.push({id:'newidea',title:'New Online Pumpkin',source_url:'https://example.com/new'});
  $('sync-status').click();await wait(()=>$('grid').textContent.includes('New Online Pumpkin'));
  change('filter','all');
  $('search').scrollIntoView();$('search').focus();search('mo');
  await wait(()=>$('guest-search-suggestions')&&!$('guest-search-suggestions').hidden);
  search('appa');check('base search has no visual-only matches',$('grid').children.length===0);
  window.releaseMetadata();await wait(()=>$('grid').children.length===2);
  check('active search remains unchanged',$('search').value==='appa');
  check('visual metadata updates search results',$('grid').textContent.includes('Hidden Grin')&&$('grid').textContent.includes('Moon Mask'));
  search('ap');await wait(()=>$('guest-search-suggestions')&&!$('guest-search-suggestions').hidden);
  check('suggestion cache incorporates new visual tags',$('guest-search-suggestions').textContent.includes('apparition'));
  search('');change('filter','family');check('family import survives enrichment',$('grid').textContent.includes('Family Pumpkin')&&$('grid').textContent.includes('New Family Pumpkin')); 
  change('filter','web');check('saved idea survives enrichment',$('grid').textContent.includes('Online Pumpkin')&&$('grid').textContent.includes('New Online Pumpkin'));
 }catch(error){checks.push({label:String(error.stack||error),ok:false});}
 const output=document.createElement('pre');output.id='async-search-test';output.textContent=JSON.stringify(checks);document.body.append(output);
})();
</script>`;
test('slow search metadata enriches an already-open private gallery', {skip:!browser&&'No Chromium-compatible browser found',timeout:45000},async()=>{
 const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  try{
   let data=readFileSync(path.join(root,pathname==='/'?'guest.html':pathname.slice(1)));
   if(pathname==='/guest.html')data=Buffer.from(data.toString().replace('<script type="module" src="guest.js',fixture+'<script type="module" src="guest.js').replace('</body>',driver+'</body>'));
   res.writeHead(200,{'Content-Type':pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html'});res.end(data);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const profile=mkdtempSync(path.join(tmpdir(),'pumpkin-search-'));
 try{
  const args=['--headless','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check','--no-sandbox','--window-size=375,812','--virtual-time-budget=8000',`--user-data-dir=${profile}`,'--dump-dom',`http://127.0.0.1:${server.address().port}/guest.html#invite=${'a'.repeat(43)}`];
  const result=await new Promise((resolve,reject)=>{const child=spawn(browser,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('Browser timed out'));},30000);child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});});
  assert.equal(result.code,0,result.stderr);const match=result.stdout.match(/<pre id="async-search-test">([^<]+)<\/pre>/);assert.ok(match,result.stderr);
  const checks=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>'));
  assert.deepEqual(checks.filter(x=>!x.ok),[]);
 }finally{server.close();try{rmSync(profile,{recursive:true,force:true});}catch{}}
});
