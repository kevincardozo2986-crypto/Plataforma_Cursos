import { correctIndexAfterRemoving, toQuestionDrafts, toQuestionInputs } from './evaluation-mapper';

describe('toQuestionInputs', () => {
  it('marca como correcta solo la opción elegida y limpia los espacios', () => {
    const result = toQuestionInputs([
      { text: '  ¿2+2?  ', points: 2, correctIndex: 1, options: [' 3 ', '4', '5'] },
    ]);

    expect(result).toEqual([
      {
        text: '¿2+2?',
        points: 2,
        options: [
          { text: '3', isCorrect: false },
          { text: '4', isCorrect: true },
          { text: '5', isCorrect: false },
        ],
      },
    ]);
  });
});

describe('toQuestionDrafts', () => {
  it('recupera el índice de la opción correcta', () => {
    const drafts = toQuestionDrafts([
      {
        text: 'Capital de Francia',
        points: 1,
        options: [
          { text: 'Roma', isCorrect: false },
          { text: 'París', isCorrect: true },
        ],
      },
    ]);

    expect(drafts[0].correctIndex).toBe(1);
    expect(drafts[0].options).toEqual(['Roma', 'París']);
  });

  it('usa 0 si ninguna opción venía marcada', () => {
    const [draft] = toQuestionDrafts([
      {
        text: 'Pregunta',
        points: 1,
        options: [
          { text: 'a', isCorrect: false },
          { text: 'b', isCorrect: false },
        ],
      },
    ]);

    expect(draft.correctIndex).toBe(0);
  });

  it('es la inversa de toQuestionInputs', () => {
    const original = [
      { text: 'Pregunta uno', points: 3, correctIndex: 2, options: ['a', 'b', 'c'] },
    ];

    expect(toQuestionDrafts(toQuestionInputs(original))).toEqual(original);
  });
});

describe('correctIndexAfterRemoving', () => {
  it('vuelve a la primera si se quita la opción correcta', () => {
    expect(correctIndexAfterRemoving(2, 2)).toBe(0);
  });

  it('retrocede un lugar si se quita una opción anterior', () => {
    expect(correctIndexAfterRemoving(2, 0)).toBe(1);
  });

  it('se mantiene si se quita una opción posterior', () => {
    expect(correctIndexAfterRemoving(0, 2)).toBe(0);
  });
});
