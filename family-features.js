// Goodnight family library, image discovery and private file imports.
export function init({getClient,getOwner,bridge}){
 const $=id=>document.getElementById(id),client=()=>getClient(),owner=()=>getOwner();
 const safeUrl=v=>{try{const u=new URL(v);return u.protocol==="https:"?u.href:""}catch{return""}};
 const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
 const style=make("style");style.textContent=".pf-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 15px}.pf-actions button,.pf-panel button,.pf-modal button{cursor:pointer;background:#34483b;border:1px solid #70866c;color:#f2eee4;padding:9px 12px;border-radius:9px;font-weight:650}.pf-actions .pf-primary,.pf-modal button[type=submit],.pf-panel .pf-primary{background:#bb773e;color:#151d18;border-color:#e3ab73}.pf-panel{border:1px solid #58735e;border-radius:15px;background:#1a2b21;padding:15px;margin-bottom:16px}.pf-panel h3{margin:0 0 8px}.pf-panel a{color:#edb887}.pf-search{display:flex;gap:8px;flex-wrap:wrap}.pf-search input{flex:1;min-width:160px;background:#0f1b14;color:#fff;border:1px solid #6a826e;border-radius:9px;padding:10px}.pf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-top:13px}.pf-card{background:#263a2b;border:1px solid #526e57;border-radius:11px;padding:9px;min-width:0}.pf-card img{width:100%;height:150px;object-fit:contain;background:#101c14;border-radius:6px}.pf-card strong{display:block;font-size:13px;margin:6px 0;overflow-wrap:anywhere}.pf-card small{display:block;color:#bed0bc;margin:6px 0}.pf-card nav{display:flex;gap:5px;flex-wrap:wrap}.pf-card nav a,.pf-card nav button{font-size:12px;border:1px solid #65836b;color:#f9f2de;background:#354b3a;padding:7px;border-radius:6px;text-decoration:none}.pf-modal{border:1px solid #6c896c;border-radius:14px;background:#1d2c23;color:#f4ecdf;padding:20px;width:min(92vw,640px);max-height:85vh;overflow:auto}.pf-modal::backdrop{background:#000b}.pf-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pf-form label{display:grid;gap:5px;font-weight:600;font-size:13px}.pf-form input{background:#0c1912;border:1px solid #668369;border-radius:8px;color:white;padding:10px;min-width:0;width:100%;box-sizing:border-box}.pf-form .wide{grid-column:1/-1}.pf-note{font-size:13px;color:#ccdace;line-height:1.5}.pf-more{position:relative;align-self:center}.pf-more summary{cursor:pointer;color:#d5d8c7;padding:9px;border:1px solid #536f58;border-radius:8px;font-size:13px}.pf-more[open]{border:1px solid #526e57;background:#1a2b21;border-radius:9px;padding:5px}.pf-more button{margin:5px 5px 0 0}.pf-more summary::marker{color:#dfa878}@media(max-width:560px){.pf-form{grid-template-columns:1fr}.pf-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}";document.head.append(style);
 const actions=make("div","pf-actions");
 const importBtn=make("button","pf-primary","＋ Import pattern"),webBtn=make("button","","🌐 Find more online"),ideasBtn=make("button","","♡ Saved web ideas"),manageBtn=make("button","","Manage imports"),helpBtn=make("button","","Help");
 const libraryTools=make("details","pf-more"),toolSummary=make("summary","","Library tools");
libraryTools.append(toolSummary,ideasBtn,manageBtn,helpBtn);
actions.append(importBtn,webBtn,libraryTools);
 (document.querySelector(".utility-row")||document.getElementById("catalog-area"))?.after(actions);
 // Search all collections by default; curated Zombie Pumpkins still wins close relevance ties.
 const initialSource=$("source");if(initialSource&&initialSource.value==="zombie"){initialSource.value="";initialSource.dispatchEvent(new Event("change",{bubbles:true}));}
 const panel=make("section","pf-panel");panel.hidden=true;panel.append(make("h3","","Find more printable designs"));
 panel.append(make("p","pf-note","External results are suggestions, not part of your library. Check the original source and usage rights before importing."));
 const searchLine=make("div","pf-search"),webInput=document.createElement("input"),findBtn=make("button","pf-primary","Search Google Images"),google=make("a","","Open Google Images ↗");
 webInput.type="search";webInput.placeholder="e.g. Hello Kitty";webInput.setAttribute("aria-label","Search web patterns");
 google.target="_blank";google.rel="noopener noreferrer";searchLine.append(webInput,findBtn,google);panel.append(searchLine);
 const providerNotice=make("p","pf-note");providerNotice.hidden=true;panel.append(providerNotice);
 const feedback=make("p","pf-note");feedback.setAttribute("aria-live","polite");const grid=make("div","pf-grid");panel.append(feedback,grid);actions.after(panel);
 const dialog=make("dialog","pf-modal"),close=make("button","","Close ✕"),titleHeader=make("h2","","Import pattern to family library");
 close.type="button";close.style.float="right";dialog.append(close,titleHeader,make("p","pf-note","Upload a PDF or printable image. An optional preview makes it easy to recognize in search. Files stay private to your signed-in family."));
 const form=make("form","pf-form");
 const input=(label,type="text",value="")=>{const wrap=make("label","",label),el=document.createElement("input");el.type=type;el.value=value;wrap.append(el);form.append(wrap);return el};
 const title=input("Title");title.required=true;title.maxLength=160;
 const category=input("Category / theme","text","Family imports");category.maxLength=80;
 const tags=input("Search tags (comma-separated)");tags.maxLength=350;
 const difficulty=input("Difficulty (optional)");difficulty.maxLength=40;
 const link=input("Original source webpage (optional)","url");link.maxLength=1500;
 const preview=input("Preview image (JPG / PNG / WebP)","file");preview.accept=".jpg,.jpeg,.png,.webp";
 const printable=input("Printable file (PDF / image)","file");printable.accept=".pdf,.jpg,.jpeg,.png,.webp";printable.required=true;
 const rights=make("label","wide"),check=document.createElement("input");check.type="checkbox";check.required=true;check.style.width="18px";
 rights.style.cssText="display:flex;gap:8px;flex-direction:row;align-items:start";rights.append(check,document.createTextNode("I have permission to store these selected files privately for our family. Web search previews are not automatically downloaded."));form.append(rights);
 const submit=make("button","wide","Upload and add pattern");submit.type="submit";const formStatus=make("p","pf-note wide");formStatus.setAttribute("aria-live","polite");form.append(submit,formStatus);dialog.append(form);document.body.append(dialog);
 close.addEventListener("click",()=>dialog.close());dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close()});
 let webSource=null,ideas=[],cloudRows=[],channel=null,userId=null,loading=false,refreshQueued=false,cache=new Map(),cacheUntil=0;
 const openImport=src=>{if(!owner()){alert("Connect a parent account first.");return;}form.reset();category.value="Family imports";webSource=src||null;if(src){title.value=src.title||"";link.value=src.sourceUrl||src.source_url||"";tags.value="pumpkin, carving";}formStatus.textContent=src?"Download an authorized printable file from the source website, then choose that file here.":"Choose your printable PDF/image and optional preview.";dialog.showModal();title.focus()};
 let providerConfigured=null,providerChecking=false;
 const recentSearches=new Map();
 let currentWebRequest=0,activeTerm="",panelMode="search";
 async function checkSearchConnection(){
   if(!owner()||!client()||providerChecking)return;
   providerChecking=true;
   try{
     const {data,error}=await client().functions.invoke("pumpkin-image-search",{body:{action:"status"}});
     if(error||typeof data?.configured!=="boolean")throw Error("Status unavailable");
     providerConfigured=data.configured;
     if(!providerConfigured){
       providerNotice.replaceChildren(document.createTextNode("In-app Google Images needs a free SerpApi key. "));
       const keyLink=make("a","","Get free key");
       keyLink.href="https://serpapi.com/manage-api-key";keyLink.target="_blank";keyLink.rel="noopener noreferrer";
       const setupLink=make("a","","Add key in Supabase");
       setupLink.href="https://supabase.com/dashboard/project/wljddcebgmqzrgxjebkn";setupLink.target="_blank";setupLink.rel="noopener noreferrer";
       providerNotice.append(keyLink,document.createTextNode(" · "),setupLink,document.createTextNode(" (Edge Functions → Secrets, name: SERPAPI_KEY). Or use Open Google Images."));
       providerNotice.hidden=false;
     }else providerNotice.hidden=true;
   }catch{providerConfigured=null;providerNotice.hidden=true;}
   finally{providerChecking=false;}
 }
 const webUrl=()=>{google.href="https://www.google.com/search?tbm=isch&q="+encodeURIComponent(webInput.value.trim()+" pumpkin carving stencil printable")};
 const openWeb=q=>{
   panelMode="search";panel.hidden=false;
   webInput.value=q||$("search")?.value||"";
   const requested=webInput.value.trim();
   webUrl();panel.scrollIntoView({behavior:"smooth",block:"nearest"});
   // Discovery is explicitly requested, so search now rather than making the
   // family click Search Google Images a second time.
   void (async()=>{
     await checkSearchConnection();
     if(panelMode!=="search"||webInput.value.trim()!==requested)return;
     if(requested.length>=2)void findWeb({reuse:true});
     else{grid.replaceChildren();feedback.textContent="Enter a subject above, then select Search Google Images.";}
   })();
 };
 importBtn.addEventListener("click",()=>openImport(null));
 webBtn.addEventListener("click",()=>openWeb());
 ideasBtn.addEventListener("click",showIdeas);
 manageBtn.addEventListener("click",showImports);
 helpBtn.addEventListener("click",()=>alert("Import local PDF/image files into the shared catalog, or search for ideas online. A web idea is only a source link; to make it a permanent carving template, download a file you are allowed to use and import it. The source and all original designs remain separate."));
 webInput.addEventListener("input",webUrl);
 window.addEventListener("pumpkin:searchweb",e=>openWeb(e.detail?.query||""));
 window.addEventListener("pumpkin:resultschange",e=>{const d=e.detail||{};webBtn.textContent=d.query&&d.count<=5?"🌐 More designs for “"+d.query.slice(0,20)+"”":"🌐 Find more online"});
 function card({name,image,source,url}){
   const e=make("article","pf-card"),pic=make("img"),heading=make("strong","",name),sub=make("small","",source),buttons=make("nav");
   pic.loading="lazy";pic.alt=name;pic.referrerPolicy="no-referrer";if(safeUrl(image))pic.src=safeUrl(image);else pic.hidden=true;
   if(safeUrl(url)){const a=make("a","","Source ↗");a.href=safeUrl(url);a.target="_blank";a.rel="noopener noreferrer";buttons.append(a)}
   e.append(pic,heading,sub,buttons);grid.append(e);return buttons;
 }
 async function saveIdea(row,term,b){
   if(!owner())return;const url=safeUrl(row.sourceUrl);if(!url)return;
   b.disabled=true;b.textContent="Saving…";
   const {error}=await client().from("pc_web_ideas").upsert({
     user_id:owner(),title:row.title.slice(0,220),source_url:url,preview_url:safeUrl(row.thumbnail)||null,
     source_name:(row.source||"Source").slice(0,160),search_term:term.slice(0,120)
   },{onConflict:"user_id,source_url"});
   b.disabled=false;b.textContent=error?"Save failed":"♥ Saved idea";if(!error)await fetchIdeas();
 }
 function renderWebCards(results,term,reused=false){
   grid.replaceChildren();
   feedback.textContent=results.length
     ?results.length+" results"+(reused?" · Reused recent results":"")+" · Open original sources before saving or importing."
     :"No results found. Try the external Google Images link.";
   for(const r of results){
     if(!safeUrl(r.thumbnail)||!safeUrl(r.sourceUrl))continue;
     const nav=card({name:r.title,image:r.thumbnail,source:r.source,url:r.sourceUrl});
     const save=make("button","","♡ Save idea"),imp=make("button","","Import file…");
     save.addEventListener("click",()=>saveIdea(r,term,save));
     imp.addEventListener("click",()=>openImport(r));
     nav.append(save,imp);
   }
 }
 async function findWeb({reuse=false}={}){
   panelMode="search";
   const term=webInput.value.trim();
   if(term.length<2){feedback.textContent="Enter at least 2 characters.";return;}
   webUrl();
   const uid=owner(),key=term.toLowerCase().replace(/\\s+/g," ");
   if(!uid){grid.replaceChildren();feedback.textContent="Connect a parent account to search within the page, or open Google Images.";return;}
   if(reuse){
     const entry=recentSearches.get(key);
     if(entry&&Date.now()-entry.time<15*60*1000){
       ++currentWebRequest;activeTerm="";findBtn.disabled=false;
       renderWebCards(entry.results,term,true);return;
     }
   }
   if(activeTerm===key)return; // avoid duplicate concurrent API requests
   if(providerConfigured===false){grid.replaceChildren();feedback.textContent="Set SERPAPI_KEY in Supabase Edge Functions → Secrets, then refresh this app. The Open Google Images link works without a key.";return;}
   const request=++currentWebRequest;
   activeTerm=key;findBtn.disabled=true;grid.replaceChildren();feedback.textContent="Searching Google Images…";
   try{
     const {data,error}=await client().functions.invoke("pumpkin-image-search",{body:{query:term}});
     if(error){const serverError=await error.context?.json?.().catch(()=>null);throw Error(serverError?.error||error.message)}
     if(data?.error)throw Error(data.error);
     if(request!==currentWebRequest||owner()!==uid||panelMode!=="search")return;
     const results=Array.isArray(data?.results)?data.results:[];
     recentSearches.set(key,{time:Date.now(),results});
     if(recentSearches.size>12)recentSearches.delete(recentSearches.keys().next().value);
     renderWebCards(results,term);
   }catch(e){
     if(request===currentWebRequest&&owner()===uid&&panelMode==="search")
       feedback.textContent=e.message+". The external Google Images link still works.";
   }finally{
     if(request===currentWebRequest){activeTerm="";findBtn.disabled=false;}
   }
 }
 findBtn.addEventListener("click",()=>void findWeb());
 webInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();void findWeb()}});
 async function fetchIdeas(){
   if(!owner())return;const {data,error}=await client().from("pc_web_ideas").select("*").eq("user_id",owner()).order("created_at",{ascending:false}).limit(300);
   if(!error){ideas=data||[];ideasBtn.textContent="♡ Saved ideas ("+ideas.length+")";}
 }
 function showIdeas(){
   if(!owner()){alert("Connect a parent account first.");return;}
   panelMode="ideas";++currentWebRequest;activeTerm="";findBtn.disabled=false;
   panel.hidden=false;providerNotice.hidden=true;grid.replaceChildren();
   feedback.textContent=ideas.length?ideas.length+" saved source links. No files were copied.":"No saved ideas yet. Search the web to save some.";
   for(const idea of ideas){const nav=card({name:idea.title,image:idea.preview_url,source:idea.source_name,url:idea.source_url});
     const imp=make("button","","Import file…"),remove=make("button","","Remove");
     imp.addEventListener("click",()=>openImport(idea));
     remove.addEventListener("click",async()=>{if(!confirm("Remove this saved idea?"))return;const {error}=await client().from("pc_web_ideas").delete().eq("user_id",owner()).eq("id",idea.id);if(!error){await fetchIdeas();showIdeas()}else alert(error.message)});
     nav.append(imp,remove);
   }
   panel.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 function showImports(){
   if(!owner()){alert("Connect the parent account first.");return;}
   panelMode="imports";++currentWebRequest;activeTerm="";findBtn.disabled=false;
   panel.hidden=false;providerNotice.hidden=true;grid.replaceChildren();
   feedback.textContent=cloudRows.length?cloudRows.length+" imported family templates. Rename or remove a pattern here. Removing also clears its saved favorites and final selections.":"No imports yet. Choose Import pattern to add a PDF or printable image.";
   for(const row of cloudRows){
     const previewUrl=cache.get(row.thumbnail_path)||"";
     const nav=card({name:row.name,image:previewUrl,source:row.category+" · Family library",url:row.source_url});
     const edit=make("button","","Rename"),remove=make("button","","Delete");
     edit.addEventListener("click",async()=>{
       const proposed=prompt("Rename imported pattern:",row.name);
       if(proposed===null)return;
       const next=proposed.trim().slice(0,160);if(!next)return;
       const {error}=await client().from("pc_imports").update({name:next,updated_at:new Date().toISOString()}).eq("id",row.id).eq("user_id",owner());
       if(error)alert(error.message);else{await refreshImports();showImports()}
     });
     remove.addEventListener("click",async()=>{
       if(!confirm("Permanently remove “"+row.name+"” from the family library and clear its favorites/final picks? This cannot be undone."))return;
       remove.disabled=true;
       const uid=owner();
       const {error}=await client().from("pc_imports").delete().eq("id",row.id).eq("user_id",uid);
       if(error){alert(error.message);remove.disabled=false;return;}
       const saved=await client().from("pc_choices").delete().eq("user_id",uid).eq("template_id","family:"+row.id);
       if(saved.error)console.warn("Could not clear old favorites",saved.error);
       const paths=[row.thumbnail_path,row.original_path].filter(Boolean);
       if(paths.length){const result=await client().storage.from("pc-family-imports").remove([...new Set(paths)]);if(result.error)console.warn("File cleanup incomplete:",result.error);}
       await refreshImports();window.dispatchEvent(new Event("pumpkin:cloudrefresh"));showImports();
     });
     nav.append(edit,remove);
   }
   panel.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 const imageTypes={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"},originalTypes={...imageTypes,"application/pdf":"pdf"};
 async function put(file,id,label,allowed){
   if(!file)return null;const ext=allowed[file.type];
   if(!ext)throw Error(label+" file type unsupported.");
   if(file.size<1||file.size>20*1024*1024)throw Error(label+" must be under 20 MB.");
   const path=owner()+"/imports/"+id+"-"+label+"."+ext;
   const {error}=await client().storage.from("pc-family-imports").upload(path,file,{contentType:file.type,upsert:false});
   if(error)throw Error(label+": "+error.message);return path;
 }
 form.addEventListener("submit",async e=>{
   e.preventDefault();if(!owner()||submit.disabled)return;
   const previewFile=preview.files[0],originalFile=printable.files[0];
   if(!originalFile){formStatus.textContent="Choose an original printable PDF or image. A thumbnail alone is not a carving template.";return}
   if(link.value&&!safeUrl(link.value)){formStatus.textContent="Source link must be https://";return}
   if(!check.checked){formStatus.textContent="Confirm permission before uploading.";return}
   if(cloudRows.some(row=>row.name.trim().toLowerCase()===title.value.trim().toLowerCase())&&!confirm("A family import already has this title. Add another copy?"))return;
   submit.disabled=true;formStatus.textContent="Uploading privately…";const id=crypto.randomUUID(),uploaded=[];
   try{
     let p=await put(previewFile,id,"preview",imageTypes);if(p)uploaded.push(p);
     const o=await put(originalFile,id,"original",originalTypes);if(o)uploaded.push(o);
     if(!p&&originalFile&&imageTypes[originalFile.type])p=o;
     const row={id,user_id:owner(),name:title.value.trim().slice(0,160),category:(category.value.trim()||"Family imports").slice(0,80),
       tags:tags.value.split(",").map(x=>x.trim()).filter(Boolean).slice(0,12).map(x=>x.slice(0,50)),
       difficulty:difficulty.value.trim().slice(0,40),thumbnail_path:p,original_path:o,origin:webSource?"web":"upload",
       source_url:safeUrl(link.value)||null,source_name:(webSource?.source||webSource?.source_name||"").slice(0,160)||null};
     const {error}=await client().from("pc_imports").insert(row);if(error)throw error;
     modalSuccess();
     await refreshImports();
     const source=$("source");if(source){source.value="family";source.dispatchEvent(new Event("change",{bubbles:true}))}
     const search=$("search");if(search){search.value=row.name;search.dispatchEvent(new Event("input",{bubbles:true}))}
   }catch(err){formStatus.textContent="Import failed: "+err.message;if(uploaded.length)await client().storage.from("pc-family-imports").remove(uploaded)}
   finally{submit.disabled=false}
 });
 function modalSuccess(){dialog.close();panel.hidden=true;alert("Added to the shared family library! Search or favorite it on any connected device.")}
 const placeholder="data:image/svg+xml;charset=UTF-8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="100%" height="100%" fill="#1c3025"/><text x="200" y="230" text-anchor="middle" font-size="82">🎃</text><text x="200" y="300" text-anchor="middle" fill="#f2d5a8" font-size="24">Family import</text></svg>');
 async function signed(paths){
   if(Date.now()>cacheUntil){cache.clear();cacheUntil=Date.now()+45*60*1000}
   const unseen=[...new Set(paths.filter(Boolean))].filter(p=>!cache.has(p));
   for(let i=0;i<unseen.length;i+=80){const part=unseen.slice(i,i+80);
     const {data,error}=await client().storage.from("pc-family-imports").createSignedUrls(part,3600);if(error)throw error;
     part.forEach((p,j)=>cache.set(p,data?.[j]?.signedUrl||""));
   }
   return cache;
 }
 async function refreshImports(){
   if(loading){refreshQueued=true;return;}if(!owner())return;loading=true;const uid=owner();
   try{const {data,error}=await client().from("pc_imports").select("*").eq("user_id",uid).order("created_at",{ascending:false}).limit(2000);
     if(error)throw error;if(uid!==owner())return;cloudRows=data||[];
     const links=await signed(cloudRows.flatMap(r=>[r.thumbnail_path,r.original_path]));if(uid!==owner())return;
     bridge.setCloudImports(cloudRows.map(r=>({
       id:"family:"+r.id,name:r.name,category:r.category||"Family imports",theme:r.category||"Family imports",
       tags:r.tags||[],keywords:r.tags||[],difficulty:r.difficulty||"",thumbnail:links.get(r.thumbnail_path)||placeholder,
       path:links.get(r.original_path)||"",source:"family",pages:1,cloud_id:r.id
     })));
     importBtn.textContent="＋ Import pattern";manageBtn.textContent="Manage imports"+(cloudRows.length?" ("+cloudRows.length+")":"");
   }catch(err){console.error("Could not load family imports",err);manageBtn.title="Could not refresh imports: "+err.message;}finally{loading=false;if(refreshQueued){refreshQueued=false;void refreshImports()}}
 }
 async function connect(){
   const uid=owner();if(!uid)return;
   if(userId!==uid){userId=uid;recentSearches.clear();++currentWebRequest;activeTerm="";cache.clear();cacheUntil=0;ideas=[];cloudRows=[];if(channel)client()?.removeChannel(channel);
     channel=client().channel("pc-library-"+uid)
       .on("postgres_changes",{event:"*",schema:"public",table:"pc_imports",filter:"user_id=eq."+uid},refreshImports)
       .on("postgres_changes",{event:"*",schema:"public",table:"pc_web_ideas",filter:"user_id=eq."+uid},fetchIdeas).subscribe();
   }
   await Promise.all([refreshImports(),fetchIdeas()]);
 }
 window.addEventListener("focus",()=>{if(owner()&&Date.now()>cacheUntil-5*60*1000)refreshImports()});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&owner()&&Date.now()>cacheUntil-5*60*1000)refreshImports()});
 window.addEventListener("pumpkin:cloudready",connect);
 setInterval(()=>{if(owner())refreshImports()},25*60*1000);
 window.addEventListener("pumpkin:cloudsignedout",()=>{if(channel)client()?.removeChannel(channel);channel=null;userId=null;recentSearches.clear();++currentWebRequest;activeTerm="";cache.clear();cacheUntil=0;cloudRows=[];bridge.setCloudImports([]);ideas=[];ideasBtn.textContent="♡ Saved web ideas";});
 if(owner())connect();
}
