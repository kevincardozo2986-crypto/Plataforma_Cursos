import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { CourseWithContent, DRAFT_TITLE, TeacherCourse } from '../teacher-courses.models';
import { TeacherCoursesService } from '../teacher-courses.service';
import { CourseWizardService, publishChecklist } from './course-wizard.service';

const course = (overrides: Partial<CourseWithContent> = {}): CourseWithContent =>
  ({
    id: 4,
    title: 'Intro a Node',
    description: 'Aprende Node',
    status: 'DRAFT',
    modules: [{ id: 1 }],
    ...overrides,
  }) as unknown as CourseWithContent;

describe('publishChecklist', () => {
  it('un borrador recién creado no cumple nada', () => {
    const items = publishChecklist({ title: DRAFT_TITLE, description: '', modules: [] });

    expect(items.map((i) => i.done)).toEqual([false, false, false]);
  });

  it('marca como hecho lo que ya está', () => {
    const items = publishChecklist({ title: 'Mi curso', description: 'x', modules: [{}] });

    expect(items.every((i) => i.done)).toBe(true);
  });

  it('un título en blanco o la descripción en blanco no cuentan', () => {
    const items = publishChecklist({ title: '   ', description: '  ', modules: [{}] });

    expect(items.map((i) => i.done)).toEqual([false, false, true]);
  });

  it('sin curso cargado, nada está hecho', () => {
    expect(publishChecklist(null).every((i) => !i.done)).toBe(true);
  });
});

describe('CourseWizardService', () => {
  const api = {
    get: vi.fn(),
    setStatus: vi.fn(),
  };

  function setup(initial: CourseWithContent | null = course()) {
    TestBed.configureTestingModule({
      providers: [CourseWizardService, { provide: TeacherCoursesService, useValue: api }],
    });

    const service = TestBed.inject(CourseWizardService);
    service.course.set(initial);

    return service;
  }

  beforeEach(() => vi.resetAllMocks());

  it('sin ningún paso registrado no hay nada que guardar y sigue', () => {
    const service = setup();
    let result: boolean | undefined;

    service.saveCurrent().subscribe((ok) => (result = ok));

    expect(result).toBe(true);
  });

  it('si el paso dice que su formulario es inválido, no continúa y avisa', () => {
    const service = setup();
    service.register(() => null);
    let result: boolean | undefined;

    service.saveCurrent().subscribe((ok) => (result = ok));

    expect(result).toBe(false);
    expect(service.error()).toContain('Revisa los campos');
  });

  it('guarda el paso y mezcla lo devuelto sin perder los módulos', () => {
    const service = setup();
    service.register(() => of({ id: 4, title: 'Nuevo título' } as TeacherCourse));

    service.saveCurrent().subscribe();

    expect(service.course()?.title).toBe('Nuevo título');
    expect(service.course()?.modules).toHaveLength(1);
    expect(service.saving()).toBe(false);
  });

  it('muestra el mensaje del backend si falla el guardado', () => {
    const service = setup();
    service.register(() =>
      throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Esa dirección ya la usa otro curso' } })),
    );
    let result: boolean | undefined;

    service.saveCurrent().subscribe((ok) => (result = ok));

    expect(result).toBe(false);
    expect(service.error()).toBe('Esa dirección ya la usa otro curso');
    expect(service.saving()).toBe(false);
  });

  it('al volver a editar desaparecen los avisos viejos', () => {
    const service = setup();
    service.register(() => null);
    service.saveCurrent().subscribe();
    expect(service.error()).not.toBe('');

    service.clearMessages();

    expect(service.error()).toBe('');
    expect(service.notice()).toBe('');
  });

  it('un paso que se va ya no se guarda (anular el registro)', () => {
    const service = setup();
    const unregister = service.register(() => null);

    unregister();
    let result: boolean | undefined;
    service.saveCurrent().subscribe((ok) => (result = ok));

    expect(result).toBe(true);
  });

  it('un paso nuevo no queda anulado por el anterior que se cierra tarde', () => {
    const service = setup();
    const unregisterOld = service.register(() => null);
    service.register(() => of({ id: 4 } as TeacherCourse));

    unregisterOld();
    let result: boolean | undefined;
    service.saveCurrent().subscribe((ok) => (result = ok));

    expect(result).toBe(true);
  });

  describe('publish', () => {
    it('guarda el paso y después publica', () => {
      const service = setup();
      service.register(() => of({ id: 4 } as TeacherCourse));
      api.setStatus.mockReturnValue(of({ id: 4, status: 'PUBLISHED' }));

      service.publish();

      expect(api.setStatus).toHaveBeenCalledWith(4, 'PUBLISHED');
      expect(service.course()?.status).toBe('PUBLISHED');
      expect(service.notice()).toContain('publicado');
    });

    it('si el formulario es inválido no llega a publicar', () => {
      const service = setup();
      service.register(() => null);

      service.publish();

      expect(api.setStatus).not.toHaveBeenCalled();
    });

    it('muestra qué falta según el backend y el curso sigue en borrador', () => {
      const service = setup();
      api.setStatus.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 400, error: { message: 'Para publicar falta: al menos un módulo' } }),
        ),
      );

      service.publish();

      expect(service.error()).toBe('Para publicar falta: al menos un módulo');
      expect(service.course()?.status).toBe('DRAFT');
    });
  });

  it('despublicar devuelve el curso a borrador', () => {
    const service = setup(course({ status: 'PUBLISHED' }));
    api.setStatus.mockReturnValue(of({ id: 4, status: 'DRAFT' }));

    service.unpublish();

    expect(api.setStatus).toHaveBeenCalledWith(4, 'DRAFT');
    expect(service.course()?.status).toBe('DRAFT');
  });

  it('el aviso de "Guardar" distingue borrador de curso ya publicado', () => {
    const draft = setup();
    draft.saveDraft();
    expect(draft.notice()).toBe('Borrador guardado.');

    TestBed.resetTestingModule();

    const published = setup(course({ status: 'PUBLISHED' }));
    published.saveDraft();
    expect(published.notice()).toBe('Cambios guardados.');
  });
});
