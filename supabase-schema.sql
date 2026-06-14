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
