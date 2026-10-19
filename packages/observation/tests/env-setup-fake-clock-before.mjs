Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => 123 } });
Date.now = () => 123;
