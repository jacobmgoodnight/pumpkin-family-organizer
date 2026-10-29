// Restricted profile invitation API. Only the organizer can mint/revoke links.
// Guests receive a 256-bit capability in the URL fragment; only its SHA-256 hash
// is stored in Postgres. Never log, include in GET URLs, or expose service keys.
import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const ORIGIN="https://jacobmgoodnight.github.io";
const CORS={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Vary":"Origin"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
const fail=(message:string,status=400)=>reply({error:message},status);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN=/^[a-zA-Z0-9_-]{43}$/;
const BUILTIN=/^(?:Thumbnails\/[a-f0-9]{16}\.jpg|Additional_Thumbnails\/[a-f0-9]{16}\.(?:jpg|png|webp))$/i;
const text=(v:unknown,max:number)=>typeof v==="string"&&v.length<=max?v:null;
const bytesToHex=(bytes:Uint8Array)=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
async function digest(v:string){return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))));}
function key(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(request.method!=="POST")return fail("Method not allowed",405);
 if(request.headers.get("origin")&&request.headers.get("origin")!==ORIGIN)return fail("Origin forbidden",403);
 if(!SUPABASE_URL||!SERVICE_KEY)return fail("Invitation service unavailable",503);
 if(Number(request.headers.get("content-length")||0)>12000)return fail("Request too large",413);
 let body:Record<string,unknown>;
 try{const source=await request.text();if(source.length>12000)return fail("Request too large",413);body=JSON.parse(source);if(!body||Array.isArray(body)||typeof body!=="object")throw Error("Bad payload");}
 catch{return fail("Invalid request",400);}
 const action=text(body.action,30)||"";
 const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
   if(["list","create","revoke"].includes(action)){
     const jwt=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
     if(jwt.length<100||jwt.length>5000)return fail("Organizer sign-in required",401);
     const {data:{user},error:authError}=await admin.auth.getUser(jwt);
     if(authError||!user||user.is_anonymous||!user.email)return fail("Organizer sign-in required",401);
     const uid=user.id;
     const membership=await admin.from("pc_accounts").select("user_id").eq("user_id",uid).maybeSingle();
     if(membership.error||!membership.data)return fail("Family organizer account not found",403);
     if(action==="list"){
       const {data,error}=await admin.from("pc_profile_invites").select("id,person_id,created_at,expires_at").eq("owner_id",uid).is("revoked_at",null).gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(30);
       if(error)throw error;return reply({invites:data||[]});
     }
     if(action==="revoke"){
       const id=text(body.id,36);
       if(!id||!UUID.test(id))return fail("Invalid invitation",400);
       const {error}=await admin.from("pc_profile_invites").update({revoked_at:new Date().toISOString()}).eq("owner_id",uid).eq("id",id).is("revoked_at",null);
       if(error)throw error;return reply({ok:true});
     }
     const personId=text(body.personId,80);
     if(!personId||personId.length<1)return fail("Choose a family member",400);
     const {data:person,error:personError}=await admin.from("pc_people").select("person_id,display_name").eq("user_id",uid).eq("person_id",personId).maybeSingle();
     if(personError||!person)return fail("Family member not found",404);
     const days=body.days===7?7:body.days===14?14:30;
     const created=new Date(),expiry=new Date(created.getTime()+days*86400000);
     // Replace prior links for this person: never leave older live tokens.
     const {error:revokeError}=await admin.from("pc_profile_invites").update({revoked_at:created.toISOString()}).eq("owner_id",uid).eq("person_id",personId).is("revoked_at",null);
     if(revokeError)throw revokeError;
     const secret=key(),hash=await digest(secret);
     const {data:invite,error:insertError}=await admin.from("pc_profile_invites").insert({owner_id:uid,person_id:personId,token_hash:hash,expires_at:expiry.toISOString()}).select("id,expires_at").single();
     if(insertError)throw insertError;
     return reply({id:invite.id,personId,name:person.display_name,expiresAt:invite.expires_at,token:secret});
   }
   // Guests never authenticate as the parent and never get access to parent RLS.
   // The token authorizes exactly one person's choices until expiration/revocation.
   if(!["guest","thumbs","choice","print"].includes(action))return fail("Unsupported action",400);
   const token=text(body.token,43);
   if(!token||!TOKEN.test(token))return fail("Invitation invalid or expired",401);
   const tokenHash=await digest(token);
   const now=new Date().toISOString();
   const {data:invite,error:inviteError}=await admin.from("pc_profile_invites")
      .select("owner_id,person_id,expires_at").eq("token_hash",tokenHash).is("revoked_at",null).gt("expires_at",now).maybeSingle();
   if(inviteError||!invite)return fail("Invitation invalid or expired",401);
   const uid=invite.owner_id,personId=invite.person_id;
   if(action==="guest"){
     const [member,rows,imported]=await Promise.all([
       admin.from("pc_people").select("display_name").eq("user_id",uid).eq("person_id",personId).maybeSingle(),
       admin.from("pc_choices").select("template_id,favorite,final_pick").eq("user_id",uid).eq("person_id",personId).limit(2500),
       admin.from("pc_imports").select("id,name,category,difficulty,tags,thumbnail_path,original_path").eq("user_id",uid).order("created_at",{ascending:false}).limit(250)
     ]);
     if(member.error||!member.data||rows.error||imported.error)throw Error("Guest view unavailable");
     return reply({personId,name:member.data.display_name,expiresAt:invite.expires_at,choices:rows.data||[],imports:imported.data||[]});
   }
   if(action==="choice"){
     const templateId=text(body.templateId,160);
     if(!templateId||!templateId.trim()||typeof body.favorite!=="boolean"||typeof body.finalPick!=="boolean")return fail("Invalid selection",400);
     const finalPick=body.finalPick, favorite=body.favorite||finalPick;
     const {error}=await admin.from("pc_choices").upsert({user_id:uid,person_id:personId,template_id:templateId,favorite,final_pick:finalPick,updated_at:now},{onConflict:"user_id,person_id,template_id"});
     if(error)throw error;
     return reply({ok:true,templateId,favorite,finalPick});
   }
   if(action==="thumbs"){
     if(!Array.isArray(body.paths)||body.paths.length>60)return fail("Too many previews",400);
     const paths=[...new Set(body.paths.filter((x:unknown)=>typeof x==="string"&&x.length<140))] as string[];
     const builtin=paths.filter(p=>BUILTIN.test(p)),imports=paths.filter(p=>!BUILTIN.test(p));
     const links:Record<string,string>={};
     if(builtin.length){
       const resp=await admin.storage.from("pc-previews").createSignedUrls(builtin.map(path=>uid+"/"+path),1200);
       if(resp.error)throw resp.error;
       resp.data?.forEach((x,i)=>{if(x.signedUrl)links[builtin[i]]=x.signedUrl;});
     }
     if(imports.length){
       // Only thumbnails belonging to this owner's imported patterns qualify.
       const allowed=await admin.from("pc_imports").select("thumbnail_path,original_path").eq("user_id",uid).limit(250);
       if(allowed.error)throw allowed.error;
       const approved=new Set((allowed.data||[]).map(x=>x.thumbnail_path||x.original_path).filter(Boolean));
       const safe=imports.filter(p=>p.startsWith(uid+"/imports/")&&approved.has(p));
       if(safe.length){
         const resp=await admin.storage.from("pc-family-imports").createSignedUrls(safe,1200);
         if(resp.error)throw resp.error;
         resp.data?.forEach((x,i)=>{if(x.signedUrl)links[safe[i]]=x.signedUrl;});
       }
     }
     return reply({links});
   }
   const importId=text(body.importId,36);
   if(!importId||!UUID.test(importId))return fail("Printable unavailable",400);
   const {data:imported,error:importError}=await admin.from("pc_imports").select("original_path").eq("user_id",uid).eq("id",importId).maybeSingle();
   if(importError||!imported?.original_path)return fail("Printable unavailable",404);
   const {data:printed,error:signError}=await admin.storage.from("pc-family-imports").createSignedUrl(imported.original_path,120);
   if(signError||!printed?.signedUrl)return fail("Printable unavailable",404);
   return reply({url:printed.signedUrl});
 }catch(error){
   console.error("Profile invite request failed",error instanceof Error?error.message:"Unexpected server error");
   return fail("Unable to complete this request",503);
 }
});
