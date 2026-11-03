// Search the same metadata as the organizer without including protected originals.
const groups=[
 'cat kitty kitten feline cats meow purr','dog puppy pup canine doggie hound','ghost ghosts ghostie phantom spirit specter',
 'witch witches witchy sorceress','skull skeleton skelly bones','spider spiders arachnid cobweb web',
 'bat bats batty','owl owlet hootie','wolf wolves werewolf lycanthrope','vampire vampires dracula nosferatu',
 'jackolantern pumpkin lantern','grin smiling smile smiles laughing smirk','moon lunar crescent',
 'scary spooky creepy fright frightening','kid kids kiddie children','eyeball eyes eye','grave graveyard cemetery tombstone',
 'movie film cinema','videogame game gaming','flames fire burning','dinosaur dino trex prehistoric',
 'happy cheerful joyful','angry frown mad grumpy','magic magical wizard sorcerer','candy sweets treats','sun sunshine solar'
];
const aliases=new Map();for(const group of groups){const words=group.split(' ');for(const word of words)aliases.set(word,words);}
const stopwords=new Set('show me find a an the of for with and or in on some design designs pattern patterns template templates stencil stencils please looking want need'.split(' '));
const cache=new WeakMap();
const normalize=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
function distance(a,b){
 if(Math.abs(a.length-b.length)>1)return 2;
 if(a.length===b.length){for(let k=0;k<a.length-1;k++)if(a[k]!==b[k]&&a[k]===b[k+1]&&a[k+1]===b[k]&&a.slice(0,k)===b.slice(0,k)&&a.slice(k+2)===b.slice(k+2))return 1;}
 let i=0,j=0,errors=0;
 while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++errors>1)return errors;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}
 return errors+(i<a.length||j<b.length?1:0);
}
let lastQuery=null;
const weights=[12,10,7,4,2,1];
function prepare(query){
 if(lastQuery?.input===query)return lastQuery;
 const raw=normalize(query);
 const filtered=raw.split(' ').filter(term=>term&&!stopwords.has(term));
 const terms=(filtered.length?filtered:(raw?[raw]:[])).map(term=>({term,alternatives:aliases.get(term)||[term]}));
 return lastQuery={input:query,raw,terms};
}
function match(word,term){if(word===term)return 1;if(term.length>=4&&word.startsWith(term))return .7;if(term.length>=5&&word.length>=5&&distance(word,term)<=1)return .35;return 0;}
function index(item){
 let result=cache.get(item);if(result)return result;
 const visual=item.visual||{};
 const fields=[item.name,[...(visual.tags||[]),visual.description||''].join(' '),(item.keywords||[]).join(' '),(item.tags||[]).join(' '),[item.category,item.theme].join(' '),item.difficulty];
 result={name:normalize(item.name),sets:fields.map(field=>new Set(normalize(field).split(' ').filter(Boolean)))};
 cache.set(item,result);return result;
}
export function guestSearchScore(item,query){
 if(!query)return 0;
 const {raw,terms}=prepare(query);if(!raw)return 0;
 const ix=index(item);let total=0;
 for(const {term,alternatives} of terms){let best=0;
  // Series and category names are broad labels, so expand synonyms only in
  // the title, reviewed visual details, and subject keywords.
  for(let i=0;i<ix.sets.length;i++)for(const alternative of i<3?alternatives:[term])for(const word of ix.sets[i]){
   const value=weights[i]*match(word,alternative)*(alternative===term?1:.85);
   if(value>best)best=value;
  }
  if(!best)return -1;total+=best;
 }
 if(ix.name.includes(raw))total+=18;
 if(ix.name===raw)total+=20;
 return total;
}
