import test from 'node:test';
import assert from 'node:assert/strict';
import {openFamilyOriginal} from '../family-original.js';

function harness(){
 let owner='parent',row={id:'design',original_path:'parent/original.pdf',thumbnail_path:'parent/preview.jpg'};
 const requests=[],notices=[],opened=[];
 let resolve;
 const client={storage:{from:bucket=>({createSignedUrl:(path,seconds)=>{requests.push({bucket,path,seconds});return new Promise(r=>resolve=r)}})}};
 const inputs={getOwner:()=>owner,getClient:()=>client,getRow:id=>id===row?.id?row:null,
  openWindow:()=>{const tab={opener:{},closed:false,location:{replace(url){tab.url=url}},close(){tab.closed=true}};opened.push(tab);return tab},
  notify:message=>notices.push(message)};
 return {inputs,requests,notices,opened,respond:value=>resolve(value),setOwner:v=>owner=v,setRow:v=>row=v};
}
test('Opening a family original signs the original on demand, not its thumbnail',async()=>{
 const h=harness(),pending=openFamilyOriginal(h.inputs,'design');
 assert.equal(h.opened.length,1,'tab must open during the user gesture');
 assert.deepEqual(h.requests,[{bucket:'pc-family-imports',path:'parent/original.pdf',seconds:60}]);
 h.respond({data:{signedUrl:'https://storage.example/original?token=secret'},error:null});
 assert.equal(await pending,true);assert.equal(h.opened[0].opener,null);
 assert.equal(h.opened[0].url,'https://storage.example/original?token=secret');assert.deepEqual(h.notices,[]);
});
test('Blocked popup does not issue a signed URL',async()=>{
 for(const open of [()=>null,()=>{throw Error('blocked')}]){
  const h=harness();h.inputs.openWindow=open;
  assert.equal(await openFamilyOriginal(h.inputs,'design'),false);
  assert.equal(h.requests.length,0);assert.match(h.notices[0],/blocked/i);
 }
});
test('Signing failures and account changes close pending tabs',async()=>{
 for(const change of ['error','owner','removed','bad-url']){
  const h=harness(),pending=openFamilyOriginal(h.inputs,'design');
  if(change==='owner')h.setOwner('other-parent');if(change==='removed')h.setRow(null);
  h.respond(change==='error'?{error:{message:'sensitive details'}}:{data:{signedUrl:change==='bad-url'?'javascript:alert(1)':'https://storage.example/file'},error:null});
  assert.equal(await pending,false,change);assert.equal(h.opened[0].closed,true,change);
  assert.equal(h.opened[0].url,undefined);assert.doesNotMatch(h.notices[0],/sensitive|storage\.example/);
 }
});
test('Missing original or signed-out parent does not open a tab',async()=>{
 const h=harness();h.setOwner(null);assert.equal(await openFamilyOriginal(h.inputs,'design'),false);
 h.setOwner('parent');h.setRow({id:'design',thumbnail_path:'preview.jpg'});
 assert.equal(await openFamilyOriginal(h.inputs,'design'),false);
 assert.equal(h.opened.length,0);assert.equal(h.requests.length,0);
});
