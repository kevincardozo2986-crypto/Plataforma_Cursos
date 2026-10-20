import { describe, expect, it } from 'vitest';
import { studyStreak } from './study-streak.js';
describe('Racha de estudio en Colombia', () => {
  const now = new Date('2026-10-19T17:00:00Z');
  const dates = (...values: string[]) => values.map(value => new Date(value));
  it('muestra de lunes a domingo aunque hoy sea lunes', () => {
    const result = studyStreak([], now);
    expect(result.week[0].date).toBe('2026-10-19');
    expect(result.week[0].today).toBe(true);
    expect(result.week[6].date).toBe('2026-10-25');
  });
  it('comienza en cero sin actividad', () => {
    const result = studyStreak([], now);
    expect(result.days).toBe(0);
    expect(result.week).toHaveLength(7);
    expect(result.studiedToday).toBe(false);
  });
  it('cuenta días distintos aunque haya varias lecciones', () => {
    expect(studyStreak(dates('2026-10-19T12:00:00Z','2026-10-19T16:00:00Z','2026-10-18T16:00:00Z'),now).days).toBe(2);
  });
  it('conserva ayer mientras el estudiante aún puede estudiar hoy', () => {
    const result = studyStreak(dates('2026-10-18T16:00:00Z','2026-10-17T16:00:00Z'),now);
    expect(result.days).toBe(2);
    expect(result.studiedToday).toBe(false);
  });
  it('reinicia tras un día perdido y no cuenta fechas futuras', () => {
    expect(studyStreak(dates('2026-10-17T16:00:00Z','2026-10-20T16:00:00Z'),now).days).toBe(0);
  });
  it('usa medianoche de Colombia y cruza meses correctamente', () => {
    const result = studyStreak(dates('2026-11-01T04:59:59Z','2026-10-30T16:00:00Z'),new Date('2026-11-01T05:00:00Z'));
    expect(result.days).toBe(2);
    expect(result.studiedToday).toBe(false);
    expect(result.week[6].date).toBe('2026-11-01');
    expect(result.week[5].completed).toBe(true);
  });
});
