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

  // Extrai o id do titulo referenciado em uma baixa ("Ref Lanc #12").
  function refId(observacao) {
    var m = /#(\d+)/.exec(String(observacao || ''));
    return m ? m[1] : '';
  }

  // Titulo a receber (receita/venda) + suas baixas (recebimento).
  // Baixas orfas (cujo titulo nao existe mais) ficam de fora por construcao.
  function calcTitulo(logs, parentId) {
    var arr = logs || [];
    var rows = arr.filter(function (l) {
      return String(l.id) === String(parentId) && (l.tipo === 'venda' || l.tipo === 'receita') && !isEstornado(l);
    });
    var baixas = arr.filter(function (l) {
      return l.tipo === 'recebimento' && !isEstornado(l) && refId(l.observacao) === String(parentId);
    });
    var total = rows.reduce(function (a, r) { return a + Number(r.valor_total || 0); }, 0);
    var pago = baixas.reduce(function (a, l) { return a + Number(l.valor_total || 0); }, 0);
    var disc = baixas.reduce(function (a, l) { return a + Number(l.desconto || 0); }, 0);
    var jur = baixas.reduce(function (a, l) { return a + Number(l.acrescimo || 0); }, 0);
    var saldo = total + jur - disc - pago;
    var status = saldo <= 0.005 ? 'PAGO' : (pago > 0 ? 'PARCIAL' : 'PENDENTE');
    return { rows: rows, baixas: baixas, total: total, pago: pago, disc: disc, jur: jur, saldo: saldo, status: status };
  }

  // Ids dos titulos que existem (ignora parcelas substituidas e estornados).
  function idsTitulos(logs) {
    var ids = {};
    (logs || []).forEach(function (l) {
      if ((l.tipo === 'venda' || l.tipo === 'receita') && !isEstornado(l) && String(l.status_financeiro || '').toUpperCase() !== 'PARCELADO') ids[l.id] = true;
    });
    return ids;
  }

  // Total efetivamente recebido, considerando SOMENTE baixas de titulos que
  // ainda existem. Evita contar baixas orfas (titulo excluido) como receita.
  function recebidoDe(logs) {
    var ids = idsTitulos(logs);
    var total = 0;
    Object.keys(ids).forEach(function (id) { total += calcTitulo(logs, id).pago; });
    return total;
  }

  // Saldo em aberto a receber dos titulos existentes.
  function aReceberDe(logs) {
    var ids = idsTitulos(logs);
    var total = 0;
    Object.keys(ids).forEach(function (id) { var c = calcTitulo(logs, id); if (c.saldo > 0.005) total += c.saldo; });
    return total;
  }

  // Fases ativas de uma obra (para os selects de lancamento).
  async function listFases(obraId) {
    if (!obraId || obraId === '__all__') return [];
    try {
      var res = await sb.from('obras_fases')
        .select('id,nome,ordem,arquivada')
        .eq('obra_id', obraId)
        .order('ordem');
      return (res.data || []).filter(function (f) {
        return !f.arquivada && String(f.nome || '').trim().toLowerCase() !== '(removida)';
      });
    } catch (e) { return []; }
  }

  function fasesOptions(fases, sel) {
    var opts = ['<option value="">Sem fase</option>'];
    (fases || []).forEach(function (f) {
      opts.push('<option value="' + f.id + '"' + (String(f.id) === String(sel || '') ? ' selected' : '') + '>' + esc(f.nome) + '</option>');
    });
    return opts.join('');
  }

  function faseNome(fases, id) {
    if (!id) return '';
    var f = (fases || []).find(function (x) { return String(x.id) === String(id); });
    return f ? f.nome : '';
  }

  var CAT_LABELS = {
    ponto: 'M.O. DI\u00c1RIA',
    terceirizado: 'M.O. METRAGEM',
    empreita: 'M.O. EMPREITA'
  };

  function catLabel(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var friendly = CAT_LABELS[s.toLowerCase()];
    return friendly || s.toUpperCase();
  }

  async function confirmar(msg, opts) {
    if (typeof confirmDialog === 'function') return confirmDialog(msg, opts || {});
    return window.confirm(msg);
  }

  async function nextId(tabela) {
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
    await refreshState();
    return { despesa: desp, log: null };
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
    refId: refId,
    calcTitulo: calcTitulo,
    recebidoDe: recebidoDe,
    aReceberDe: aReceberDe,
    listFases: listFases,
    fasesOptions: fasesOptions,
    faseNome: faseNome,
    catLabel: catLabel,
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
