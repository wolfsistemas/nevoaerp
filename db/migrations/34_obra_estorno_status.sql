-- ============================================================
-- 34_obra_estorno_status.sql
-- Permite ESTORNADO em medicoes e producao (nunca apagar).
-- Idempotente.
-- ============================================================

begin;

alter table public.medicoes_empreita drop constraint if exists medicoes_empreita_status_check;
alter table public.medicoes_empreita
    add constraint medicoes_empreita_status_check
    check (status in ('PENDENTE','PAGO','ESTORNADO'));

alter table public.producao_terc drop constraint if exists producao_terc_status_check;
alter table public.producao_terc
    add constraint producao_terc_status_check
    check (status in ('PENDENTE','PAGO','ESTORNADO'));

commit;
