import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guestSearchScore as score} from '../guest-search.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const catalog=JSON.parse(read('guest-catalog.json'));
const meta=JSON.parse(read('guest-search-metadata.json'));
const html=read('index.html');
function object(name){const marker=`const ${name}=`;const begin=html.indexOf(marker)+marker.length;return JSON.parse(html.slice(begin,html.indexOf('};',begin)+1));}
const visual=object('VISUAL_CAPTIONS'),keywords=object('SEARCH_KEYWORDS');
test('private search metadata matches organizer data without changing the catalog',()=>{
 assert.equal(catalog.length,2053);
 for(const row of catalog){
  const expected=meta[row.id]||{};
  assert.deepEqual(expected.keywords||[],keywords[row.id]||[],row.id);
  assert.deepEqual(expected.visual||null,visual[row.id]?{description:visual[row.id].description,tags:visual[row.id].tags}:null,row.id);
 }
 assert.ok(!JSON.stringify(meta).includes('Templates/'));
});
test('every built-in design has search descriptions with honest review provenance',()=>{
 assert.equal(Object.keys(visual).length,2053);
 assert.equal(Object.values(visual).filter(entry=>entry.source.startsWith('AI visual inspection')).length,500);
 for(const row of catalog){
  const entry=visual[row.id];
  assert.ok(entry?.description&&Array.isArray(entry.tags)&&entry.tags.length>0,row.id);
  if(entry.source.startsWith('AI visual inspection'))assert.equal(entry.confidence,'medium');
 }
 assert.doesNotMatch(read('guest-search-metadata.json'),/[A-Za-z]:\\\\Users\\\\/);
});
test('new visual observations make subjects searchable even when absent from the title',()=>{
 for(const [name,query] of [['Moonlit Owl','owl branch'],['Orange Eye','skull pumpkin']]){
  const row=catalog.find(item=>item.name.toLowerCase()===name.toLowerCase());
  assert.ok(row,name);
  assert.ok(score({...row,...meta[row.id]},query)>0,`${name}: ${query}`);
 }
});
test('private search finds visual descriptions, multiword concepts, typos and synonyms',()=>{
 const item={id:'test',name:'The Prowler',category:'Other',tags:[],visual:{description:'A curious cat peeking through a window',tags:['cat','feline','peek']},keywords:[]};
 assert.ok(score(item,'cat window')>0);
 assert.ok(score(item,'kitty window')>0);
 assert.ok(score(item,'windwo')>0);
 assert.equal(score(item,'cat ghost'),-1);
 assert.ok(score({name:'Ghost',tags:[]},'ghost')>score({name:'Ghostly Cat',tags:[]},'ghost'));
 // Broad collection names should not become visual claims via synonyms.
 assert.equal(score({name:'Abraham Lincoln',tags:['Summer Spirits']},'ghost'),-1);
});

test('exact titles lead close matches and broad collection labels do not imply a subject',()=>{
 const exact={name:'Ghost',tags:[]};
 const similar={name:'Ghostly Cat',tags:[],visual:{tags:['ghost'],description:'A ghostly cat'}};
 assert.ok(score(exact,'ghost')>score(similar,'ghost'));
 assert.equal(score({name:'Abraham Lincoln',tags:['Summer Spirits']},'ghost'),-1);
 assert.equal(score({name:'Sparkling Castle',tags:[],keywords:['magic']},'witch'),-1);
 assert.ok(score({name:'A Witchy Face',tags:[]},'witch')>0);
 assert.ok(score({name:'Cat and Moon',tags:[]},'kitty lunar')>0);
});

test('approved visual corrections replace inferred subject keywords on both pages',()=>{
 const original={name:'Mysterious Figure',category:'Summer Spirits',tags:[],keywords:['ghost'],visual:{description:'A flying ghost',tags:['ghost']}};
 const corrected={description:'A cat sitting down',tags:['cat']};
 const organizer=query=>globalThis.PUMPKIN_SEARCH.score(original,query,corrected,{ignoreKeywords:true});
 const guest=query=>score({...original,keywords:[],visual:corrected},query);
 assert.ok(score(original,'ghost')>0);
 for(const [query,expectedMatch] of [['ghost',false],['cat',true],['summer spirits',true]]){
  assert.equal(organizer(query)>0,expectedMatch,'organizer: '+query);
  assert.equal(guest(query)>0,expectedMatch,'guest: '+query);
 }
 assert.ok(globalThis.PUMPKIN_SEARCH.score(original,'ghost',original.visual)>0,'original keyword returns when correction is removed');
});
