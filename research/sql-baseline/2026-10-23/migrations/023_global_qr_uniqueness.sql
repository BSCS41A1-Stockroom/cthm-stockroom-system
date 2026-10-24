begin;

create extension if not exists pgcrypto;

-- One authoritative namespace prevents the same public QR identity from ever
-- being persisted for two accounts/assets, including concurrent inserts.
create table if not exists public.qr_identity_registry (
  public_id uuid primary key,
  owner_type text not null check (owner_type in ('profile','asset')),
  owner_id text not null,
  created_at timestamptz not null default now(),
  unique (owner_type, owner_id)
);

do $$
declare
  profile_row record;
  candidate uuid;
  claimed uuid;
begin
  for profile_row in
    select user_id, qr_public_id from public.profiles profile
     where not exists (
       select 1 from public.qr_identity_registry registry
        where registry.owner_type='profile' and registry.owner_id=profile.user_id::text
     )
  loop
    candidate := profile_row.qr_public_id;
    loop
      insert into public.qr_identity_registry(public_id,owner_type,owner_id)
      values(candidate,'profile',profile_row.user_id::text)
      on conflict do nothing returning public_id into claimed;
      exit when claimed is not null;
      candidate := gen_random_uuid();
      update public.profiles set qr_public_id=candidate, qr_version=qr_version+1, updated_at=now()
       where user_id=profile_row.user_id;
    end loop;
    claimed := null;
  end loop;
end $$;

do $$
declare
  asset_row record;
  candidate uuid;
  claimed uuid;
begin
  for asset_row in
    select id, qr_public_id from public.inventory_assets asset
     where not exists (
       select 1 from public.qr_identity_registry registry
        where registry.owner_type='asset' and registry.owner_id=asset.id::text
     )
  loop
    candidate := asset_row.qr_public_id;
    loop
      insert into public.qr_identity_registry(public_id,owner_type,owner_id)
      values(candidate,'asset',asset_row.id::text)
      on conflict do nothing returning public_id into claimed;
      exit when claimed is not null;
      candidate := gen_random_uuid();
      update public.inventory_assets set qr_public_id=candidate, qr_version=qr_version+1, updated_at=now()
       where id=asset_row.id;
    end loop;
    claimed := null;
  end loop;
end $$;

create or replace function public.claim_global_qr_identity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  identity_owner_type text;
  identity_owner_id text;
  claimed uuid;
begin
  identity_owner_type := case when tg_table_name='profiles' then 'profile' else 'asset' end;
  identity_owner_id := coalesce(to_jsonb(new)->>'user_id',to_jsonb(new)->>'id');

  if tg_op='UPDATE' and new.qr_public_id=old.qr_public_id then
    return new;
  end if;

  if tg_op='UPDATE' then
    delete from public.qr_identity_registry
     where public_id=old.qr_public_id
       and owner_type=identity_owner_type and owner_id=identity_owner_id;
  end if;

  loop
    insert into public.qr_identity_registry(public_id,owner_type,owner_id)
    values(new.qr_public_id,identity_owner_type,identity_owner_id)
    on conflict do nothing returning public_id into claimed;
    exit when claimed is not null;
    new.qr_public_id := gen_random_uuid();
  end loop;
  return new;
end $$;

create or replace function public.release_global_qr_identity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from public.qr_identity_registry
   where public_id=old.qr_public_id
     and owner_type=case when tg_table_name='profiles' then 'profile' else 'asset' end
     and owner_id=coalesce(to_jsonb(old)->>'user_id',to_jsonb(old)->>'id');
  return old;
end $$;

drop trigger if exists profiles_claim_global_qr_identity on public.profiles;
create trigger profiles_claim_global_qr_identity before insert or update of qr_public_id on public.profiles
for each row execute function public.claim_global_qr_identity();
drop trigger if exists assets_claim_global_qr_identity on public.inventory_assets;
create trigger assets_claim_global_qr_identity before insert or update of qr_public_id on public.inventory_assets
for each row execute function public.claim_global_qr_identity();
drop trigger if exists profiles_release_global_qr_identity on public.profiles;
create trigger profiles_release_global_qr_identity after delete on public.profiles
for each row execute function public.release_global_qr_identity();
drop trigger if exists assets_release_global_qr_identity on public.inventory_assets;
create trigger assets_release_global_qr_identity after delete on public.inventory_assets
for each row execute function public.release_global_qr_identity();

alter table public.qr_identity_registry enable row level security;
revoke all on public.qr_identity_registry from anon, authenticated;
revoke all on function public.claim_global_qr_identity() from public;
revoke all on function public.release_global_qr_identity() from public;

commit;
