export function createStore(initial) {
  let state = Object.freeze(initial);
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) { state = Object.freeze({ ...state, ...patch }); for (const listener of listeners) listener(state); },
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); }
  };
}
