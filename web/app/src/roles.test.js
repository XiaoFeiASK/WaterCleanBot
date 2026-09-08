import { describe, expect, it } from 'vitest';
import { getRoleName, hasMinimumRole, ROLE_LEVELS } from './roles';

describe('user roles', () => {
  it('uses the expected Chinese role names', () => {
    expect(getRoleName('user')).toBe('普通用户');
    expect(getRoleName('superuser')).toBe('超级用户');
    expect(getRoleName('admin')).toBe('管理员用户');
  });

  it('orders permissions from ordinary user to administrator', () => {
    expect(ROLE_LEVELS.user).toBeLessThan(ROLE_LEVELS.superuser);
    expect(ROLE_LEVELS.superuser).toBeLessThan(ROLE_LEVELS.admin);
    expect(hasMinimumRole('admin', 'superuser')).toBe(true);
    expect(hasMinimumRole('superuser', 'admin')).toBe(false);
    expect(hasMinimumRole('unknown', 'user')).toBe(false);
  });
});
