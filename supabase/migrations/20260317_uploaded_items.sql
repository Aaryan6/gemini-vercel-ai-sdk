create extension if not exists vector with schema extensions;

create table if not exists public.uploaded_items (
  id uuid primary key,
  kind text not null check (kind in ('text', 'file')),
  created_at timestamptz not null default timezone('utc', now()),
  embedding extensions.vector(1536) not null,
  text text,
  truncated boolean not null default false,
  original_name text,
  stored_name text,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  file_url text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists uploaded_items_created_at_idx on public.uploaded_items (created_at desc);
create index if not exists uploaded_items_embedding_idx on public.uploaded_items using ivfflat (embedding extensions.vector_cosine_ops);

alter table public.uploaded_items disable row level security;

create or replace function public.match_uploaded_items(
  query_embedding extensions.vector(1536),
  match_count int default 4
)
returns table (
  id uuid,
  kind text,
  created_at timestamptz,
  text text,
  truncated boolean,
  original_name text,
  stored_name text,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  file_url text,
  metadata jsonb,
  score float8
)
language sql
stable
as $$
  select
    uploaded_items.id,
    uploaded_items.kind,
    uploaded_items.created_at,
    uploaded_items.text,
    uploaded_items.truncated,
    uploaded_items.original_name,
    uploaded_items.stored_name,
    uploaded_items.mime_type,
    uploaded_items.size_bytes,
    uploaded_items.storage_path,
    uploaded_items.file_url,
    uploaded_items.metadata,
    1 - (uploaded_items.embedding <=> query_embedding) as score
  from public.uploaded_items
  order by uploaded_items.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;
