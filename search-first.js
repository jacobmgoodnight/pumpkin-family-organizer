// Search-first home screen: progressive disclosure without replacing core filters.
// All existing inputs and bridge listeners continue to own search behavior.
export function init(){
 const byId=id=>document.getElementById(id);
 const details=byId("advanced-filters"),toggle=byId("filter-toggle"),label=byId("active-filters-label");
 const hero=byId("search-first"),search=byId("search");
 if(!details||!toggle||!hero||!search)return;
 const announce=()=>{
   const source=byId("source"),theme=byId("category"),difficulty=byId("difficulty");
   const count=Number(!!source?.value)+Number(!!theme?.value)+Number(!!difficulty?.value&&!difficulty?.disabled);
   label.textContent=count?" · "+count+" active":"";
   toggle.setAttribute("aria-expanded",String(details.open));
   toggle.textContent="";toggle.append(document.createTextNode(details.open?"☷ Hide filters":"☷ More filters"),label);
   const selected=count?[source?.value,theme?.value,difficulty?.value].filter(Boolean).join(" · "):"";
   details.title=count?"Active filters: "+selected:"Optional collection, theme and difficulty filters";
 };
 toggle.addEventListener("click",()=>{
   details.open=!details.open;
   announce();
   if(details.open)details.scrollIntoView({block:"nearest",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
 });
 details.addEventListener("toggle",announce);
 for(const id of ["source","category","difficulty"])byId(id)?.addEventListener("change",announce);
 byId("clear-filters")?.addEventListener("click",()=>queueMicrotask(announce));
 byId("empty-clear")?.addEventListener("click",()=>queueMicrotask(announce));
 window.addEventListener("pumpkin:resultschange",announce);
 const updatePlaceholder=()=>{
   const name=window.PUMPKIN_FAMILY_BRIDGE?.snapshot()?.people
       ?.find(p=>p.id===window.PUMPKIN_FAMILY_BRIDGE?.snapshot()?.active)?.name||"";
   search.setAttribute("aria-label","Search pumpkin designs"+(name?" for "+name:""));
 };
 window.addEventListener("pumpkin:statechange",updatePlaceholder);
 window.addEventListener("pumpkin:cloudready",updatePlaceholder);
 announce();updatePlaceholder();
}