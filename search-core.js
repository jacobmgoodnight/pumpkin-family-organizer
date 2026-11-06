// Shared by the organizer and private gallery. Broad labels match literally, without subject synonyms.
(function(){
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
// At the end of a longer search these usually describe the medium, not an
// additional subject ("cat pumpkin stencil"). Keep standalone searches and
// leading title words such as "Pumpkin King" meaningful.
const trailingMediumWords=new Set(['pumpkin','pumpkins','carving','carvings']);
// These are source collection labels, not independently verified estimates of
// carving difficulty. Only interpret them alongside a subject, so a standalone
// title word (or a search for a particular level) keeps its literal meaning.
const difficultyTerms={
 easy:{words:['easy','simple','beginner'],level:'level 1'},
 simple:{words:['easy','simple','beginner'],level:'level 1'},
 beginner:{words:['easy','simple','beginner'],level:'level 1'},
 medium:{words:['medium','moderate','intermediate'],level:'level 3'},
 moderate:{words:['medium','moderate','intermediate'],level:'level 3'},
 intermediate:{words:['medium','moderate','intermediate'],level:'level 3'},
 hard:{words:['hard','difficult','advanced','challenging'],level:'level 5'},
 difficult:{words:['hard','difficult','advanced','challenging'],level:'level 5'},
 advanced:{words:['hard','difficult','advanced','challenging'],level:'level 5'},
 challenging:{words:['hard','difficult','advanced','challenging'],level:'level 5'}
};
let cache=new WeakMap();
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
 while(filtered.length>1&&trailingMediumWords.has(filtered[filtered.length-1]))filtered.pop();
 const selected=filtered.length?filtered:(raw?[raw]:[]);
 const hasOneDifficulty=selected.length>1&&selected.filter(term=>Object.hasOwn(difficultyTerms,term)).length===1;
 const terms=selected.map(term=>({term,alternatives:aliases.get(term)||[term],difficulty:hasOneDifficulty&&Object.hasOwn(difficultyTerms,term)?difficultyTerms[term]:null}));
 return lastQuery={input:query,raw,terms};
}
function match(word,term){if(word===term)return 1;if(term.length>=4&&word.startsWith(term))return .7;if(term.length>=5&&word.length>=5&&distance(word,term)<=1)return .35;return 0;}
function index(item, visual, ignoreKeywords){
 let result=cache.get(item);if(result && result.visual===visual && result.ignoreKeywords===ignoreKeywords)return result;
 const indexedVisual=visual||{};
 const fields=[item.name,[...(indexedVisual.tags||[]),indexedVisual.description||''].join(' '),(ignoreKeywords?[]:(item.keywords||[])).join(' '),(item.tags||[]).join(' '),[item.category,item.theme].join(' '),item.difficulty];
 const name=normalize(item.name),nameWords=name.split(' '),joinedNames=new Set();
 // Handle joined character names such as Spider-Man / spiderman without
 // fuzzy-matching unrelated words or combining visual metadata and tags.
 for(let i=0;i<nameWords.length-1;i++){
  const a=nameWords[i],b=nameWords[i+1];
  if(a.length>=3&&b.length>=3&&a.length+b.length>=7)joinedNames.add(a+b);
 }
 result={visual,ignoreKeywords,name,joinedNames,difficulty:normalize(item.difficulty),sets:fields.map(field=>new Set(normalize(field).split(' ').filter(Boolean)))};
 cache.set(item,result);return result;
}
function score(item,query,visual=item.visual,{ignoreKeywords=false}={}){
 if(!query)return 0;
 const {raw,terms}=prepare(query);if(!raw)return 0;
 const ix=index(item,visual,ignoreKeywords);let total=0;
 for(const {term,alternatives,difficulty} of terms){let best=0;
  if(ix.joinedNames.has(term))best=weights[0];
  // Series and category names are broad labels, so expand synonyms only in
  // the title, reviewed visual details, and subject keywords.
  for(let i=0;i<ix.sets.length;i++)for(const alternative of i<3?alternatives:[term])for(const word of ix.sets[i]){
   const value=weights[i]*match(word,alternative)*(alternative===term?1:.85);
   if(value>best)best=value;
  }
  // A descriptive word can occur in a title, visual caption or keywords, or
  // as a family-entered difficulty. Keep collection names literal and never
  // infer a rating from an unrated design.
  if(difficulty){
   if(ix.difficulty===difficulty.level)best=Math.max(best,weights[5]);
   for(const i of [0,1,2,5])for(const alternative of difficulty.words)for(const word of ix.sets[i]){
    if(word===alternative)best=Math.max(best,weights[i]*(alternative===term?1:.85));
   }
  }
  if(!best)return -1;total+=best;
 }
 if(ix.name.includes(raw))total+=18;
 if(ix.name===raw)total+=20;
 return total;
}

function interpretation(query){
 const matches=prepare(query).terms.filter(term=>term.difficulty);
 if(matches.length!==1)return '';
 const {term,difficulty}=matches[0];
 return `“${term}” also matches ${difficulty.words.filter(word=>word!==term).join(' / ')} descriptions and ${difficulty.level.replace('level','Level')} source labels. Source labels are not verified carving difficulty.`;
}
globalThis.PUMPKIN_SEARCH={score,interpretation,clearCache(){cache=new WeakMap();}};
})();
