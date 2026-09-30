import { TestBed } from '@angular/core/testing';
import { LoginForm } from './login-form';
describe('LoginForm', () => {
  it('rechaza identificadores vacíos sin emitir credenciales', () => {
    const fixture = TestBed.createComponent(LoginForm);
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.form.setValue({
      identifier: '  ',
      password: 'password123',
      remember: false,
    });
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(submitted).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#identifier-error').textContent).toContain(
      'Ingresa',
    );
  });
  it('emite credenciales válidas y evita envíos mientras carga', () => {
    const fixture = TestBed.createComponent(LoginForm);
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    const data = { identifier: '0012345', password: 'password123', remember: true };
    fixture.componentInstance.form.setValue(data);
    fixture.componentInstance.submit();
    expect(submitted).toHaveBeenCalledWith(data);
    fixture.componentRef.setInput('loading', true);
    fixture.componentInstance.submit();
    expect(submitted).toHaveBeenCalledTimes(1);
  });
  it('permite mostrar y ocultar la contraseña', () => {
    const fixture = TestBed.createComponent(LoginForm);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.eye').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#password').type).toBe('text');
    fixture.nativeElement.querySelector('.eye').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#password').type).toBe('password');
  });
});
