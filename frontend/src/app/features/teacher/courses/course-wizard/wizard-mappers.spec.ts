import { DRAFT_TITLE } from '../teacher-courses.models';
import {
  BasicsValue,
  isAutoSlug,
  joinDuration,
  pricingOf,
  splitDuration,
  toAdditionalUpdate,
  toBasicsUpdate,
} from './wizard-mappers';

const basics = (overrides: Partial<BasicsValue> = {}): BasicsValue => ({
  title: '  Intro a Node  ',
  slug: ' intro-a-node ',
  description: '  Aprende Node ',
  level: 'INTERMEDIATE',
  categoryId: 3,
  pricing: 'PAID',
  price: 49.9,
  visibility: 'PUBLIC',
  accessPassword: '',
  maxStudents: null,
  publicContent: false,
  qaEnabled: true,
  imageUrl: '',
  introVideoUrl: '',
  ...overrides,
});

describe('pricingOf', () => {
  it.each([
    ['0', 'FREE'],
    [0, 'FREE'],
    ['49.99', 'PAID'],
    [null, 'FREE'],
  ] as const)('%s -> %s', (price, expected) => {
    expect(pricingOf(price)).toBe(expected);
  });
});

describe('isAutoSlug', () => {
  it('sigue al título mientras la dirección salga de él', () => {
    expect(isAutoSlug({ title: 'Intro a Node', slug: 'intro-a-node' })).toBe(true);
  });

  it('un borrador sin título sigue al título que se escriba', () => {
    expect(isAutoSlug({ title: DRAFT_TITLE, slug: 'curso-sin-titulo-3' })).toBe(true);
  });

  it('deja de seguirlo si el profesor puso otra dirección', () => {
    expect(isAutoSlug({ title: 'Intro a Node', slug: 'node-desde-cero' })).toBe(false);
  });
});

describe('toBasicsUpdate', () => {
  it('limpia espacios y deja vacíos los opcionales como null (para borrarlos)', () => {
    const update = toBasicsUpdate(basics());

    expect(update).toMatchObject({
      title: 'Intro a Node',
      slug: 'intro-a-node',
      description: 'Aprende Node',
      price: 49.9,
      categoryId: 3,
      maxStudents: null,
      imageUrl: null,
      introVideoUrl: null,
    });
  });

  it('un título o una dirección en blanco no se envían, para poder guardar un borrador', () => {
    const update = toBasicsUpdate(basics({ title: '   ', slug: '' }));

    expect(update.title).toBeUndefined();
    expect(update.slug).toBeUndefined();
    expect(update.description).toBe('Aprende Node');
  });

  it('un curso gratuito se guarda con precio 0 aunque el campo tuviera un valor', () => {
    expect(toBasicsUpdate(basics({ pricing: 'FREE', price: 80 })).price).toBe(0);
  });

  it('la contraseña viaja solo si el curso es con contraseña y se escribió una', () => {
    expect(
      toBasicsUpdate(basics({ visibility: 'PASSWORD', accessPassword: ' clave1 ' })).accessPassword,
    ).toBe('clave1');
    expect(
      toBasicsUpdate(basics({ visibility: 'PASSWORD', accessPassword: '' })),
    ).not.toHaveProperty('accessPassword');
    expect(
      toBasicsUpdate(basics({ visibility: 'PUBLIC', accessPassword: 'olvidada' })),
    ).not.toHaveProperty('accessPassword');
  });

  it('el cupo vacío o en 0 significa sin límite', () => {
    expect(toBasicsUpdate(basics({ maxStudents: 0 })).maxStudents).toBeNull();
    expect(toBasicsUpdate(basics({ maxStudents: 30 })).maxStudents).toBe(30);
  });

  it('conserva la imagen y el video cuando se escriben', () => {
    const update = toBasicsUpdate(
      basics({ imageUrl: ' https://x.com/a.png ', introVideoUrl: 'https://x.com/v.mp4' }),
    );

    expect(update.imageUrl).toBe('https://x.com/a.png');
    expect(update.introVideoUrl).toBe('https://x.com/v.mp4');
  });
});

describe('duración', () => {
  it('separa minutos totales en horas y minutos', () => {
    expect(splitDuration(150)).toEqual({ hours: 2, minutes: 30 });
    expect(splitDuration(45)).toEqual({ hours: 0, minutes: 45 });
    expect(splitDuration(null)).toEqual({ hours: null, minutes: null });
  });

  it('une horas y minutos; sin nada es null', () => {
    expect(joinDuration(2, 30)).toBe(150);
    expect(joinDuration(null, 45)).toBe(45);
    expect(joinDuration(0, 0)).toBeNull();
    expect(joinDuration(null, null)).toBeNull();
  });

  it('ida y vuelta', () => {
    const { hours, minutes } = splitDuration(135);

    expect(joinDuration(hours, minutes)).toBe(135);
  });
});

describe('toAdditionalUpdate', () => {
  it('manda null en lo vacío y la lista completa de prerrequisitos', () => {
    expect(
      toAdditionalUpdate({
        whatYouWillLearn: ' Variables\nFunciones ',
        audience: '',
        hours: 1,
        minutes: 30,
        materials: '   ',
        requirements: 'Ganas',
        prerequisiteIds: [2, 5],
        certificateTemplateId: 12,
      }),
    ).toEqual({
      whatYouWillLearn: 'Variables\nFunciones',
      audience: null,
      durationMinutes: 90,
      materials: null,
      requirements: 'Ganas',
      prerequisiteIds: [2, 5],
      certificateTemplateId: 12,
    });
  });

  it('sin plantilla manda null, que quita el certificado del curso', () => {
    expect(
      toAdditionalUpdate({
        whatYouWillLearn: '',
        audience: '',
        hours: null,
        minutes: null,
        materials: '',
        requirements: '',
        prerequisiteIds: [],
        certificateTemplateId: null,
      }).certificateTemplateId,
    ).toBeNull();
  });
});
