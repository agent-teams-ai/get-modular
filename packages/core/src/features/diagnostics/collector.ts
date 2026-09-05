import type { Diagnostic } from "../authoring/internal.js";
import { compareDiagnostics } from "./order.js";
import type { CanonicalizeDetails, DiagnosticCandidate, DiagnosticCollector } from "./types.js";

const retainedLimit = 256;
const maximumOmitted = 262_144;
const countCeiling = retainedLimit - 1 + maximumOmitted;

function snapshot(candidate: DiagnosticCandidate): DiagnosticCandidate {
  const details = candidate.code === "graph.cycle"
    ? { component: Object.freeze([...candidate.details.component]) }
    : candidate.code === "binding.compatibility-mismatch"
      ? { expectedCompatibility: Object.freeze({ ...candidate.details.expectedCompatibility }),
          actualCompatibility: Object.freeze({ ...candidate.details.actualCompatibility }) }
      : { ...candidate.details };
  // These fixed-depth containers are already closed and normalized by producers.
  // Copy only retained candidates; never collect the complete failure stream.
  return Object.freeze({ ...candidate,
    path: Object.freeze(candidate.path.map(segment => Object.freeze({ ...segment }))),
    coordinate: Object.freeze({ ...candidate.coordinate }),
    details: Object.freeze(details),
  }) as DiagnosticCandidate;
}

/** A per-call max heap over the upstream unique, eligible diagnostic stream. */
export function createDiagnosticCollector(canonicalize: CanonicalizeDetails): DiagnosticCollector {
  const heap: DiagnosticCandidate[] = [];
  let count = 0;
  let saturated = false;
  let peakRetained = 0;
  let comparisons = 0;
  let result: readonly Diagnostic[] | undefined;
  const compare = (left: Diagnostic, right: Diagnostic): number => {
    comparisons = Math.min(Number.MAX_SAFE_INTEGER, comparisons + 1);
    return compareDiagnostics(left, right, canonicalize);
  };
  const addUnique = (candidate: DiagnosticCandidate): void => {
    if (result !== undefined) throw new Error("Diagnostic stream is already finalized");
    if (count < countCeiling) count += 1;
    else saturated = true;
    if (heap.length < retainedLimit) {
      let index = heap.length;
      heap.push(snapshot(candidate));
      peakRetained = heap.length;
      while (index > 0) {
        const parent = (index - 1) >>> 1;
        if (compare(heap[parent]!, heap[index]!) >= 0) break;
        [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
        index = parent;
      }
      return;
    }
    if (compare(candidate, heap[0]!) >= 0) return;
    heap[0] = snapshot(candidate);
    let index = 0;
    for (;;) {
      const left = 2 * index + 1;
      if (left >= heap.length) return;
      const right = left + 1;
      const child = right < heap.length && compare(heap[right]!, heap[left]!) > 0 ? right : left;
      if (compare(heap[index]!, heap[child]!) >= 0) return;
      [heap[index], heap[child]] = [heap[child]!, heap[index]!];
      index = child;
    }
  };
  const finish = (): readonly Diagnostic[] => {
    if (result !== undefined) return result;
    // Sort only the bounded retained set. Release the last candidate before
    // constructing the overflow record, so retained records never exceed K.
    heap.sort(compare);
    if (count > retainedLimit) heap.pop();
    const completed: Diagnostic[] = heap;
    if (count > retainedLimit) completed.push(Object.freeze({
      code: "diagnostics.truncated", phase: "output", path: Object.freeze([]),
      coordinate: Object.freeze({}), details: Object.freeze({ omitted: count - heap.length }),
    }));
    result = Object.freeze(completed);
    return result;
  };
  return Object.freeze({ addUnique, finish, statistics: () => Object.freeze({
    retainedCount: heap.length, peakRetained, comparisons,
    saturatedFailureCount: count, failureCountSaturated: saturated,
  }) });
}
