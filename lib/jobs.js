'use strict';
// The background job queue (main process): converting files, making thumbnails and previews, and the like. One heavy
// and two light jobs run at a time, the user's own requests before background work. Asking for the same thing twice
// (the same key) gives the same job. Jobs not finished when Wallpane closes start again next time (save/load). Every
// change is reported through notify(list): at once when a job starts, ends or is added, and progress at most
// four times a second. The list keeps the last KEEP jobs that ended.
//
// createJobs({ kinds, notify, save, load, limits })
//   kinds: { name: { heavy: bool, transient: bool, run(job, ctx) -> Promise<result> } }; ctx = { signal, progress(0..1) }
//     transient: work for what is on screen now; not saved for next time, and gone from the list when cancelled
//     before it started
//   save(pending): store [{ kind, key, label, input, priority }]; load() -> that list
// Returns { add, cancel, list, clearFinished, idle }.
const KEEP = 100;
function createJobs(o) {
  const kinds = o.kinds || {}, limits = Object.assign({ heavy: 1, light: 2 }, o.limits);
  const jobs = [];
  let seq = 0, timer = null, loading = false;
  const ended = (j) => j.state !== 'queued' && j.state !== 'running';

  function view(j) {
    return { id: j.id, kind: j.kind, key: j.key, label: j.label, priority: j.priority, state: j.state, progress: j.progress, error: j.error, result: j.result };
  }
  function list() { return jobs.map(view); }
  function report(now) {
    if (now) { clearTimeout(timer); timer = null; if (o.notify) o.notify(list()); return; }
    if (!timer) timer = setTimeout(() => { timer = null; if (o.notify) o.notify(list()); }, 250);
  }
  function persist() {
    if (o.save) o.save(jobs.filter((j) => !ended(j) && !kinds[j.kind].transient).map((j) => ({ kind: j.kind, key: j.key, label: j.label, input: j.input, priority: j.priority })));
  }
  // The oldest jobs that ended make way once there are more than KEEP.
  function trim() {
    let n = jobs.filter(ended).length;
    for (let i = 0; n > KEEP && i < jobs.length;) { if (ended(jobs[i])) { jobs.splice(i, 1); n--; } else i++; }
  }

  // Starts what may start: the user's jobs first, then the oldest; heavy and light jobs each up to their limit.
  function pump() {
    if (loading) return;
    const running = (heavy) => jobs.filter((j) => j.state === 'running' && !!kinds[j.kind].heavy === heavy).length;
    const waiting = jobs.filter((j) => j.state === 'queued').sort((a, b) => (a.priority === 'user' ? 0 : 1) - (b.priority === 'user' ? 0 : 1) || a.id - b.id);
    waiting.forEach((j) => {
      const heavy = !!kinds[j.kind].heavy;
      if (running(heavy) >= (heavy ? limits.heavy : limits.light)) return;
      start(j);
    });
  }
  function start(j) {
    j.state = 'running'; j.ctrl = new AbortController();
    report(true); persist();
    const ctx = { signal: j.ctrl.signal, progress: (p) => { j.progress = Math.max(0, Math.min(1, p)); report(false); } };
    Promise.resolve().then(() => kinds[j.kind].run(j, ctx)).then((result) => {
      j.state = 'done'; j.progress = 1; j.result = result === undefined ? null : result;
    }, (err) => {
      j.state = j.ctrl.signal.aborted || (err && err.code === 'CANCELLED') ? 'cancelled' : 'failed';
      j.error = j.state === 'failed' ? String((err && err.message) || err) : null;
    }).then(() => {
      j.ctrl = null; trim(); report(true); persist();
      if (j.state === 'done') j.resolve(j.result); else j.reject(Object.assign(new Error(j.error || 'Cancelled'), { code: j.state === 'cancelled' ? 'CANCELLED' : 'FAILED' }));
      pump();
    });
  }

  // { kind, key, label, input, priority: 'user' | 'background' } -> the job (a running or waiting one with the same key
  // is returned as it is; a user request lifts a waiting background job to the front). job.promise ends with its result.
  function add(spec) {
    if (!kinds[spec.kind]) throw new Error('Unknown kind of job: ' + spec.kind);
    const key = spec.key || spec.kind + ':' + (++seq);
    const same = jobs.find((j) => j.key === key && (j.state === 'queued' || j.state === 'running'));
    if (same) {
      if (spec.priority === 'user' && same.priority !== 'user') { same.priority = 'user'; report(true); persist(); pump(); }
      return same;
    }
    const j = { id: ++seq, kind: spec.kind, key, label: spec.label || spec.kind, input: spec.input, priority: spec.priority === 'user' ? 'user' : 'background', state: 'queued', progress: 0, error: null, result: null, ctrl: null };
    j.promise = new Promise((res, rej) => { j.resolve = res; j.reject = rej; });
    j.promise.catch(() => {});   // nobody has to wait for a job
    const old = jobs.findIndex((x) => x.key === key);   // a finished job with this key makes way for the new one
    if (old > -1) jobs.splice(old, 1);
    jobs.push(j);
    report(true); persist(); pump();
    return j;
  }
  function cancel(id) {
    const j = jobs.find((x) => x.id === id);
    if (!j) return false;
    if (j.state === 'running') { j.ctrl.abort(); return true; }
    if (j.state !== 'queued') return false;
    j.state = 'cancelled';
    if (kinds[j.kind].transient) jobs.splice(jobs.indexOf(j), 1); else trim();
    report(true); persist();
    j.reject(Object.assign(new Error('Cancelled'), { code: 'CANCELLED' }));
    return true;
  }
  // Forget the jobs that ended (done, failed or cancelled).
  function clearFinished() {
    for (let i = jobs.length - 1; i >= 0; i--) if (ended(jobs[i])) jobs.splice(i, 1);
    report(true);
  }
  // Resolves when nothing is waiting or running (for tests and shutdown).
  function idle() {
    return new Promise((res) => {
      (function check() { if (jobs.some((j) => j.state === 'queued' || j.state === 'running')) setTimeout(check, 20); else res(); })();
    });
  }

  // Jobs from last time: all read back first, then the queue picks what starts.
  loading = true;
  (o.load ? o.load() || [] : []).forEach((s) => { if (kinds[s.kind]) add(s); });
  loading = false;
  pump();
  return { add, cancel, list, clearFinished, idle };
}

module.exports = { createJobs, KEEP };
