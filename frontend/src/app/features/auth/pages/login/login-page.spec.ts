import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LoginPage } from './login-page';
describe('LoginPage', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('muestra errores y bloquea peticiones duplicadas', () => {
    const fixture = TestBed.createComponent(LoginPage);
    const page = fixture.componentInstance;
    const credentials = {
      identifier: 'test@example.com',
      password: 'password123',
      remember: false,
    };
    page.login(credentials);
    page.login(credentials);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/login')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(page.loading()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Revisa tus datos',
    );
  });
  it('compone las partes y permite ajustar el contraste', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-campus-brand')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-login-form')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-login-links')).toBeTruthy();
    fixture.nativeElement.querySelector('app-accessibility-menu .trigger').click();
    fixture.detectChanges();
    const contrastButton = Array.from(
      fixture.nativeElement.querySelectorAll('#access-options button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Alto contraste'));
    expect(contrastButton).toBeTruthy();
    contrastButton!.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('main').classList.contains('high-contrast')).toBe(
      true,
    );
    expect(fixture.nativeElement.querySelector('app-campus-brand img').getAttribute('src')).toBe(
      '/images/1-Logo-Oficial-Santoto-Tunja.png',
    );
  });
});
