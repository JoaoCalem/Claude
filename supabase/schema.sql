-- Splitwise Clone Schema for Supabase
-- Run this in Supabase SQL Editor to set up your database

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- Groups table
create table groups (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Group members
create table group_members (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

-- Expenses
create table expenses (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references groups(id) on delete cascade not null,
  paid_by uuid references profiles(id) on delete set null not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  split_type text not null default 'equal' check (split_type in ('equal', 'percentage', 'exact', 'shares')),
  created_at timestamptz default now()
);

-- Expense splits (how each person owes)
create table expense_splits (
  id uuid default uuid_generate_v4() primary key,
  expense_id uuid references expenses(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  amount numeric(12,2) not null,
  unique (expense_id, user_id)
);

-- Settlements (recording payments between users)
create table settlements (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references groups(id) on delete cascade not null,
  paid_by uuid references profiles(id) on delete set null not null,
  paid_to uuid references profiles(id) on delete set null not null,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table settlements enable row level security;

-- Profiles: users can read all profiles, update their own
create policy "Profiles are viewable by authenticated users"
  on profiles for select to authenticated using (true);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Groups: members can see their groups
create policy "Group members can view groups"
  on groups for select using (
    id in (select group_id from group_members where user_id = auth.uid())
  );

create policy "Authenticated users can create groups"
  on groups for insert to authenticated with check (true);

create policy "Group creator can update"
  on groups for update using (created_by = auth.uid());

create policy "Group creator can delete"
  on groups for delete using (created_by = auth.uid());

-- Group members: members can see other members
create policy "Members can view group members"
  on group_members for select using (
    group_id in (select group_id from group_members gm where gm.user_id = auth.uid())
  );

create policy "Group creators can add members"
  on group_members for insert to authenticated with check (true);

create policy "Members can leave or creator can remove"
  on group_members for delete using (
    user_id = auth.uid() or
    group_id in (select id from groups where created_by = auth.uid())
  );

-- Expenses: group members can view
create policy "Group members can view expenses"
  on expenses for select using (
    group_id in (select group_id from group_members where user_id = auth.uid())
  );

create policy "Group members can add expenses"
  on expenses for insert to authenticated with check (
    group_id in (select group_id from group_members where user_id = auth.uid())
  );

create policy "Expense creator can delete"
  on expenses for delete using (paid_by = auth.uid());

-- Expense splits
create policy "Group members can view splits"
  on expense_splits for select using (
    expense_id in (
      select e.id from expenses e
      join group_members gm on gm.group_id = e.group_id
      where gm.user_id = auth.uid()
    )
  );

create policy "Authenticated users can insert splits"
  on expense_splits for insert to authenticated with check (true);

create policy "Expense creator can delete splits"
  on expense_splits for delete using (
    expense_id in (select id from expenses where paid_by = auth.uid())
  );

-- Settlements
create policy "Group members can view settlements"
  on settlements for select using (
    group_id in (select group_id from group_members where user_id = auth.uid())
  );

create policy "Group members can add settlements"
  on settlements for insert to authenticated with check (
    group_id in (select group_id from group_members where user_id = auth.uid())
  );

-- Function to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
