import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../search-corrections.js',import.meta.url),'utf8');

// Exercise the shipped UI module against a tiny DOM and an in-memory Supabase
// API. There is no live family data or backend involved in these tests.
function harness() {
  class Element {
    constructor(tag) { this.tagName=tag; this.children=[]; this.listeners={}; this.hidden=false; this.open=false; this.value=''; this.textContent=''; }
    append(...children) { for(const child of children){this.children.push(child);child.parentElement=this;} }
    replaceChildren(...children) { this.children=[]; this.append(...children); }
    setAttribute(name,value) { this[name]=value; }
    addEventListener(name,callback) { (this.listeners[name] ||= []).push(callback); }
    dispatch(name) { for(const callback of this.listeners[name]||[]) callback({type:name,target:this,preventDefault(){}}); }
    click() { this.dispatch('click'); }
    showModal() { this.open=true; }
    close() { this.open=false; }
    focus() { this.focused=true; }
  }
  const body=new Element('body'),settings=new Element('div'),preview=new Element('div');
  body.append(settings,preview);
  const document={body,createElement:tag=>new Element(tag),
    getElementById:id=>id==='settings-dialog'?settings:null,
    querySelector:selector=>selector==='#preview-dialog .detail-sidebar'?preview:null};
  const listeners={};
  const window={allData:()=>[{id:'design-1',name:'Moonlit Owl',source:'extra'}],
    addEventListener:(name,callback)=>(listeners[name] ||= []).push(callback)};
  const event=name=>(listeners[name]||[]).forEach(callback=>callback());
  let owner='owner-a';
  const store={
    feedback:[{id:'report-1',user_id:'owner-a',template_id:'design-1',note:'This is an owl, not a cat.',created_at:'2026-10-31'}],
    overrides:[{user_id:'owner-b',template_id:'design-1',description:'B family owl',tags:['owl','night']}]
  };
  const failures={};
  const calls=[],pending=[];
  const client={from(table){
    const query={table,filters:[],operation:'select',start:0,end:999,
      select(){return this;},eq(column,value){this.filters.push([column,value]);return this;},order(){return this;},limit(n){this.end=n-1;return this;},range(start,end){this.start=start;this.end=end;return this;},
      delete(){this.operation='delete';return this;},
      upsert(row){calls.push({operation:'upsert',table,row:structuredClone(row)});
        if(failures.upsert)return Promise.resolve({error:new Error('denied')});
        store.overrides=store.overrides.filter(x=>x.user_id!==row.user_id||x.template_id!==row.template_id);
        store.overrides.push(structuredClone(row));return Promise.resolve({error:null});},
      then(resolve,reject){
        const rows=table==='pc_search_feedback'?store.feedback:store.overrides;
        const matches=row=>this.filters.every(([key,value])=>row[key]===value);
        calls.push({operation:this.operation,table,filters:structuredClone(this.filters)});
        if(failures[this.operation])return Promise.resolve({error:new Error('denied')}).then(resolve,reject);
        if(this.operation==='delete')store.feedback=rows.filter(row=>!matches(row));
        const selected=rows.filter(matches).sort((a,b)=>String(a.template_id||'').localeCompare(String(b.template_id||'')));
        const result={data:structuredClone(selected.slice(this.start,Math.min(this.end+1,this.start+1000))),error:null};
        if(this.operation==='select'&&this.filters.some(([key,value])=>key==='user_id'&&value===failures.deferOwner))
          return new Promise(done=>pending.push(()=>done(result))).then(resolve,reject);
        return Promise.resolve(result).then(resolve,reject);
      }
    };return query;
  }};
  let approved=[];
  const bridge={getPreviewId:()=> 'design-1',getSearchVisual:()=>approved.find(x=>x.templateId==='design-1')||{description:'Original cat description',tags:['cat']},
    setSearchOverrides:rows=>{approved=structuredClone(rows);}};
  const init=new Function('window','document',source.replace('export function init','function init')+';return init;')(window,document);
  init({getClient:()=>client,getOwner:()=>owner,bridge});
  const all=()=>{const out=[];function walk(node){out.push(node);for(const child of node.children)walk(child);}walk(body);return out;};
  const text=value=>{const result=all().find(node=>node.textContent===value);assert.ok(result,`Missing element: ${value}`);return result;};
  const id=value=>{const result=all().find(node=>node.id===value);assert.ok(result,`Missing element id: ${value}`);return result;};
  const wait=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,0));}assert.fail('Timed out waiting for corrections UI');};
  const openReport=async()=>{text('Review search reports').click();await wait(()=>all().some(node=>node.textContent==='Review and correct'));text('Review and correct').click();};
  const form=()=>id('correction-description').parentElement;
  return {all,text,id,wait,openReport,form,store,failures,calls,pending,event,setOwner:value=>owner=value,getApproved:()=>approved};
}

test('organizer can review a report, save a correction and load the approved values again',async()=>{
  const h=harness();await h.openReport();
  assert.equal(h.id('correction-description').value,'Original cat description');
  assert.equal(h.id('correction-tags').value,'cat');
  assert.equal(h.text('Family suggestion: This is an owl, not a cat.').hidden,false);
  h.id('correction-description').value='An owl on a branch';
  h.id('correction-tags').value='owl, branch, owl, night';
  h.form().dispatch('submit');
  await h.wait(()=>h.all().some(node=>node.textContent==='Correction saved for your family.'));
  assert.deepEqual(h.store.feedback,[],'a successfully applied report is resolved');
  assert.deepEqual(h.getApproved(),[{templateId:'design-1',description:'An owl on a branch',tags:['owl','branch','night']}]);
  assert.equal(h.calls.filter(x=>x.operation==='upsert').length,1);
  assert.equal(h.calls.filter(x=>x.operation==='delete').length,1);
  h.text('Review search reports').click();
  await h.wait(()=>h.all().some(node=>node.textContent==='No search reports waiting. Open a design preview to correct it directly.'));
  h.text('Correct search description').click();
  await h.wait(()=>h.id('correction-tags').value==='owl, branch, night');
  assert.equal(h.id('correction-description').value,'An owl on a branch');
  assert.equal(h.id('correction-tags').value,'owl, branch, night');
});

test('denied correction save preserves the report and does not apply an override',async()=>{
  const h=harness();await h.openReport();h.failures.upsert=true;
  h.id('correction-description').value='An owl on a branch';h.form().dispatch('submit');
  await h.wait(()=>h.all().some(node=>node.textContent==='Could not save the correction. Check your connection and try again.'));
  assert.equal(h.store.feedback.length,1);
  assert.deepEqual(h.getApproved(),[]);
  assert.equal(h.calls.filter(x=>x.operation==='delete').length,0);
  assert.equal(h.form().hidden,false,'the user can retry without losing the form');
});

test('a report stays available when clearing it fails after a successful save',async()=>{
  const h=harness();await h.openReport();h.failures.delete=true;
  h.id('correction-description').value='An owl on a branch';h.form().dispatch('submit');
  await h.wait(()=>h.all().some(node=>node.textContent==='Correction saved, but the report could not be cleared. Try again.'));
  assert.equal(h.store.feedback.length,1);
  assert.equal(h.store.overrides.find(row=>row.user_id==='owner-a').description,'An owl on a branch');
  assert.equal(h.form().hidden,false);
});

test('sign-out and account switching clear the previous family before loading the next',async()=>{
  const h=harness();await h.openReport();
  h.id('correction-description').value='An owl on a branch';h.form().dispatch('submit');
  await h.wait(()=>h.getApproved().length===1);
  h.setOwner(null);h.event('pumpkin:cloudsignedout');
  assert.deepEqual(h.getApproved(),[]);
  assert.equal(h.form().hidden,true);
  assert.equal(h.all().find(node=>node.tagName==='dialog').open,false);
  h.setOwner('owner-b');h.event('pumpkin:cloudownerchange');
  assert.deepEqual(h.getApproved(),[],'no previous-family correction remains visible during account switch');
  h.event('pumpkin:cloudready');
  await h.wait(()=>h.getApproved().some(row=>row.description==='B family owl'));
  assert.deepEqual(h.getApproved(),[{templateId:'design-1',description:'B family owl',tags:['owl','night']}]);
  h.text('Review search reports').click();
  await h.wait(()=>h.all().some(node=>node.textContent==='No search reports waiting. Open a design preview to correct it directly.'));
  assert.ok(!h.all().some(node=>node.textContent==='This is an owl, not a cat.'));
});

test('a late refresh from the previous account cannot overwrite the new family',async()=>{
  const h=harness();
  // Let the initial owner-a load complete, then delay its next pair of reads.
  await h.wait(()=>h.calls.filter(x=>x.operation==='select').length===2);
  h.failures.deferOwner='owner-a';h.text('Review search reports').click();
  await h.wait(()=>h.pending.length===2);
  h.setOwner('owner-b');h.event('pumpkin:cloudownerchange');h.event('pumpkin:cloudready');
  await h.wait(()=>h.getApproved().some(row=>row.description==='B family owl'));
  h.pending.splice(0).forEach(resolve=>resolve());
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(h.getApproved(),[{templateId:'design-1',description:'B family owl',tags:['owl','night']}]);
  assert.ok(!h.all().some(node=>node.textContent==='This is an owl, not a cat.'));
});

test('organizer loads every page when more than 1000 corrections exist',async()=>{
 const h=harness();await h.wait(()=>h.calls.filter(x=>x.operation==='select').length>=2);
 for(let i=0;i<1101;i++)h.store.overrides.push({user_id:'owner-a',template_id:'design-'+String(i).padStart(4,'0'),description:'Correction '+i,tags:['tag']});
 h.text('Review search reports').click();await h.wait(()=>h.getApproved().length===1101);
 assert.ok(h.getApproved().some(x=>x.templateId==='design-1100'));
});
