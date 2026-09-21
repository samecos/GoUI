/**
 * Read-only variation provider. The session adapter reads the existing server graph.
 * Input: { board, toPlay, candidate, generation }.
 * Options: { signal: AbortSignal } cancels the correlated WebSocket request.
 * Output: { moves: [{ index: null|0..360, color: 1|2 }], available, generation, version }.
 */
let provider = async () => ({ available: false, moves: [] });
export function configureVariationProvider(next) { provider = next; }
export function requestVariation(request, options) { return provider(request, options); }

export function createVariationHover({ request = requestVariation, onResult, onPending = () => {}, onError = () => {}, delay = 300, refreshInterval = 1000 }) {
  let timer, controller, generation = 0;
  function cancel() {
    clearTimeout(timer);
    controller?.abort();
    controller = undefined;
    generation++;
  }
  function schedule(payload, { immediate = false } = {}) {
    cancel();
    const current = generation;
    async function fetchVariation(refreshing = false) {
      controller = new AbortController();
      const { signal } = controller;
      try {
        onPending({refreshing});
        const result = await request(payload, { signal });
        if (current === generation && !signal.aborted) onResult(result, payload);
      } catch (error) {
        if (current === generation && !signal.aborted) onError(error);
      } finally {
        // Wait for completion before scheduling again: slow responses never overlap.
        if (current === generation && !signal.aborted) {
          controller = undefined;
          timer = setTimeout(() => fetchVariation(true), refreshInterval);
        }
      }
    }
    if (immediate) void fetchVariation();
    else timer = setTimeout(() => fetchVariation(), delay);
  }
  return { schedule, cancel };
}
