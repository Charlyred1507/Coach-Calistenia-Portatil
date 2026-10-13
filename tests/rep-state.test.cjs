const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function code(name, kind = 'function') {
  const pattern = kind === 'function'
    ? new RegExp('^function ' + name + '\\([^]*?^}', 'm')
    : new RegExp('^const ' + name + '\\s*=\\s*{[^]*?^};', 'm');
  const match = source.match(pattern);
  assert.ok(match, 'Missing implementation: ' + name);
  return match[0];
}
function context() {
  const elements = new Map();
  const state = {
    adv: {}, advPending: null, accepted: 0, rejected: [],
    performance: { now: () => 0 },
    $: id => {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    },
    markVisible() {}, missingWarning() {}, updateMetrics() {},
    setStatus() {}, setProgress() {}, trackMinAngle() {}, resetAttemptMetrics() {},
    clamp: (v, low, high) => Math.max(low, Math.min(high, v)),
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    acceptAdvanced: amount => { state.accepted += amount; },
    noRep: reason => { state.rejected.push(reason); },
    frontleverMetricsV95: pose => pose,
    handstandMetricsV96: pose => pose,
    frontleverReasonV95: () => 'invalid', handstandReasonV96: () => 'invalid',
    renderFrontleverV95() {}, renderHandstandV96() {}
  };
  return vm.createContext(state);
}

const validHold = {
  strictValid: true, sustainValid: true, confidence: .95,
  arm: { elbow: 170 }, hip: { torsoTilt: 0 }, leg: { legTilt: 0 },
  torso: { hipRise: 1 }
};
for (const [exercise, suffix, config] of [
  ['frontlever', 'FrontleverV95', 'FL95'], ['handstand', 'HandstandV96', 'HS96']
]) {
  function hold() {
    const c = context();
    vm.runInContext(code(config, 'const') + '\n' +
      code('reset' + suffix + 'Hard') + '\n' +
      code('credit' + suffix) + '\n' + code('judge' + suffix), c);
    c.adv = { holdValid: true, holdMs: 4900, credited: 0,
      fl95LastAt: 0, fl95LastStrictAt: 0, fl95GoodFrames: 2,
      hs96LastAt: 0, hs96LastStrictAt: 0, hs96EntrySince: 0 };
    return c;
  }
  test(exercise + ': separated holds cannot complete the same five-second block', () => {
    const c = hold();
    c['judge' + suffix]({}, 100);
    c['judge' + suffix]({}, 650);
    c['judge' + suffix](validHold, 700);
    c['judge' + suffix](validHold, 750);
    assert.equal(c.accepted, 0);
    assert.ok(c.adv.holdMs < 500);
    for (let t = 800; t <= 5800; t += 50) c['judge' + suffix](validHold, t);
    assert.equal(c.accepted, 5, 'a new uninterrupted hold still earns credit');
  });
  test(exercise + ': a short tracking gap preserves the existing bridge', () => {
    const c = hold();
    c['judge' + suffix]({}, 100);
    c['judge' + suffix](validHold, 200);
    assert.equal(c.accepted, 5);
  });
  test(exercise + ': include the return-frame interval in the bridge limit', () => {
    const bridge = vm.runInContext(config + '.bridge', hold());
    for (const extra of [0, 1]) {
      const c = hold();
      c['judge' + suffix]({}, 100);
      c['judge' + suffix](validHold, bridge + extra);
      assert.equal(c.accepted, extra ? 0 : 5);
    }
  });
  test(exercise + ': sparse observations cannot manufacture hold time', () => {
    const c = hold();
    c['judge' + suffix](validHold, 800);
    assert.equal(c.accepted, 0);
  });
}
