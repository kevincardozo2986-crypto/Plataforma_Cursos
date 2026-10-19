import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { uploadsDir } from '../uploads/upload-paths.js';
import { CertificateFontsRepository } from './certificate-fonts.repository.js';
import {
  cleanFontName,
  detectFormat,
  type FontFormat,
  inspectFont,
  MAX_CUSTOM_FONTS,
  MAX_FONT_BYTES,
} from './font-files.js';
import {
  customFontId,
  customKey,
  DEFAULT_FONT,
  isStandardKey,
  libraryFilePath,
  libraryFont,
  loadLibrary,
  STANDARD_FONTS,
} from './font-library.js';

/** Lo que el generador de PDF necesita de una tipografía: la normal y la negrita (o la normal otra vez). */
export interface FontSource {
  /** Un nombre de las tipografías del PDF ("Helvetica") o el contenido del archivo a incrustar. */
  regular: string | Buffer;
  bold: string | Buffer;
}

const STANDARD_SOURCE: Record<string, FontSource> = Object.fromEntries(
  STANDARD_FONTS.map((font) => [font.key, { regular: font.regular, bold: font.bold }]),
);

/** Carpeta privada donde quedan las tipografías que suben los docentes. */
const customDir = () => join(uploadsDir(), '.fonts');

const FILE_NAME = /^[a-f0-9]{32}\.(?:ttf|otf|woff2?)$/;

@Injectable()
export class CertificateFontsService {
  private readonly logger = new Logger(CertificateFontsService.name);
  private readonly cache = new Map<string, Buffer>();

  constructor(private readonly repository: CertificateFontsRepository) {}

  // --- Lista para el editor ---

  async catalog(user: AuthenticatedUser) {
    const custom = await this.repository.listOf(user.id);

    return {
      standard: STANDARD_FONTS.map(({ key, label, category }) => ({ key, label, category, hasBold: true })),
      library: loadLibrary().map((font) => ({
        key: font.key,
        label: font.label,
        category: font.category,
        hasBold: font.bold !== null,
        regularUrl: `/api/certificate-fonts/files/${font.regular}`,
        boldUrl: font.bold ? `/api/certificate-fonts/files/${font.bold}` : null,
      })),
      custom: custom.map((font) => ({
        key: customKey(font.id),
        id: font.id,
        label: font.name,
        category: 'Mía',
        hasBold: false,
        regularUrl: `/api/certificate-fonts/custom/${font.id}/file`,
        boldUrl: null,
      })),
    };
  }

  // --- Subir y borrar las propias ---

  async upload(user: AuthenticatedUser, file: { buffer: Buffer; originalname: string } | undefined, name?: string) {
    if (!file) {
      throw new BadRequestException('Adjunta un archivo de tipografía en el campo «file»');
    }

    if (file.buffer.length > MAX_FONT_BYTES) {
      throw new BadRequestException('La tipografía pesa demasiado (máximo 2 MB)');
    }

    if ((await this.repository.count(user.id)) >= MAX_CUSTOM_FONTS) {
      throw new BadRequestException(
        `Puedes tener hasta ${MAX_CUSTOM_FONTS} tipografías propias; borra alguna que no uses`,
      );
    }

    const format = detectFormat(file.buffer);

    if (!format) {
      throw new BadRequestException('El archivo no es una tipografía válida (usa .ttf, .otf, .woff o .woff2)');
    }

    let inspection;

    try {
      inspection = inspectFont(file.buffer);
    } catch {
      throw new BadRequestException('No pudimos leer la tipografía: el archivo está dañado o no es compatible');
    }

    if (inspection.missing.length > 0) {
      throw new BadRequestException(
        `Esta tipografía no incluye todas las letras del español (faltan: ${inspection.missing.slice(0, 8).join(' ')}). ` +
          'Sin ellas el certificado saldría con cuadros en lugar de letras.',
      );
    }

    const fileName = `${randomBytes(16).toString('hex')}.${format}`;

    await mkdir(customDir(), { recursive: true });
    await writeFile(join(customDir(), fileName), file.buffer);

    const font = await this.repository.create({
      name: cleanFontName(name, inspection.family || file.originalname.replace(/\.[^.]+$/, '')),
      fileName,
      ownerId: user.id,
    });

    return { id: font.id, key: customKey(font.id), label: font.name };
  }

  /** El archivo de una tipografía propia (su dueño o un admin). */
  async customFile(user: AuthenticatedUser, id: number): Promise<{ buffer: Buffer; format: FontFormat }> {
    const font = await this.ownedCustom(user, id);
    const buffer = await readFile(join(customDir(), font.fileName)).catch(() => null);

    if (!buffer) {
      throw new NotFoundException('La tipografía no existe');
    }

    return { buffer, format: detectFormat(buffer) ?? 'ttf' };
  }

  /** No se borra una tipografía que alguna plantilla usa o que está en un certificado ya emitido. */
  async remove(user: AuthenticatedUser, id: number) {
    const font = await this.ownedCustom(user, id);
    const key = customKey(id);
    const [templates, certificates] = await Promise.all([
      this.repository.templatesUsing(key),
      this.repository.certificatesUsing(key),
    ]);

    if (templates > 0) {
      throw new ConflictException(
        `Esta tipografía la usa${templates === 1 ? '' : 'n'} ${templates} ${templates === 1 ? 'plantilla' : 'plantillas'}; cámbiala allí antes de borrarla`,
      );
    }

    if (certificates > 0) {
      throw new ConflictException(
        `Esta tipografía está en ${certificates} ${certificates === 1 ? 'certificado ya emitido' : 'certificados ya emitidos'} y se necesita para volver a generarlos; no se puede borrar`,
      );
    }

    await this.repository.delete(id);
    await rm(join(customDir(), font.fileName), { force: true });
    this.cache.delete(key);

    return { deleted: true };
  }

  // --- Para las plantillas y el PDF ---

  /** ¿Puede este usuario usar esa tipografía en una plantilla? */
  async assertUsable(user: AuthenticatedUser, key: string): Promise<void> {
    if (isStandardKey(key) || libraryFont(key)) {
      return;
    }

    const id = customFontId(key);
    const font = id === null ? null : await this.repository.find(id);

    if (!font || (font.ownerId !== user.id && user.role !== Role.ADMIN)) {
      throw new BadRequestException('La tipografía elegida no existe');
    }
  }

  /**
   * Lo necesario para dibujar con una tipografía. Una clave desconocida o un archivo que ya no
   * está (por ejemplo, una tipografía propia borrada) cae a Helvetica: el certificado se genera igual.
   */
  async resolve(key: string | undefined): Promise<FontSource> {
    const wanted = key ?? DEFAULT_FONT;

    if (STANDARD_SOURCE[wanted]) {
      return STANDARD_SOURCE[wanted];
    }

    try {
      const library = libraryFont(wanted);

      if (library) {
        const regular = await this.fileBuffer(`lib:${library.regular}`, libraryFilePath(library.regular));
        const bold = library.bold
          ? await this.fileBuffer(`lib:${library.bold}`, libraryFilePath(library.bold))
          : regular;

        return { regular, bold };
      }

      const id = customFontId(wanted);
      const font = id === null ? null : await this.repository.find(id);

      if (font && FILE_NAME.test(font.fileName)) {
        const buffer = await this.fileBuffer(`custom:${font.id}`, join(customDir(), font.fileName));

        return { regular: buffer, bold: buffer };
      }
    } catch (error) {
      this.logger.warn(`No se pudo cargar la tipografía «${wanted}»: ${(error as Error).message}`);
    }

    return STANDARD_SOURCE[DEFAULT_FONT];
  }

  private async fileBuffer(cacheKey: string, path: string | null): Promise<Buffer> {
    if (!path) {
      throw new Error('archivo desconocido');
    }

    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const buffer = await readFile(path);

    this.cache.set(cacheKey, buffer);

    return buffer;
  }

  private async ownedCustom(user: AuthenticatedUser, id: number) {
    const font = await this.repository.find(id);

    // Quien no es el dueño ni admin recibe lo mismo que si no existiera.
    if (!font || (font.ownerId !== user.id && user.role !== Role.ADMIN)) {
      throw new NotFoundException('La tipografía no existe');
    }

    return font;
  }
}
