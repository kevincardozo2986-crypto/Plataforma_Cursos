import { Course } from '../../../core/courses/courses.models';
import { FALLBACK_IMAGE, toCardCourse } from './course-mapper';

const api = (overrides: Partial<Course> = {}): Course => ({
  id: '7',
  title: 'Intro a Node',
  description: 'Aprende Node',
  price: '49.99',
  level: 'INTERMEDIATE',
  imageUrl: 'https://cdn.example.com/node.png',
  category: { id: '1', name: 'Programación' },
  _count: { modules: 3 },
  ...overrides,
});

describe('toCardCourse', () => {
  it('traduce un curso de la API al formato de la tarjeta', () => {
    expect(toCardCourse(api())).toEqual({
      id: '7',
      title: 'Intro a Node',
      category: 'Programación',
      description: 'Aprende Node',
      image: 'https://cdn.example.com/node.png',
      duration: '3 módulos',
      level: 'Intermedio',
      price: 49.99,
    });
  });

  it('usa valores por defecto cuando faltan datos', () => {
    const card = toCardCourse(api({ imageUrl: null, category: null, description: null, _count: undefined }));

    expect(card.image).toBe(FALLBACK_IMAGE);
    expect(card.category).toBe('General');
    expect(card.description).toBe('');
    expect(card.duration).toBe('Próximamente');
  });

  it('escribe bien el singular de módulo', () => {
    expect(toCardCourse(api({ _count: { modules: 1 } })).duration).toBe('1 módulo');
  });

  it('un precio inválido se muestra como 0 y un nivel desconocido como "Todos los niveles"', () => {
    const card = toCardCourse(api({ price: 'abc', level: 'X' }));

    expect(card.price).toBe(0);
    expect(card.level).toBe('Todos los niveles');
  });
});
