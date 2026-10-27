export type WatchedRange = [number, number];

/** Credit distinct played segments, never the seek position or repeated playback. */
export function addWatchedRange(
  ranges: WatchedRange[],
  start: number,
  end: number,
  duration: number,
): WatchedRange[] {
  const sorted = [
    ...ranges,
    [Math.max(0, start), Math.min(duration, end)] as WatchedRange,
  ]
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((a, b) => a[0] - b[0]);
  const merged: WatchedRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1])
      previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}
export function watchedPercent(
  ranges: WatchedRange[],
  duration: number,
): number {
  return duration > 0
    ? Math.min(
        100,
        (ranges.reduce((sum, [a, b]) => sum + b - a, 0) / duration) * 100,
      )
    : 0;
}
export function embeddedVideo(content?: string | null): string | null {
  for (const match of (content ?? '').matchAll(
    /<(iframe|video)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
  )) {
    const source = match[2].replace(/&amp;/g, '&');
    try {
      const url = new URL(source, 'https://campus.invalid');
      if (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        (/^(?:www\.|m\.|player\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|loom\.com|dailymotion\.com)$/.test(
          url.hostname,
        ) ||
          (match[1].toLowerCase() === 'video' &&
            /\.(mp4|webm|ogv|ogg|mov)$/i.test(url.pathname)))
      )
        return source;
    } catch {
      /* Ignore malformed URLs. */
    }
  }
  return null;
}
export function primaryVideo(lesson: {
  videoUrl?: string | null;
  content?: string | null;
  resources?: { type: string; url: string }[];
}): string | null {
  return (
    lesson.videoUrl ||
    lesson.resources?.find(
      (r) =>
        r.type === 'VIDEO' ||
        (!['AUDIO', 'PDF', 'IMAGE', 'INTERACTIVE'].includes(r.type) &&
          /\.(mp4|webm|ogv|mov)(?:[?#]|$)/i.test(r.url)),
    )?.url ||
    embeddedVideo(lesson.content)
  );
}
