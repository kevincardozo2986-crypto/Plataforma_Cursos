export interface Positioned {
  id: number;
  position: number;
}

export interface PositionChange {
  id: number;
  position: number;
}

/**
 * Mueve el elemento de `from` a `to` (índices de la lista tal como se muestra)
 * y devuelve solo los cambios de posición necesarios, numerando de 1 a n.
 * Renumerar todo evita posiciones repetidas si el orden ya venía desordenado.
 */
export function moveItem(items: Positioned[], from: number, to: number): PositionChange[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [];
  }

  const ordered = [...items];
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);

  return ordered
    .map((item, index) => ({ id: item.id, position: index + 1 }))
    .filter((change) => items.find((item) => item.id === change.id)?.position !== change.position);
}
