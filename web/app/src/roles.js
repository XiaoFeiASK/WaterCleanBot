export const ROLE_NAMES = Object.freeze({
  user: '普通用户',
  superuser: '超级用户',
  admin: '管理员用户',
});

export const ROLE_LEVELS = Object.freeze({
  user: 1,
  superuser: 2,
  admin: 3,
});

export function getRoleName(role) {
  return ROLE_NAMES[role] || role;
}

export function hasMinimumRole(role, minimumRole) {
  const minimumLevel = ROLE_LEVELS[minimumRole];
  return Boolean(minimumLevel && ROLE_LEVELS[role] >= minimumLevel);
}
