export type DripKind =
  | 'NONE'
  | 'BY_DATE'
  | 'AFTER_DAYS'
  | 'SEQUENTIAL'
  | 'PREREQUISITES';

export interface DripModule {
  id: number;
  title: string;
  position: number;
  unlockAt: Date | null;
  unlockAfterDays: number | null;
  /** Ids de los módulos que hay que terminar antes (modo PREREQUISITES). */
  requires: number[];
}

/** Por qué un módulo está cerrado. NOT_ENROLLED: el curso no es de contenido público y no hay inscripción. */
export type LockReason =
  | 'DATE'
  | 'DAYS'
  | 'PREVIOUS'
  | 'PREREQUISITES'
  | 'NOT_ENROLLED';

export interface ModuleAvailability {
  moduleId: number;
  locked: boolean;
  reason: LockReason | null;
  /** Cuándo se abre, si el motivo es una fecha (DATE o DAYS). */
  unlocksAt: Date | null;
  /** Módulos que faltan por terminar (PREVIOUS o PREREQUISITES). */
  requiredModules: { id: number; title: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const open = (moduleId: number): ModuleAvailability => ({
  moduleId,
  locked: false,
  reason: null,
  unlocksAt: null,
  requiredModules: [],
});

/**
 * Qué módulos de un curso puede abrir hoy un estudiante inscrito.
 * - BY_DATE: cada módulo se abre en su `unlockAt`.
 * - AFTER_DAYS: se abre `unlockAfterDays` días después de la inscripción.
 * - SEQUENTIAL: el primero siempre; cada uno de los demás al terminar el anterior (por posición).
 * - PREREQUISITES: al terminar todos los módulos de su lista.
 * Un módulo sin ajuste en el modo activo queda abierto. `completed` son los módulos que el
 * estudiante ya terminó (todas sus lecciones).
 */
export function computeAvailability(
  type: DripKind,
  modules: DripModule[],
  context: { now: Date; enrolledAt: Date; completed: Set<number> },
): ModuleAvailability[] {
  const ordered = [...modules].sort((a, b) => a.position - b.position);
  const byId = new Map(ordered.map((m) => [m.id, m]));
  const nameOf = (id: number) => ({ id, title: byId.get(id)?.title ?? '' });

  return ordered.map((module, index): ModuleAvailability => {
    switch (type) {
      case 'BY_DATE':
        return module.unlockAt && context.now < module.unlockAt
          ? {
              ...open(module.id),
              locked: true,
              reason: 'DATE',
              unlocksAt: module.unlockAt,
            }
          : open(module.id);

      case 'AFTER_DAYS': {
        if (module.unlockAfterDays === null) {
          return open(module.id);
        }

        const unlocksAt = new Date(
          context.enrolledAt.getTime() + module.unlockAfterDays * DAY_MS,
        );

        return context.now < unlocksAt
          ? { ...open(module.id), locked: true, reason: 'DAYS', unlocksAt }
          : open(module.id);
      }

      case 'SEQUENTIAL': {
        const previous = ordered[index - 1];

        return previous && !context.completed.has(previous.id)
          ? {
              ...open(module.id),
              locked: true,
              reason: 'PREVIOUS',
              requiredModules: [nameOf(previous.id)],
            }
          : open(module.id);
      }

      case 'PREREQUISITES': {
        const missing = module.requires.filter(
          (id) => !context.completed.has(id),
        );

        return missing.length > 0
          ? {
              ...open(module.id),
              locked: true,
              reason: 'PREREQUISITES',
              requiredModules: missing.map(nameOf),
            }
          : open(module.id);
      }

      default:
        return open(module.id);
    }
  });
}

const dateFormat = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Bogota',
});

/** Mensaje para mostrar cuando alguien intenta abrir un módulo cerrado. */
export function lockMessage(availability: ModuleAvailability): string {
  const required = availability.requiredModules
    .map((m) => `«${m.title}»`)
    .join(', ');

  switch (availability.reason) {
    case 'DATE':
    case 'DAYS':
      return `Este contenido se desbloquea el ${dateFormat.format(availability.unlocksAt as Date)}`;
    case 'PREVIOUS':
      return `Termina el módulo anterior (${required}) para desbloquear este contenido`;
    case 'PREREQUISITES':
      return `Termina antes: ${required}`;
    case 'NOT_ENROLLED':
      return 'Debes estar inscrito en el curso para ver este contenido';
    default:
      return 'Este contenido todavía no está disponible';
  }
}

/**
 * ¿Pedir que `moduleId` requiera a `requires` crearía un círculo (A pide B, B pide A)?
 * `graph` es lo que ya existe en el curso: módulo -> módulos que requiere.
 */
export function createsCycle(
  moduleId: number,
  requires: number[],
  graph: Map<number, number[]>,
): boolean {
  if (requires.includes(moduleId)) {
    return true;
  }

  const next = new Map(graph);
  next.set(moduleId, requires);

  const seen = new Set<number>();
  const stack = [...requires];

  while (stack.length > 0) {
    const current = stack.pop() as number;

    if (current === moduleId) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }

    seen.add(current);
    stack.push(...(next.get(current) ?? []));
  }

  return false;
}
