// A classic script also runs when index.html is opened directly from disk.
// Check the desktop bridge before importing modules or subscribing to IPC.
(function bootstrap() {
  function showStartupError(title, message) {
    document.querySelector('#record').disabled = true;
    document.querySelector('#status-label').textContent = title;
    document.querySelector('#record-label').textContent = title;
    document.querySelector('#record-help').textContent = message;
    const notice = document.querySelector('#notice');
    notice.textContent = message;
    notice.hidden = false;
  }

  const bridge = window.desktop;
  if (!bridge || !['loadEngine', 'history', 'transcribe', 'onToggle', 'onStatus'].every(key => typeof bridge[key] === 'function')) {
    showStartupError('Open the desktop app',
      'This page needs the desktop speech engine. Close this browser tab and open Whisperflow Local.exe. If running from source, use npm start in the application folder.');
    return;
  }

  import('./app.js').catch(error => {
    console.error('Application startup failed:', error);
    showStartupError('Application could not start',
      `Restart Whisperflow Local.exe. If the problem continues, report this error: ${error.message}`);
  });
})();
