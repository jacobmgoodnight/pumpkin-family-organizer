// Keeps private family links working longer, alongside pumpkin-profile-invites.
// Organizers can see recently expired links and extend them: the same secret link
// keeps working, so remembered devices and Home Screen icons are not broken.
// The holder of a rejected link can ask why: expired (a parent can extend it) or
// replaced. Deployed with verify_jwt false; every request is checked here.
import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const ORIGIN="https://jacobmgoodnight.github.io";
const CORS={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Vary":"Origin"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
const fail=(message:string,status=400)=>reply({error:message},status);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN=/^[a-zA-Z0-9_-]{43}$/;
const DAY=86400000;
// Organizers can still see and extend a link for this long after it expires.
const EXPIRED_GRACE_MS=30*DAY;
const text=(v:unknown,max:number)=>typeof v==="string"&&v.length<=max?v:null;
async function digest(v:string){
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)));
 return Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
}
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEYS=Deno.env.get("SUPABASE_SECRET_KEYS");
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||(()=>{try{return JSON.parse(SERVICE_KEYS||"{}").default||"";}catch{return"";}})();

Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(request.method!=="POST")return fail("Method not allowed",405);
 if(request.headers.get("origin")&&request.headers.get("origin")!==ORIGIN)return fail("Origin forbidden",403);
 if(!SUPABASE_URL||!SERVICE_KEY)return fail("Invitation service unavailable",503);
 if(Number(request.headers.get("content-length")||0)>4000)return fail("Request too large",413);
 let body:Record<string,unknown>;
 try{const source=await request.text();if(source.length>4000)return fail("Request too large",413);body=JSON.parse(source);if(!body||Array.isArray(body)||typeof body!=="object")throw Error("Bad payload");}
 catch{return fail("Invalid request",400);}
 const action=text(body.action,30)||"";
 const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
   if(action==="status"){
     // For the holder of a link only. A revoked link never reveals whose it was.
     const token=text(body.token,43);
     if(!token||!TOKEN.test(token))return reply({reason:"unknown"});
     const {data:invite,error}=await admin.from("pc_profile_invites").select("owner_id,person_id,expires_at,revoked_at").eq("token_hash",await digest(token)).maybeSingle();
     if(error)throw error;
     if(!invite)return reply({reason:"unknown"});
     if(invite.revoked_at)return reply({reason:"replaced"});
     if(Date.parse(invite.expires_at)>Date.now())return reply({reason:"active",expiresAt:invite.expires_at});
     const {data:person}=await admin.from("pc_people").select("display_name").eq("user_id",invite.owner_id).eq("person_id",invite.person_id).maybeSingle();
     return reply({reason:"expired",name:typeof person?.display_name==="string"?person.display_name:null,expiredAt:invite.expires_at});
   }
   if(action!=="list"&&action!=="extend")return fail("Unsupported action",400);
   // Organizer actions: the real parent session, never a family member's link.
   const jwt=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
   if(jwt.length<100||jwt.length>5000)return fail("Organizer sign-in required",401);
   const {data:{user},error:authError}=await admin.auth.getUser(jwt);
   if(authError||!user||user.is_anonymous||!user.email)return fail("Organizer sign-in required",401);
   const uid=user.id;
   const membership=await admin.from("pc_accounts").select("user_id").eq("user_id",uid).maybeSingle();
   if(membership.error||!membership.data)return fail("Family organizer account not found",403);
   if(action==="list"){
     const since=new Date(Date.now()-EXPIRED_GRACE_MS).toISOString();
     const {data,error}=await admin.from("pc_profile_invites").select("id,person_id,created_at,expires_at").eq("owner_id",uid).is("revoked_at",null).gt("expires_at",since).order("created_at",{ascending:false}).limit(30);
     if(error)throw error;
     return reply({invites:data||[]});
   }
   const id=text(body.id,36);
   if(!id||!UUID.test(id))return fail("Invalid invitation",400);
   const days=body.days===7?7:body.days===14?14:30;
   const {data:current,error:readError}=await admin.from("pc_profile_invites").select("expires_at").eq("owner_id",uid).eq("id",id).is("revoked_at",null).maybeSingle();
   if(readError)throw readError;
   if(!current)return fail("This link was replaced or revoked. Create a new link instead.",404);
   // Never shortens a link.
   const target=new Date(Math.max(Date.parse(current.expires_at)||0,Date.now()+days*DAY)).toISOString();
   const {data:updated,error:updateError}=await admin.from("pc_profile_invites").update({expires_at:target}).eq("owner_id",uid).eq("id",id).is("revoked_at",null).select("id,person_id,expires_at").maybeSingle();
   if(updateError)throw updateError;
   if(!updated)return fail("This link was replaced or revoked. Create a new link instead.",404);
   return reply({id:updated.id,personId:updated.person_id,expiresAt:updated.expires_at});
 }catch(error){
   console.error("Invite renewal request failed",error instanceof Error?error.message:"Unexpected server error");
   return fail("Unable to complete this request",503);
 }
});
