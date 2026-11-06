import {findBrowser} from './browser-executable.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),browser=findBrowser();
const driver=`<script>
(async()=>{
 const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});const $=id=>document.getElementById(id);
 try{
  document.body.classList.remove('cloud-gated');
  const builtin=normalizedZombie[0];let opened='';window.PUMPKIN_OPEN_FAMILY_ORIGINAL=id=>opened=id;
  PUMPKIN_FAMILY_BRIDGE.setCloudImports([{id:'family:one',cloud_id:'one',source:'family',hasOriginal:true,name:'Family Owl',category:'Family imports',theme:'Animals',difficulty:'',tags:[],thumbnail:'app-icon.svg',path:''}]);
  PUMPKIN_FAMILY_BRIDGE.applyRemote({version:3,people:[{id:'one',name:'Person One'},{id:'two',name:'Person Two'}],active:'one',favorites:{},picks:{one:[builtin.id,'family:one'],two:['missing:design']}});
  document.querySelector('[data-view=summary]').click();
  const count=$('print-queue-counts').textContent,sections=[...$('summary-list').querySelectorAll('.overview-member')];
  check('counts cover each person and missing picks',count.includes('3 final picks')&&count.includes('1 saved original to check')&&count.includes('2 originals needed'));
  check('family original has honest status and action',sections[0].textContent.includes('Family Owl')&&sections[0].textContent.includes('Saved original')&&sections[0].textContent.includes('open to check'));
  check('builtin routes through local file locator',sections[0].textContent.includes('Original needed')&&!!sections[0].querySelector('a[data-original-id]'));
  check('missing pick remains visible',sections[1].textContent.includes('Original needed')&&sections[1].textContent.includes('unavailable'));
  [...sections[0].querySelectorAll('button')].find(x=>x.textContent.includes('Open original')).click();
  check('family action opens the original by id',opened==='one');
  check('lineup print button does not claim to print originals',$('print-summary').textContent.includes('not patterns'));
  document.querySelector('[data-view=all]').click();$('source').value='zombie';$('source').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#grid .preview-open').click();
  check('preview exposes difficulty even when unrated',!$('preview-difficulty').hidden&&$('preview-difficulty').textContent.startsWith('Difficulty:'));
 }catch(e){checks.push({name:String(e.stack||e),ok:false});}
 const output=document.createElement('pre');output.id='browser-test-output';output.textContent=JSON.stringify(checks);document.body.append(output);
})();
</script>`;
test('family print queue shows actionable original status and opens family originals', {skip:!browser&&'No Chromium-compatible browser found',timeout:90000},async()=>{
 const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  try{let data=readFileSync(path.join(root,pathname.slice(1)));if(pathname==='/index.html')data=Buffer.from(data.toString().replace('</body>',driver+'</body>'));
   res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html');res.end(data);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const profile=mkdtempSync(path.join(tmpdir(),'pumpkin-queue-'));
 try{
  const url=`http://127.0.0.1:${server.address().port}/index.html`;
  const args=['--headless','--disable-gpu','--disable-extensions','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-sandbox','--window-size=375,812','--virtual-time-budget=6000',`--user-data-dir=${profile}`,'--dump-dom',url];
  const result=await new Promise((resolve,reject)=>{const child=spawn(browser,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('Browser timeout: '+stderr.slice(-2000)))},60000);child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})});
  assert.equal(result.code,0,result.stderr);const m=result.stdout.match(/<pre id="browser-test-output">([^<]+)<\/pre>/);assert.ok(m,'Missing browser result: '+result.stderr);
  const checks=JSON.parse(m[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>'));assert.deepEqual(checks.filter(x=>!x.ok),[]);
 }finally{server.close();try{rmSync(profile,{recursive:true,force:true})}catch{}}
});
