// Private Node 24 CDP transport. No discovery outside the owned profile.
export function bounded(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: timeout`)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function connectCDP(url) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1' ||
      !endpoint.port || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash ||
      !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(endpoint.pathname)) {
    throw new Error('invalid owned CDP endpoint');
  }
  const socket = new WebSocket(endpoint);
  const pending = new Map();
  const listeners = new Set();
  let sequence = 0;
  let stopped = false;
  function fail(error) {
    stopped = true;
    for (const item of pending.values()) item.reject(error);
    pending.clear();
    for (const item of listeners) item.reject(error);
    listeners.clear();
  }
  socket.addEventListener('close', () => fail(new Error('CDP closed')));
  socket.addEventListener('error', () => fail(new Error('CDP transport error')));
  socket.addEventListener('message', event => {
    try {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const item = pending.get(message.id);
        if (!item) return;
        pending.delete(message.id);
        if (message.error) item.reject(new Error(JSON.stringify(message.error)));
        else item.resolve(message.result);
      } else {
        for (const item of [...listeners]) {
          if (item.method === message.method && item.sessionId === message.sessionId) {
            listeners.delete(item);
            item.resolve(message.params);
          }
        }
      }
    } catch (error) {
      fail(error);
      socket.close();
    }
  });
  try {
    await bounded(new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
      socket.addEventListener('close', reject, { once: true });
    }), 10_000, 'CDP connection');
  } catch (error) {
    socket.close();
    throw error;
  }
  return {
    call(method, params = {}, sessionId, milliseconds = 30_000) {
      if (stopped) return Promise.reject(new Error('CDP unavailable'));
      const id = ++sequence;
      return bounded(new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          socket.send(JSON.stringify({ id, method, params, sessionId }));
        } catch (error) {
          pending.delete(id);
          reject(error);
        }
      }), milliseconds, method).finally(() => pending.delete(id));
    },
    event(method, sessionId) {
      let item;
      const promise = bounded(new Promise((resolve, reject) => {
        item = { method, sessionId, resolve, reject };
        listeners.add(item);
      }), 30_000, method).finally(() => listeners.delete(item));
      // Navigation can fail before the caller awaits the event.
      promise.catch(() => {});
      return promise;
    },
    close() {
      fail(new Error('CDP disposed'));
      socket.close();
    },
  };
}
