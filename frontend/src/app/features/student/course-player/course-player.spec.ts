import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { CoursePlayer } from './course-player';

const course = {
  id: '7',
  programmingEnabled: true,
  title: 'Aprende Angular',
  modules: [
    {
      id: 10,
      title: 'Primeros pasos',
      lessons: [
        { id: 1, title: 'Introduccion' },
        { id: 2, title: 'Componentes' },
      ],
    },
    { id: 20, title: 'Avanzado', lessons: [{ id: 3, title: 'Proyecto' }] },
  ],
};
describe('CoursePlayer', () => {
  let fixture: ComponentFixture<CoursePlayer>;
  let player: CoursePlayer;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => ({ email: 'student@example.com' }) } },
      ],
    });
    fixture = TestBed.createComponent(CoursePlayer);
    player = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('course', course);
    fixture.componentRef.setInput('initialProgress', {
      percent: 33,
      completedLessons: 1,
      totalLessons: 3,
      completedLessonIds: [1],
    });
    fixture.detectChanges();
    http.expectOne('/api/courses/7/modules/availability').flush({
      modules: [
        { moduleId: 10, locked: false },
        { moduleId: 20, locked: true, reason: 'PREVIOUS' },
      ],
    });
  });
  afterEach(() => {
    for (const request of http
      .match('/api/certificates/courses/7/completion')
      .filter((r) => !r.cancelled))
      request.flush({
        contentComplete: false,
        gradesComplete: true,
        eligible: false,
        certificateEnabled: true,
        average: null,
        assessments: [],
        certificate: null,
      });
    http.verify();
    localStorage.removeItem('campus.notes:student@example.com:7:2');
  });
  function loadLesson() {
    http
      .expectOne('/api/lessons/2')
      .flush({ id: 2, title: 'Componentes', content: '<p>Contenido real</p>', resources: [] });
  }
  it('lets the student go back while the current video is incomplete', () => {
    http
      .expectOne('/api/lessons/2')
      .flush({ id: 2, title: 'Video', videoUrl: 'https://example.com/video.mp4', resources: [] });
    http
      .expectOne('/api/lessons/2/video-progress')
      .flush({ required: true, percent: 10, eligible: false, position: 10 });
    fixture.detectChanges();
    const previous = fixture.nativeElement.querySelector('.stage-previous') as HTMLButtonElement;
    expect(previous.disabled).toBe(false);
    previous.click();
    http.expectOne('/api/lessons/1').flush({ id: 1, title: 'Introduccion', resources: [] });
    expect(player.selectedId()).toBe(1);
  });
  it('promotes an embedded YouTube video into the main player and enforces the server threshold', () => {
    http.expectOne('/api/lessons/2').flush({
      id: 2,
      title: 'Componentes',
      content:
        '<p>Introduccion</p><iframe src="https://www.youtube.com/embed/9P0UkeGBZwQ"></iframe>',
      resources: [],
    });
    http
      .expectOne('/api/lessons/2/video-progress')
      .flush({ required: true, percent: 89, eligible: false, position: 89 });
    expect(player.currentVideo()).toBe('https://www.youtube.com/embed/9P0UkeGBZwQ');
    expect(player.lessonDescription()).toBe('<p>Introduccion</p>');
    expect(player.canComplete()).toBe(false);
    player.complete();
    http.expectNone('/api/lessons/2/complete');
    player.availability.set([
      { moduleId: 10, locked: false },
      { moduleId: 20, locked: false },
    ]);
    player.select(3);
    http.expectNone('/api/lessons/3');
    player.reportVideo({ position: 90, duration: 100, playing: true });
    http
      .expectOne('/api/lessons/2/video-progress')
      .flush({ required: true, percent: 90, eligible: true, position: 90 });
    expect(player.canComplete()).toBe(true);
    // Reaching 90% enables completion, but the next lesson still waits for saved completion.
    expect(player.lessonLocked(3)).toBe(true);
  });
  it('shows the introductory video for an empty course without fabricating lesson progress', () => {
    loadLesson();
    fixture.componentRef.setInput('course', {
      ...course,
      modules: [],
      introVideoUrl: 'https://example.com/intro.mp4',
    });
    fixture.detectChanges();
    http.expectOne('/api/courses/7/modules/availability').flush({ modules: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-course-video video')?.getAttribute('src')).toBe(
      'https://example.com/intro.mp4',
    );
    expect(fixture.nativeElement.textContent).toContain('video introductorio');
    expect(player.lessons()).toHaveLength(0);
  });
  it('resumes the first incomplete unlocked lesson and renders its real content', () => {
    expect(player.selectedId()).toBe(2);
    loadLesson();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Contenido real');
    expect(player.completed().has(1)).toBe(true);
  });
  it('does not request content from a locked module', () => {
    loadLesson();
    player.select(3);
    expect(player.selectedId()).toBe(2);
    http.expectNone('/api/lessons/3');
  });
  it('cancels a previous lesson request when selection changes', () => {
    const old = http.expectOne('/api/lessons/2');
    player.select(1);
    expect(old.cancelled).toBe(true);
    http.expectOne('/api/lessons/1').flush({ id: 1, title: 'Introduccion', resources: [] });
    expect(player.lesson()?.id).toBe(1);
  });
  it('updates completion only after the server confirms and refreshes module locks', () => {
    loadLesson();
    player.complete();
    player.complete();
    const request = http.expectOne('/api/lessons/2/complete');
    expect(request.request.method).toBe('POST');
    expect(player.completed().has(2)).toBe(false);
    request.flush({
      percent: 67,
      completedLessons: 2,
      totalLessons: 3,
      completedLessonIds: [1, 2],
    });
    http.expectOne('/api/courses/7/modules/availability').flush({
      modules: [
        { moduleId: 10, locked: false },
        { moduleId: 20, locked: false },
      ],
    });
    expect(player.completed().has(2)).toBe(true);
    expect(player.locked(20)).toBe(false);
  });
  it('retains the previous progress when completion fails', () => {
    loadLesson();
    player.complete();
    http
      .expectOne('/api/lessons/2/complete')
      .flush({ message: 'No autorizado' }, { status: 403, statusText: 'Forbidden' });
    expect(player.progress().percent).toBe(33);
    expect(player.completed().has(2)).toBe(false);
    expect(player.progressError()).toBe('No autorizado');
  });
  it('keeps notes scoped to the student, course and lesson', () => {
    loadLesson();
    player.note = 'Mis apuntes';
    player.saveNote();
    expect(localStorage.getItem('campus.notes:student@example.com:7:2')).toBe('Mis apuntes');
    expect(player.noteNotice()).toContain('este navegador');
  });
  it('loads course announcements separately from questions', () => {
    loadLesson();
    player.selectTab('announcements');
    http
      .expectOne('/api/announcements?courseId=7&limit=20')
      .flush({ items: [{ id: 9, title: 'Bienvenidos', body: '<p>Hola</p>' }] });
    expect(player.posts()[0].title).toBe('Bienvenidos');
    player.selectTab('questions');
    http.expectOne('/api/discussions?kind=QUESTION&courseId=7&limit=20').flush({ items: [] });
    expect(player.posts()).toEqual([]);
  });
  it('keeps practice and course questions available when there are no lessons', () => {
    loadLesson();
    fixture.componentRef.setInput('course', { ...course, modules: [] });
    fixture.detectChanges();
    http.expectOne('/api/courses/7/modules/availability').flush({ modules: [] });
    player.selectTab('practice');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-code-practice')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.quick-tools').textContent).toContain(
      'Hacer una pregunta',
    );
    player.selectTab('questions');
    http.expectOne('/api/discussions?kind=QUESTION&courseId=7&limit=20').flush({ items: [] });
    player.questionTitle = 'Duda del curso';
    player.questionBody = 'Cuando empieza el contenido?';
    player.ask();
    const request = http.expectOne('/api/courses/7/questions');
    expect(request.request.body).not.toHaveProperty('lessonId');
    request.flush({ id: 20, title: 'Duda del curso', body: 'Cuando empieza el contenido?' });
    expect(player.questionNotice()).toContain('enviada');
  });

  it('hides the code workspace on non-programming courses', () => {
    loadLesson();
    fixture.componentRef.setInput('course', { ...course, programmingEnabled: false });
    fixture.detectChanges();
    http
      .expectOne('/api/courses/7/modules/availability')
      .flush({ modules: [{ moduleId: 10, locked: false }] });
    http.expectOne('/api/lessons/2').flush({ id: 2, title: 'Componentes', resources: [] });
    expect(player.tabs().some((tab) => tab.id === 'practice')).toBe(false);
    player.selectTab('practice');
    expect(player.tab()).not.toBe('practice');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-code-practice')).toBeNull();
  });
});
