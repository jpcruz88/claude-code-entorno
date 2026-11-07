// Conector vertical del diagrama: un paquete ● con su cola • baja por la columna mientras hay trabajo.
// Sin motor: cada fase da un cuadro. Solo dibujo.

/**
 * Las filas (de arriba abajo) de un conector de `alto` filas en la fase `fase`.
 * En reposo, todo │. Con `activo`, un paquete entra por arriba, baja y sale; la fase da la posición.
 */
export const cuadroConectorV = (alto: number, fase: number, activo: boolean): string[] => {
  const n = Math.max(0, Math.floor(alto))
  if (n === 0) return []
  if (!activo) return Array.from({ length: n }, () => '│')
  // Un ciclo: el paquete recorre las n filas y dos pasos fuera (antes de entrar y después de salir).
  const ciclo = n + 2
  const cabeza = (((Math.floor(fase) % ciclo) + ciclo) % ciclo) - 1
  return Array.from({ length: n }, (_, i) => (i === cabeza ? '●' : i === cabeza - 1 ? '•' : '│'))
}
