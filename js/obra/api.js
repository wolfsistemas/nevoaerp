(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dataBR(iso) {
    if (!iso) return '-';
    var s = String(iso).slice(0, 10);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  function toast(msg, isError) {
    if (typeof showToast === 'function') showToast(msg, !!isError);
    else if (typeof window.uiAlert === 'function') window.uiAlert(msg, !!isError);
  }

  function icons() {
    if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
  }

  function equipeId(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function isEstornado(row) {
    if (!row) return false;
    var st = String(row.status || '').toUpperCase();
    var sf = String(row.status_financeiro || '').toUpperCase();
    return st === 'ESTORNADO' || sf === 'ESTORNADO';
  }

  async function confirmar(msg, opts) {
    if (typeof confirmDialog === 'function') return confirmDialog(msg, opts || {});
    return window.confirm(msg);
  }

  async function nextId(tabela) {
    if (typeof getNextId === 'function' && typeof STATE !== 'undefined') {
      if (tabela === 'despesas' && STATE.expenses) return getNextId(STATE.expenses);
      if (tabela === 'logs' && STATE.logs) return getNextId(STATE.logs);
    }
    var col = tabela === 'despesas' ? 'despesas' : 'logs';
    var res = await sb.from(col).select('id').order('id', { ascending: false }).limit(1);
    var max = (res.data && res.data[0] && res.data[0].id) ? Number(res.data[0].id) : 0;
    return max + 1;
  }

  async function refreshState() {
    if (typeof loadData === 'function') {
      try { await loadData(); } catch (e) {}
    }
  }

  async function insertDespesa(payload) {
    var id = payload.id != null ? payload.id : await nextId('despesas');
    var row = Object.assign({
      id: id,
      quantidade: 1,
      unidade: 'Un',
      status: payload.status || 'PENDENTE',
      data: payload.data || new Date().toISOString()
    }, payload, { id: id });
    var res = await sb.from('despesas').insert([row]).select('uid,id').single();
    if (res.error) throw res.error;
    return res.data;
  }

  async function insertLog(payload) {
    var id = payload.id != null ? payload.id : await nextId('logs');
    var row = Object.assign({
      id: id,
      quantidade: 1,
      data: payload.data || new Date().toISOString(),
      status: payload.status || 'ATIVO'
    }, payload, { id: id });
    var res = await sb.from('logs').insert([row]).select('uid,id').single();
    if (res.error) throw res.error;
    return res.data;
  }

  async function insertDespesaComLog(payload) {
    var desp = await insertDespesa(payload);
    var obs = String(payload.observacao || payload.item || '');
    if (obs.indexOf('Ref Despesa #') < 0) obs = (obs ? obs + ' | ' : '') + 'Ref Despesa #' + desp.id;
    try {
      var log = await insertLog({
        tipo: 'despesa',
        produto_nome: payload.item,
        quantidade: 1,
        valor_total: payload.custo,
        observacao: obs,
        status: 'ATIVO',
        status_financeiro: payload.status || 'PENDENTE',
        obra_id: payload.obra_id || null,
        categoria: payload.categoria || null,
        fornecedor_id: payload.fornecedor_id || null
      });
      await refreshState();
      return { despesa: desp, log: log };
    } catch (e) {
      await sb.from('despesas').update({ status: 'ESTORNADO' }).eq('uid', desp.uid);
      await refreshState();
      throw e;
    }
  }

  async function estornarDespesaPorUid(uid) {
    if (!uid) return { despesa: null, logs: 0 };
    var dres = await sb.from('despesas').select('uid,id,status').eq('uid', uid).maybeSingle();
    if (dres.error) throw dres.error;
    var desp = dres.data;
    if (!desp) return { despesa: null, logs: 0 };
    if (!isEstornado(desp)) {
      var u1 = await sb.from('despesas').update({ status: 'ESTORNADO' }).eq('uid', desp.uid);
      if (u1.error) throw u1.error;
    }
    var u2 = await sb.from('logs').update({ status: 'ESTORNADO', status_financeiro: 'ESTORNADO' })
      .eq('tipo', 'despesa')
      .ilike('observacao', '%Ref Despesa #' + desp.id + '%');
    if (u2.error) throw u2.error;
    await refreshState();
    return { despesa: desp, logs: (u2.data && u2.data.length) || 0 };
  }

  async function estornarLogPorUid(uid) {
    if (!uid) return;
    var u = await sb.from('logs').update({ status: 'ESTORNADO', status_financeiro: 'ESTORNADO' }).eq('uid', uid);
    if (u.error) throw u.error;
    await refreshState();
  }

  async function listObras(ativas) {
    var q = sb.from('obras').select('*').order('nome');
    if (ativas) q = q.eq('ativo', true);
    var res = await q;
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function listEquipeObra() {
    var res = await sb.from('equipe')
      .select('*')
      .in('tipo', ['Diaria', 'Empreita', 'Terceirizado'])
      .order('nome');
    if (res.error) throw res.error;
    return res.data || [];
  }

  function optionsObras(obras, selected) {
    var html = '<option value="">-- Sem obra --</option>';
    (obras || []).forEach(function (o) {
      html += '<option value="' + esc(o.id) + '"' + (String(o.id) === String(selected || '') ? ' selected' : '') + '>' + esc(o.nome) + '</option>';
    });
    return html;
  }

  function obraMaisFrequente(rows) {
    var cont = {};
    (rows || []).forEach(function (r) {
      if (!r.obra_id) return;
      var k = String(r.obra_id);
      cont[k] = (cont[k] || 0) + 1;
    });
    var best = null;
    var n = 0;
    Object.keys(cont).forEach(function (k) {
      if (cont[k] > n) { n = cont[k]; best = k; }
    });
    return best;
  }

  global.obraApi = {
    esc: esc,
    money: money,
    hojeISO: hojeISO,
    dataBR: dataBR,
    toast: toast,
    icons: icons,
    equipeId: equipeId,
    isEstornado: isEstornado,
    confirmar: confirmar,
    nextId: nextId,
    insertDespesa: insertDespesa,
    insertLog: insertLog,
    insertDespesaComLog: insertDespesaComLog,
    estornarDespesaPorUid: estornarDespesaPorUid,
    estornarLogPorUid: estornarLogPorUid,
    listObras: listObras,
    listEquipeObra: listEquipeObra,
    optionsObras: optionsObras,
    obraMaisFrequente: obraMaisFrequente,
    refreshState: refreshState
  };
})(typeof window !== 'undefined' ? window : globalThis);
