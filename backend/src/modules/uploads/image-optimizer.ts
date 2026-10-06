import { stat } from 'node:fs/promises';
import sharp from 'sharp';

// Sin caché de archivos abiertos: así el original se puede borrar justo después de optimizarlo
// (en Windows, un archivo aún abierto no se puede eliminar).
sharp.cache(false);

export interface ImageOptions {
  maxWidth: number;
  /** 1-100. */
  quality: number;
}

/**
 * Deja una imagen ligera: la gira según su orientación, la reduce si es más ancha
 * que `maxWidth` (nunca la agranda), la convierte a WebP y le quita los metadatos
 * (ubicación GPS, cámara…). Un GIF animado sigue animado.
 * Devuelve el tamaño final en bytes.
 */
export async function optimizeImage(
  inputPath: string,
  outputPath: string,
  options: ImageOptions,
): Promise<number> {
  await sharp(inputPath, {
    animated: true,
    // Protege contra "bombas de píxeles": imágenes diminutas en bytes pero gigantes al abrirlas.
    limitInputPixels: 100_000_000,
  })
    .rotate()
    .resize({ width: options.maxWidth, withoutEnlargement: true })
    .webp({ quality: options.quality })
    .toFile(outputPath);

  return (await stat(outputPath)).size;
}
