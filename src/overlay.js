const capsule = document.querySelector('#capsule');
window.indicator.onState(state => {
  capsule.dataset.phase = state.phase;
  const labels = { loading: ['Loading model…', 'Local speech engine'], ready: ['Ready', 'Hold Right Ctrl to talk'], requesting: ['Starting microphone…', 'Release Right Ctrl to finish'], recording: ['Listening', 'Release Right Ctrl to finish'], finishing: ['Transcribing…', 'Keep your text box focused'], error: ['Engine needs attention', 'Open history from the tray'] };
  document.querySelector('#label').textContent = state.message || labels[state.phase][0];
  document.querySelector('#hint').textContent = ['requesting', 'recording'].includes(state.phase)
    ? (state.mode === 'hold' ? 'Release Right Ctrl to finish' : 'Click the capsule to finish') : labels[state.phase][1];
  document.querySelector('#toggle').disabled = !['ready', 'recording', 'requesting'].includes(state.phase);
  document.querySelector('#symbol').textContent = state.phase === 'recording' ? '■' : '●';
  document.querySelectorAll('#meter i').forEach((bar, i) => {
    bar.style.height = `${4 + (state.phase === 'recording' ? state.level * (9 + i * 4) : 0)}px`;
  });
});
document.querySelector('#toggle').addEventListener('click', () => window.indicator.toggle());
