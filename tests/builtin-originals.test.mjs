import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuiltinOriginals} from '../builtin-originals.js';
const id='0123456789abcdef';
function harness(){
 let owner='user-a',stored=[],objects=new Set(),writeError=false,uploadHook=()=>{},signHook=()=>{},cleanupError=false;
 const calls=[];
 const bucket={
  upload:async(path)=>{calls.push(['upload',path]);objects.add(path);uploadHook();return{}},
  remove:async(paths)=>{calls.push(['remove',...paths]);if(cleanupError)return{error:Error('cleanup')};paths.forEach(x=>objects.delete(x));return{}},
  createSignedUrl:async(path,seconds)=>{calls.push(['sign',path,seconds]);signHook();return {data:{signedUrl:'https://storage.test/signed'}}}
 };
 const client={storage:{from:name=>{assert.equal(name,'pc-family-imports');return bucket}},from:table=>{
  assert.equal(table,'pc_builtin_originals');let user,template,path;
  const q={select(){return q},eq(field,value){if(field==='user_id')user=value;if(field==='template_id')template=value;if(field==='original_path')path=value;return q},order(){return q},range:async()=>({data:stored.filter(x=>x.user_id===user)}),
   insert(row){return{select:async()=>{if(writeError)return{error:Error('write')};if(stored.some(x=>x.user_id===row.user_id&&x.template_id===row.template_id))return{error:{code:'23505'}};stored.push(row);return{data:[row]}}}},
   update(row){return{eq(field,value){if(field==='user_id')user=value;if(field==='template_id')template=value;if(field==='original_path')path=value;return this},select:async()=>{if(writeError)return{error:Error('write')};const match=stored.find(x=>x.user_id===user&&x.template_id===template&&x.original_path===path);if(!match)return{data:[]};match.original_path=row.original_path;return{data:[match]}}}},
   delete(){return {eq(field,value){if(field==='user_id')user=value;if(field==='template_id')template=value;if(field==='original_path')path=value;return this},select:async()=>{const matched=stored.filter(x=>x.user_id===user&&x.template_id===template&&x.original_path===path);stored=stored.filter(x=>!matched.includes(x));return{data:matched}}}}};return q;
 }};
 let n=0;const newApi=()=>createBuiltinOriginals({getOwner:()=>owner,getClient:()=>client,makeId:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`});const api=newApi();
 return {api,newApi,calls,objects,rows:()=>stored,setOwner:x=>owner=x,setWriteError:x=>writeError=x,setUploadHook:x=>uploadHook=x,setSignHook:x=>signHook=x,setCleanupError:x=>cleanupError=x};
}
const file={type:'application/pdf',size:100};
test('original is explicitly uploaded under owner path and attached without changing design id',async()=>{
 const h=harness();await h.api.save(id,file);assert.equal(h.api.has(id),true);assert.equal(h.rows()[0].template_id,id);assert.equal(h.rows()[0].original_path,'user-a/imports/builtin-00000000-0000-4000-8000-000000000001-original.pdf');
 await h.api.save(id,file);assert.equal(h.rows().length,1);assert.deepEqual([...h.objects],['user-a/imports/builtin-00000000-0000-4000-8000-000000000002-original.pdf']);
 const result=await h.api.remove(id);assert.equal(result.cleanupFailed,false);assert.equal(h.api.has(id),false);assert.equal(h.objects.size,0);
});
test('refuses unsupported files and clears prior owner mapping on account switch',async()=>{
 const h=harness();await assert.rejects(h.api.save(id,{type:'image/svg+xml',size:50}));assert.equal(h.calls.length,0);
 await h.api.save(id,file);h.setOwner('user-b');assert.equal(h.api.has(id),false);await h.api.refresh();assert.equal(h.api.has(id),false);
});
test('a failed or ambiguous database write never deletes a potentially linked upload',async()=>{
 const h=harness();h.setWriteError(true);await assert.rejects(h.api.save(id,file));assert.equal(h.objects.size,1);assert.equal(h.api.has(id),false);
});
test('account changes during upload or signing never expose an old account original',async()=>{
 const h=harness();h.setUploadHook(()=>h.setOwner('user-b'));await assert.rejects(h.api.save(id,file));assert.equal(h.rows().length,0);
 h.setUploadHook(()=>{});h.setOwner('user-a');await h.api.save(id,file);
 let closed=false,url='';h.setSignHook(()=>h.setOwner('user-b'));
 await assert.rejects(h.api.open(id,()=>({location:{replace:x=>url=x},close:()=>closed=true})));assert.equal(url,'');assert.equal(closed,true);
});
test('reports failed file cleanup without misreporting mapping state',async()=>{
 const h=harness();await h.api.save(id,file);h.setCleanupError(true);const result=await h.api.remove(id);assert.equal(result.cleanupFailed,true);assert.equal(h.api.has(id),false);assert.equal(h.objects.size,1);
});
test('a stale organizer cannot overwrite a newer original from another tab',async()=>{
 const h=harness();await h.api.save(id,file);const other=h.newApi();await other.refresh();
 await h.api.save(id,file);const newer=h.rows()[0].original_path;
 await assert.rejects(other.save(id,file),/changed in another window/);
 assert.equal(h.rows()[0].original_path,newer);assert.deepEqual([...h.objects],[newer]);
});
test('two organizers adding the first original do not overwrite one another',async()=>{
 const h=harness(),other=h.newApi();await other.refresh();await h.api.save(id,file);const newer=h.rows()[0].original_path;
 await assert.rejects(other.save(id,file),/changed in another window/);
 assert.equal(h.rows()[0].original_path,newer);assert.deepEqual([...h.objects],[newer]);assert.equal(other.has(id),true);
});
