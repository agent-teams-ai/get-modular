type Adjacency = readonly (readonly number[])[];
export type GraphComponents = {
  readonly members: readonly (readonly number[])[];
  readonly edgeVisits: number;
  readonly peakFrames: number;
};

// Iterative two-pass SCC decomposition. Both adjacency directions describe
// the same bounded graph. Vertex ranks are private integers, not wire IDs.
export function graphComponents(outgoing: Adjacency, incoming: Adjacency): GraphComponents {
  const seen = new Uint8Array(outgoing.length);
  const finish: number[] = [];
  const frames: { vertex: number; next: number }[] = [];
  let edgeVisits = 0;
  let peakFrames = 0;
  for (let root = 0; root < outgoing.length; root += 1) {
    if (seen[root]) continue;
    seen[root] = 1;
    frames.push({ vertex: root, next: 0 });
    peakFrames = Math.max(peakFrames, frames.length);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const adjacent = outgoing[frame.vertex]!;
      if (frame.next === adjacent.length) { finish.push(frame.vertex); frames.pop(); continue; }
      const target = adjacent[frame.next++]!;
      edgeVisits += 1;
      if (!seen[target]) {
        seen[target] = 1;
        frames.push({ vertex: target, next: 0 });
        peakFrames = Math.max(peakFrames, frames.length);
      }
    }
  }
  seen.fill(0);
  const members: number[][] = [];
  const pending: number[] = [];
  for (let position = finish.length - 1; position >= 0; position -= 1) {
    const root = finish[position]!;
    if (seen[root]) continue;
    const component: number[] = [];
    seen[root] = 1;
    pending.push(root);
    peakFrames = Math.max(peakFrames, pending.length);
    while (pending.length > 0) {
      const vertex = pending.pop()!;
      component.push(vertex);
      for (const target of incoming[vertex]!) {
        edgeVisits += 1;
        if (!seen[target]) {
          seen[target] = 1;
          pending.push(target);
          peakFrames = Math.max(peakFrames, pending.length);
        }
      }
    }
    component.sort((left, right) => left - right);
    members.push(component);
  }
  // Distinct SCCs have disjoint members, so their smallest ranks differ and
  // determine the accepted lexicographic order of their sorted member arrays.
  members.sort((left, right) => left[0]! - right[0]!);
  return { members, edgeVisits, peakFrames };
}
