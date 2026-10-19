import { notificationLink, timeAgo } from './notification-link';
import { NotificationType } from './notifications.service';

const note = (type: NotificationType, courseId: number | null = 3, refId: number | null = 20) => ({
  type,
  courseId,
  refId,
});

describe('notificationLink: docente', () => {
  it('una pregunta o una respuesta llevan al hilo', () => {
    expect(notificationLink(note('NEW_QUESTION'), 'TEACHER')).toEqual([
      '/teacher/discussions',
      '20',
    ]);
    expect(notificationLink(note('NEW_REPLY'), 'TEACHER')).toEqual(['/teacher/discussions', '20']);
  });

  it('sin refId lleva a la bandeja', () => {
    expect(notificationLink(note('NEW_QUESTION', 3, null), 'TEACHER')).toEqual([
      '/teacher/discussions',
    ]);
  });

  it('una reseña lleva a las reseñas', () => {
    expect(notificationLink(note('NEW_REVIEW'), 'TEACHER')).toEqual(['/teacher/reviews']);
  });

  it('un anuncio lleva a anuncios', () => {
    expect(notificationLink(note('ANNOUNCEMENT'), 'TEACHER')).toEqual(['/teacher/announcements']);
  });

  it('que te agreguen como instructor lleva a editar ese curso', () => {
    expect(notificationLink(note('INSTRUCTOR_ADDED', 7, null), 'TEACHER')).toEqual([
      '/teacher',
      'courses',
      '7',
      'edit',
    ]);
    expect(notificationLink(note('INSTRUCTOR_ADDED', null, null), 'TEACHER')).toEqual([
      '/teacher/courses',
    ]);
  });

  it('el administrador se comporta como el docente', () => {
    expect(notificationLink(note('NEW_REVIEW'), 'ADMIN')).toEqual(['/teacher/reviews']);
  });
});

describe('notificationLink: estudiante', () => {
  it.each([
    'ANNOUNCEMENT',
    'NEW_REPLY',
    'GRADED_ASSIGNMENT',
    'GRADED_QUIZ',
    'CERTIFICATE_ISSUED',
  ] as NotificationType[])('%s lleva a la página del curso', (type) => {
    expect(notificationLink(note(type), 'STUDENT')).toEqual(['/courses', '3']);
  });

  it('sin curso no hay a dónde ir', () => {
    expect(notificationLink(note('GRADED_QUIZ', null), 'STUDENT')).toBeNull();
  });

  it('sin rol (sesión aún sin cargar) se trata como estudiante', () => {
    expect(notificationLink(note('ANNOUNCEMENT'), null)).toEqual(['/courses', '3']);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-18T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it.each([
    [10_000, 'hace un momento'],
    [5 * 60_000, 'hace 5 min'],
    [59 * 60_000, 'hace 59 min'],
    [3 * 3_600_000, 'hace 3 h'],
    [30 * 3_600_000, 'ayer'],
    [4 * 86_400_000, 'hace 4 días'],
  ])('hace %s ms -> %s', (ms, expected) => expect(timeAgo(ago(ms), now)).toBe(expected));

  it('pasado un mes muestra la fecha', () => {
    expect(timeAgo(ago(60 * 86_400_000), now)).toMatch(/\d{4}/);
  });

  it('una fecha inválida da vacío y una del futuro, «hace un momento»', () => {
    expect(timeAgo('nada', now)).toBe('');
    expect(timeAgo(new Date(now.getTime() + 60_000).toISOString(), now)).toBe('hace un momento');
  });
});
