// Use an explicitly configured executable exactly as requested, or choose a
// browser known to the current platform. CI configures a required executable.
import {existsSync} from 'node:fs';
export function findBrowser({override=process.env.PUMPKIN_TEST_BROWSER,platform=process.platform,exists=existsSync}={}){
 if(override){
  if(!exists(override))throw new Error(`Configured PUMPKIN_TEST_BROWSER does not exist: ${override}`);
  return override;
 }
 const candidates=platform==='win32'?
  ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']:
  platform==='linux'?['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser']:[];
 return candidates.find(path=>exists(path));
}
