'use strict';
/**
 * Regenerate the bundled notification sounds that are SYNTHESIZED.
 *
 * Not every bundled sound is generated any more: the four task slots ship an
 * authored recorded take (see `lib/slots.js`). This script therefore renders and
 * verifies only the slots marked `shipped: 'tone'`, and for a recorded slot it
 * verifies the opposite thing — that a playable take is actually committed —
 * instead of comparing it against a tone. A recorded file is NEVER written:
 * overwriting a recording with a generated tone would silently replace the
 * feature's factory default, which is precisely the mistake this guard exists to
 * make impossible.
 *
 * Run it after editing a tone definition:
 *
 *   node scripts/build-sounds.js
 *   node scripts/build-sounds.js --check   # verify the committed files
 */

const fs = require('fs');
const path = require('path');
const { renderWav, parseWav } = require('../lib/tone.js');
const { SLOTS, SLOT_IDS } = require('../lib/slots.js');

const OUT_DIR = path.join(__dirname, '..', 'sounds');
const checkOnly = process.argv.includes('--check');

let problems = 0;
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const id of SLOT_IDS) {
  /* The file name is the slot's own (`lib/slots.js`), not `<id>.wav`: the four
     recorded takes ship under the names they were authored with. */
  const name = SLOTS[id].file;
  const target = path.join(OUT_DIR, name);

  if (SLOTS[id].shipped === 'recorded') {
    const bytes = fs.existsSync(target) ? fs.readFileSync(target) : undefined;
    if (bytes === undefined) {
      problems += 1;
      console.log(`MISSING  ${name} (${id}) — the recorded default must ship with the package`);
      continue;
    }
    const parsed = parseWav(bytes);
    if (parsed === undefined || parsed.bitsPerSample !== 16) {
      problems += 1;
      console.log(`UNPLAYABLE ${name} (${id}) — expected 16-bit PCM (got ${parsed === undefined ? 'no PCM data' : parsed.bitsPerSample + '-bit'})`);
      continue;
    }
    console.log(`kept     ${name} (${id}, ${bytes.length} bytes, ${parsed.sampleRate} Hz ${parsed.channels}ch — recorded default, never regenerated)`);
    continue;
  }

  const bytes = renderWav(SLOTS[id]);
  const existing = fs.existsSync(target) ? fs.readFileSync(target) : undefined;
  if (existing !== undefined && existing.equals(bytes)) {
    console.log(`ok       ${name} (${id}, ${bytes.length} bytes)`);
    continue;
  }
  if (checkOnly) {
    problems += 1;
    console.log(`DRIFTED  ${name} (${id}) — run: node scripts/build-sounds.js`);
    continue;
  }
  fs.writeFileSync(target, bytes);
  console.log(`${existing === undefined ? 'created ' : 'updated '} ${name} (${id}, ${bytes.length} bytes)`);
}
if (problems > 0) {
  console.error(`\n${problems} sound file(s) out of date.`);
  process.exitCode = 1;
} else if (checkOnly) {
  console.log('\nall sound files are up to date.');
}
