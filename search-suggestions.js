/* Fast, offline search suggestions from existing catalog records.
 * No network requests or SerpApi usage. Does not silently rewrite search terms.
 */
export function init(){
  const main=document.getElementById("search");
  const sticky=document.getElementById("sticky-search");
  if(!main||!sticky||!window.allData)return;
  const panel=document.createElement("div");
  panel.id="pumpkin-search-suggestions";
  panel.setAttribute("role","listbox");
  panel.setAttribute("aria-label","Suggested pumpkin searches");
  panel.hidden=true;
  panel.style.cssText="position:fixed;z-index:3000;background:#182a20;color:#f5eee0;border:1px solid #75906e;border-radius:12px;box-shadow:0 14px 42px #000a;padding:6px;max-height:min(340px,48vh);overflow-y:auto;box-sizing:border-box";
  document.body.append(panel);
  const css=document.createElement("style");
  css.textContent="#pumpkin-search-suggestions[hidden]{display:none!important}#pumpkin-search-suggestions button{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;width:100%;font:inherit;font-size:14px;padding:10px 12px;color:#f4ecdb;background:transparent;border:0;border-radius:7px;cursor:pointer}#pumpkin-search-suggestions button:hover,#pumpkin-search-suggestions button[aria-selected=true]{background:#35513d}#pumpkin-search-suggestions small{font-size:11px;color:#bdcbb5;flex-shrink:0}#pumpkin-search-suggestions strong{color:#ffa96b}";
  document.head.append(css);
  for(const el of [main,sticky]){
    el.setAttribute("aria-autocomplete","list");
    el.setAttribute("aria-controls",panel.id);
    el.setAttribute("aria-expanded","false");
  }
  const normal=v=>String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
  const omit=new Set("the and for with from level template templates pumpkin pumpkins carving pattern design halloween zombie additional more original printable kids girl boy face faces collection family imports other".split(" "));
  let catalog=[],titles=[],terms=[],active=null,options=[],highlight=-1,ignore=false,stamp="";
  function build(){
    const rows=window.allData();
    const currentStamp=rows.length+"|"+rows[rows.length-1]?.id+"|"+rows[0]?.id;
    if(currentStamp===stamp)return;
    stamp=currentStamp;
    titles=[];const words=new Map();
    const seenTitles=new Set();
    for(const x of rows){
      const name=String(x.name||"").trim(),label=normal(name);
      if(label.length>=2&&!seenTitles.has(label)){
        seenTitles.add(label);
        titles.push({value:name,normalized:label,source:x.source});
      }
      const inputs=[name,...(x.tags||[]),...(x.keywords||[]),x.theme||""];
      const unique=new Set(normal(inputs.join(" ")).split(" "));
      for(const word of unique){
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
      if(rowMin>limit)return limit+1;
      prev=curr;
    }
    return prev[b.length];
  }
  function candidates(query){
    build();
    const q=normal(query);if(q.length<2)return [];
    const found=new Map();
    function add(value,type,score){
      const key=normal(value);
      if(!key||key===q)return;
      const old=found.get(key);
      if(!old||score>old.score)found.set(key,{value,type,score});
    }
    for(const t of titles){
      const text=t.normalized;
      if(text.startsWith(q))add(t.value,"Design",120+(t.source==="zombie"?3:0)-text.length/100);
      else if(text.split(" ").some(w=>w.startsWith(q)))add(t.value,"Design",80+(t.source==="zombie"?3:0)-text.length/100);
    }
    for(const t of terms){
      if(t.word.startsWith(q))add(t.word,"Topic",60+Math.min(t.count,40)/4);
    }
    // Only propose spelling corrections when there is not a clear completion.
    if(found.size<5&&q.length>=4&&q.split(" ").length===1){
      const limit=q.length>=7?2:1;
      for(const t of terms){
        if(Math.abs(t.word.length-q.length)>limit||t.word===q)continue;
        const d=distance(q,t.word,limit);
        if(d<=limit)add(t.word,"Did you mean?",38-d*5+Math.min(t.count,40)/10);
      }
    }
    return [...found.values()].sort((a,b)=>b.score-a.score||a.value.localeCompare(b.value)).slice(0,6);
  }
  function hide(){
    panel.hidden=true;panel.replaceChildren();options=[];highlight=-1;
    for(const el of [main,sticky])el.setAttribute("aria-expanded","false");
    active=null;
  }
  function locate(el){
    const r=el.getBoundingClientRect();
    panel.style.left=Math.max(8,r.left)+"px";
    panel.style.top=Math.min(innerHeight-55,r.bottom+5)+"px";
    panel.style.width=Math.max(140,Math.min(r.width,innerWidth-16))+"px";
  }
  function choose(i){
    const item=options[i],input=active;
    if(!item||!input)return;
    hide();ignore=true;
    input.value=item.value;
    input.dispatchEvent(new Event("input",{bubbles:true}));
    ignore=false;
    input.focus();
  }
  function highlightRow(){
    [...panel.querySelectorAll("button")].forEach((b,i)=>b.setAttribute("aria-selected",String(i===highlight)));
  }
  function show(el){
    if(ignore||document.activeElement!==el)return;
    const value=el.value;
    if(normal(value).length<2){hide();return;}
    const suggested=candidates(value);
    if(!suggested.length){hide();return;}
    active=el;options=suggested;highlight=-1;
    panel.replaceChildren();
    suggested.forEach((s,i)=>{
      const btn=document.createElement("button");
      btn.type="button";btn.setAttribute("role","option");btn.setAttribute("aria-selected","false");
      const title=document.createElement("span");title.textContent=s.value;
      const hint=document.createElement("small");hint.textContent=s.type;
      btn.append(title,hint);
      btn.addEventListener("pointerdown",e=>e.preventDefault());
      btn.addEventListener("click",()=>choose(i));
      panel.append(btn);
    });
    locate(el);panel.hidden=false;
    el.setAttribute("aria-expanded","true");
  }
  for(const el of [main,sticky]){
    el.addEventListener("input",()=>show(el));
    el.addEventListener("focus",()=>show(el));
    el.addEventListener("keydown",e=>{
      if(panel.hidden||active!==el)return;
      if(e.key==="Escape"){e.preventDefault();hide();}
      else if(e.key==="ArrowDown"||e.key==="ArrowUp"){
        e.preventDefault();
        highlight=(highlight+(e.key==="ArrowDown"?1:-1)+options.length)%options.length;
        highlightRow();
      }else if(e.key==="Enter"&&highlight>=0){e.preventDefault();choose(highlight);}
    });
  }
  document.addEventListener("pointerdown",e=>{
    if(!panel.contains(e.target)&&e.target!==main&&e.target!==sticky)hide();
  });
  window.addEventListener("scroll",hide,{passive:true});
  window.addEventListener("resize",hide);
}
