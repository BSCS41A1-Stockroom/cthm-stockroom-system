begin;

alter table public.profiles
  add column if not exists section_id bigint
  references public.academic_sections(id) on delete restrict;

create index if not exists profiles_section_id_idx
  on public.profiles(section_id)
  where section_id is not null;

commit;
