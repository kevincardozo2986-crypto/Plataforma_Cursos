import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../../generated/prisma/enums.js';
import { CourseAccessService } from '../../course-access/course-access.service.js';
import { CertificatesRepository } from '../certificates.repository.js';
import {
  advanceStatus,
  buildCredentialBody,
  buildPreviewBody,
  customParametersFor,
  type PokConfig,
  PokClient,
  pokConfig,
  type PokStatus,
  statusFromState,
  stateOf,
  viewUrlOf,
} from './pok-api.js';

/** Avisos de POK que cambian el estado de una credencial. */
/** Cuánto tiempo se reutiliza una vista previa ya generada. */
const PREVIEW_TTL_MS = 10 * 60_000;

const EVENT_STATUS: Record<string, PokStatus> = {
  'credential-emitted': 'EMITTED',
  'credential-accepted': 'ACCEPTED',
};

/**
 * Envía a POK una credencial digital por cada certificado emitido y mantiene su estado al día (consulta
 * y webhook). Nunca rompe la emisión del certificado: un fallo se guarda y se puede reintentar.
 */
@Injectable()
export class PokService {
  private readonly logger = new Logger(PokService.name);

  /** Se puede sustituir en las pruebas. */
  clientFor: (config: PokConfig) => PokClient = (config) => new PokClient(config);

  /** Cada cuánto se consulta a POK mientras la credencial se emite (se pone en 0 en las pruebas). */
  pollDelayMs = 3000;

  constructor(
    private readonly repository: CertificatesRepository,
    private readonly access: CourseAccessService,
  ) {}

  get enabled(): boolean {
    return pokConfig() !== null;
  }

  /** Envía el certificado a POK (si está activado y aún no se envió). No lanza: registra y guarda el error. */
  async emit(certificateId: number): Promise<void> {
    // Se espera a que POK termine de emitir para dejar el estado al día (corre en segundo plano).
    await this.emitOne(certificateId, true);
  }

  /** Igual que `emit`, pero dice cómo quedó (null = no se intentó). `settle`: esperar hasta que POK emita. */
  private async emitOne(certificateId: number, settle = false): Promise<PokStatus | null> {
    const config = pokConfig();

    if (!config) {
      return null;
    }

    try {
      const certificate = await this.repository.findForPok(certificateId);

      // Solo los certificados que el curso eligió emitir en POK; los de la plataforma nunca se envían.
      if (!certificate || certificate.provider !== 'POK' || certificate.status === 'REVOKED' || certificate.pokCredentialId) {
        return null;
      }

      // El diseño con el que se emitió (guardado en el certificado al emitirlo).
      const templateId = certificate.pokTemplateId;

      if (!templateId) {
        const message = 'Este certificado no tiene un diseño de POK: elige uno para el curso en la pantalla POK';

        await this.repository.setPok(certificateId, { pokStatus: 'FAILED', pokError: message });

        return 'FAILED';
      }

      const client = this.clientFor(config);
      // El documento del estudiante va en los campos del diseño que lo piden («Documento Id», «Cédula»…).
      const customParameters = customParametersFor(await client.templateParameters(templateId), {
        document: certificate.studentDocument,
        courseTitle: certificate.courseTitle,
      });
      const result = await client.emit(
        buildCredentialBody(
          {
            code: certificate.code,
            courseId: certificate.courseId,
            courseTitle: certificate.courseTitle,
            issuedAt: certificate.issuedAt,
            firstName: certificate.user.firstName,
            lastName: certificate.user.lastName,
            email: certificate.user.email,
            document: certificate.studentDocument,
          },
          config,
          templateId,
          customParameters,
        ),
      );

      if (result.kind === 'created') {
        await this.repository.setPok(certificateId, {
          pokCredentialId: result.id,
          pokStatus: advanceStatus('PENDING', statusFromState(result.state)),
          pokState: result.state,
          pokError: null,
        });
        // El estado y el enlace público se leen de la credencial ya creada.
        await this.refresh(certificateId, result.id, config);
        if (settle) await this.settle(certificateId, result.id, config);
      } else if (result.kind === 'duplicate' && result.id) {
        // POK ya tenía esta credencial (se reintentó tras una caída): se enlaza y se consulta su estado.
        await this.repository.setPok(certificateId, { pokCredentialId: result.id, pokStatus: 'PENDING', pokError: null });
        await this.refresh(certificateId, result.id, config);
        if (settle) await this.settle(certificateId, result.id, config);
      } else {
        const message = result.kind === 'error' ? result.message : 'POK ya tiene una credencial para este certificado';

        this.logger.warn(`POK rechazó el certificado ${certificateId}: ${message}`);
        await this.repository.setPok(certificateId, { pokStatus: 'FAILED', pokError: message });
      }

      return (await this.repository.findById(certificateId))?.pokStatus ?? null;
    } catch (error) {
      this.logger.error(`No se pudo enviar el certificado ${certificateId} a POK: ${(error as Error).message}`);

      return null;
    }
  }

  // --- Pantalla POK del docente ---

  /** Estado de la conexión: organización, créditos y cómo está configurado. */
  async status() {
    const config = pokConfig();

    if (!config) {
      return { enabled: false as const };
    }

    return {
      enabled: true as const,
      organization: await this.clientFor(config).organization(),
      draftMode: config.saveAsDraft,
      emitter: config.emitter,
      webhookConfigured: Boolean(process.env.POK_WEBHOOK_SIGNING_KEY?.trim() || process.env.POK_WEBHOOK_SECRET?.trim()),
    };
  }

  /** Los diseños de la cuenta de POK, para elegir uno por curso. */
  async templates() {
    const config = this.requireConfig();
    const templates = await this.clientFor(config).listTemplates();

    if (!templates) {
      throw new BadGatewayException('No pudimos consultar los diseños de POK. Intenta de nuevo');
    }

    return templates;
  }

  /** Vistas previas ya pedidas a POK: la imagen es la misma mientras no cambien el diseño ni el título. */
  private readonly previews = new Map<string, { url: string; at: number }>();

  /**
   * La imagen de cómo se ve la credencial de POK con ese diseño y el título del curso (con un estudiante de
   * ejemplo). Se guarda unos minutos para no pedirle a POK lo mismo en cada clic.
   */
  async preview(templateId: string, courseTitle: string): Promise<{ url: string }> {
    const config = this.requireConfig();

    if (!/^[A-Za-z0-9_-]{1,100}$/.test(templateId)) {
      throw new BadRequestException('El id del diseño no es válido');
    }

    const title = courseTitle.trim() || 'Nombre del curso';
    const key = `${templateId}|${title}`;
    const cached = this.previews.get(key);

    if (cached && Date.now() - cached.at < PREVIEW_TTL_MS) {
      return { url: cached.url };
    }

    const client = this.clientFor(config);
    // Un documento de ejemplo, para ver dónde saldrá el del estudiante.
    const customParameters = customParametersFor(await client.templateParameters(templateId), { document: '1234567890', courseTitle: title });
    const url = await client.preview(buildPreviewBody({ courseTitle: title, templateId, customParameters }, config));

    if (!url) {
      throw new BadGatewayException('No pudimos generar la vista previa en POK. Revisa que el diseño exista e intenta de nuevo');
    }

    if (this.previews.size >= 100) {
      this.previews.delete(this.previews.keys().next().value as string);
    }

    this.previews.set(key, { url, at: Date.now() });

    return { url };
  }

  /** Los cursos del docente con la vía de certificado que usa cada uno y cuántos certificados de POK faltan por enviar. */
  async courses(user: AuthenticatedUser) {
    this.requireConfig();
    const courses = await this.repository.listCoursesForPok(user.role === Role.ADMIN ? undefined : user.id);

    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      status: course.status,
      pokTemplateId: course.pokTemplate?.pokTemplateId ?? null,
      pokTemplateName: course.pokTemplate?.pokTemplateName ?? null,
      unsent: course._count.certificates,
    }));
  }

  /**
   * Elige que el curso emita sus certificados en POK con este diseño (comprueba que exista en la cuenta), o
   * `null` para volver al certificado de la plataforma. Es una cosa o la otra, nunca las dos.
   */
  async setCourseTemplate(user: AuthenticatedUser, courseId: number, pokTemplateId: string | null) {
    await this.access.assertCanManage(user, courseId);
    const config = this.requireConfig();

    if (pokTemplateId === null) {
      await this.repository.clearPokTemplate(courseId);

      return { courseId, pokTemplateId: null, pokTemplateName: null };
    }

    const found = await this.clientFor(config).findTemplate(pokTemplateId);

    if (!found.found) {
      if (found.unknown) {
        throw new BadGatewayException('No pudimos consultar POK para comprobar el diseño. Intenta de nuevo');
      }

      throw new BadRequestException('Ese diseño no existe en tu cuenta de POK');
    }

    await this.repository.setPokTemplate(courseId, found.id, found.name);

    return { courseId, pokTemplateId: found.id, pokTemplateName: found.name };
  }

  /** Envía a POK los certificados vigentes del curso que todavía no están allá (hasta 100 por vez). */
  async sendPending(user: AuthenticatedUser, courseId: number) {
    await this.access.assertCanManage(user, courseId);
    this.requireConfig();

    const ids = await this.repository.unsentCertificateIds(courseId, 100);
    let failed = 0;

    for (const id of ids) {
      if ((await this.emitOne(id)) === 'FAILED') failed += 1;
    }

    return { total: ids.length, sent: ids.length - failed, failed };
  }

  private requireConfig(): PokConfig {
    const config = pokConfig();

    if (!config) {
      throw new BadRequestException('La integración con POK no está activada');
    }

    return config;
  }

  /**
   * Reintenta el envío (si falló o no se envió) o consulta el estado actual. Lo pide el dueño del
   * certificado o quien gestiona el curso.
   */
  async sync(user: AuthenticatedUser, certificateId: number) {
    const certificate = await this.repository.findById(certificateId);

    if (!certificate) {
      throw new NotFoundException('El certificado no existe');
    }

    if (certificate.userId !== user.id) {
      try {
        await this.access.assertCanManage(user, certificate.courseId);
      } catch {
        throw new NotFoundException('El certificado no existe');
      }
    }

    const config = pokConfig();

    if (!config) {
      throw new BadRequestException('La integración con POK no está activada');
    }

    if (certificate.provider !== 'POK') {
      throw new BadRequestException('Este certificado es de la plataforma: el curso no lo emite en POK');
    }

    if (certificate.pokCredentialId) {
      await this.refresh(certificateId, certificate.pokCredentialId, config);
    } else {
      await this.emitOne(certificateId);
    }

    const updated = await this.repository.findById(certificateId);

    return {
      pokStatus: updated?.pokStatus ?? 'NONE',
      pokError: updated?.pokError ?? null,
      pokUrl: updated?.pokUrl ?? null,
    };
  }

  /** Aviso de POK (webhook). Devuelve si cambió algún certificado nuestro. */
  async handleEvent(payload: unknown): Promise<{ handled: boolean }> {
    if (typeof payload !== 'object' || payload === null) {
      return { handled: false };
    }

    const { type, id } = payload as { type?: unknown; id?: unknown };
    const next = typeof type === 'string' ? EVENT_STATUS[type] : undefined;

    if (!next || typeof id !== 'string') {
      return { handled: false };
    }

    const certificate = await this.repository.findByPokCredentialId(id);

    if (!certificate) {
      // Credencial emitida desde el panel de POK (no es de la plataforma): se ignora.
      return { handled: false };
    }

    await this.repository.setPok(certificate.id, {
      pokStatus: advanceStatus(certificate.pokStatus, next),
      pokState: type as string,
      pokError: null,
    });

    return { handled: true };
  }

  /**
   * POK emite en unos segundos (procesando → emitida). Sin esperar al webhook, se le pregunta cada pocos
   * segundos hasta que deje de estar pendiente, para que el estudiante vea su credencial enseguida.
   */
  private async settle(certificateId: number, credentialId: string, config: PokConfig): Promise<void> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await this.repository.findById(certificateId))?.pokStatus !== 'PENDING') {
        return;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, this.pollDelayMs));
      await this.refresh(certificateId, credentialId, config);
    }
  }

  /**
   * Al abrir sus certificados, se actualizan los de POK que siguen «pendientes» (por si el servidor se
   * reinició o el webhook no está configurado). Devuelve si consultó alguno, para volver a leer.
   */
  async refreshPending(items: { id: number; provider?: string | null; pokStatus?: string | null }[]): Promise<boolean> {
    const config = pokConfig();
    const ids = items.filter((item) => item.provider === 'POK' && item.pokStatus === 'PENDING').slice(0, 5).map((item) => item.id);

    if (!config || ids.length === 0) {
      return false;
    }

    await Promise.all(
      ids.map(async (id) => {
        try {
          const certificate = await this.repository.findById(id);

          if (certificate?.pokCredentialId) {
            await this.refresh(id, certificate.pokCredentialId, config);
          }
        } catch (error) {
          this.logger.warn(`No se pudo consultar el certificado ${id} en POK: ${(error as Error).message}`);
        }
      }),
    );

    return true;
  }

  private async refresh(certificateId: number, credentialId: string, config: PokConfig): Promise<void> {
    const current = await this.repository.findById(certificateId);
    const credential = await this.clientFor(config).get(credentialId);
    const state = stateOf(credential);

    if (!current || state === null) {
      return;
    }

    await this.repository.setPok(certificateId, {
      pokStatus: advanceStatus(current.pokStatus === 'NONE' ? 'PENDING' : current.pokStatus, statusFromState(state)),
      pokState: state,
      pokError: null,
      pokUrl: viewUrlOf(credential),
    });
  }
}
