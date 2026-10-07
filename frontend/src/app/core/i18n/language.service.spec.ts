import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { LanguageService } from './language.service';
import { LoginPage } from '../../features/auth/pages/login/login-page';
import { LoginForm } from '../../features/auth/components/login-form/login-form';
import { AccessibilityMenu } from '../../shared/ui/accessibility-menu/accessibility-menu';

describe('Application language', () => {
  beforeEach(() => {
    localStorage.removeItem('campus.language');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem('campus.language');
    document.documentElement.lang = 'es';
    document.title = 'Campus Virtual | Santo Tomás Tunja';
  });
  it('translates the page, validations and existing errors from the global menu', async () => {
    const page = TestBed.createComponent(LoginPage);
    const menu = TestBed.createComponent(AccessibilityMenu);
    page.detectChanges();
    menu.detectChanges();
    await page.whenStable();
    await menu.whenStable();
    page.debugElement.query(By.directive(LoginForm)).componentInstance.submit();
    page.componentInstance.error.set('Revisa el correo o documento y tu contraseña.');
    page.componentInstance.unavailable('El acceso como invitado');
    menu.nativeElement.querySelector('.trigger').click();
    menu.detectChanges();
    menu.nativeElement.querySelector('button[lang="en"]').click();
    page.detectChanges();
    menu.detectChanges();
    await page.whenStable();
    expect(page.nativeElement.querySelector('label[for="identifier"]').textContent).toContain(
      'Email address or document number',
    );
    expect(page.nativeElement.querySelector('#identifier').placeholder).toContain(
      'Enter your email',
    );
    expect(page.nativeElement.querySelector('#password-error').textContent).toContain(
      'at least 8 characters',
    );
    expect(page.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Check your email',
    );
    expect(page.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'Guest access',
    );
    expect(menu.nativeElement.querySelector('h2').textContent.trim()).toBe('Accessibility');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('campus.language')).toBe('en');
    menu.nativeElement.querySelector('button[lang="es"]').click();
    page.detectChanges();
    expect(page.nativeElement.querySelector('label[for="identifier"]').textContent).toContain(
      'Correo electr',
    );
  });
  it('restores the saved language and retains it when the page is recreated', async () => {
    localStorage.setItem('campus.language', 'en');
    const first = TestBed.createComponent(LoginPage);
    first.detectChanges();
    await first.whenStable();
    first.detectChanges();
    expect(TestBed.inject(LanguageService).language()).toBe('en');
    first.destroy();
    const second = TestBed.createComponent(LoginPage);
    second.detectChanges();
    expect(second.nativeElement.querySelector('label[for="identifier"]').textContent).toContain(
      'Email address',
    );
  });
  it('defaults to Spanish for unsupported saved values', async () => {
    localStorage.setItem('campus.language', 'invalid');
    const page = TestBed.createComponent(LoginPage);
    page.detectChanges();
    await page.whenStable();
    expect(TestBed.inject(LanguageService).language()).toBe('es');
  });
});
