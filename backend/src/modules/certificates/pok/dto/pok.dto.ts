import { Matches, ValidateIf } from 'class-validator';

export class SetPokTemplateDto {
  /** Id del diseño en POK, o `null` para volver al diseño predeterminado. */
  @ValidateIf((dto: SetPokTemplateDto) => dto.pokTemplateId !== null)
  @Matches(/^[A-Za-z0-9_-]{1,100}$/, { message: 'El id del diseño no es válido' })
  pokTemplateId: string | null;
}
