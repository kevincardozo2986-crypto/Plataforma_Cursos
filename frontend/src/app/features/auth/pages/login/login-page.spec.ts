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
  it('compone el login sin duplicar el menú global', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-login-form')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-login-links')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-accessibility-menu')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-site-header')).toBeNull();
  });
});
