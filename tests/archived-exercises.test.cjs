const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const context = vm.createContext({ EXERCISES: { pushup: { name: 'Push-up' } } });
const archive = source.match(/^const ARCHIVED_EXERCISES=.*;$/m);
const label = source.match(/^function exerciseLabel\(id\).*$/m);
const validate = source.match(/^function validateImport\(o\).*$/m);
assert.ok(archive && label && validate);
vm.runInContext([archive[0], label[0], validate[0]].join('\n'), context);
const ids = vm.runInContext('[...ARCHIVED_EXERCISES]', context);
function backup(exercise) {
  return {
    format: 'calistenia-var', schema: 1, samples: [],
    session: {
      id: 'archived-session', participant: {}, events: [], audit: [],
      plan: [{ exercise, target: 3 }], duration: 20, revision: 1, rounds: 1
    }
  };
}
test('archived evidence remains readable without reactivating exercise labels', () => {
  for (const id of ids) {
    const original = backup(id);
    const before = JSON.stringify(original);
    context.validateImport(original);
    assert.equal(JSON.stringify(original), before);
    assert.equal(context.exerciseLabel(id), 'Ejercicio retirado');
    assert.equal(context.EXERCISES[id], undefined);
  }
  assert.equal(context.exerciseLabel('pushup'), 'Push-up');
});
test('unknown exercises and malformed archive data remain rejected', () => {
  assert.throws(() => context.validateImport(backup('unknown-exercise')));
  const invalid = backup(ids[0]);
  invalid.session.duration = -1;
  assert.throws(() => context.validateImport(invalid));
});
