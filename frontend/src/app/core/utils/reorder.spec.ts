import { moveItem } from './reorder';

const items = [
  { id: 10, position: 1 },
  { id: 20, position: 2 },
  { id: 30, position: 3 },
];

describe('moveItem', () => {
  it('intercambia dos elementos contiguos y solo cambia esos dos', () => {
    expect(moveItem(items, 0, 1)).toEqual([
      { id: 20, position: 1 },
      { id: 10, position: 2 },
    ]);
  });

  it('mueve el último al principio y renumera a los demás', () => {
    expect(moveItem(items, 2, 0)).toEqual([
      { id: 30, position: 1 },
      { id: 10, position: 2 },
      { id: 20, position: 3 },
    ]);
  });

  it('no hace nada si el movimiento sale de la lista o no cambia nada', () => {
    expect(moveItem(items, 0, 0)).toEqual([]);
    expect(moveItem(items, 0, -1)).toEqual([]);
    expect(moveItem(items, 2, 3)).toEqual([]);
  });

  it('corrige posiciones repetidas al renumerar', () => {
    const repeated = [
      { id: 1, position: 1 },
      { id: 2, position: 1 },
      { id: 3, position: 1 },
    ];

    // Queda 2, 1, 3. El 2 ya tenía la posición 1, así que no necesita cambio.
    expect(moveItem(repeated, 0, 1)).toEqual([
      { id: 1, position: 2 },
      { id: 3, position: 3 },
    ]);
  });
});
