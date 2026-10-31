'use strict';
// One at a time, the latest first: for what a resting pointer asks for (hover previews, timeline pictures). While one is
// being made, only the one asked for last waits; any other asked for meanwhile gets null (the pointer has moved on,
// and asks again when it comes back). Asking again for the one being made, or the one waiting, gives its promise.
//
// createLatest(make) -> { get(key, arg) -> Promise<make(arg)'s result | null> }   make(arg) -> Promise; a failure is null
function createLatest(make) {
  let running = null, next = null;   // { key, promise } being made; { key, arg, resolve, promise } waiting
  function pump() {
    if (running || !next) return;
    const job = next;
    next = null; running = job;
    Promise.resolve().then(() => make(job.arg)).then(job.resolve, () => job.resolve(null)).then(() => { running = null; pump(); });
  }
  function get(key, arg) {
    if (running && running.key === key) return running.promise;
    if (next && next.key === key) return next.promise;
    if (next) next.resolve(null);
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    next = { key, arg, resolve, promise };
    pump();
    return promise;
  }
  return { get };
}

module.exports = { createLatest };
