// Conector horizontal del diagrama: el paquete ● con su cola (• y ·) avanza de izquierda a derecha por la línea
// mientras hay trabajo, y termina en ▶. Sin motor: cada fase da un cuadro. Solo dibujo.

/**
 * La línea de `ancho` celdas en la fase `fase`: ─ en reposo, con la flecha ▶ al final.
 * Con `activo`, un paquete entra por la izquierda, cruza y sale; la fase da la posición.
 */
export const cuadroConectorH = (ancho: number, fase: number, activo: boolean): string => {
  const w = Math.max(0, Math.floor(ancho))
  if (w === 0) return ''
  if (w === 1) return '▶'
  const n = w - 1
  const celdas: string[] = Array.from({ length: n }, () => '─')
  if (activo) {
    // Un ciclo: el paquete recorre las n celdas y cuatro pasos fuera (antes de entrar y después de salir, con su cola).
    const ciclo = n + 4
    const cabeza = (((Math.floor(fase) % ciclo) + ciclo) % ciclo) - 1
    const pon = (i: number, c: string) => {
      if (i >= 0 && i < n) celdas[i] = c
    }
    pon(cabeza, '●')
    pon(cabeza - 1, '•')
    pon(cabeza - 2, '·')
  }
  return celdas.join('') + '▶'
}
