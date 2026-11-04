import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../search-core.js';
import {guestSearchScore} from '../guest-search.js';

const catalog = JSON.parse(readFileSync(new URL('../guest-catalog.json', import.meta.url), 'utf8'));
const metadata = JSON.parse(readFileSync(new URL('../guest-search-metadata.json', import.meta.url), 'utf8'));
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
