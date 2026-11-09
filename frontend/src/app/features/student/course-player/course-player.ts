import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { PublicUrlPipe } from '../../../core/http/public-url.pipe';
import { embeddedLessonVideo, withoutMainVideo } from './video-source';
import { CourseVideo, VideoSample } from './course-video';
import { CourseAssessments, Assessment } from './course-assessments';
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
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Subscription, catchError, concatMap, EMPTY, finalize, of, switchMap } from 'rxjs';
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
  /** Solo en las preguntas: si ya la contestó el docente y cuántas respuestas tiene. */
  answered?: boolean;
  _count?: { replies: number };
}
interface VideoState {
  required: boolean;
  percent: number;
  eligible: boolean;
  position: number;
}
interface Graduation {
  contentComplete: boolean;
  gradesComplete: boolean;
  eligible: boolean;
  certificateEnabled: boolean;
  /** Quién emite el certificado de este curso: la plataforma (PDF) o POK (credencial digital). */
  certificateProvider?: 'PLATFORM' | 'POK';
  average: number | null;
  assessments: Assessment[];
  certificate: {
    id: number;
    status: string;
    provider?: 'PLATFORM' | 'POK';
    pokStatus?: 'NONE' | 'PENDING' | 'EMITTED' | 'ACCEPTED' | 'FAILED';
    pokUrl?: string | null;
  } | null;
}

type Tab =
  | 'assessments'
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
    TranslatePipe,
    PublicUrlPipe,
    FormsModule,
    StudentIcon,
    LessonResource,
    CodePractice,
    QuestionThread,
    StudentAssignments,
    CourseFiles,
    CourseVideo,
    CourseAssessments,
    RichHtmlPipe,
  ],
  templateUrl: './course-player.html',
  styleUrl: './course-player.scss',
})
export class CoursePlayer {
  readonly maximized = signal(true);
  readonly started = signal(false);
  readonly focusToolOpen = signal(false);
  readonly modulesOpen = signal(false);

  toggleModules(): void {
    this.modulesOpen.update((value) => !value);
    this.focusToolOpen.set(false);
  }

  closeFocusPanels(): void {
    this.element.nativeElement
      .querySelector<HTMLButtonElement>('.focus-rail button.active')
      ?.focus({ preventScroll: true });
    this.modulesOpen.set(false);
    this.focusToolOpen.set(false);
  }

  readonly activeToolLabel = computed(
    () => this.tabs().find((item) => item.id === this.tab())?.label ?? 'Herramientas',
  );

  @HostListener('document:keydown', ['$event'])
  onClassroomKeydown(event: KeyboardEvent): void {
    if (!this.maximized() || event.defaultPrevented) return;
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (this.modulesOpen()) {
      this.modulesOpen.set(false);
      this.element.nativeElement
        .querySelector<HTMLButtonElement>('.focus-modules-button')
        ?.focus();
    } else if (this.focusToolOpen()) {
      this.closeFocusPanels();
    }
  }

  readonly course = input.required<CourseDetail>();
  readonly initialProgress = input.required<LearningProgress>();
  readonly courseInformation = computed(() => {
    const course = this.course();
    return [
      { title: 'Qué aprenderás', content: course.whatYouWillLearn },
      { title: 'A quién está dirigido', content: course.audience },
      { title: 'Materiales incluidos', content: course.materials },
      { title: 'Requisitos', content: course.requirements },
    ].filter((section) => section.content?.trim());
  });
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private requestedTab = false;
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private lessonRequest?: Subscription;
  private panelRequest?: Subscription;
  private availabilityRequest?: Subscription;
  readonly videoState = signal<VideoState | null>(null);
  readonly watchError = signal('');
  readonly graduation = signal<Graduation | null>(null);
  readonly graduationError = signal('');
  readonly graduationLoading = signal(false);
  readonly downloading = signal(false);
  private graduationRequest?: Subscription;
  private videoStateRequest?: Subscription;
  private readonly watchSamples = new Subject<{ id: number; sample: VideoSample }>();
  readonly currentVideo = computed(
    () =>
      this.lesson()?.videoUrl ||
      this.lesson()?.resources?.find((r) => materialKind(r) === 'video')?.url ||
      embeddedLessonVideo(this.lesson()?.content),
  );
  readonly lessonDescription = computed(() =>
    withoutMainVideo(this.lesson()?.content ?? '', this.currentVideo()),
  );
  /** ¿La lección trae algo más que el video (texto, imágenes, páginas incrustadas)? Se muestra en la pantalla grande. */
  readonly hasLessonContent = computed(() => {
    const html = this.lessonDescription();

    return (
      /<(iframe|img|video|audio|table|object)\b/i.test(html) ||
      html.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '').length > 0
    );
  });
  readonly canComplete = computed(
    () => !this.currentVideo() || this.videoState()?.eligible === true,
  );
  readonly pendingGrades = computed(
    () => this.graduation()?.assessments.filter((a) => !a.passed).length ?? 0,
  );
  /** Al terminar todas las lecciones el certificado aparece en el escenario, sin abrir el panel. */
  readonly showCertificateBanner = computed(
    () =>
      this.started() &&
      this.progress().percent === 100 &&
      this.progress().totalLessons > 0,
  );
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
    { id: 'assessments', label: 'Evaluaciones' },
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
    this.watchSamples
      .pipe(
        concatMap(({ id, sample }) =>
          this.http.post<VideoState>('/api/lessons/' + id + '/video-progress', sample).pipe(
            switchMap((state) => {
              if (this.selectedId() === id) {
                this.videoState.set(state);
                this.watchError.set('');
              }
              return EMPTY;
            }),
            catchError((error) => {
              if (this.selectedId() === id)
                this.watchError.set(
                  apiErrorMessage(
                    error,
                    'No pudimos guardar el avance del video. Revisa tu conexion y sigue reproduciendo para reintentar.',
                  ),
                );
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
    // Un aviso («Respondieron tu pregunta») manda `?tab=preguntas`: se abre esa pestaña. Se vuelve a
    // leer si llega otro aviso estando ya en el curso, porque la ruta no cambia.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.requestedTab = params.get('tab') === 'preguntas';
      // Si todavía se está iniciando, se abre al terminar (`select` vuelve a «Descripción»).
      if (!this.initializing()) this.applyRequestedTab();
    });
    effect(() => {
      const course = this.course();
      untracked(() => {
        this.progress.set(this.initialProgress());
        this.started.set(false);
        this.maximized.set(true);
        this.selectedId.set(null);
        this.lesson.set(null);
        this.initialize(course.id);
        this.refreshGraduation();
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
          if (this.started() && !this.selectedId()) {
            const open = this.lessons().filter((item) => !this.locked(item.moduleId));
            const first = open.find((item) => !this.completed().has(item.id)) ?? open[0];
            if (first) this.select(first.id);
          }
          this.applyRequestedTab();
        },
        error: (error) =>
          this.initError.set(apiErrorMessage(error, 'No pudimos cargar el contenido disponible.')),
      });
  }
  startCourse(): void {
    if (this.initializing() || this.started()) return;
    this.started.set(true);
    const open = this.lessons().filter((item) => !this.locked(item.moduleId));
    const first = open.find((item) => !this.completed().has(item.id)) ?? open[0];
    if (first) this.select(first.id);
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
    if (!item || this.lessonLocked(id) || this.saving() || this.questionSaving()) return;
    if (this.modulesOpen()) {
      this.element.nativeElement
        .querySelector<HTMLButtonElement>('.focus-modules-button')
        ?.focus({ preventScroll: true });
      this.modulesOpen.set(false);
    }
    this.saveNote(false);
    this.lessonRequest?.unsubscribe();
    this.panelRequest?.unsubscribe();
    this.selectedId.set(id);
    this.lesson.set(null);
    this.activeResource.set(null);
    this.loading.set(true);
    this.error.set('');
    this.videoError.set(false);
    this.videoState.set(null);
    this.watchError.set('');
    this.videoStateRequest?.unsubscribe();
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
          if (this.currentVideo()) {
            this.videoStateRequest = this.http
              .get<VideoState>('/api/lessons/' + id + '/video-progress')
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (state) => this.videoState.set(state),
                error: (e) =>
                  this.watchError.set(apiErrorMessage(e, 'No pudimos cargar tu avance del video.')),
              });
          }
          if (!this.currentVideo())
            this.activeResource.set(
              lesson.resources?.find((resource) => materialKind(resource) !== 'link') ?? null,
            );
        },
        error: (error) => this.error.set(apiErrorMessage(error, 'No pudimos abrir esta lección.')),
      });
  }
  lessonLocked(id: number): boolean {
    const items = this.lessons();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0 || this.locked(items[index].moduleId)) return true;
    if (this.completed().has(id)) return false;
    return items
      .slice(0, index)
      .some(
        (item) =>
          (item.hasVideo || (item.id === this.lesson()?.id && Boolean(this.currentVideo()))) &&
          !this.completed().has(item.id),
      );
  }
  reportVideo(sample: VideoSample): void {
    const id = this.lesson()?.id;
    if (id && this.currentVideo()) this.watchSamples.next({ id, sample });
  }
  /** Mientras POK emite la credencial (Pendiente), se vuelve a preguntar sola hasta que quede lista. */
  private pokTimer: ReturnType<typeof setTimeout> | null = null;
  private pokChecks = 0;
  private readonly stopPokWatch = this.destroyRef.onDestroy(() => {
    if (this.pokTimer) clearTimeout(this.pokTimer);
  });
  private watchPokCredential(state: Graduation): void {
    if (this.pokTimer) clearTimeout(this.pokTimer);
    this.pokTimer = null;
    const certificate = state.certificate;
    if (certificate?.pokStatus !== 'PENDING') {
      this.pokChecks = 0;
      return;
    }
    if (this.pokChecks >= 20) return; // ~1 minuto: después basta con el botón
    this.pokChecks += 1;
    this.pokTimer = setTimeout(() => {
      this.http
        .post('/api/certificates/' + certificate.id + '/pok/sync', {})
        .pipe(
          catchError(() => of(null)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => this.refreshGraduation(true));
    }, 3000);
  }
  refreshGraduation(silent = false): void {
    this.graduationRequest?.unsubscribe();
    if (!silent) this.graduationLoading.set(true);
    this.graduationError.set('');
    this.graduationRequest = this.http
      .get<Graduation>('/api/certificates/courses/' + this.course().id + '/completion')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.graduationLoading.set(false)),
      )
      .subscribe({
        next: (state) => {
          this.graduation.set(state);
          this.watchPokCredential(state);
        },
        error: (e) =>
          this.graduationError.set(
            apiErrorMessage(e, 'No pudimos consultar las notas y el certificado.'),
          ),
      });
  }
  readonly pokBusy = signal(false);
  readonly pokLabels: Record<string, string> = {
    NONE: 'Sin enviar',
    PENDING: 'Pendiente',
    EMITTED: 'Emitida',
    ACCEPTED: 'Aceptada',
    FAILED: 'Falló el envío',
  };
  /** Credencial de POK: se pide (si aún no existe) o se consulta su estado. No hay PDF de la plataforma. */
  requestPokCredential(): void {
    if (this.pokBusy()) return;
    this.pokBusy.set(true);
    this.graduationError.set('');
    const existing = this.graduation()?.certificate;
    const request = existing
      ? this.http.post('/api/certificates/' + existing.id + '/pok/sync', {})
      : this.http.post('/api/certificates/courses/' + this.course().id + '/claim', {});
    request
      .pipe(
        switchMap((result) => {
          const claimed = result as { certificate?: { id: number } | null };
          // Recién emitido: se pide a POK enseguida (si no, quedaría esperando la tarea en segundo plano).
          return existing || !claimed.certificate
            ? of(result)
            : this.http.post('/api/certificates/' + claimed.certificate.id + '/pok/sync', {});
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.pokBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.pokChecks = 0;
          this.refreshGraduation();
        },
        error: (e) =>
          this.graduationError.set(
            apiErrorMessage(e, 'No pudimos pedir tu credencial digital. Intenta de nuevo.'),
          ),
      });
  }
  downloadCertificate(): void {
    if (
      !this.graduation()?.eligible ||
      !this.graduation()?.certificateEnabled ||
      this.downloading()
    )
      return;
    this.downloading.set(true);
    this.graduationError.set('');
    this.http
      .post<{ certificate: { id: number; status: string } | null }>(
        '/api/certificates/courses/' + this.course().id + '/claim',
        {},
      )
      .pipe(
        switchMap((result) => {
          if (!result.certificate || result.certificate.status !== 'VALID')
            throw new Error('El certificado no esta disponible o fue revocado.');
          return this.http.get('/api/certificates/' + result.certificate.id + '/pdf', {
            responseType: 'blob',
          });
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.downloading.set(false)),
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'certificado-' + this.course().id + '.pdf';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.refreshGraduation();
        },
        error: (e) =>
          this.graduationError.set(
            apiErrorMessage(e, 'No pudimos descargar el certificado. Intenta de nuevo.'),
          ),
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
    if (!lesson || this.saving() || this.completed().has(lesson.id) || !this.canComplete()) return;
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
          this.refreshGraduation();
        },
        error: (error) =>
          this.progressError.set(apiErrorMessage(error, 'No pudimos guardar tu progreso.')),
      });
  }
  /** Abre la pestaña que pidió la ruta (`?tab=preguntas`), una sola vez. */
  private applyRequestedTab(): void {
    if (!this.requestedTab || !this.tabs().some((t) => t.id === 'questions')) return;
    this.requestedTab = false;
    // Después de pintar la página, para que exista `#course-tools` al desplazarse.
    setTimeout(() => this.openTool('questions'));
  }
  openTool(tab: Tab): void {
    this.selectTab(tab);
    this.element.nativeElement.querySelector('#course-tools')?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }
  selectTab(tab: Tab): void {
    if (this.maximized()) {
      this.modulesOpen.set(false);
      this.focusToolOpen.set(true);
    }
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
