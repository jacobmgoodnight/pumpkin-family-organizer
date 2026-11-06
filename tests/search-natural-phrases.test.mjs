import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../search-core.js';
import {guestSearchScore} from '../guest-search.js';

const catalog = JSON.parse(readFileSync(new URL('../guest-catalog.json', import.meta.url), 'utf8'));
const metadata = JSON.parse(readFileSync(new URL('../guest-search-metadata.json', import.meta.url), 'utf8'));
const details = JSON.parse(readFileSync(new URL('../guest-pattern-details.json', import.meta.url), 'utf8'));
const matching = (item, query) => {
  const extra = metadata[item.id] || {};
  const organizer = globalThis.PUMPKIN_SEARCH.score({...item, keywords: extra.keywords || []}, query, extra.visual);
  const guest = guestSearchScore({...item, ...extra}, query);
  assert.equal(organizer, guest, `Organizer and private gallery differ for ${item.name}: ${query}`);
  return organizer >= 0;
};

test('joined title finds Spider-Man without introducing other spider designs', () => {
  const found = catalog.filter(item => matching(item, 'spiderman')).map(item => item.name);
  assert.ok(found.includes('Spider-Man'));
  assert.ok(!found.includes('Spiteful Spider'));
  assert.ok(!found.includes('Spider'));
});

test('joined words match only consecutive title words, not fuzzy tags or descriptions', () => {
  const item = {id: 'example', name: 'Nighttime Hero', visual: {description: 'A spider man on a building', tags: ['spider', 'man']}};
  assert.equal(globalThis.PUMPKIN_SEARCH.score(item, 'spiderman'), -1);
  assert.equal(guestSearchScore(item, 'spiderman'), -1);
  assert.ok(globalThis.PUMPKIN_SEARCH.score({name: 'Spider-Man'}, 'spiderman') > 0);
  assert.equal(globalThis.PUMPKIN_SEARCH.score({name: 'Spider Woman'}, 'spiderman'), -1);
});

test('trailing medium words do not hide subject matches or add unrelated subjects', () => {
  for (const query of ['cat pumpkin', 'cat pumpkin stencil', 'cat carving']) {
    for (const item of catalog) {
      assert.equal(matching(item, query), matching(item, 'cat'), `${query}: ${item.name}`);
    }
  }
});

test('standalone and leading pumpkin remain meaningful, and exact titles rank first', () => {
  const score = globalThis.PUMPKIN_SEARCH.score;
  assert.ok(score({name: 'Pumpkin King'}, 'pumpkin') > 0);
  assert.equal(score({name: 'Cat'}, 'pumpkin'), -1);
  assert.ok(score({name: 'Pumpkin King'}, 'pumpkin king') > score({name: 'King of Jacks', visual: {description: 'Pumpkin king'}}, 'pumpkin king'));
  assert.equal(score({name: 'King of Jacks'}, 'pumpkin king'), -1);
  assert.ok(score({name: 'Cat Pumpkin'}, 'cat pumpkin') > score({name: 'Cat'}, 'cat pumpkin'));
});

test('natural difficulty words use source labels and explicit descriptions on both pages', () => {
  const score = globalThis.PUMPKIN_SEARCH.score;
  const examples = [
    [{name: 'Ghost', difficulty: 'Level 1'}, 'easy ghost', true],
    [{name: 'Ghost', difficulty: 'Level 2'}, 'easy ghost', false],
    [{name: 'Ghost', difficulty: 'Level 3'}, 'medium ghost', true],
    [{name: 'Ghost', difficulty: 'Level 5'}, 'advanced ghost', true],
    [{name: 'Ghost', difficulty: 'Level 4'}, 'hard ghost', false],
    [{name: 'Ghost', difficulty: ''}, 'easy ghost', false],
    [{name: 'Ghost', visual: {description:'A simple ghost', tags:[]}}, 'easy ghost', true],
    [{name: 'Easy Ghost', difficulty: 'Level 5'}, 'easy ghost', true],
    [{name: 'Ghost', difficulty: 'beginner'}, 'simple ghost', true],
    [{name: 'Cat', difficulty: 'Level 1'}, 'easy ghost', false],
    [{name: 'Ghost', tags:['Simple Stories']}, 'easy ghost', false],
  ];
  for (const [item, query, matches] of examples) {
    assert.equal(score(item,query)>=0, matches, `organizer: ${query} ${JSON.stringify(item)}`);
    assert.equal(guestSearchScore(item,query)>=0, matches, `guest: ${query} ${JSON.stringify(item)}`);
  }
  assert.ok(score({name:'Easy Ghost',difficulty:'Level 5'},'easy ghost')>score({name:'Ghost',difficulty:'Level 1'},'easy ghost'));
  assert.equal(score({name:'Ghost',difficulty:'Level 1'},'easy'),-1, 'standalone word is literal');
  assert.equal(score({name:'Ghost',difficulty:'Level 1'},'easy hard ghost'),-1, 'conflicting descriptors are literal');
  assert.doesNotThrow(()=>score({name:'Constructor Ghost'},'constructor ghost'));
  assert.match(globalThis.PUMPKIN_SEARCH.interpretation('easy ghost'), /Level 1.*not verified/);
  assert.equal(globalThis.PUMPKIN_SEARCH.interpretation('easy'), '');
  assert.equal(globalThis.PUMPKIN_SEARCH.interpretation('easy hard ghost'), '');
});

test('real catalog easy ghost results use source Level 1 without losing literal simple descriptions', () => {
  const withDetails = catalog.map(item => ({...item,...(details[item.id]||{}),...(metadata[item.id]||{})}));
  const results = withDetails.filter(item => guestSearchScore(item, 'easy ghost') >= 0);
  assert.ok(results.some(item => item.name === 'Boo Ghost' && item.difficulty === 'Level 1'));
  assert.ok(results.some(item => item.name === 'Happy Ghost' && item.difficulty === 'Level 1'));
  for (const item of withDetails.filter(item => guestSearchScore(item,'simple ghost') >= 0)) {
    assert.ok(guestSearchScore(item,'easy ghost') >= 0, item.name);
  }
});
