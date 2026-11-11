// Idempotent schema. Runs once per server start, inside a transaction guarded by an advisory lock.
export const SCHEMA = `
create table if not exists settings (
  key text primary key,
  value text not null
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'member',
  color text not null default '#5b6cff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  color text not null default '#ff5a36',
  portfolio text not null default '',
  archived boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  position double precision not null default 0,
  is_done boolean not null default false
);

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  start_date date not null,
  end_date date not null,
  color text not null default '#5b6cff',
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status_id uuid references statuses(id) on delete set null,
  milestone_id uuid references milestones(id) on delete set null,
  parent_id uuid references tasks(id) on delete cascade,
  title text not null,
  description text not null default '',
  priority text not null default 'none',
  start_date date,
  due_date date,
  position double precision not null default 0,
  tags jsonb not null default '[]',
  assignees jsonb not null default '[]',
  completed_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tasks_project_idx on tasks(project_id);
create index if not exists tasks_parent_idx on tasks(parent_id);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_task_idx on comments(task_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_project_idx on messages(project_id, created_at);

create table if not exists docs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null default 'Untitled doc',
  content text not null default '',
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  name text not null,
  mime text not null default 'application/octet-stream',
  size integer not null default 0,
  data bytea,
  url text,
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists files_project_idx on files(project_id);

create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  user_id uuid not null references users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  seconds integer not null default 0,
  note text not null default ''
);
create index if not exists time_project_idx on time_entries(project_id);
create index if not exists time_user_idx on time_entries(user_id);

create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_project_idx on activity(project_id, created_at);

-- kept so databases created by earlier versions still load; the app no longer
-- reads or writes either column (dependencies and repeating tasks were removed)
alter table tasks add column if not exists recurrence text not null default '';
alter table tasks add column if not exists blocked_by jsonb not null default '[]';

create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (project_id, user_id)
);
-- one-time upgrade: workspaces created before project membership existed keep everyone on every project
insert into project_members (project_id, user_id)
  select p.id, u.id from projects p cross join users u
  where not exists (select 1 from settings where key = 'pm_migrated')
  on conflict do nothing;
insert into settings (key, value) values ('pm_migrated', '1') on conflict (key) do nothing;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  kind text not null,
  text text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  is_group boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists dm_messages_conv_idx on dm_messages(conversation_id, created_at);

/* ── v3: Google sign-in, invitations, chat channels ── */
alter table users add column if not exists google_id text;
alter table users add column if not exists avatar_url text not null default '';
alter table users alter column password_hash drop not null;
create unique index if not exists users_google_idx on users(google_id) where google_id is not null;

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'member',
  token text not null unique,
  invited_by uuid references users(id) on delete set null,
  accepted_by uuid references users(id) on delete set null,
  accepted_at timestamptz,
  project_ids jsonb not null default '[]',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);
create index if not exists invitations_email_idx on invitations(lower(email));

create table if not exists channel_reads (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists tasks_title_idx on tasks(lower(title));
create index if not exists projects_name_idx on projects(lower(name));

/* ── v4: task keys, threaded discussions, attachments on messages ── */
alter table projects add column if not exists key text not null default '';
alter table tasks add column if not exists number integer;
alter table messages add column if not exists parent_id uuid references messages(id) on delete cascade;
alter table messages add column if not exists edited_at timestamptz;
alter table comments add column if not exists edited_at timestamptz;
alter table files add column if not exists comment_id uuid references comments(id) on delete cascade;
alter table files add column if not exists message_id uuid references messages(id) on delete cascade;
alter table activity add column if not exists task_id uuid references tasks(id) on delete cascade;
create index if not exists files_comment_idx on files(comment_id);
create index if not exists files_message_idx on files(message_id);
create index if not exists messages_parent_idx on messages(parent_id);
create index if not exists activity_task_idx on activity(task_id);

-- one-time: give every existing project a short key and every task a number
update projects p set key = k.key from (
  select id, upper(left(coalesce(nullif(regexp_replace(name, '[^a-zA-Z]', '', 'g'), ''), 'PRJ'), 3))
    || case when row_number() over (
         partition by upper(left(coalesce(nullif(regexp_replace(name, '[^a-zA-Z]', '', 'g'), ''), 'PRJ'), 3))
         order by created_at, id) = 1 then '' else
         row_number() over (
           partition by upper(left(coalesce(nullif(regexp_replace(name, '[^a-zA-Z]', '', 'g'), ''), 'PRJ'), 3))
           order by created_at, id)::text end as key
  from projects
) k where p.id = k.id and p.key = '';

update tasks t set number = n.seq from (
  select id, row_number() over (partition by project_id order by created_at, id) as seq
  from tasks where parent_id is null
) n where t.id = n.id and t.number is null
  and not exists (select 1 from settings where key = 'task_numbers_migrated');
insert into settings (key, value) values ('task_numbers_migrated', '1') on conflict (key) do nothing;

/* ── v5: desktop and push notifications ── */
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists push_user_idx on push_subscriptions(user_id);
alter table notifications add column if not exists link text;
`;
