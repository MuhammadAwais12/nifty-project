/**
 * Roles and permissions.
 *
 * Every protected action is listed in PERMS below. The RPC route checks this
 * table before any handler runs, so a role can never reach an action it is not
 * listed for — even if the client sends the request directly.
 */

export const ROLES = ['owner', 'admin', 'manager', 'member', 'guest'] as const;
export type Role = (typeof ROLES)[number];

export const RANK: Record<Role, number> = { owner: 4, admin: 3, manager: 2, member: 1, guest: 0 };

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  member: 'Member',
  guest: 'Guest',
};

export const ROLE_BLURB: Record<Role, string> = {
  owner: 'Full control of the workspace. There is always exactly one owner.',
  admin: 'Everything except removing the owner. Sees every project.',
  manager: 'Creates projects and manages who is on the projects they belong to.',
  member: 'Works on the projects they are added to.',
  guest: 'Client access: views their projects, comments and shares files. Changes nothing.',
};

/** Roles a person with this role is allowed to hand out. */
export const CAN_GRANT: Record<Role, Role[]> = {
  owner: ['admin', 'manager', 'member', 'guest'],
  admin: ['manager', 'member', 'guest'],
  manager: ['member', 'guest'],
  member: [],
  guest: [],
};

export const atLeast = (role: Role, min: Role) => RANK[role] >= RANK[min];
/** Owner and admin see every project without being a member. */
export const seesEverything = (role: Role) => atLeast(role, 'admin');
/** Guests never write to anything except comments, discussions and file links. */
export const readOnly = (role: Role) => role === 'guest';

/**
 * Which roles may call each RPC action.
 * `null` means the action is public (no session required).
 */
export const PERMS: Record<string, Role[] | null> = {
  'auth.status': null,
  'auth.signup': null,
  'auth.login': null,
  'auth.logout': null,
  'invite.preview': null,

  // everyone signed in, guests included
  bootstrap: [...ROLES],
  mywork: [...ROLES],
  search: [...ROLES],
  'project.get': [...ROLES],
  'task.get': [...ROLES],
  'comment.create': [...ROLES],
  'comment.delete': [...ROLES],
  'message.list': [...ROLES],
  'message.create': [...ROLES],
  'message.delete': [...ROLES],
  'channel.read': [...ROLES],
  'doc.list': [...ROLES],
  'doc.get': [...ROLES],
  'file.list': [...ROLES],
  'file.addLink': [...ROLES],
  'notif.list': [...ROLES],
  'notif.read': [...ROLES],
  'profile.update': [...ROLES],

  // members and up: the people who do the work
  'project.update': ['owner', 'admin', 'manager', 'member'],
  'status.create': ['owner', 'admin', 'manager', 'member'],
  'status.update': ['owner', 'admin', 'manager', 'member'],
  'status.reorder': ['owner', 'admin', 'manager', 'member'],
  'status.delete': ['owner', 'admin', 'manager', 'member'],
  'task.create': ['owner', 'admin', 'manager', 'member'],
  'task.update': ['owner', 'admin', 'manager', 'member'],
  'task.move': ['owner', 'admin', 'manager', 'member'],
  'task.delete': ['owner', 'admin', 'manager', 'member'],
  'milestone.create': ['owner', 'admin', 'manager', 'member'],
  'milestone.update': ['owner', 'admin', 'manager', 'member'],
  'milestone.delete': ['owner', 'admin', 'manager', 'member'],
  'doc.create': ['owner', 'admin', 'manager', 'member'],
  'doc.update': ['owner', 'admin', 'manager', 'member'],
  'doc.delete': ['owner', 'admin', 'manager', 'member'],
  'file.delete': ['owner', 'admin', 'manager', 'member'],
  'time.start': ['owner', 'admin', 'manager', 'member'],
  'time.stop': ['owner', 'admin', 'manager', 'member'],
  'time.add': ['owner', 'admin', 'manager', 'member'],
  'time.list': ['owner', 'admin', 'manager', 'member'],
  'time.delete': ['owner', 'admin', 'manager', 'member'],
  'report.summary': ['owner', 'admin', 'manager', 'member'],
  'dm.list': ['owner', 'admin', 'manager', 'member'],
  'dm.open': ['owner', 'admin', 'manager', 'member'],
  'dm.messages': ['owner', 'admin', 'manager', 'member'],
  'dm.send': ['owner', 'admin', 'manager', 'member'],

  // managers and up: shape the workspace
  'project.create': ['owner', 'admin', 'manager'],
  'project.delete': ['owner', 'admin', 'manager'],
  'member.set': ['owner', 'admin', 'manager'],
  'invite.create': ['owner', 'admin', 'manager'],
  'invite.list': ['owner', 'admin', 'manager'],
  'invite.revoke': ['owner', 'admin', 'manager'],

  // admins only: the workspace itself
  'team.invite': ['owner', 'admin'],
  'team.update': ['owner', 'admin'],
  'team.transfer': ['owner'],
};

export function allowed(action: string, role: Role | null): 'public' | 'ok' | 'signin' | 'forbidden' {
  const roles = PERMS[action];
  if (roles === null) return 'public';
  if (roles === undefined) return 'forbidden';
  if (!role) return 'signin';
  return roles.includes(role) ? 'ok' : 'forbidden';
}

export function forbiddenMessage(role: Role): string {
  if (role === 'guest') return 'Guests can view, comment and share files. Ask a team member to make this change.';
  if (role === 'member') return 'Only managers and admins can do this.';
  if (role === 'manager') return 'Only workspace admins can do this.';
  return 'You do not have access to this.';
}
