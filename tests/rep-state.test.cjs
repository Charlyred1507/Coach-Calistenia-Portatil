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
    lungeMetricsV1010: pose => pose,
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

function lunge() {
  const c = context();
  const functions = ['newLungeV1010', 'resetLungeV1010', 'lungeTopishV1010',
    'updateLungeTopV1010', 'lungePelvisDropV1010', 'lungeBottomEvidenceV1010',
    'lungeProgressV1010', 'updateLungeMemoryV1010', 'bestLungeBottomV1010',
    'matchLungeWorkingLegV1010', 'lungeFinishV1010', 'lungeClearMemoryV1010',
    'judgeLungeV1010'];
  vm.runInContext(code('LUNGE_V1010', 'const') + '\n' +
    functions.map(name => code(name)).join('\n') +
    '\nlet lungeV1010 = newLungeV1010();', c);
  return c;
}
const metric = (knee, hip, y, side = 'L') => ({
  sides: [{ side, kneeAngle: knee, hipAngle: hip, scale: 100,
    confidence: .95, knee: { x: 100, y: 200 }, ankle: { x: 100, y: 300 } }],
  pelvis: { x: 100, y }, scale: 100, confidence: .95
});
function completeLunge(c, t, side = 'L') {
  c.judgeLungeV1010(metric(170, 170, 100, side), t);
  c.judgeLungeV1010(metric(90, 90, 125, side), t + 100);
  c.judgeLungeV1010(metric(90, 90, 125, side), t + 200);
  c.judgeLungeV1010(metric(170, 170, 100, side), t + 400);
  c.judgeLungeV1010(metric(170, 170, 100, side), t + 500);
}
test('lunge: two incomplete descents cannot share depth evidence', () => {
  const c = lunge();
  c.judgeLungeV1010(metric(170, 170, 100), 0);
  c.judgeLungeV1010(metric(120, 125, 105), 100);
  for (let t = 200; t < 5000; t += 500) c.judgeLungeV1010(metric(170, 170, 100), t);
  c.judgeLungeV1010(metric(135, 135, 115), 5000);
  c.judgeLungeV1010(metric(135, 135, 115), 5100);
  c.judgeLungeV1010(metric(170, 170, 100), 5200);
  c.judgeLungeV1010(metric(170, 170, 100), 5300);
  assert.equal(c.accepted, 0);
});
test('lunge: consecutive full reps still count with either leg', () => {
  for (const secondSide of ['L', 'R']) {
    const c = lunge();
    completeLunge(c, 0);
    completeLunge(c, 600, secondSide);
    assert.equal(c.accepted, 2);
  }
});
test('lunge: the other straight leg must not close the working-leg descent', () => {
  const c = lunge();
  function twoLegs(knee, hip, y) {
    const m = metric(knee, hip, y);
    m.sides.push(metric(170, 170, y, 'R').sides[0]);
    return m;
  }
  c.judgeLungeV1010(twoLegs(170, 170, 100), 0);
  for (const t of [100, 200, 300]) c.judgeLungeV1010(twoLegs(90, 90, 125), t);
  c.judgeLungeV1010(twoLegs(170, 170, 100), 400);
  c.judgeLungeV1010(twoLegs(170, 170, 100), 500);
  assert.equal(c.accepted, 1);
});
test('lunge: an occluded working leg cannot be replaced by an upright resting leg', () => {
  const c = lunge();
  c.judgeLungeV1010(metric(170, 170, 100), 0);
  c.judgeLungeV1010(metric(135, 135, 110), 100);
  c.judgeLungeV1010(metric(170, 170, 100, 'R'), 200);
  c.judgeLungeV1010(metric(170, 170, 100, 'R'), 300);
  assert.equal(c.rejected.length, 0);
  c.judgeLungeV1010(metric(90, 90, 125), 400);
  c.judgeLungeV1010(metric(90, 90, 125), 500);
  c.judgeLungeV1010(metric(170, 170, 100), 600);
  c.judgeLungeV1010(metric(170, 170, 100), 700);
  assert.equal(c.accepted, 1);
});
test('lunge: a reversed media clock cannot retain the previous descent', () => {
  const c = lunge();
  c.judgeLungeV1010(metric(170, 170, 100), 1000);
  c.judgeLungeV1010(metric(90, 90, 125), 1100);
  c.judgeLungeV1010(metric(90, 90, 125), 1200);
  c.judgeLungeV1010(metric(170, 170, 100), 0);
  assert.equal(vm.runInContext('lungeV1010.state', c), 'ready');
  c.judgeLungeV1010(metric(170, 170, 100), 100);
  assert.equal(c.accepted, 0);
});
test('lunge: global attempt invalidation clears pending depth', () => {
  const c = lunge();
  c.loseAttempt = () => {};
  const hook = source.match(/^const loseAttemptLungeV1010Base=loseAttempt;[^]*?^};/m);
  assert.ok(hook, 'lunge must be connected to global invalidation');
  vm.runInContext(hook[0], c);
  c.judgeLungeV1010(metric(170, 170, 100), 0);
  c.judgeLungeV1010(metric(90, 90, 125), 100);
  c.judgeLungeV1010(metric(90, 90, 125), 200);
  c.loseAttempt();
  c.judgeLungeV1010(metric(170, 170, 100), 400);
  c.judgeLungeV1010(metric(170, 170, 100), 500);
  assert.equal(c.accepted, 0);
  completeLunge(c, 600);
  assert.equal(c.accepted, 1);
});
