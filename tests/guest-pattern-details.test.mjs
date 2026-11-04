import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('guest details preserve organizer themes and catalog values',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const marker='const TEMPLATE_METADATA=';
 const begin=html.indexOf(marker)+marker.length;
 assert.ok(begin>=marker.length,'organizer metadata exists');
 const end=html.indexOf('};',begin)+1;
 const metadata=JSON.parse(html.slice(begin,end));
 const catalog=JSON.parse(readFileSync(new URL('../guest-catalog.json',import.meta.url),'utf8'));
 const actual=JSON.parse(readFileSync(new URL('../guest-pattern-details.json',import.meta.url),'utf8'));
 const expected={};
 for(const item of catalog){
  const theme=metadata[item.id]?.[0];
  const rating=metadata[item.id]?.[1];
  const level=item.source==='extra'&&/^Level [1-5]$/.test(rating)&&rating===item.category?rating:'';
  const catalogRating=item.source==='zombie'&&typeof rating==='string'?rating:'';
  const keptRating=level||catalogRating;
  if(typeof theme==='string'&&theme.trim()||keptRating)expected[item.id]={
   ...(typeof theme==='string'&&theme.trim()?{theme}:{}),...(keptRating?{difficulty:keptRating}:{})};
 }
 assert.deepEqual(actual,expected);
 assert.ok(Object.keys(actual).length>0,'verified ratings are available');
});
