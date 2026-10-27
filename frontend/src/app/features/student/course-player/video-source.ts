import { toEmbed } from '../../../core/html/video-embed';
import { isPlayableVideoUrl } from '../../../core/uploads/upload-rules';

export function embeddedLessonVideo(content?: string | null): string | null {
  for (const match of (content ?? '').matchAll(
    /<(iframe|video)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
  )) {
    const source = match[2].replace(/&amp;/g, '&');
    const embed = toEmbed(source);
    if (
      (embed && embed.provider !== 'other') ||
      (match[1].toLowerCase() === 'video' && isPlayableVideoUrl(source))
    )
      return source;
  }
  return null;
}

/** Avoid a second player for the same video underneath the main player. */
export function withoutMainVideo(content: string, source: string | null): string {
  if (!source) return content;
  return content.replace(
    /<(iframe|video)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/\1\s*>/gi,
    (html, _tag: string, url: string) => (url.replace(/&amp;/g, '&') === source ? '' : html),
  );
}
