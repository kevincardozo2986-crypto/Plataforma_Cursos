import { slugify } from '../../../../core/utils/slugify';
import {
  CourseLevel,
  CourseUpdate,
  CourseVisibility,
  DRAFT_TITLE,
} from '../teacher-courses.models';

// ---------- Paso 1: Básicos ----------

export type Pricing = 'FREE' | 'PAID';

export interface BasicsValue {
  title: string;
  slug: string;
  description: string;
  level: CourseLevel;
  categoryId: number | null;
  pricing: Pricing;
  price: number | null;
  visibility: CourseVisibility;
  accessPassword: string;
  maxStudents: number | null;
  publicContent: boolean;
  qaEnabled: boolean;
  imageUrl: string;
  introVideoUrl: string;
}

/** Un precio de cero es un curso gratuito. */
export function pricingOf(price: string | number | null | undefined): Pricing {
  return Number(price) > 0 ? 'PAID' : 'FREE';
}

/**
 * ¿La dirección se genera sola a partir del título? Sí mientras sea la que
 * salió de ese título (o del borrador sin título); si el profesor la cambió a
 * mano, deja de seguirlo.
 */
export function isAutoSlug(course: { title: string; slug: string }): boolean {
  return (
    course.title === DRAFT_TITLE ||
    course.slug === slugify(course.title) ||
    /^curso-sin-titulo(-\d+)?$/.test(course.slug)
  );
}

/**
 * Del formulario del paso 1 al cuerpo de PATCH. Vacío = null (borra) en los opcionales.
 * El título y la dirección en blanco no se envían, para que un borrador se guarde
 * sin completarlos (el backend los exige solo al publicar).
 */
export function toBasicsUpdate(value: BasicsValue): CourseUpdate {
  const update: CourseUpdate = {
    title: value.title.trim() || undefined,
    slug: value.slug.trim() || undefined,
    description: value.description.trim(),
    level: value.level,
    price: value.pricing === 'FREE' ? 0 : Number(value.price ?? 0),
    categoryId: value.categoryId,
    visibility: value.visibility,
    maxStudents: value.maxStudents ? Number(value.maxStudents) : null,
    publicContent: value.publicContent,
    qaEnabled: value.qaEnabled,
    imageUrl: value.imageUrl.trim() || null,
    introVideoUrl: value.introVideoUrl.trim() || null,
  };

  // La contraseña solo viaja si es un curso con contraseña y se escribió una nueva.
  if (value.visibility === 'PASSWORD' && value.accessPassword.trim()) {
    update.accessPassword = value.accessPassword.trim();
  }

  return update;
}

// ---------- Paso 3: Adicional ----------

export interface AdditionalValue {
  whatYouWillLearn: string;
  audience: string;
  hours: number | null;
  minutes: number | null;
  materials: string;
  requirements: string;
  prerequisiteIds: number[];
}

export function splitDuration(totalMinutes: number | null): {
  hours: number | null;
  minutes: number | null;
} {
  if (!totalMinutes) {
    return { hours: null, minutes: null };
  }

  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/** Horas y minutos a minutos totales; sin nada, null. */
export function joinDuration(hours: number | null, minutes: number | null): number | null {
  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);

  return total > 0 ? total : null;
}

export function toAdditionalUpdate(value: AdditionalValue): CourseUpdate {
  return {
    whatYouWillLearn: value.whatYouWillLearn.trim() || null,
    audience: value.audience.trim() || null,
    durationMinutes: joinDuration(value.hours, value.minutes),
    materials: value.materials.trim() || null,
    requirements: value.requirements.trim() || null,
    prerequisiteIds: value.prerequisiteIds,
  };
}
