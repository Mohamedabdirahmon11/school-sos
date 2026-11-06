import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classGradeMismatchError } from '../src/server/class-grade-validation.ts';

test('grade labels must agree with their numeric grade level', () => {
  assert.equal(classGradeMismatchError('Grade 1', 1), null);
  assert.equal(classGradeMismatchError('Grade 12 A', 12), null);
  assert.equal(classGradeMismatchError('KG', 0), null);
  assert.equal(classGradeMismatchError('Kindergarten A', 0), null);
  assert.match(classGradeMismatchError('Grade 1', 0) || '', /conflicts with selected Grade 0/);
  assert.match(classGradeMismatchError('Grade 1', 2) || '', /conflicts with selected Grade 2/);
  assert.match(classGradeMismatchError('KG', 1) || '', /must use KG grade level/);
});
