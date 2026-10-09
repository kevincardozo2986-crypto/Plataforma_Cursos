import {
  changeType,
  markOnlyCorrect,
  newDraft,
  QuestionDraft,
  toQuestionDrafts,
  toQuestionInputs,
  validateQuestion,
} from './evaluation-mapper';

const draft = (overrides: Partial<QuestionDraft> = {}): QuestionDraft => ({
  ...newDraft('SINGLE'),
  text: '¿2+2?',
  options: [
    { text: '3', correct: false },
    { text: '4', correct: true },
  ],
  ...overrides,
});

describe('toQuestionInputs', () => {
  it('opción única: manda las opciones con su correcta y limpia espacios', () => {
    expect(
      toQuestionInputs([
        draft({
          text: '  ¿2+2?  ',
          points: 2,
          options: [
            { text: ' 3 ', correct: false },
            { text: '4', correct: true },
          ],
        }),
      ]),
    ).toEqual([
      {
        type: 'SINGLE',
        text: '¿2+2?',
        points: 2,
        options: [
          { text: '3', isCorrect: false },
          { text: '4', isCorrect: true },
        ],
      },
    ]);
  });

  it('varias respuestas: manda todas las marcadas', () => {
    const [input] = toQuestionInputs([
      draft({
        type: 'MULTIPLE',
        options: [
          { text: 'TypeScript', correct: true },
          { text: 'Python', correct: true },
          { text: 'Excel', correct: false },
        ],
      }),
    ]);

    expect(input.options?.filter((option) => option.isCorrect)).toHaveLength(2);
  });

  it('verdadero o falso: manda isTrue y nada de opciones', () => {
    expect(toQuestionInputs([draft({ type: 'TRUE_FALSE', isTrue: false })])).toEqual([
      { type: 'TRUE_FALSE', text: '¿2+2?', points: 1, isTrue: false },
    ]);
  });

  it('completar la palabra: manda las respuestas aceptadas, sin vacías', () => {
    expect(
      toQuestionInputs([draft({ type: 'FILL_BLANK', answers: [' París ', '', 'Ciudad Luz '] })]),
    ).toEqual([
      { type: 'FILL_BLANK', text: '¿2+2?', points: 1, acceptedAnswers: ['París', 'Ciudad Luz'] },
    ]);
  });

  it('pregunta abierta: solo enunciado y puntos', () => {
    expect(toQuestionInputs([draft({ type: 'ESSAY', points: 4 })])).toEqual([
      { type: 'ESSAY', text: '¿2+2?', points: 4 },
    ]);
  });
});

describe('toQuestionDrafts', () => {
  it('opción única: recupera cuál es la correcta', () => {
    const [result] = toQuestionDrafts([
      {
        type: 'SINGLE',
        text: 'Capital de Francia',
        points: 1,
        options: [
          { text: 'Roma', isCorrect: false },
          { text: 'París', isCorrect: true },
        ],
      },
    ]);

    expect(result.options).toEqual([
      { text: 'Roma', correct: false },
      { text: 'París', correct: true },
    ]);
  });

  it('verdadero o falso: lee cuál de las dos opciones es la correcta', () => {
    const options = (trueIsCorrect: boolean) => [
      { text: 'Verdadero', isCorrect: trueIsCorrect },
      { text: 'Falso', isCorrect: !trueIsCorrect },
    ];

    expect(
      toQuestionDrafts([
        { type: 'TRUE_FALSE', text: 'a b c', points: 1, options: options(false) },
      ])[0].isTrue,
    ).toBe(false);
    expect(
      toQuestionDrafts([
        { type: 'TRUE_FALSE', text: 'a b c', points: 1, options: options(true) },
      ])[0].isTrue,
    ).toBe(true);
  });

  it('completar la palabra: las opciones son las respuestas aceptadas', () => {
    const [result] = toQuestionDrafts([
      {
        type: 'FILL_BLANK',
        text: 'Capital',
        points: 1,
        options: [
          { text: 'París', isCorrect: true },
          { text: 'Ciudad Luz', isCorrect: true },
        ],
      },
    ]);

    expect(result.answers).toEqual(['París', 'Ciudad Luz']);
  });

  it('una pregunta abierta no trae opciones', () => {
    const [result] = toQuestionDrafts([{ type: 'ESSAY', text: 'Explica', points: 4, options: [] }]);

    expect(result.type).toBe('ESSAY');
    expect(result.points).toBe(4);
  });

  it('un quiz antiguo sin tipo se deduce de las opciones correctas', () => {
    const options = (flags: boolean[]) =>
      flags.map((isCorrect, i) => ({ text: `o${i}`, isCorrect }));

    expect(
      toQuestionDrafts([{ text: 'a b c', points: 1, options: options([true, false]) }])[0].type,
    ).toBe('SINGLE');
    expect(
      toQuestionDrafts([{ text: 'a b c', points: 1, options: options([true, true, false]) }])[0]
        .type,
    ).toBe('MULTIPLE');
  });

  it('es la inversa de toQuestionInputs en opción única', () => {
    const original = [
      draft({
        text: 'Pregunta uno',
        points: 3,
        options: [
          { text: 'a', correct: false },
          { text: 'b', correct: false },
          { text: 'c', correct: true },
        ],
      }),
    ];
    const backend = toQuestionInputs(original).map((input) => ({
      type: input.type,
      text: input.text,
      points: input.points,
      options: (input.options ?? []).map((option) => ({ ...option })),
    }));

    expect(toQuestionDrafts(backend)).toEqual(original);
  });
});

describe('changeType', () => {
  const multi = draft({
    type: 'MULTIPLE',
    options: [
      { text: 'a', correct: true },
      { text: 'b', correct: true },
      { text: 'c', correct: false },
    ],
  });

  it('a opción única deja solo la primera correcta', () => {
    expect(changeType(multi, 'SINGLE').options.map((o) => o.correct)).toEqual([true, false, false]);
  });

  it('a otros tipos no toca nada más', () => {
    const result = changeType(multi, 'ESSAY');

    expect(result.type).toBe('ESSAY');
    expect(result.options).toEqual(multi.options);
  });
});

describe('markOnlyCorrect', () => {
  it('deja marcada una sola', () => {
    expect(
      markOnlyCorrect(
        [
          { text: 'a', correct: true },
          { text: 'b', correct: false },
        ],
        1,
      ).map((o) => o.correct),
    ).toEqual([false, true]);
  });
});

describe('validateQuestion', () => {
  it('una pregunta bien hecha no tiene error', () => {
    expect(validateQuestion(draft())).toBeNull();
  });

  it('exige enunciado y puntos válidos', () => {
    expect(validateQuestion(draft({ text: 'a' }))).toContain('enunciado');
    expect(validateQuestion(draft({ points: 0 }))).toContain('puntos');
    expect(validateQuestion(draft({ points: 1.5 }))).toContain('puntos');
  });

  it('opción única: una sola correcta y sin opciones vacías', () => {
    expect(
      validateQuestion(
        draft({
          options: [
            { text: 'a', correct: false },
            { text: 'b', correct: false },
          ],
        }),
      ),
    ).toContain('correcta');
    expect(
      validateQuestion(
        draft({
          options: [
            { text: 'a', correct: true },
            { text: ' ', correct: false },
          ],
        }),
      ),
    ).toContain('opciones');
    expect(validateQuestion(draft({ options: [{ text: 'a', correct: true }] }))).toContain(
      '2 opciones',
    );
  });

  it('varias respuestas: al menos 2 correctas y 1 incorrecta', () => {
    const multiple = (flags: boolean[]) =>
      draft({ type: 'MULTIPLE', options: flags.map((correct, i) => ({ text: `o${i}`, correct })) });

    expect(validateQuestion(multiple([true, false, false]))).toContain('al menos 2');
    expect(validateQuestion(multiple([true, true]))).toContain('incorrecta');
    expect(validateQuestion(multiple([true, true, false]))).toBeNull();
  });

  it('completar la palabra: al menos una respuesta aceptada', () => {
    expect(validateQuestion(draft({ type: 'FILL_BLANK', answers: ['', '  '] }))).toContain(
      'respuesta',
    );
    expect(validateQuestion(draft({ type: 'FILL_BLANK', answers: ['París'] }))).toBeNull();
  });

  it('verdadero o falso y abierta no piden más', () => {
    expect(validateQuestion(draft({ type: 'TRUE_FALSE', options: [] }))).toBeNull();
    expect(validateQuestion(draft({ type: 'ESSAY', options: [] }))).toBeNull();
  });
});
