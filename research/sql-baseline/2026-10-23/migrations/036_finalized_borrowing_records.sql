begin;

create or replace function public.prevent_borrowing_signature_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_request_id bigint;
begin
  target_request_id := old.request_id;
  if tg_table_name='borrowing_transaction_signatures' then
    raise exception 'Release and return signature snapshots are immutable.' using errcode='55000';
  end if;
  if exists (select 1 from public.borrow_requests where id=target_request_id and status='Returned') then
    raise exception 'Finalized borrowing authorization records are immutable.' using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists immutable_transaction_signatures on public.borrowing_transaction_signatures;
create trigger immutable_transaction_signatures before update or delete on public.borrowing_transaction_signatures
for each row execute function public.prevent_borrowing_signature_mutation();
drop trigger if exists immutable_final_professor_authorization on public.borrow_request_authorizations;
create trigger immutable_final_professor_authorization before update or delete on public.borrow_request_authorizations
for each row execute function public.prevent_borrowing_signature_mutation();
drop trigger if exists immutable_final_custodian_authorization on public.borrow_request_custodian_authorizations;
create trigger immutable_final_custodian_authorization before update or delete on public.borrow_request_custodian_authorizations
for each row execute function public.prevent_borrowing_signature_mutation();

revoke all on function public.prevent_borrowing_signature_mutation() from public,anon,authenticated;

commit;
