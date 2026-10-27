import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toEmbed } from '../../../core/html/video-embed';
import { isPlayableVideoUrl } from '../../../core/uploads/upload-rules';

export interface VideoSample {
  position: number;
  duration: number;
  playing: boolean;
}
interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  pauseVideo(): void;
  destroy(): void;
}
interface VimeoPlayer {
  on(event: string, callback: (data: { seconds: number; duration: number }) => void): void;
  getCurrentTime(): Promise<number>;
  getDuration(): Promise<number>;
  getPaused(): Promise<boolean>;
  pause(): Promise<void>;
  destroy(): Promise<void>;
}
type VideoWindow = Window & {
  YT?: {
    Player: new (
      frame: HTMLIFrameElement,
      options: { events: Record<string, () => void> },
    ) => YouTubePlayer;
  };
  Vimeo?: { Player: new (frame: HTMLIFrameElement) => VimeoPlayer };
  onYouTubeIframeAPIReady?: () => void;
};
const sdkLoads = new Map<string, Promise<void>>();
function loadSdk(window: VideoWindow, provider: 'youtube' | 'vimeo'): Promise<void> {
  if (provider === 'youtube' ? window.YT?.Player : window.Vimeo?.Player) return Promise.resolve();
  const existing = sdkLoads.get(provider);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = window.document.createElement('script');
    const timeout = window.setTimeout(
      () => reject(new Error('No se pudo conectar con el reproductor')),
      15000,
    );
    const ready = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    if (provider === 'youtube') {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        ready();
      };
      script.src = 'https://www.youtube.com/iframe_api';
    } else {
      script.src = 'https://player.vimeo.com/api/player.js';
      script.onload = ready;
    }
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('No se pudo cargar el reproductor'));
    };
    window.document.head.append(script);
  }).catch((error) => {
    sdkLoads.delete(provider);
    throw error;
  });
  sdkLoads.set(provider, promise);
  return promise;
}

@Component({
  selector: 'app-course-video',
  template: `
    @if (native()) {
      <video
        #video
        controls
        playsinline
        preload="metadata"
        [src]="src()"
        [poster]="poster()"
        [attr.aria-label]="title()"
        (loadedmetadata)="nativeSample(true)"
        (play)="nativeSample(true)"
        (pause)="nativeSample(true)"
        (timeupdate)="nativeSample()"
        (ended)="nativeSample(true)"
        (seeking)="nativeSample(true, false)"
        (seeked)="nativeSample(true)"
        (error)="failed.set(true)"
      >
        Tu navegador no puede reproducir este video.
      </video>
    } @else if (embed(); as embedded) {
      <div #frameHost class="embed-player"></div>
      @if (embedded.provider === 'youtube') {
        <div class="video-actions">
          <a [href]="originalUrl()" target="_blank" rel="noopener noreferrer"
            >Abrir en YouTube &#8599;</a
          >
          <button type="button" (click)="switchYouTubeHost()">
            Probar reproductor alternativo
          </button>
        </div>
      }
      @if (embedded.provider !== 'youtube' && embedded.provider !== 'vimeo') {
        <p class="notice">
          Este proveedor no permite registrar el avance. Pide al docente el archivo del video o un
          enlace de YouTube o Vimeo.
        </p>
      }
    } @else {
      <div class="unsupported"><p>Este enlace no se puede reproducir dentro del aula.</p></div>
    }
    @if (failed()) {
      <div class="notice" role="alert">
        <p>
          No pudimos cargar el video. Puede seguir procesándose o tener restricciones del proveedor.
        </p>
        <button type="button" (click)="retry()">Reintentar video</button>
        @if (safeLink()) {
          <a [href]="src()" target="_blank" rel="noopener noreferrer">Abrir original ↗</a>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      background: #08182c;
      color: #e5f0ff;
    }
    video,
    iframe {
      display: block;
      width: 100%;
      aspect-ratio: 16/9;
      max-height: var(--course-video-height, none);
      border: 0;
      object-fit: contain;
    }
    .video-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      padding: 8px 14px;
      font-size: 0.72rem;
    }
    .video-actions a {
      color: #a8d7ff;
    }
    .video-actions button {
      font-size: inherit;
      padding: 4px 8px;
    }
    .notice {
      padding: 12px 18px;
      font-size: 0.76rem;
      line-height: 1.6;
      background: #132c47;
    }
    .notice p {
      margin: 0 0 8px;
    }
    .notice a {
      color: #a8d7ff;
      margin-left: 12px;
    }
    button {
      padding: 7px 12px;
      border: 1px solid #8cb9ed;
      border-radius: 8px;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }
    .unsupported {
      min-height: 240px;
      display: grid;
      place-items: center;
      padding: 24px;
      text-align: center;
    }
  `,
})
export class CourseVideo {
  readonly src = input.required<string>();
  readonly title = input('Video de la lección');
  readonly poster = input('');
  readonly sample = output<VideoSample>();
  readonly failed = signal(false);
  private readonly document = inject(DOCUMENT);
  private readonly frame = viewChild<ElementRef<HTMLDivElement>>('frameHost');
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private lastSample = 0;
  readonly retryVersion = signal(0);
  private readonly privacyHost = signal(false);
  private pauseExternal?: () => void;
  readonly safeLink = computed(
    () =>
      /^https?:\/\/[^\s]+$/i.test(this.src()) ||
      /^\/api\/uploads\/[a-f0-9]{32}\.[a-z0-9]+$/i.test(this.src()),
  );
  readonly native = computed(() => this.safeLink() && isPlayableVideoUrl(this.src()));
  readonly embed = computed(() => (this.native() ? null : toEmbed(this.src())));
  readonly frameUrl = computed(() => {
    const embed = this.embed();
    if (!embed) return null;
    const url = new URL(embed.src);
    if (embed.provider === 'youtube') {
      url.hostname = this.privacyHost() ? 'www.youtube-nocookie.com' : 'www.youtube.com';
      url.searchParams.set('enablejsapi', '1');
      url.searchParams.set('origin', this.document.location?.origin ?? '');
    }
    return url.href;
  });
  readonly originalUrl = computed(() => {
    const embed = this.embed();
    if (embed?.provider !== 'youtube') return this.src();
    const id = new URL(embed.src).pathname.split('/').pop();
    return 'https://www.youtube.com/watch?v=' + id;
  });
  constructor() {
    effect(() => {
      this.src();
      this.failed.set(false);
      this.privacyHost.set(false);
    });
    effect((onCleanup) => {
      this.retryVersion();
      const host = this.frame()?.nativeElement;
      const address = this.frameUrl();
      const embed = this.embed();
      const window = this.document.defaultView as VideoWindow | null;
      if (!host || !window || !embed || !address) return;
      // Provider SDKs remove their iframe during destroy. Keep that DOM outside Angular's ownership.
      const frame = this.document.createElement('iframe');
      frame.src = address;
      frame.title = this.title();
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.style.cssText =
        'display:block;width:100%;aspect-ratio:16/9;max-height:var(--course-video-height,none);border:0';
      host.replaceChildren(frame);
      if (embed.provider !== 'youtube' && embed.provider !== 'vimeo') {
        onCleanup(() => frame.remove());
        return;
      }
      let disposed = false;
      let timer: number | undefined;
      let readyTimer: number | undefined;
      let ready = false;
      let destroy: (() => void) | undefined;
      let polling = false;
      loadSdk(window, embed.provider)
        .then(() => {
          if (disposed) return;
          readyTimer = window.setTimeout(() => {
            if (!disposed && !ready) this.frameFailed();
          }, 12000);
          if (embed.provider === 'youtube') {
            const player = new window.YT!.Player(frame, {
              events: {
                onReady: () => {
                  ready = true;
                  window.clearTimeout(readyTimer);
                  if (!disposed)
                    this.emit({
                      position: player.getCurrentTime(),
                      duration: player.getDuration(),
                      playing: false,
                    });
                },
                onStateChange: () => {
                  if (!disposed)
                    this.emit({
                      position: player.getCurrentTime(),
                      duration: player.getDuration(),
                      playing: player.getPlayerState() === 1,
                    });
                },
                onError: () => {
                  if (!disposed) this.failed.set(true);
                },
              },
            });
            this.pauseExternal = () => player.pauseVideo();
            timer = window.setInterval(() => {
              if (!disposed && ready && player.getDuration)
                this.emit({
                  position: player.getCurrentTime(),
                  duration: player.getDuration(),
                  playing: player.getPlayerState() === 1,
                });
            }, 4000);
            destroy = () => player.destroy();
          } else {
            const player = new window.Vimeo!.Player(frame);
            const poll = async () => {
              if (polling || disposed) return;
              polling = true;
              try {
                const [position, duration, paused] = await Promise.all([
                  player.getCurrentTime(),
                  player.getDuration(),
                  player.getPaused(),
                ]);
                if (!disposed) this.emit({ position, duration, playing: !paused });
              } catch {
                if (!disposed) this.failed.set(true);
              } finally {
                polling = false;
              }
            };
            player.on('loaded', () => {
              ready = true;
              window.clearTimeout(readyTimer);
            });
            for (const event of ['loaded', 'play', 'pause', 'seeked', 'ended'])
              player.on(event, () => void poll());
            player.on('error', () => {
              if (!disposed) this.failed.set(true);
            });
            timer = window.setInterval(() => void poll(), 4000);
            this.pauseExternal = () => {
              void player.pause().catch(() => {});
            };
            destroy = () => {
              void player.destroy().catch(() => {});
            };
          }
        })
        .catch(() => {
          if (!disposed) this.failed.set(true);
        });
      onCleanup(() => {
        disposed = true;
        if (timer !== undefined) window.clearInterval(timer);
        if (readyTimer !== undefined) window.clearTimeout(readyTimer);
        this.pauseExternal = undefined;
        destroy?.();
        frame.remove();
      });
    });
    const hide = () => {
      if (this.document.hidden) {
        this.video()?.nativeElement.pause();
        this.pauseExternal?.();
      }
    };
    this.document.addEventListener('visibilitychange', hide);
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('visibilitychange', hide));
  }
  private emit(sample: VideoSample): void {
    if (Number.isFinite(sample.duration) && sample.duration > 0 && Number.isFinite(sample.position))
      this.sample.emit(sample);
  }
  nativeSample(force = false, playing?: boolean): void {
    const video = this.video()?.nativeElement;
    if (!video || (!force && Date.now() - this.lastSample < 4000)) return;
    this.lastSample = Date.now();
    this.emit({
      position: video.currentTime,
      duration: video.duration,
      playing: playing ?? (!video.paused && !video.ended && !video.seeking),
    });
  }
  frameFailed(): void {
    if (this.embed()?.provider === 'youtube' && !this.privacyHost()) this.switchYouTubeHost();
    else this.failed.set(true);
  }
  switchYouTubeHost(): void {
    this.privacyHost.update((value) => !value);
    this.retry();
  }
  retry(): void {
    this.failed.set(false);
    this.video()?.nativeElement.load();
    this.retryVersion.update((value) => value + 1);
  }
}
