import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../generated/prisma/enums.js';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  const makeContext = (role?: Role) =>
    ({
      getHandler: () => () => undefined,
      getClass: () => RolesGuard,
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  it('permite rutas sin roles requeridos', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(new RolesGuard(reflector).canActivate(makeContext())).toBe(true);
  });

  it('permite el rol requerido', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(new RolesGuard(reflector).canActivate(makeContext(Role.ADMIN))).toBe(
      true,
    );
  });

  it('rechaza un rol diferente', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(() =>
      new RolesGuard(reflector).canActivate(makeContext(Role.STUDENT)),
    ).toThrow(ForbiddenException);
  });

  it('rechaza solicitudes sin usuario en rutas con roles', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(() => new RolesGuard(reflector).canActivate(makeContext())).toThrow(
      ForbiddenException,
    );
  });
});
