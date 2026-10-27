import { embeddedLessonVideo, withoutMainVideo } from './video-source';

describe('Videos embedded by the course editor', () => {
  it('recognizes an existing YouTube iframe and keeps the description without a duplicate player', () => {
    const content =
      '<p>Clase</p><iframe src="https://www.youtube.com/embed/9P0UkeGBZwQ?si=test&amp;start=0" allowfullscreen></iframe>';
    const source = embeddedLessonVideo(content);
    expect(source).toBe('https://www.youtube.com/embed/9P0UkeGBZwQ?si=test&start=0');
    expect(withoutMainVideo(content, source)).toBe('<p>Clase</p>');
  });
  it('preserves interactive resources and rejects a script URL masquerading as a video', () => {
    const activity = '<iframe src="https://view.genially.com/123"></iframe>';
    expect(embeddedLessonVideo(activity)).toBeNull();
    expect(withoutMainVideo(activity, null)).toBe(activity);
    expect(embeddedLessonVideo('<iframe src="javascript:alert(1)"></iframe>')).toBeNull();
  });
});
