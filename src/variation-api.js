/**
 * Read-only variation provider. The session adapter reads the existing server graph.
 * Input: { board, toPlay, candidate, generation }.
 * Options: { signal: AbortSignal } cancels the correlated WebSocket request.
 * Output: { moves: [{ index: null|0..360, color: 1|2 }], available, generation, version }.
 */
let provider = async () => ({ available: false, moves: [] });
export function configureVariationProvider(next) { provider = next; }
export function requestVariation(request, options) { return provider(request, options); }

export function createVariationHover({ request = requestVariation, onResult, onPending = () => {}, onError = () => {}, delay = 300 }) {
  let timer, controller, generation = 0;
  function cancel() {
    clearTimeout(timer);
    controller?.abort();
    controller = undefined;
    generation++;
  }
  function schedule(payload) {
    cancel();
    const current = generation;
    timer = setTimeout(async () => {
      controller = new AbortController();
      const { signal } = controller;
      onPending();
      try {
        const result = await request(payload, { signal });
        if (current === generation && !signal.aborted) onResult(result, payload);
      } catch (error) {
        if (current === generation && !signal.aborted) onError(error);
      }
    }, delay);
  }
  return { schedule, cancel };
}
