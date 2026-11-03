import test from 'node:test';
import assert from 'node:assert/strict';
import {findBrowser} from './browser-executable.mjs';
test('Linux browser discovery prefers Chrome, supports explicit paths and fails on invalid configuration',()=>{
 const paths=new Set(['/usr/bin/google-chrome','/usr/bin/chromium']);
 const exists=path=>paths.has(path);
 assert.equal(findBrowser({override:'',platform:'linux',exists}),'/usr/bin/google-chrome');
 assert.equal(findBrowser({override:'/usr/bin/chromium',platform:'linux',exists}),'/usr/bin/chromium');
 assert.throws(()=>findBrowser({override:'/missing',platform:'linux',exists}),/Configured PUMPKIN_TEST_BROWSER does not exist/);
 paths.delete('/usr/bin/google-chrome');
 assert.equal(findBrowser({override:'',platform:'linux',exists}),'/usr/bin/chromium');
});
