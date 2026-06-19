create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  year integer,
  isbn text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.book_files (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  format text not null check (format in ('epub', 'mobi', 'txt')),
  file_url text not null,
  created_at timestamptz not null default now()
);

alter table public.books enable row level security;
alter table public.book_files enable row level security;

drop policy if exists "Anyone can read books" on public.books;
create policy "Anyone can read books"
  on public.books for select
  using (true);

drop policy if exists "Anyone can read book files" on public.book_files;
create policy "Anyone can read book files"
  on public.book_files for select
  using (true);

drop policy if exists "Temporary public book inserts" on public.books;
create policy "Temporary public book inserts"
  on public.books for insert
  with check (true);

drop policy if exists "Temporary public book file inserts" on public.book_files;
create policy "Temporary public book file inserts"
  on public.book_files for insert
  with check (true);

insert into storage.buckets (id, name, public)
values ('book-files', 'book-files', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Anyone can read book files" on storage.objects;
create policy "Anyone can read book files"
  on storage.objects for select
  using (bucket_id = 'book-files');

drop policy if exists "Anyone can upload book files" on storage.objects;
create policy "Anyone can upload book files"
  on storage.objects for insert
  with check (bucket_id = 'book-files');

create table if not exists public.reader_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_key text not null,
  book_title text,
  file_url text,
  chapter_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_key)
);

create table if not exists public.reader_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_key text not null,
  book_title text,
  file_url text,
  chapter_index integer not null default 0,
  note_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reader_progress enable row level security;
alter table public.reader_notes enable row level security;

drop policy if exists "Users can read own reader progress" on public.reader_progress;
create policy "Users can read own reader progress"
  on public.reader_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own reader progress" on public.reader_progress;
create policy "Users can insert own reader progress"
  on public.reader_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own reader progress" on public.reader_progress;
create policy "Users can update own reader progress"
  on public.reader_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own reader notes" on public.reader_notes;
create policy "Users can read own reader notes"
  on public.reader_notes for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own reader notes" on public.reader_notes;
create policy "Users can insert own reader notes"
  on public.reader_notes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own reader notes" on public.reader_notes;
create policy "Users can delete own reader notes"
  on public.reader_notes for delete
  to authenticated
  using (auth.uid() = user_id);
