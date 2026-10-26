import { Matches } from 'class-validator';

import { PRIVATE_NAME } from '../../uploads/upload-paths.js';

export class AttachCourseFileDto {
  /** Nombre que devolvió `POST /uploads/documents`. */
  @Matches(PRIVATE_NAME, { message: 'El nombre del archivo no es válido' })
  name: string;
}
