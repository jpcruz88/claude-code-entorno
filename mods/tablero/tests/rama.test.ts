import { expect, test } from 'claude-code/testing'

import { TOPE_LECTURA } from '../hooks/core'
import { gitdirDe, ramaDeHead } from '../hooks/rama'

test('ramaDeHead lee la rama o el commit suelto, y gitdirDe sigue un worktree', () => {
  expect(ramaDeHead('ref: refs/heads/main\n')).toBe('main')
  expect(ramaDeHead('ref: refs/heads/feature/x-1\r\n')).toBe('feature/x-1')
  expect(ramaDeHead('0123456789abcdef0123456789abcdef01234567\n')).toBe('0123456')
  expect(ramaDeHead('')).toBe(null)
  expect(ramaDeHead('basura')).toBe(null)
  expect(gitdirDe('ref: refs/heads/main', '/srv/demo/proj')).toBe(null)
  expect(gitdirDe('gitdir: C:/repo/.git/worktrees/w1\n', '/srv/demo/proj')).toBe('C:/repo/.git/worktrees/w1')
})

test('gitdirDe resuelve una ruta relativa contra la carpeta que tiene el .git', () => {
  expect(gitdirDe('gitdir: ../repo/.git/worktrees/w1\n', '/srv/demo/proj/wt')).toBe('/srv/demo/proj/wt/../repo/.git/worktrees/w1')
  expect(gitdirDe('gitdir: /srv/demo/repo/.git/worktrees/w1\n', '/srv/demo/proj/wt')).toBe('/srv/demo/repo/.git/worktrees/w1')
})

test('ramaDeHead quita los controles del nombre de la rama', () => {
  const r = ramaDeHead('ref: refs/heads/mi\x1b[2Jrama\x07\n')
  expect(r).toBe('mi[2Jrama')
  expect(r).not.toContain('\x1b')
})

test('un HEAD mayor que el tope no da rama', () => {
  expect(ramaDeHead(`ref: refs/heads/${'a'.repeat(TOPE_LECTURA)}`) === null).toBe(true)
})
