import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../search-core.js';
import {guestSearchScore} from '../guest-search.js';

// These named cases are deliberately readable outside this test. A relevant or
// irrelevant judgment is grounded in a title, catalog description, or the
// AI reinspection noted in the fixture. These are not claims of human review
// or that every search result in the collection has been verified.
const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const cases = read('./search-benchmark.json');
const catalog = read('../guest-catalog.json');
const metadata = read('../guest-search-metadata.json');
const sharedScore = globalThis.PUMPKIN_SEARCH.score;

function find(name) {
  const rows = catalog.filter(item => item.name === name);
  assert.equal(rows.length, 1, `Benchmark title must uniquely identify a design: ${name}`);
  return rows[0];
}

// Organizer supplies visual data separately; private gallery attaches the same
// exported data to the record. Test both public entry points against the exact
// same judgment so one page cannot silently drift from the other.
function scores(item, query) {
  const data = metadata[item.id] || {};
  return [
    sharedScore({...item, keywords: data.keywords || []}, query, data.visual),
    guestSearchScore({...item, ...data}, query)
  ];
}

for (const example of cases) {
  test(`catalog search benchmark: ${example.query}`, () => {
    for (const name of example.relevant || []) {
      const values = scores(find(name), example.query);
      assert.equal(values[0], values[1], `Organizer and private gallery disagree for ${name}`);
      assert.ok(values[0] > 0, `Expected ${name} for ${example.query}: ${example.reason}`);
    }
    for (const name of example.irrelevant || []) {
      const values = scores(find(name), example.query);
      assert.equal(values[0], values[1], `Organizer and private gallery disagree for ${name}`);
      assert.equal(values[0], -1, `Unexpected ${name} for ${example.query}: ${example.reason}`);
    }
    if (example.rankFirst) {
      const ranked = catalog.map(item => ({item, score: scores(item, example.query)[0]}))
        .filter(result => result.score > 0).sort((a, b) => b.score - a.score);
      assert.equal(ranked[0]?.item.name, example.rankFirst, example.reason);
      assert.ok(ranked[0].score > ranked[1].score, 'The exact title should have a clear lead');
    }
  });
}
