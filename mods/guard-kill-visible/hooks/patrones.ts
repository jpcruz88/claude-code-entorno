// Mismos casos que ~/.claude/rules/matar-procesos.md y guard-kill.py: matar por nombre o en masa.
const PATRONES: ReadonlyArray<readonly [string, RegExp]> = [
  ['pkill', /\bpkill\b/i],
  ['killall', /\bkillall\b/i],
  ['pgrep | xargs kill', /\bpgrep\b[^\n]*\|\s*xargs\s+kill\b/i],
  ['kill -1 / kill 0', /\bkill\s+(?:-1|0)(?!\d)/i],
  ['taskkill /IM', /\btaskkill\b[^\n]*\s\/{1,2}im\b/i],
  ['taskkill /FI IMAGENAME', /\btaskkill\b[^\n]*\/{1,2}fi\s+["']?imagename/i],
  ['tskill', /\btskill\s+(?!\d+\b)[^\s/]/i],
  ['Stop-Process -Name', /\bStop-Process\b[^\n]*\s-Name\b/i],
  ['Get-Process | Stop-Process', /\bGet-Process\b(?![^|\n]*-Id\b)[^|\n]*\|\s*Stop-Process\b/i],
]

export function detectarMatarPorNombre(comando: string): string | undefined {
  return PATRONES.find(([, patron]) => patron.test(comando))?.[0]
}
