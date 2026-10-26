import { LessonResource, LearningResource, materialKind } from './lesson-resource';
import { CodePractice } from './code-practice';
import { QuestionThread } from './question-thread';
import { CourseFiles } from './course-files';
import { StudentAssignments } from './student-assignments';
import { RichHtmlPipe } from '../../../shared/pipes/rich-html.pipe';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, finalize } from 'rxjs';
import type { CourseDetail } from '../../home/pages/course-detail-page';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { formatDuration } from '../../../core/utils/format-duration';
import { isPlayableVideoUrl } from '../../../core/uploads/upload-rules';
import { StudentIcon } from '../dashboard/student-icon';

export interface LearningProgress {
  percent: number;
  completedLessons: number;
  totalLessons: number;
  completedLessonIds?: number[];
  status?: string;
}
interface Availability {
  moduleId: number;
  locked: boolean;
  reason?: string | null;
}
interface Lesson {
  id: number;
  title: string;
  content?: string;
  videoUrl?: string;
  resources: LearningResource[];
}
interface Post {
  id: number;
  title: string;
  body: string;
  author?: { firstName: string; lastName: string };
}
type Tab =
  | 'practice'
  | 'description'
  | 'resources'
  | 'assignments'
  | 'notes'
  | 'questions'
  | 'announcements';
@Component({
  selector: 'app-course-player',
  imports: [
    RouterLink,
    FormsModule,
    StudentIcon,
    LessonResource,
    CodePractice,
    QuestionThread,
    StudentAssignments,
    CourseFiles,
    RichHtmlPipe,
  ],
  templateUrl: './course-player.html',
  styleUrl: './course-player.scss',
})
export class CoursePlayer {
  readonly course = input.required<CourseDetail>();
  readonly initialProgress = input.required<LearningProgress>();
  private readonly http = inject(HttpClient);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private lessonRequest?: Subscription;
  private panelRequest?: Subscription;
  private availabilityRequest?: Subscription;
  readonly progress = signal<LearningProgress>({
    percent: 0,
    completedLessons: 0,
    totalLessons: 0,
  });
  readonly availability = signal<Availability[]>([]);
  readonly initializing = signal(true);
  readonly initError = signal('');
  readonly selectedId = signal<number | null>(null);
  readonly lesson = signal<Lesson | null>(null);
  readonly activeResource = signal<LearningResource | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly progressError = signal('');
  readonly videoError = signal(false);
  readonly tab = signal<Tab>('description');
  readonly panelLoading = signal(false);
  readonly panelError = signal('');
  readonly posts = signal<Post[]>([]);
  readonly questionSaving = signal(false);
  readonly questionNotice = signal('');
  readonly noteNotice = signal('');
  note = '';
  questionTitle = '';
  questionBody = '';
  readonly formatDuration = formatDuration;
  readonly playable = isPlayableVideoUrl;
  private readonly allTabs: { id: Tab; label: string }[] = [
    { id: 'description', label: 'Descripción' },
    { id: 'resources', label: 'Recursos' },
    { id: 'assignments', label: 'Tareas' },
    { id: 'practice', label: 'Practicar código' },
    { id: 'notes', label: 'Mis notas' },
    { id: 'questions', label: 'Preguntas' },
    { id: 'announcements', label: 'Anuncios' },
  ];
  readonly programmingEnabled = computed(() => this.course().programmingEnabled === true);
  readonly tabs = computed(() =>
    this.allTabs.filter((tab) => tab.id !== 'practice' || this.programmingEnabled()),
  );
  readonly lessons = computed(() =>
    (this.course().modules ?? []).flatMap((module, moduleIndex) =>
      module.lessons.map((lesson, lessonIndex) => ({
        ...lesson,
        moduleId: module.id,
        moduleTitle: module.title,
        moduleIndex,
        lessonIndex,
      })),
    ),
  );
  readonly selected = computed(() => this.lessons().find((item) => item.id === this.selectedId()));
  readonly selectedIndex = computed(() =>
    this.lessons().findIndex((item) => item.id === this.selectedId()),
  );
  readonly previous = computed(() => this.lessons()[this.selectedIndex() - 1]);
  readonly next = computed(() => this.lessons()[this.selectedIndex() + 1]);
  readonly completed = computed(() => new Set(this.progress().completedLessonIds ?? []));
  readonly level = computed(
    () =>
      ({ BEGINNER: 'Principiante', INTERMEDIATE: 'Intermedio', ADVANCED: 'Avanzado' })[
        this.course().level ?? ''
      ] ?? 'Todos los niveles',
  );
  constructor() {
    effect(() => {
      const course = this.course();
      untracked(() => {
        this.progress.set(this.initialProgress());
        this.selectedId.set(null);
        this.lesson.set(null);
        this.initialize(course.id);
      });
    });
  }
  initialize(courseId = this.course().id): void {
    this.availabilityRequest?.unsubscribe();
    this.initializing.set(true);
    this.initError.set('');
    this.availabilityRequest = this.http
      .get<{ modules: Availability[] }>('/api/courses/' + courseId + '/modules/availability')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.initializing.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.availability.set(data.modules);
          if (!this.selectedId()) {
            const open = this.lessons().filter((item) => !this.locked(item.moduleId));
            const first = open.find((item) => !this.completed().has(item.id)) ?? open[0];
            if (first) this.select(first.id);
          }
        },
        error: (error) =>
          this.initError.set(apiErrorMessage(error, 'No pudimos cargar el contenido disponible.')),
      });
  }
  locked(moduleId: number): boolean {
    return this.availability().find((module) => module.moduleId === moduleId)?.locked ?? true;
  }
  lockReason(moduleId: number): string {
    const reason = this.availability().find((module) => module.moduleId === moduleId)?.reason;
    return reason === 'DATE' || reason === 'DAYS'
      ? 'Disponible en la fecha indicada por el docente'
      : 'Completa los módulos anteriores o sus requisitos';
  }
  moduleCompleted(moduleId: number): number {
    return this.lessons().filter(
      (item) => item.moduleId === moduleId && this.completed().has(item.id),
    ).length;
  }
  select(id: number): void {
    const item = this.lessons().find((lesson) => lesson.id === id);
    if (!item || this.locked(item.moduleId) || this.saving()) return;
    this.saveNote(false);
    this.lessonRequest?.unsubscribe();
    this.panelRequest?.unsubscribe();
    this.selectedId.set(id);
    this.lesson.set(null);
    this.activeResource.set(null);
    this.loading.set(true);
    this.error.set('');
    this.videoError.set(false);
    this.tab.set('description');
    this.panelError.set('');
    this.progressError.set('');
    this.noteNotice.set('');
    this.questionTitle = '';
    this.questionBody = '';
    this.questionNotice.set('');
    this.loadNote();
    this.lessonRequest = this.http
      .get<Lesson>('/api/lessons/' + id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (lesson) => {
          this.lesson.set(lesson);
          if (!lesson.videoUrl)
            this.activeResource.set(
              lesson.resources?.find((resource) => materialKind(resource) !== 'link') ?? null,
            );
        },
        error: (error) => this.error.set(apiErrorMessage(error, 'No pudimos abrir esta lección.')),
      });
  }
  openResource(resource: LearningResource): void {
    this.activeResource.set(resource);
  }
  resourceLabel(resource: LearningResource): string {
    return {
      pdf: 'PDF',
      audio: 'Audio',
      video: 'Video',
      image: 'Imagen',
      interactive: 'Actividad',
      link: 'Enlace',
    }[materialKind(resource)];
  }
  practiceKey(): string {
    return (
      'campus.practice:' +
      this.auth.user()?.email +
      ':' +
      this.course().id +
      ':' +
      this.selectedId()
    );
  }
  complete(): void {
    const lesson = this.lesson();
    if (!lesson || this.saving() || this.completed().has(lesson.id)) return;
    this.saving.set(true);
    this.progressError.set('');
    this.http
      .post<LearningProgress>('/api/lessons/' + lesson.id + '/complete', {})
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (progress) => {
          this.progress.set(progress);
          this.initialize();
        },
        error: (error) =>
          this.progressError.set(apiErrorMessage(error, 'No pudimos guardar tu progreso.')),
      });
  }
  openTool(tab: Tab): void {
    this.selectTab(tab);
    this.element.nativeElement.querySelector('#course-tools')?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }
  selectTab(tab: Tab): void {
    if (tab === 'practice' && !this.programmingEnabled()) return;
    this.tab.set(tab);
    this.panelRequest?.unsubscribe();
    this.panelError.set('');
    this.posts.set([]);
    if (tab !== 'questions' && tab !== 'announcements') return;
    this.panelLoading.set(true);
    const path =
      tab === 'questions'
        ? '/api/discussions?kind=QUESTION&courseId='
        : '/api/announcements?courseId=';
    this.panelRequest = this.http
      .get<{ items: Post[] }>(path + this.course().id + '&limit=20')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.panelLoading.set(false)),
      )
      .subscribe({
        next: (data) => this.posts.set(data.items),
        error: (error) =>
          this.panelError.set(apiErrorMessage(error, 'No pudimos cargar esta sección.')),
      });
  }
  ask(): void {
    if (this.questionSaving() || this.course()['qaEnabled'] === false) return;
    this.questionSaving.set(true);
    this.panelError.set('');
    this.questionNotice.set('');
    this.http
      .post<Post>('/api/courses/' + this.course().id + '/questions', {
        title: this.questionTitle.trim(),
        body: this.questionBody.trim(),
        ...(this.lesson() ? { lessonId: this.lesson()!.id } : {}),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.questionSaving.set(false)),
      )
      .subscribe({
        next: (post) => {
          if (this.tab() === 'questions') this.posts.update((items) => [post, ...items]);
          this.questionTitle = this.questionBody = '';
          this.questionNotice.set('Tu pregunta fue enviada al docente.');
        },
        error: (error) =>
          this.panelError.set(apiErrorMessage(error, 'No pudimos enviar tu pregunta.')),
      });
  }
  private noteKey(): string {
    return (
      'campus.notes:' + this.auth.user()?.email + ':' + this.course().id + ':' + this.selectedId()
    );
  }
  private loadNote(): void {
    try {
      this.note = localStorage.getItem(this.noteKey()) ?? '';
    } catch {
      this.note = '';
      this.noteNotice.set('No se pudo acceder a tus notas locales.');
    }
  }
  saveNote(notify = true): void {
    if (!this.selectedId()) return;
    try {
      localStorage.setItem(this.noteKey(), this.note);
      if (notify) this.noteNotice.set('Notas guardadas en este navegador.');
    } catch {
      this.noteNotice.set('No se pudieron guardar las notas. Copia el texto antes de salir.');
    }
  }
}
