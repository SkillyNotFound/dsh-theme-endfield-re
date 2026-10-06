'use strict';
/**
 * Sound-slot definitions for the audio-notification feature.
 *
 * One entry per slot: the moment it marks (so the settings page and the docs can
 * describe them without a second source of truth), the file name it looks for,
 * and WHERE its shipped default comes from.
 *
 * `file` is the ONE name a slot answers to, in every candidate directory — the
 * configured directory, the workspace root, the Desktop and the bundled
 * `sounds/`. `lib/audio.js` reads the name from here instead of deriving
 * `<slot>.wav`, so a slot may ship a recording under whatever name the audio was
 * authored with (`turn-done` ships `end.wav`) without the two spellings drifting
 * apart. Renaming a take therefore means editing this table, not the file.
 *
 * `shipped` says what the file under `sounds/` IS:
 *
 *   'recorded'  an authored take, shipped byte for byte. `scripts/build-sounds.js`
 *               never regenerates these (overwriting a recording with a tone
 *               would silently replace the factory default). The four task slots
 *               — 任务开始 / 任务结束 / 需要你回应 / 出错 — are recorded; the
 *               measured format, length and level of each take is tabulated in
 *               docs/audio-notifications.md.
 *   'tone'      an electronic tone GENERATED from the note definition below, so
 *               the package's musical identity stays described by code instead of
 *               by a binary (启动加载动画音 only).
 *
 * The synthesized designs the four recorded takes replaced are in git history
 * (`sounds/*.wav` before they were swapped); no live consumer kept the note data,
 * which is why it is gone rather than dormant here.
 *
 * Wired to events by the host half: `boot` (the loader plates), `turn-start` /
 * `turn-done`. Wired from the PAGE side: `attention` (the confirmation-panel
 * watcher plus the host waterfalls). NOT wired at all: `turn-fail`, which ships
 * a sound and a switch on purpose so an error needing no human decision stays
 * silent.
 */

const SLOTS = {
  /**
   * 启动加载动画 —— the boot plate starts. A rising three-note figure (G4 → D5 →
   * G5), written to land on the G5 the old synthesized task-end chime began from;
   * it is now the one musical, non-voice cue in the set, which is exactly why it
   * is the slot that keeps its generated tone. Fired only on the real
   * once-per-page-load run of the loader, never by a preview button.
   */
  boot: {
    file: 'boot.wav',
    shipped: 'tone',
    duration: 0.95,
    peakDbfs: -3,
    notes: [
      { note: 'G4', start: 0, duration: 0.42, gain: 0.34, timbre: 'blip', decay: 2.2, curve: 2.4 },
      { note: 'D5', start: 0.11, duration: 0.5, gain: 0.32, timbre: 'blip', decay: 1.9, curve: 2.2 },
      { note: 'G5', start: 0.22, duration: 0.7, gain: 0.32, timbre: 'chime', decay: 1.5, curve: 2.0 },
      { note: 'D6', start: 0.34, duration: 0.55, gain: 0.06, timbre: 'chime', decay: 2.0 },
    ],
  },

  /**
   * 任务开始 —— the user submitted a prompt from the composer and the agent is
   * picking it up. Confirms the instruction was received without implying
   * anything finished (shipped take: 5.88 s).
   */
  'turn-start': { file: 'start.wav', shipped: 'recorded' },

  /**
   * 任务结束 —— the agent delivered a final text result. Closing, not
   * celebratory (shipped take: 6.44 s).
   */
  'turn-done': { file: 'end.wav', shipped: 'recorded' },

  /**
   * 需要你回应 —— a human must act: an approval request, one of my questions or a
   * plan review. Deliberately unresolved so it does not read as "done"
   * (shipped take: 6.16 s).
   */
  attention: { file: 'wait.wav', shipped: 'recorded' },

  /**
   * 出错 —— the turn failed. Ships a take as well, even though nothing is wired
   * to the slot yet (shipped take: 4.36 s).
   */
  'turn-fail': { file: 'erro.wav', shipped: 'recorded' },
};

/** Slot ids in playback/preview order. */
const SLOT_IDS = ['boot', 'turn-start', 'turn-done', 'attention', 'turn-fail'];

module.exports = { SLOTS, SLOT_IDS };
