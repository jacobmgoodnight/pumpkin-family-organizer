/* Shared, offline Smart Search for organizer and private family links.
 * Suggestions stay attached to the input, rather than fixed to the viewport:
 * mobile Safari's keyboard changes the visual viewport independently of innerHeight.
 */
export function mountSmartSuggestions({inputs,getItems,id="pumpkin-search-suggestions"}){
 const fields=inputs.filter(Boolean);
 if(!fields.length||typeof getItems!=="function")return {hide(){}};
 const panel=document.createElement("div");
 panel.id=id;panel.setAttribute("role","listbox");
 panel.setAttribute("aria-label","Suggested pumpkin searches");panel.hidden=true;
 panel.style.cssText="position:absolute;z-index:3000;background:#182a20;color:#f5eee0;border:1px solid #75906e;border-radius:12px;box-shadow:0 14px 42px #000a;padding:6px;overflow-y:auto;box-sizing:border-box;overscroll-behavior:contain";
 const css=document.createElement("style");
 css.textContent=`#${id}[hidden]{display:none!important}#${id} button{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;width:100%;font:inherit;font-size:14px;padding:10px 12px;min-height:44px;color:#f4ecdb;background:transparent;border:0;border-radius:7px;cursor:pointer}#${id} button:hover,#${id} button[aria-selected=true]{background:#35513d}#${id} small{font-size:11px;color:#bdcbb5;flex-shrink:0}#${id} strong{color:#ffa96b}`;
 document.head.append(css);
 for(const el of fields){
   el.setAttribute("aria-autocomplete","list");
   el.setAttribute("aria-controls",panel.id);
   el.setAttribute("aria-expanded","false");
 }
 const normal=v=>String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
 const omit=new Set("the and for with from level template templates pumpkin pumpkins carving pattern design halloween zombie additional more original printable kids girl boy face faces collection family imports other".split(" "));
 let titles=[],terms=[],active=null,options=[],highlight=-1,ignore=false,stamp="";
 function build(){
   const rows=getItems()||[],next=rows.length+"|"+rows[0]?.id+"|"+rows[rows.length-1]?.id;
   if(next===stamp)return;
   stamp=next;titles=[];const words=new Map(),seen=new Set();
   for(const x of rows){
     const name=String(x.name||"").trim(),normalized=normal(name);
     if(normalized.length>=2&&!seen.has(normalized)){
       seen.add(normalized);titles.push({value:name,normalized,source:x.source});
     }
     const data=[name,...(x.tags||[]),...(x.keywords||[]),x.theme||"",x.category||""];
     for(const word of new Set(normal(data.join(" ")).split(" "))){
       if(word.length<3||word.length>28||omit.has(word)||/^\d+$/.test(word))continue;
       words.set(word,(words.get(word)||0)+1);
     }
   }
   terms=[...words].filter(([,count])=>count>=2).map(([word,count])=>({word,count}));
 }
 function distance(a,b,limit){
   if(Math.abs(a.length-b.length)>limit)return limit+1;
   let prev=Array.from({length:b.length+1},(_,i)=>i);
   for(let i=1;i<=a.length;i++){
     const curr=[i];let rowMin=i;
     for(let j=1;j<=b.length;j++){
       curr[j]=Math.min(curr[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
       rowMin=Math.min(rowMin,curr[j]);
     }
     if(rowMin>limit)return limit+1;prev=curr;
   }
   return prev[b.length];
 }
 function candidates(query){
   build();const q=normal(query);if(q.length<2)return [];
   const found=new Map();
   function add(value,type,score){
     const key=normal(value);if(!key||key===q)return;
     const old=found.get(key);
     if(!old||score>old.score)found.set(key,{value,type,score});
   }
   for(const title of titles){
     const name=title.normalized,boost=title.source==="zombie"?3:0;
     if(name.startsWith(q))add(title.value,"Design",120+boost-name.length/100);
     else if(name.split(" ").some(word=>word.startsWith(q)))add(title.value,"Design",80+boost-name.length/100);
   }
   for(const term of terms){
     if(term.word.startsWith(q))add(term.word,"Topic",60+Math.min(term.count,40)/4);
   }
   if(found.size<5&&q.length>=4&&!q.includes(" ")){
     const limit=q.length>=7?2:1;
     for(const term of terms){
       if(Math.abs(term.word.length-q.length)>limit||term.word===q)continue;
       const d=distance(q,term.word,limit);
       if(d<=limit)add(term.word,"Did you mean?",38-d*5+Math.min(term.count,40)/10);
     }
   }
   return [...found.values()].sort((a,b)=>b.score-a.score||a.value.localeCompare(b.value)).slice(0,6);
 }
 function hide(){
   panel.hidden=true;panel.replaceChildren();options=[];highlight=-1;
   fields.forEach(el=>el.setAttribute("aria-expanded","false"));active=null;
 }
 function position(el){
   // Anchor to the *input's parent*, so suggestions scroll away with the search
   // field instead of floating over family sections when the iOS keyboard opens.
   const host=el.parentElement;
   if(!host)return false;
   if(panel.parentElement!==host)host.append(panel);
   if(getComputedStyle(host).position==="static")host.style.position="relative";
   const r=el.getBoundingClientRect(),p=host.getBoundingClientRect();
   const vv=window.visualViewport;
   const visibleBottom=vv?vv.offsetTop+vv.height:window.innerHeight;
   const room=visibleBottom-r.bottom-12;
   // If the keyboard leaves too little space below the field, suppress rather
   // than drawing a panel on top of the field or other content.
   if(room<92||r.bottom<0||r.top>=visibleBottom)return false;
   panel.style.left=Math.max(0,r.left-p.left)+"px";
   panel.style.top=Math.max(0,r.bottom-p.top+5)+"px";
   panel.style.width=Math.max(140,r.width)+"px";
   panel.style.maxHeight=Math.min(288,Math.floor(room))+"px";
   return true;
 }
 function choose(index){
   const choice=options[index],input=active;
   if(!choice||!input)return;
   hide();ignore=true;input.value=choice.value;
   input.dispatchEvent(new Event("input",{bubbles:true}));ignore=false;
   input.focus();
 }
 function selectRow(){
   panel.querySelectorAll('button').forEach((b,i)=>b.setAttribute("aria-selected",String(i===highlight)));
 }
 function show(input){
   if(ignore||document.activeElement!==input)return;
   const suggested=candidates(input.value);
   if(!suggested.length){hide();return;}
   active=input;highlight=-1;
   options=matchMedia("(max-width:600px)").matches?suggested.slice(0,4):suggested;
   panel.replaceChildren();
   for(const [i,item] of options.entries()){
     const btn=document.createElement("button");btn.type="button";
     btn.setAttribute("role","option");btn.setAttribute("aria-selected","false");
     const label=document.createElement("span");label.textContent=item.value;
     const hint=document.createElement("small");hint.textContent=item.type;
     btn.append(label,hint);btn.addEventListener("pointerdown",e=>e.preventDefault());
     btn.addEventListener("click",()=>choose(i));panel.append(btn);
   }
   if(!position(input)){hide();return;}
   panel.hidden=false;input.setAttribute("aria-expanded","true");
 }
 for(const field of fields){
   field.addEventListener("input",()=>show(field));
   field.addEventListener("focus",()=>show(field));
   field.addEventListener("keydown",event=>{
     if(panel.hidden||active!==field)return;
     if(event.key==="Escape"){event.preventDefault();hide();}
     else if(event.key==="ArrowDown"||event.key==="ArrowUp"){
       event.preventDefault();highlight=(highlight+(event.key==="ArrowDown"?1:-1)+options.length)%options.length;selectRow();
     }else if(event.key==="Enter"&&highlight>=0){event.preventDefault();choose(highlight);}
   });
 }
 document.addEventListener("pointerdown",event=>{
   if(!panel.contains(event.target)&&!fields.includes(event.target))hide();
 });
 window.addEventListener("scroll",hide,{passive:true});
 window.addEventListener("resize",()=>{if(active&&!panel.hidden&&!position(active))hide();},{passive:true});
 window.visualViewport?.addEventListener("resize",()=>{if(active&&!panel.hidden&&!position(active))hide();},{passive:true});
 window.visualViewport?.addEventListener("scroll",()=>{if(active&&!panel.hidden&&!position(active))hide();},{passive:true});
 return {hide};
}
export function init(){
 const main=document.getElementById("search"),sticky=document.getElementById("sticky-search");
 if(!main||!sticky||!window.allData)return;
 mountSmartSuggestions({inputs:[main,sticky],getItems:()=>window.allData()});
}
