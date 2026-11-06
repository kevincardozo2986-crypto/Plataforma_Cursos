import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../../generated/prisma/enums.js';
import type { CourseAccessService } from '../../course-access/course-access.service.js';
import type { CertificatesRepository } from '../certificates.repository.js';
import type { PokClient } from './pok-api.js';
import { PokService } from './pok.service.js';

const certificate = {
  id: 19,
  code: 'CC-AAAA-BBBB-CCCC',
  status: 'VALID',
  courseId: 7,
  userId: 5,
  courseTitle: 'Angular',
  studentDocument: '123',
  issuedAt: new Date('2026-11-04T15:00:00Z'),
  provider: 'POK',
  pokTemplateId: 'tpl-cert',
  pokStatus: 'NONE',
  pokCredentialId: null,
  pokError: null,
  pokUrl: null,
  user: { firstName: 'Ana', lastName: 'Ruiz', email: 'ana@correo.com' },
};

const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;
const stranger = { id: 99, role: Role.STUDENT } as AuthenticatedUser;

function build(env: Record<string, string> = { POK_API_KEY: 'k' }) {
  for (const key of ['POK_API_KEY']) delete process.env[key];
  Object.assign(process.env, env);

  const repository = {
    findForPok: vi.fn().mockResolvedValue(certificate),
    findById: vi.fn().mockResolvedValue(certificate),
    findByPokCredentialId: vi.fn().mockResolvedValue({ ...certificate, pokCredentialId: 'cred-1', pokStatus: 'PENDING' }),
    setPok: vi.fn().mockResolvedValue({}),
    findPokTemplate: vi.fn().mockResolvedValue(null),
    setPokTemplate: vi.fn().mockResolvedValue({}),
    clearPokTemplate: vi.fn().mockResolvedValue({}),
    listCoursesForPok: vi.fn().mockResolvedValue([]),
    unsentCertificateIds: vi.fn().mockResolvedValue([]),
  };
  const access = { assertCanManage: vi.fn().mockRejectedValue(new Error('no')) };
  const client = {
    emit: vi.fn().mockResolvedValue({ kind: 'created', id: 'cred-1', state: 'draft' }),
    get: vi.fn().mockResolvedValue({ id: 'cred-1', state: 'draft', viewUrl: 'https://v.pok.tech/r/cred-1' }),
    organization: vi.fn().mockResolvedValue({ name: 'ORG', availableCredits: 3 }),
    listTemplates: vi.fn().mockResolvedValue([{ id: 't1', name: 'Uno', tags: [] }]),
    findTemplate: vi.fn().mockResolvedValue({ found: true, id: 't1', name: 'Uno' }),
    templateParameters: vi.fn().mockResolvedValue([{ id: 'p-doc', label: 'Documento Id' }]),
  };
  const service = new PokService(repository as unknown as CertificatesRepository, access as unknown as CourseAccessService);

  service.clientFor = () => client as unknown as PokClient;
  service.pollDelayMs = 0;

  return { service, repository, access, client };
}

afterEach(() => {
  delete process.env.POK_API_KEY;
});

describe('PokService.emit', () => {
  it('envía el certificado a POK y guarda el id, el estado y el enlace público', async () => {
    const { service, repository, client } = build();

    await service.emit(19);

    expect(client.emit).toHaveBeenCalledOnce();
    expect(client.emit.mock.calls[0][0].receiver).toMatchObject({ email: 'ana@correo.com', firstName: 'Ana' });
    expect(repository.setPok).toHaveBeenCalledWith(19, expect.objectContaining({ pokCredentialId: 'cred-1', pokStatus: 'PENDING' }));
    expect(repository.setPok).toHaveBeenCalledWith(19, expect.objectContaining({ pokUrl: 'https://v.pok.tech/r/cred-1' }));
  });

  it('lleva el documento del estudiante al campo «Documento Id» del diseño', async () => {
    const { service, client } = build();

    await service.emit(19);

    expect(client.emit.mock.calls[0][0].customization.template.customParameters).toEqual({ 'p-doc': '123' });
  });

  it('si POK no devuelve los parámetros del diseño, emite igual (sin ellos)', async () => {
    const { service, client } = build();
    client.templateParameters.mockResolvedValue([]);

    await service.emit(19);

    expect(client.emit).toHaveBeenCalledOnce();
    expect(client.emit.mock.calls[0][0].customization.template.customParameters).toEqual({});
  });

  it('apagado (sin clave) no hace nada', async () => {
    const { service, client } = build({});

    await service.emit(19);

    expect(client.emit).not.toHaveBeenCalled();
    expect(service.enabled).toBe(false);
  });

  it('usa el diseño con el que se emitió el certificado', async () => {
    const { service, client } = build();

    await service.emit(19);

    expect(client.emit.mock.calls[0][0].customization.template.id).toBe('tpl-cert');
  });

  it('un certificado de la plataforma NUNCA se envía a POK', async () => {
    const { service, repository, client } = build();

    repository.findForPok.mockResolvedValue({ ...certificate, provider: 'PLATFORM' });
    await service.emit(19);

    expect(client.emit).not.toHaveBeenCalled();
    expect(repository.setPok).not.toHaveBeenCalled();
  });

  it('un certificado de POK sin diseño queda FAILED con la indicación y no llama a POK', async () => {
    const { service, repository, client } = build();

    repository.findForPok.mockResolvedValue({ ...certificate, pokTemplateId: null });
    await service.emit(19);

    expect(client.emit).not.toHaveBeenCalled();
    expect(repository.setPok).toHaveBeenCalledWith(19, { pokStatus: 'FAILED', pokError: expect.stringMatching(/pantalla POK/) });
  });

  it('no reenvía un certificado que ya está en POK ni uno revocado', async () => {
    const { service, repository, client } = build();

    repository.findForPok.mockResolvedValueOnce({ ...certificate, pokCredentialId: 'cred-1' });
    await service.emit(19);
    repository.findForPok.mockResolvedValueOnce({ ...certificate, status: 'REVOKED' });
    await service.emit(19);

    expect(client.emit).not.toHaveBeenCalled();
  });

  it('si POK rechaza, guarda FAILED con el motivo y NO lanza', async () => {
    const { service, repository, client } = build();

    client.emit.mockResolvedValue({ kind: 'error', status: 400, message: 'email inválido' });

    await expect(service.emit(19)).resolves.toBeUndefined();
    expect(repository.setPok).toHaveBeenCalledWith(19, { pokStatus: 'FAILED', pokError: 'email inválido' });
  });

  it('si algo revienta (BD, red), no lanza: el certificado propio no debe romperse', async () => {
    const { service, repository } = build();

    repository.findForPok.mockRejectedValue(new Error('BD caída'));

    await expect(service.emit(19)).resolves.toBeUndefined();
  });

  it('un 409 enlaza la credencial que POK ya tenía', async () => {
    const { service, repository, client } = build();

    client.emit.mockResolvedValue({ kind: 'duplicate', id: 'cred-0' });
    await service.emit(19);

    expect(repository.setPok).toHaveBeenCalledWith(19, expect.objectContaining({ pokCredentialId: 'cred-0' }));
  });
});

describe('PokService.sync', () => {
  it('el dueño reintenta el envío de un certificado que no está en POK', async () => {
    const { service, client } = build();

    await service.sync(student, 19);

    expect(client.emit).toHaveBeenCalledOnce();
  });

  it('si ya está en POK solo consulta el estado', async () => {
    const { service, repository, client } = build();

    repository.findById.mockResolvedValue({ ...certificate, pokCredentialId: 'cred-1', pokStatus: 'PENDING' });
    client.get.mockResolvedValue({ state: 'accepted' });

    await service.sync(student, 19);

    expect(client.emit).not.toHaveBeenCalled();
    expect(repository.setPok).toHaveBeenCalledWith(19, expect.objectContaining({ pokStatus: 'ACCEPTED' }));
  });

  it('otra persona sin permiso sobre el curso recibe 404', async () => {
    const { service } = build();

    await expect(service.sync(stranger, 19)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('quien gestiona el curso sí puede', async () => {
    const { service, access, client } = build();

    access.assertCanManage.mockResolvedValue(undefined);
    await service.sync({ id: 2, role: Role.TEACHER } as AuthenticatedUser, 19);

    expect(client.emit).toHaveBeenCalledOnce();
  });

  it('con POK apagado responde 400', async () => {
    const { service } = build({});

    await expect(service.sync(student, 19)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un certificado de la plataforma no se puede pedir a POK (400)', async () => {
    const { service, repository, client } = build();

    repository.findById.mockResolvedValue({ ...certificate, provider: 'PLATFORM' });

    await expect(service.sync(student, 19)).rejects.toBeInstanceOf(BadRequestException);
    expect(client.emit).not.toHaveBeenCalled();
  });
});

describe('PokService.handleEvent (webhook)', () => {
  it('credential-accepted marca el certificado como aceptado', async () => {
    const { service, repository } = build();

    const result = await service.handleEvent({ id: 'cred-1', type: 'credential-accepted' });

    expect(result).toEqual({ handled: true });
    expect(repository.setPok).toHaveBeenCalledWith(19, expect.objectContaining({ pokStatus: 'ACCEPTED' }));
  });

  it('un aviso atrasado no retrocede el estado', async () => {
    const { service, repository } = build();

    repository.findByPokCredentialId.mockResolvedValue({ ...certificate, pokCredentialId: 'cred-1', pokStatus: 'ACCEPTED' });
    await service.handleEvent({ id: 'cred-1', type: 'credential-emitted' });

    expect(repository.setPok).toHaveBeenCalledWith(19, expect.objectContaining({ pokStatus: 'ACCEPTED' }));
  });

  it('ignora credenciales que no son de la plataforma, otros eventos y cuerpos raros', async () => {
    const { service, repository } = build();

    repository.findByPokCredentialId.mockResolvedValue(null);
    expect(await service.handleEvent({ id: 'otra', type: 'credential-emitted' })).toEqual({ handled: false });
    expect(await service.handleEvent({ id: 'cred-1', type: 'learning-route-completed' })).toEqual({ handled: false });
    expect(await service.handleEvent(null)).toEqual({ handled: false });
    expect(await service.handleEvent('texto')).toEqual({ handled: false });
    expect(repository.setPok).not.toHaveBeenCalled();
  });
});

describe('PokService: pantalla POK', () => {
  const teacher = { id: 2, role: Role.TEACHER } as AuthenticatedUser;
  const admin = { id: 1, role: Role.ADMIN } as AuthenticatedUser;

  it('status: apagado o con la organización y los créditos', async () => {
    expect(await build({}).service.status()).toEqual({ enabled: false });

    const { service } = build();

    expect(await service.status()).toMatchObject({ enabled: true, organization: { name: 'ORG', availableCredits: 3 } });
  });

  it('templates: devuelve los de POK y falla con 502 si POK no responde', async () => {
    const { service, client } = build();

    expect(await service.templates()).toEqual([{ id: 't1', name: 'Uno', tags: [] }]);
    client.listTemplates.mockResolvedValue(null);
    await expect(service.templates()).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('courses: un docente ve los suyos y un admin todos, con su diseño de POK y los pendientes', async () => {
    const { service, repository } = build();

    repository.listCoursesForPok.mockResolvedValue([
      { id: 1, title: 'A', status: 'PUBLISHED', pokTemplate: { pokTemplateId: 'x', pokTemplateName: 'X' }, _count: { certificates: 2 } },
      { id: 2, title: 'B', status: 'DRAFT', pokTemplate: null, _count: { certificates: 0 } },
    ]);

    const rows = await service.courses(teacher);

    expect(repository.listCoursesForPok).toHaveBeenCalledWith(2);
    expect(rows[0]).toMatchObject({ pokTemplateId: 'x', pokTemplateName: 'X', unsent: 2 });
    expect(rows[1]).toMatchObject({ pokTemplateId: null, unsent: 0 });
    await service.courses(admin);
    expect(repository.listCoursesForPok).toHaveBeenLastCalledWith(undefined);
  });

  it('setCourseTemplate: guarda el diseño con su nombre, solo si existe en POK', async () => {
    const { service, repository, access } = build();

    access.assertCanManage.mockResolvedValue(undefined);

    expect(await service.setCourseTemplate(teacher, 7, 't1')).toEqual({ courseId: 7, pokTemplateId: 't1', pokTemplateName: 'Uno' });
    expect(repository.setPokTemplate).toHaveBeenCalledWith(7, 't1', 'Uno');
  });

  it('setCourseTemplate: un diseño que no existe es 400 y no se guarda; si POK no responde, 502', async () => {
    const { service, repository, access, client } = build();

    access.assertCanManage.mockResolvedValue(undefined);
    client.findTemplate.mockResolvedValue({ found: false, unknown: false });
    await expect(service.setCourseTemplate(teacher, 7, 'nope')).rejects.toBeInstanceOf(BadRequestException);
    client.findTemplate.mockResolvedValue({ found: false, unknown: true });
    await expect(service.setCourseTemplate(teacher, 7, 'nope')).rejects.toBeInstanceOf(BadGatewayException);
    expect(repository.setPokTemplate).not.toHaveBeenCalled();
  });

  it('setCourseTemplate: null vuelve al certificado de la plataforma', async () => {
    const { service, repository, access } = build();

    access.assertCanManage.mockResolvedValue(undefined);
    await service.setCourseTemplate(teacher, 7, null);

    expect(repository.clearPokTemplate).toHaveBeenCalledWith(7);
  });

  it('setCourseTemplate: quien no gestiona el curso no puede', async () => {
    const { service, repository } = build();

    await expect(service.setCourseTemplate(stranger, 7, 't1')).rejects.toThrow();
    expect(repository.setPokTemplate).not.toHaveBeenCalled();
  });

  it('sendPending: envía los pendientes del curso y cuenta cuántos fallaron', async () => {
    const { service, repository, access, client } = build();

    access.assertCanManage.mockResolvedValue(undefined);
    repository.unsentCertificateIds.mockResolvedValue([19, 20]);
    repository.findForPok.mockImplementation((id: number) => Promise.resolve({ ...certificate, id }));
    repository.findById.mockImplementation((id: number) => Promise.resolve({ ...certificate, id, pokStatus: id === 19 ? 'PENDING' : 'FAILED' }));
    client.emit.mockResolvedValueOnce({ kind: 'created', id: 'c19', state: 'draft' }).mockResolvedValueOnce({ kind: 'error', status: 400, message: 'mal' });

    expect(await service.sendPending(teacher, 7)).toEqual({ total: 2, sent: 1, failed: 1 });
  });

  it('con POK apagado, las operaciones de la pantalla dan 400', async () => {
    const { service, access } = build({});

    access.assertCanManage.mockResolvedValue(undefined);
    await expect(service.templates()).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.courses(teacher)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.sendPending(teacher, 7)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PokService: emisión directa (espera a que POK emita)', () => {
  it('consulta a POK hasta que la credencial pasa de «procesando» a «emitida»', async () => {
    const { service, repository, client } = build();
    const states = ['processing', 'processing', 'emitted'];
    let current = 'NONE';

    client.emit.mockResolvedValue({ kind: 'created', id: 'cred-1', state: 'processing' });
    client.get.mockImplementation(() => Promise.resolve({ state: states.shift() ?? 'emitted', viewUrl: 'https://v.pok.tech/r/cred-1' }));
    repository.setPok.mockImplementation((_id: number, data: { pokStatus?: string }) => {
      if (data.pokStatus) current = data.pokStatus;

      return Promise.resolve({});
    });
    repository.findById.mockImplementation(() => Promise.resolve({ ...certificate, pokCredentialId: 'cred-1', pokStatus: current }));

    await service.emit(19);

    expect(client.get.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(current).toBe('EMITTED');
  });

  it('no consulta indefinidamente: se rinde tras unos intentos si POK sigue procesando', async () => {
    const { service, repository, client } = build();

    client.get.mockResolvedValue({ state: 'processing' });
    repository.findById.mockResolvedValue({ ...certificate, pokCredentialId: 'cred-1', pokStatus: 'PENDING' });

    await service.emit(19);

    expect(client.get.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it('refreshPending: consulta solo los de POK pendientes y avisa si consultó alguno', async () => {
    const { service, repository, client } = build();

    repository.findById.mockResolvedValue({ ...certificate, pokCredentialId: 'cred-1', pokStatus: 'PENDING' });
    client.get.mockResolvedValue({ state: 'emitted', viewUrl: 'https://v.pok.tech/r/x' });

    expect(await service.refreshPending([{ id: 1, provider: 'PLATFORM', pokStatus: 'NONE' }, { id: 2, provider: 'POK', pokStatus: 'ACCEPTED' }])).toBe(false);
    expect(client.get).not.toHaveBeenCalled();
    expect(await service.refreshPending([{ id: 3, provider: 'POK', pokStatus: 'PENDING' }])).toBe(true);
    expect(repository.setPok).toHaveBeenCalledWith(3, expect.objectContaining({ pokStatus: 'EMITTED' }));
  });
});

describe('PokService.preview', () => {
  it('pide la imagen a POK con el título del curso y la reutiliza (no vuelve a pedirla)', async () => {
    const { service, client } = build();
    const preview = vi.fn().mockResolvedValue('https://img.example/p.png');

    (client as unknown as { preview: typeof preview }).preview = preview;

    expect(await service.preview('tpl-1', 'Mi curso')).toEqual({ url: 'https://img.example/p.png' });
    expect(await service.preview('tpl-1', 'Mi curso')).toEqual({ url: 'https://img.example/p.png' });
    expect(preview).toHaveBeenCalledOnce();
    expect(preview.mock.calls[0][0].credential.title).toBe('Mi curso');

    await service.preview('tpl-1', 'Otro curso');

    expect(preview).toHaveBeenCalledTimes(2);
  });

  it('un id de diseño con caracteres raros se rechaza antes de llamar a POK (400)', async () => {
    const { service, client } = build();
    const preview = vi.fn();

    (client as unknown as { preview: typeof preview }).preview = preview;

    await expect(service.preview('../etc/passwd', 'X')).rejects.toBeInstanceOf(BadRequestException);
    expect(preview).not.toHaveBeenCalled();
  });

  it('si POK no devuelve la imagen responde 502', async () => {
    const { service, client } = build();

    (client as unknown as { preview: () => Promise<null> }).preview = vi.fn().mockResolvedValue(null);

    await expect(service.preview('tpl-1', 'X')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('con POK apagado responde 400', async () => {
    const { service } = build({});

    await expect(service.preview('tpl-1', 'X')).rejects.toBeInstanceOf(BadRequestException);
  });
});
