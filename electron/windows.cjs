const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createWindowsIntegration() {
  if (process.platform !== 'win32') return null;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const foreground = user32.func('uintptr_t __stdcall GetForegroundWindow()');
  const windowThread = user32.func('uint32_t __stdcall GetWindowThreadProcessId(uintptr_t hwnd, void *pid)');
  const guiInfo = user32.func('int __stdcall GetGUIThreadInfo(uint32_t thread, void *info)');
  const keyState = user32.func('int16_t __stdcall GetAsyncKeyState(int key)');
  const sendInput = user32.func('uint32_t __stdcall SendInput(uint32_t count, const void *inputs, int size)');
  const pointerBytes = koffi.sizeof('void *');
  const inputSize = pointerBytes === 8 ? 40 : 28;
  const keyboardOffset = pointerBytes === 8 ? 8 : 4;
  function keyDown(key) { return (keyState(key) & 0x8000) !== 0; }
  function sendKeys(events) {
    const bytes = Buffer.alloc(inputSize * events.length);
    events.forEach(({ key, up = false }, index) => {
      const offset = index * inputSize;
      bytes.writeUInt32LE(1, offset); // INPUT_KEYBOARD
      bytes.writeUInt16LE(key, offset + keyboardOffset);
      bytes.writeUInt32LE((up ? 2 : 0) | ([0xa3].includes(key) ? 1 : 0), offset + keyboardOffset + 4);
    });
    if (sendInput(events.length, bytes, inputSize) !== events.length)
      throw new Error('Windows blocked pasting into this app. Your text is copied; paste it manually.');
  }
  function captureTarget() {
    const hwnd = foreground();
    if (!hwnd) return null;
    const pid = Buffer.alloc(4);
    const thread = windowThread(hwnd, pid);
    if (!thread || pid.readUInt32LE(0) === process.pid) return null;
    const info = Buffer.alloc(pointerBytes === 8 ? 72 : 48);
    info.writeUInt32LE(info.length, 0);
    if (!guiInfo(thread, info)) return null;
    const focus = pointerBytes === 8 ? info.readBigUInt64LE(16) : BigInt(info.readUInt32LE(12));
    if (!focus) return null;
    return { window: String(hwnd), focus: String(focus), pid: pid.readUInt32LE(0) };
  }
  function sameTarget(expected) {
    const current = captureTarget();
    return current && expected && current.window === expected.window &&
      current.focus === expected.focus && current.pid === expected.pid;
  }
  async function paste(text, target, writeClipboard) {
    writeClipboard(text);
    // Wait for the shortcut keys to be released. Never release the user's keys ourselves.
    const deadline = Date.now() + 2500;
    while ([0x10, 0x11, 0x12, 0x5b, 0x5c].some(keyDown)) {
      if (Date.now() > deadline) return { pasted: false, message: 'Text copied · release keys and press Ctrl+V' };
      await sleep(25);
    }
    if (!sameTarget(target)) return { pasted: false, message: 'Focus changed · text copied, press Ctrl+V' };
    sendKeys([{ key: 0x11 }, { key: 0x56 }, { key: 0x56, up: true }, { key: 0x11, up: true }]);
    return { pasted: true, message: 'Pasted into your text box' };
  }
  function watchHold(onPress, onRelease) {
    let down = keyDown(0xa3);
    const interval = setInterval(() => {
      const next = keyDown(0xa3);
      if (next !== down) { down = next; next ? onPress() : onRelease(); }
    }, 20);
    interval.unref();
    return () => clearInterval(interval);
  }
  return { captureTarget, paste, watchHold, keyDown, sendKeys };
}
module.exports = { createWindowsIntegration };
