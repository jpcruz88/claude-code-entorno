import { expect, test } from 'claude-code/testing'

import { gitdirDe, ramaDeHead } from '../hooks/rama'

test('ramaDeHead lee la rama o el commit suelto, y gitdirDe sigue un worktree', () => {
  expect(ramaDeHead('ref: refs/heads/main\n')).toBe('main')
  expect(ramaDeHead('ref: refs/heads/feature/x-1\r\n')).toBe('feature/x-1')
  expect(ramaDeHead('0123456789abcdef0123456789abcdef01234567\n')).toBe('0123456')
  expect(ramaDeHead('')).toBe(null)
  expect(ramaDeHead('basura')).toBe(null)
  expect(gitdirDe('gitdir: C:/repo/.git/worktrees/w1\n')).toBe('C:/repo/.git/worktrees/w1')
  expect(gitdirDe('ref: refs/heads/main')).toBe(null)
})
