/** Each archived defect patches one emitted JavaScript anchor in one isolated package copy. */
export const defects = [
  {
    id: "leak-detached", file: "features/store/engine.js", mayHang: false,
    find: "    unlink(registration) {\n        this.#registrations.delete(registration);",
    replace: "    unlink(registration) {\n        (StoreEngine.detachedRegistrations ??= []).push(registration);\n        this.#registrations.delete(registration);",
  },
  {
    id: "no-key-index", file: "features/store/engine.js", mayHang: false,
    find: "for (const registration of this.#buckets.get(key) ?? []) {",
    replace: "for (const registration of this.#registrations) {",
  },
  {
    id: "unbounded-dirty", file: "features/store/engine.js", mayHang: false,
    find: "#dirty = new Set();",
    replace: `#dirty = new class {
      entries = [];
      add(value) { this.entries.push(value); return this; }
      delete(value) { this.entries = this.entries.filter(entry => entry !== value); }
      clear() { this.entries = []; }
      get size() { return this.entries.length; }
      [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
    }();`,
  },
  {
    id: "queue-loads", file: "features/store/load.js", mayHang: false,
    find: `    #clearPending() {
        const job = this.#pending;
        if (job !== undefined) {
            this.#pending = undefined;
            this.#engine.counters.loadsPending -= 1;
            pending.loads -= 1;
        }
        return job;
    }
    #offer(job, live) {
        if (!this.#open || job.revision <= this.#lastOffered)
            return;
        this.#lastOffered = job.revision;
        this.#engine.invoke({ depth: job.depth, origin: this.origin, live }, job.revision, () => this.#callbacks.onLoading(job.snapshot));
        // A callback or its reporter can synchronously close the subscriber or source.
        if (!this.#open)
            return;
        if (this.#active === undefined) {
            this.#start(job);
            return;
        }
        if (this.#pending === undefined) {
            this.#engine.counters.loadsPending += 1;
            pending.loads += 1;
        }
        this.#pending = job;
        this.#abort(this.#active.controller);
    }`,
    replace: `    #clearPending() {
        const jobs = this.#pending;
        if (jobs === undefined) return undefined;
        const removed = this.#open ? 1 : jobs.length;
        const job = jobs.shift();
        this.#engine.counters.loadsPending -= removed;
        pending.loads -= removed;
        if (!this.#open || jobs.length === 0) this.#pending = undefined;
        return job;
    }
    #offer(job, live) {
        if (!this.#open || job.revision <= this.#lastOffered) return;
        this.#lastOffered = job.revision;
        this.#engine.invoke({ depth: job.depth, origin: this.origin, live }, job.revision, () => this.#callbacks.onLoading(job.snapshot));
        if (!this.#open) return;
        if (this.#active === undefined) { this.#start(job); return; }
        (this.#pending ??= []).push(job);
        this.#engine.counters.loadsPending += 1;
        pending.loads += 1;
        this.#abort(this.#active.controller);
    }`,
  },
  {
    id: "late-detach", file: "features/store/engine.js", mayHang: false,
    find: 'registration.resources.signal.addEventListener("abort", registration.detach, { once: true });',
    replace: "void registration;",
  },
  {
    id: "no-name-check", file: "features/store/admission.js", mayHang: false,
    find: "if (names.has(name)) {", replace: "if (false) {",
  },
  {
    id: "publish-stale", file: "features/store/load.js", mayHang: false,
    find: "return this.#open && !controller.signal.aborted && job.revision === this.#lastOffered\n            && job.revision === this.#engine.latest(this.keys);",
    replace: "return true;",
  },
  {
    id: "compare-last-offered", file: "features/store/load.js", mayHang: false,
    find: "return this.#open && !controller.signal.aborted && job.revision === this.#lastOffered\n            && job.revision === this.#engine.latest(this.keys);",
    replace: "return this.#open && !controller.signal.aborted && job.revision === this.#lastOffered;",
  },
  {
    id: "no-loading-signal", file: "features/store/load.js", mayHang: false,
    find: "this.#engine.invoke({ depth: job.depth, origin: this.origin, live }, job.revision, () => this.#callbacks.onLoading(job.snapshot));",
    replace: "void live;",
  },
  {
    id: "no-cascade-guard", file: "features/store/engine.js", mayHang: true,
    find: "else if (depth > MAX_CASCADE_DEPTH) {", replace: "else if (false) {",
  },
  {
    id: "retain-after-close", file: "features/store/engine.js", mayHang: false,
    find: "            registration.detach();\n            registration.release();",
    replace: "            void registration;",
  },
  {
    id: "no-scope-limit", file: "features/store/admission.js", mayHang: false,
    find: "if (names.size >= engine.options.maxSubscriptionsPerScope) {", replace: "if (false) {",
  },
  {
    id: "no-echo-guard", file: "features/store/engine.js", mayHang: true,
    find: "if (context.origin.engine === this.token && changed.some(([key]) => context.origin.keys.includes(key))) {",
    replace: "if (false) {",
  },
  {
    id: "no-async-context", file: "features/delivery/platform.js", mayHang: false,
    find: 'const hooks = builtin("node:async_hooks");', replace: "const hooks = undefined;",
  },
  {
    id: "facet-read-after-close", file: "features/store/store.js", mayHang: false,
    find: "read: (keys) => engine.read(keys),", replace: "read: (keys) => engine.readOwner(keys),",
  },
  {
    id: "unbounded-context", file: "features/delivery/context.js", mayHang: false,
    find: "return context?.live.open === true ? context : undefined;", replace: "return context;",
  },
  {
    id: "global-timers-only", file: "features/delivery/platform.js", mayHang: false,
    find: "const fromTimers = timers?.setImmediate;", replace: "const fromTimers = undefined;",
  },
  {
    id: "rewalk-frozen", file: "features/store/values.js", mayHang: false,
    find: " || frozenNodes.has(value)", replace: "",
  },
];
