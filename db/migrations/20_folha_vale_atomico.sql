-- 20_folha_vale_atomico.sql
-- Corrige condicao de corrida (read-modify-write) ao sincronizar vales com folhas.
-- Antes: o front lia vales_total/valor_pago, calculava em JS e regravava; dois lancamentos
-- simultaneos podiam sobrescrever um ao outro. Agora o ajuste e atomico no banco.

create or replace function public.ajustar_folha_com_vale(
    p_equipe_id bigint,
    p_mes text,
    p_delta double precision
)
returns void
language sql
security invoker
set search_path = public
as $$
    update public.folhas
       set vales_total = coalesce(vales_total, 0) + p_delta,
           valor_pago  = coalesce(valor_pago, 0) - p_delta
     where equipe_id = p_equipe_id
       and mes_referencia = p_mes
       and status = 'PENDENTE';
$$;

grant execute on function public.ajustar_folha_com_vale(bigint, text, double precision) to authenticated;
