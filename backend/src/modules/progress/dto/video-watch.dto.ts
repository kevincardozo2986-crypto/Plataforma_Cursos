import { IsBoolean, IsNumber, Max, Min } from 'class-validator';

export class VideoWatchDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(86400)
  position: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.1)
  @Max(86400)
  duration: number;

  @IsBoolean()
  playing: boolean;
}
