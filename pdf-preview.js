// First-page preview for a PDF selected by the user, rendered locally in the browser.
// Deferred import: no PDF renderer is downloaded until an import needs it.
const moduleUrl="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const workerUrl="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
let cached;
export async function makePdfThumbnail(file){
 if(file?.type!=="application/pdf"||file.size<1||file.size>20*1024*1024)throw Error("PDF must be between 1 byte and 20 MB.");
 cached??=import(moduleUrl).catch(error=>{cached=null;throw error;});
 const lib=await cached;lib.GlobalWorkerOptions.workerSrc=workerUrl;
 const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),stopAtErrors:true});
 try{
   const pdf=await task.promise;if(!pdf.numPages)throw Error("PDF has no pages.");
   const page=await pdf.getPage(1),initial=page.getViewport({scale:1});
   const scale=Math.min(2,780/initial.width,980/initial.height);
   if(!(scale>0)&&Number.isFinite(scale))throw Error("Invalid PDF page.");
   const viewport=page.getViewport({scale}),canvas=document.createElement("canvas");
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw Error("Canvas unavailable.");
   await page.render({canvasContext:ctx,viewport}).promise;
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Preview encoding failed")),"image/png"));
   canvas.width=canvas.height=0;
   if(!blob.size||blob.size>20*1024*1024)throw Error("Generated image too large.");
   return new File([blob],"pdf-first-page.png",{type:"image/png"});
 }finally{try{await task.destroy()}catch{}}
}
