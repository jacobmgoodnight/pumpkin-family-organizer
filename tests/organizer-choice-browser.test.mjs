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
  const item=normalizedZombie[0],other=normalizedZombie[1],bridge=PUMPKIN_FAMILY_BRIDGE;
  const state=()=>bridge.snapshot();let confirms=0,confirmAnswer=false,events=0;
  window.confirm=()=>{confirms++;return confirmAnswer};window.addEventListener('pumpkin:statechange',()=>events++);
  const seed=()=>bridge.applyRemote({version:3,people:[{id:'one',name:'Person One'},{id:'two',name:'Person Two'}],active:'one',favorites:{one:[item.id,other.id]},picks:{one:[item.id]}});
  const has=(key,id=item.id)=>!!state()[key].one?.includes(id);
  seed();toggleFavorite(item.id);
  check('cancel protects favorite and final pick',confirms===1&&has('favorites')&&has('picks')&&events===0);
  confirmAnswer=true;toggleFavorite(item.id);
  check('confirmed removal changes both and emits a sync event',!has('favorites')&&!has('picks')&&events===1);
  check('undo offered outside preview',!$('choice-undo').hidden&&$('choice-undo').textContent.includes(item.name));
  $('choice-undo').querySelector('button').click();
  check('undo restores favorite and final pick and emits sync event',has('favorites')&&has('picks')&&events===2&&$('choice-undo').hidden);
  const oldConfirms=confirms;toggleFavorite(other.id);
  check('ordinary favorite removal needs no confirmation',confirms===oldConfirms&&!has('favorites',other.id));
  seed();openPreview(item.id);$('preview-favorite').click();
  check('undo is available within modal preview',!$('preview-choice-undo').hidden&&$('choice-undo').hidden);
  $('preview-choice-undo').querySelector('button').click();
  check('preview undo restores the selection',has('favorites')&&has('picks')&&$('preview-favorite').getAttribute('aria-pressed')==='true');
  $('preview-favorite').click();$('preview-close').click();await new Promise(r=>setTimeout(r,0));
  check('undo moves outside closed preview',!$('choice-undo').hidden);
  openPreview(other.id);
  check('undo follows when another preview opens',!$('preview-choice-undo').hidden&&$('choice-undo').hidden);
  $('preview-close').click();await new Promise(r=>setTimeout(r,0));
  updateMember('two');
  check('switching people dismisses undo',$('choice-undo').hidden&&state().active==='two');
  seed();toggleFavorite(item.id);const remote=state();remote.favorites.one=[item.id];remote.picks.one=[];bridge.applyRemote(remote);
  check('remote change invalidates stale undo',$('choice-undo').hidden&&has('favorites')&&!has('picks'));
  seed();toggleFavorite(item.id);window.dispatchEvent(new Event('pumpkin:cloudownerchange'));
  check('account change dismisses undo',$('choice-undo').hidden);
  seed();$('search').value=item.name;renderGallery();
  let heart=[...$('grid').querySelectorAll('.heart')].find(b=>b.dataset.choiceId===item.id);
  heart.focus();heart.click();
  check('card removal places focus on a descriptive undo action',document.activeElement.dataset.undoAction==='undo'&&document.activeElement.getAttribute('aria-label').includes(item.name));
  renderAll();
  check('an unrelated redraw preserves focus on undo',document.activeElement.dataset.undoAction==='undo');
  document.activeElement.click();
  check('undo restores focus to the rebuilt gallery heart',document.activeElement.dataset.choiceId===item.id&&has('picks'));
  bridge.applyRemote({version:3,people:[{id:'one',name:'Person One'},{id:'two',name:'Person Two'}],active:'one',favorites:{one:[item.id]},picks:{one:[item.id]}});
  setView('favorites');heart=$('grid').querySelector('.heart');heart.focus();heart.click();
  check('filtered removal keeps the undo action focused',document.activeElement.dataset.undoAction==='undo');
  document.activeElement.nextElementSibling.focus();document.activeElement.click();
  check('dismiss falls back to the selected view when the card disappeared',document.activeElement.dataset.view==='favorites');
  seed();setView('favorites');heart=[...$('grid').querySelectorAll('.heart')].find(b=>b.dataset.choiceId===item.id);heart.focus();heart.click();document.activeElement.click();
  check('undo restores focus to the returned favorite card',document.activeElement.dataset.choiceId===item.id&&has('picks'));
  openPreview(item.id);$('preview-favorite').focus();$('preview-favorite').click();
  check('preview removal focuses its local undo',document.activeElement.dataset.undoAction==='undo'&&document.activeElement.closest('#preview-choice-undo'));
  document.activeElement.click();
  check('preview undo returns focus to the favorite control',document.activeElement.id==='preview-favorite'&&has('picks'));
  $('preview-close').click();await new Promise(r=>setTimeout(r,0));
  compareSelection.add(item.id);compareSelection.add(other.id);openCompare();openPreview(item.id,'compare');
  $('preview-favorite').focus();$('preview-favorite').click();
  check('nested preview undo remains inside the open modal',document.activeElement.closest('#preview-dialog')&&document.activeElement.dataset.undoAction==='undo');
  document.activeElement.click();
  check('nested preview undo restores focus inside the open modal',document.activeElement.id==='preview-favorite');
  $('preview-close').click();await new Promise(r=>setTimeout(r,0));$('compare-close').click();await new Promise(r=>setTimeout(r,0));
 }catch(e){checks.push({name:String(e.stack||e),ok:false});}
 const output=document.createElement('pre');output.id='browser-test-output';output.textContent=JSON.stringify(checks);document.body.append(output);
})();
</script>`;
test('organizer protects final picks and supports safe undo', {skip:!browser&&'No Chromium-compatible browser found',timeout:90000},async()=>{
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
