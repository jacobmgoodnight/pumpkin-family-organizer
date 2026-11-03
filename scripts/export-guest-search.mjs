// Keep the private gallery's search metadata in sync with the organizer.
// Run after changing VISUAL_CAPTIONS or SEARCH_KEYWORDS in index.html.
import {readFileSync, writeFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function object(name){
 const start=html.indexOf(`const ${name}=`);
 if(start<0)throw Error(`Missing ${name}`);
 const begin=start+`const ${name}=`.length;
 const end=html.indexOf('};',begin)+1;
 return JSON.parse(html.slice(begin,end));
}
const visuals=object('VISUAL_CAPTIONS'),keywords=object('SEARCH_KEYWORDS');
const metadata={};
for(const id of new Set([...Object.keys(visuals),...Object.keys(keywords)])){
 const visual=visuals[id];
 metadata[id]={...(visual?{visual:{description:visual.description,tags:visual.tags}}:{}),
   ...(keywords[id]?.length?{keywords:keywords[id]}:{})};
}
writeFileSync(new URL('../guest-search-metadata.json',import.meta.url),JSON.stringify(metadata)+'\n');
console.log(`Exported search metadata for ${Object.keys(metadata).length} designs`);

