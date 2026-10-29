// Pumpkin image discovery. Key stays in Supabase Edge Function secrets.
// This endpoint is manually authenticated because publishable-key clients
// cannot rely on legacy gateway JWT verification.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const PROJECT_ORIGIN="https://jacobmgoodnight.github.io";
const cors={"Access-Control-Allow-Origin":PROJECT_ORIGIN,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Vary":"Origin"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
function safeUrl(v:unknown):string|null {try{if(typeof v!=="string"||v.length>1800)return null;const u=new URL(v);return u.protocol==="https:"?u.toString():null;}catch{return null;}}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 if(req.headers.get("origin") && req.headers.get("origin")!==PROJECT_ORIGIN)return json({error:"Origin not allowed"},403);
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token||token.length<100||token.length>5000)return json({error:"Sign in required"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!key)return json({error:"Server authentication unavailable"},503);
 const auth=createClient(url,key,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await auth.auth.getUser(token);
 if(authError||!user||user.is_anonymous)return json({error:"Sign in as the parent to use image discovery"},401);
 const {data:membership,error:memberError}=await auth.from("pc_accounts").select("user_id").eq("user_id",user.id).maybeSingle();
 if(memberError||!membership)return json({error:"Family account is not initialized"},403);
 let payload:any;try{payload=await req.json();}catch{return json({error:"Invalid JSON"},400);}
 const apiKey=Deno.env.get("SERPAPI_KEY")||"";
 if(payload?.action==="status")return json({configured:!!apiKey,provider:"SerpApi",maxResults:12});
 const term=typeof payload?.query==="string"?payload.query.trim().replace(/\s+/g," "):"";
 if(term.length<2||term.length>80)return json({error:"Search for 2–80 characters"},400);
 if(!apiKey)return json({error:"Google Images is not connected. Add SERPAPI_KEY in Supabase Edge Function Secrets.",code:"missing_key"},503);
 const now=new Date();
 const {count:perHour,error:countError}=await auth.from("pc_search_logs").select("id",{count:"exact",head:true}).gte("created_at",new Date(now.getTime()-3600000).toISOString());
 if(countError)return json({error:"Search usage unavailable"},503);
 if((perHour||0)>=15)return json({error:"Family image-search limit reached (15/hour). Try again later.",code:"rate_limited"},429);
 const {count:perDay}=await auth.from("pc_search_logs").select("id",{count:"exact",head:true}).gte("created_at",new Date(now.getTime()-86400000).toISOString());
 if((perDay||0)>=40)return json({error:"Family image-search limit reached (40/day). Try again tomorrow.",code:"rate_limited"},429);
 const {error:insertError}=await auth.from("pc_search_logs").insert({user_id:user.id,query:term});
 if(insertError)return json({error:"Could not record usage"},503);
 const u=new URL("https://serpapi.com/search.json");
 u.searchParams.set("engine","google_images");
 u.searchParams.set("q",term+" pumpkin carving stencil printable");
 u.searchParams.set("safe","active");u.searchParams.set("hl","en");u.searchParams.set("gl","us");u.searchParams.set("api_key",apiKey);
 try{
   const response=await fetch(u,{signal:AbortSignal.timeout(18000)});
   if(!response.ok)return json({error:"Image search provider returned "+response.status,code:"provider_error"},502);
   const body=await response.json();
   if(body.error)return json({error:"Image search provider: "+String(body.error).slice(0,220),code:"provider_error"},502);
   const data=Array.isArray(body.images_results)?body.images_results:[];
   const results=data.filter((x:any)=>!x.unsafe).map((x:any)=>({
     title:String(x.title||"Printable carving pattern").slice(0,160),
     source:String(x.source||"Original website").slice(0,80),
     thumbnail:safeUrl(x.thumbnail),
     sourceUrl:safeUrl(x.link),
     originalImageUrl:safeUrl(x.original)
   })).filter((x:any)=>x.thumbnail&&x.sourceUrl).slice(0,12);
   return json({query:term,results,provider:"Google Images via SerpApi"});
 }catch(error){return json({error:"Image search temporarily unavailable",code:"network_error"},503);}
});
