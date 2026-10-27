import { TestBed } from '@angular/core/testing';
import { CourseVideo } from './course-video';

describe('Embedded course video lifecycle', () => {
  const originalYT = (window as unknown as { YT?: unknown }).YT;
  afterEach(() => {
    (window as unknown as { YT?: unknown }).YT = originalYT;
  });
  async function build() {
    const frames: HTMLIFrameElement[] = [];
    const destroy = vi.fn();
    (window as unknown as { YT: unknown }).YT = {
      Player: class {
        constructor(frame: HTMLIFrameElement, options: { events: { onReady: () => void } }) {
          frames.push(frame);
          this.destroy = () => {
            destroy();
            frame.remove();
          };
          queueMicrotask(() => options.events.onReady());
        }
        getCurrentTime() {
          return 0;
        }
        getDuration() {
          return 100;
        }
        getPlayerState() {
          return 2;
        }
        pauseVideo() {}
        destroy: () => void;
      },
    };
    const fixture = TestBed.createComponent(CourseVideo);
    fixture.componentRef.setInput('src', 'https://www.youtube.com/watch?v=9P0UkeGBZwQ');
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, player: fixture.componentInstance, frames, destroy };
  }
  it('uses the standard YouTube domain and provides a normal watch link', async () => {
    const { fixture, player } = await build();
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    expect(new URL(frame.src).hostname).toBe('www.youtube.com');
    expect(new URL(frame.src).searchParams.get('enablejsapi')).toBe('1');
    expect(player.originalUrl()).toBe('https://www.youtube.com/watch?v=9P0UkeGBZwQ');
  });
  it('recreates a connected iframe after retry instead of reusing the destroyed iframe', async () => {
    const { fixture, player, frames, destroy } = await build();
    const first = frames[0];
    player.retry();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(2);
    expect(frames[1]).not.toBe(first);
    expect(fixture.nativeElement.contains(frames[1])).toBe(true);
  });
  it('offers the privacy domain as fallback and safely changes lessons', async () => {
    const { fixture, player, frames } = await build();
    player.frameFailed();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(new URL(frames.at(-1)!.src).hostname).toBe('www.youtube-nocookie.com');
    fixture.componentRef.setInput('src', 'https://www.youtube.com/watch?v=GcmZj5ZhSow');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.contains(frames.at(-1))).toBe(true);
    expect(new URL(frames.at(-1)!.src).hostname).toBe('www.youtube.com');
    expect(new URL(frames.at(-1)!.src).pathname).toBe('/embed/GcmZj5ZhSow');
  });
});
