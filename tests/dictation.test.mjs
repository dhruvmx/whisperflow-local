import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DictationController } = require('../electron/dictation-controller.cjs');
function setup() {
  const commands = [], states = [], pastes = [];
  const target = { window: '1', focus: '2', pid: 123 };
  const controller = new DictationController({ native: {
    captureTarget: () => target,
    paste: async (text, field) => { pastes.push({ text, field }); return { pasted: true, message: 'Pasted' }; }
  }, onCommand: c => commands.push(c), onState: s => states.push(s), writeClipboard: () => {} });
  controller.update({ phase: 'ready' });
  return { controller, commands, states, pastes, target };
}
test('hold release during microphone setup stops the same recording, including delayed history updates', () => {
  const { controller, commands } = setup();
  controller.start('hold');
  controller.update({ phase: 'ready' }); // old preview archived before getUserMedia completes
  controller.releaseHold();
  assert.deepEqual(commands.map(x => x.action), ['start', 'stop']);
  assert.equal(controller.start('hold'), false);
});
test('a completed hold session pastes once into its captured target', async () => {
  const { controller, commands, pastes, target } = setup();
  controller.start('hold'); const id = commands[0].id;
  controller.update({ phase: 'finishing' });
  assert.equal((await controller.complete({ id, text: 'A dictated sentence.' })).pasted, true);
  await assert.rejects(controller.complete({ id, text: 'duplicate' }));
  assert.deepEqual(pastes, [{ text: 'A dictated sentence.', field: target }]);
});
test('manual recordings and silent sessions do not type into another app', async () => {
  const { controller, pastes } = setup();
  const id = controller.begin('manual');
  await controller.complete({ id, text: 'A saved note.' });
  controller.update({ phase: 'ready' });
  controller.start('hold');
  await controller.complete({ id: controller.session.id, text: '' });
  assert.equal(pastes.length, 0);
});
test('toggle sessions do not stop on Right Ctrl release and busy sessions cannot be restarted', () => {
  const { controller, commands } = setup();
  controller.toggle(); controller.releaseHold();
  assert.equal(commands.length, 1);
  controller.update({ phase: 'recording' }); controller.toggle();
  assert.equal(commands.at(-1).action, 'stop');
  controller.update({ phase: 'finishing' });
  assert.equal(controller.toggle(), false);
});
