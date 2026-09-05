// Owner-local numeric min-heap. Ranks follow ASCII implementation-ID order;
// no locale, registration order, string concatenation or policy callback.
export class ReadyQueue {
  readonly #items: number[] = [];
  comparisons: number = 0;
  peakSize: number = 0;

  get size(): number { return this.#items.length; }
  #less(left: number, right: number): boolean { this.comparisons += 1; return left < right; }

  push(value: number): void {
    let index = this.#items.length;
    this.#items.push(value);
    this.peakSize = Math.max(this.peakSize, this.#items.length);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.#less(value, this.#items[parent]!)) break;
      this.#items[index] = this.#items[parent]!;
      index = parent;
    }
    this.#items[index] = value;
  }

  take(): number {
    if (this.#items.length === 0) throw new Error("Empty internal graph ready queue");
    const first = this.#items[0]!;
    const last = this.#items.pop()!;
    if (this.#items.length > 0) {
      let index = 0;
      while (index * 2 + 1 < this.#items.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.#items.length && this.#less(this.#items[child + 1]!, this.#items[child]!)) child += 1;
        if (!this.#less(this.#items[child]!, last)) break;
        this.#items[index] = this.#items[child]!;
        index = child;
      }
      this.#items[index] = last;
    }
    return first;
  }
}
