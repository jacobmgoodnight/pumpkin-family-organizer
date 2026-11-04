// Export organizer themes and existing catalog levels, without local original paths.
// Re-run when TEMPLATE_METADATA changes.
import {readFileSync,writeFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('const TEMPLATE_METADATA=');
if(start<0)throw Error('Missing TEMPLATE_METADATA');
const begin=start+'const TEMPLATE_METADATA='.length;
const end=html.indexOf('};',begin)+1;
if(!end)throw Error('Invalid TEMPLATE_METADATA');
const metadata=JSON.parse(html.slice(begin,end));
const catalog=JSON.parse(readFileSync(new URL('../guest-catalog.json',import.meta.url),'utf8'));
const details={};
for(const item of catalog){
 const theme=metadata[item.id]?.[0];
 // Only levels that agree with their original collection folder are verified.
 const difficulty=metadata[item.id]?.[1];
 const collectionLevel=item.source==='extra'&&/^Level [1-5]$/.test(difficulty)&&difficulty===item.category?difficulty:'';
 // Eight curated values already exist in the catalog; their source is unverified.
 const catalogRating=item.source==='zombie'&&typeof difficulty==='string'?difficulty:'';
 const rating=collectionLevel||catalogRating;
 if(typeof theme==='string'&&theme.trim()||rating)details[item.id]={
   ...(typeof theme==='string'&&theme.trim()?{theme}:{}),...(rating?{difficulty:rating}:{})};
}
writeFileSync(new URL('../guest-pattern-details.json',import.meta.url),JSON.stringify(details)+'\n');
console.log(`Exported details for ${Object.keys(details).length} designs`);
