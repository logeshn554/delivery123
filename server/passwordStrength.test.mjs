import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordStrength, passwordStrengthLabel } from '../src/auth/passwordStrength.ts';

test('password strength provides useful guidance without changing minimum validity rules', () => {
  assert.equal(passwordStrength(''), 0);
  assert.equal(passwordStrength('abcdefgh'), 1);
  assert.equal(passwordStrength('Abcdefghi1'), 3);
  assert.equal(passwordStrength('CorrectHorse12!'), 4);
  assert.equal(passwordStrengthLabel(0), 'Weak');
  assert.equal(passwordStrengthLabel(2), 'Fair');
  assert.equal(passwordStrengthLabel(4), 'Strong');
});
