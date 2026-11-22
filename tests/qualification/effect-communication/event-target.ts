import type { ProgressEvent, ProgressSource } from "./progress.ts";

class ProgressNotification extends Event {
  readonly progress: ProgressEvent;
  constructor(progress: ProgressEvent) {
    super("progress");
    this.progress = Object.freeze({ jobId: progress.jobId, completed: progress.completed });
  }
}

/** Concrete synchronous source; EventTarget reports listener exceptions to its Host. */
export function eventTargetProgress(target: EventTarget) {
  const source: ProgressSource = {
    subscribe: listener => {
      const receive = (event: Event): void => {
        if (event instanceof ProgressNotification) listener(event.progress);
      };
      target.addEventListener("progress", receive);
      return () => { target.removeEventListener("progress", receive); return undefined; };
    },
  };
  return {
    source,
    publish(progress: ProgressEvent): void { target.dispatchEvent(new ProgressNotification(progress)); },
  };
}
