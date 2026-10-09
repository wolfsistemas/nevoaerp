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

  // ---------- Vales / adiantamentos (saldo em aberto, abatimento FIFO) ----------
  function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

  // Simula o abatimento FIFO de um valor bruto sobre os vales em aberto.
  // Permite abatimento parcial: o que nao couber permanece em aberto.
  function simularAbatimentos(valesAbertos, bruto) {
    var total0 = round2(bruto);
    var restante = total0;
    var itens = [];
    (valesAbertos || []).forEach(function (v) {
      if (restante <= 0) return;
      var aberto = round2(v.valor_aberto != null ? v.valor_aberto : v.valor);
      if (aberto <= 0) return;
      var usar = round2(Math.min(aberto, restante));
      itens.push({ vale: v, valor: usar });
      restante = round2(restante - usar);
    });
    var total = round2(itens.reduce(function (s, i) { return s + i.valor; }, 0));
    return { bruto: total0, total: total, itens: itens, liquido: round2(Math.max(0, total0 - total)), sobra: restante };
  }

  function somaVales(vales) {
    return round2((vales || []).reduce(function (s, v) {
      return s + round2(v.valor_aberto != null ? v.valor_aberto : v.valor);
    }, 0));
  }

  function valeAberto(v) {
    return round2(v && (v.valor_aberto != null ? v.valor_aberto : v.valor));
  }

  // Vales em aberto (saldo > 0) de uma pessoa, em ordem FIFO.
  function filtrarValesAbertos(vales, pessoaTipo, id) {
    var campo = pessoaTipo === 'terceirizado' ? 'terceirizado_id' : 'equipe_id';
    return (vales || []).filter(function (v) {
      return v && String(v[campo]) === String(id) &&
        String(v.status).toUpperCase() === 'ABERTO' && valeAberto(v) > 0;
    }).sort(function (a, b) {
      var da = String(a.data || ''), db = String(b.data || '');
      if (da < db) return -1;
      if (da > db) return 1;
      var ca = String(a.criado_em || ''), cb = String(b.criado_em || '');
      return ca < cb ? -1 : (ca > cb ? 1 : 0);
    });
  }

  async function listVales(f) {
    f = f || {};
    var q = sb.from('obra_vales').select('*');
    if (f.equipe_id != null && f.equipe_id !== '') q = q.eq('equipe_id', f.equipe_id);
    if (f.terceirizado_id != null && f.terceirizado_id !== '') q = q.eq('terceirizado_id', f.terceirizado_id);
    if (f.obra_id) q = q.eq('obra_id', f.obra_id);
    if (f.status) q = q.eq('status', f.status);
    else if (!f.incluirEstornado) q = q.neq('status', 'ESTORNADO');
    var res = await q.order('data', { ascending: true }).order('criado_em', { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function valesAbertos(pessoaTipo, id) {
    if (id == null || id === '') return [];
    var lista = await listVales(pessoaTipo === 'terceirizado' ? { terceirizado_id: id } : { equipe_id: id });
    return filtrarValesAbertos(lista, pessoaTipo, id);
  }

  async function criarVale(o) {
    o = o || {};
    var valor = round2(o.valor);
    if (!(valor > 0)) throw new Error('Valor do vale invalido.');
    var isTerc = o.pessoa_tipo === 'terceirizado';
    if (isTerc) {
      if (!o.terceirizado_id) throw new Error('Terceirizado invalido.');
    } else if (o.equipe_id == null || o.equipe_id === '') {
      throw new Error('Colaborador invalido.');
    }
    var dataStr = o.data || hojeISO();
    var dataISO = new Date(String(dataStr).length <= 10 ? dataStr + 'T12:00:00' : dataStr).toISOString();
    var chain = await insertDespesaComLog({
      item: 'VALE',
      categoria: 'VALE',
      fornecedor: o.nome || o.fornecedor || '',
      custo: valor,
      observacao: 'Vale / Adiantamento - Colaborador: ' + (o.nome || '') + (o.observacao ? ' - ' + o.observacao : ''),
      status: 'PENDENTE',
      data: dataISO,
      obra_id: o.obra_id || null,
      equipe_id: isTerc ? null : o.equipe_id
    });
    var row = {
      obra_id: o.obra_id || null,
      valor: valor,
      valor_aberto: valor,
      data: dataStr,
      observacao: o.observacao || null,
      status: 'ABERTO',
      despesa_uid: chain.despesa.uid
    };
    if (isTerc) row.terceirizado_id = o.terceirizado_id;
    else row.equipe_id = o.equipe_id;
    var ins = await sb.from('obra_vales').insert([row]).select('*').single();
    if (ins.error) {
      try { await estornarDespesaPorUid(chain.despesa.uid); } catch (e) {}
      throw ins.error;
    }
    await refreshState();
    return { vale: ins.data, despesa: chain.despesa };
  }

  async function atualizarVale(id, o) {
    o = o || {};
    var r = await sb.from('obra_vales').select('*').eq('id', id).maybeSingle();
    if (r.error) throw r.error;
    var v = r.data;
    if (!v) throw new Error('Vale nao encontrado.');
    if (round2(v.valor_aberto) < round2(v.valor)) throw new Error('Vale ja utilizado em fechamento. Estorne o fechamento antes.');
    var valor = round2(o.valor);
    if (!(valor > 0)) throw new Error('Informe um valor valido.');
    var upd = await sb.from('obra_vales').update({
      valor: valor, valor_aberto: valor, data: o.data || v.data, observacao: o.observacao || null
    }).eq('id', id);
    if (upd.error) throw upd.error;
    if (v.despesa_uid) {
      var ud = await sb.from('despesas').update({ custo: valor }).eq('uid', v.despesa_uid);
      if (ud.error) throw ud.error;
    }
    await refreshState();
  }

  // Registra o abatimento de um fechamento (insere abatimentos + atualiza saldo).
  async function registrarAbatimentosVale(fechamentoUid, itens) {
    if (!fechamentoUid || !itens || !itens.length) return;
    for (var i = 0; i < itens.length; i++) {
      var item = itens[i];
      var v = item.vale;
      var aberto = round2(v.valor_aberto != null ? v.valor_aberto : v.valor);
      var novo = round2(aberto - round2(item.valor));
      if (novo < 0) novo = 0;
      var ins = await sb.from('obra_vale_abatimentos').insert([{
        vale_id: v.id, fechamento_uid: fechamentoUid, valor: round2(item.valor)
      }]);
      if (ins.error) throw ins.error;
      var upd = await sb.from('obra_vales')
        .update({ valor_aberto: novo, status: novo <= 0 ? 'ABATIDO' : 'ABERTO' })
        .eq('id', v.id);
      if (upd.error) throw upd.error;
    }
    await refreshState();
  }

  // Reverte todos os abatimentos de um fechamento (estorno).
  async function reverterAbatimentosVale(fechamentoUid) {
    if (!fechamentoUid) return;
    var q = await sb.from('obra_vale_abatimentos').select('*').eq('fechamento_uid', fechamentoUid);
    if (q.error) throw q.error;
    var lista = q.data || [];
    for (var i = 0; i < lista.length; i++) {
      var ab = lista[i];
      var vr = await sb.from('obra_vales').select('*').eq('id', ab.vale_id).maybeSingle();
      if (vr.error) throw vr.error;
      var v = vr.data;
      if (v) {
        var novo = round2(round2(v.valor_aberto) + round2(ab.valor));
        if (novo > round2(v.valor)) novo = round2(v.valor);
        var st = String(v.status).toUpperCase() === 'ESTORNADO' ? 'ESTORNADO' : 'ABERTO';
        var upd = await sb.from('obra_vales').update({ valor_aberto: novo, status: st }).eq('id', v.id);
        if (upd.error) throw upd.error;
      }
    }
    var del = await sb.from('obra_vale_abatimentos').delete().eq('fechamento_uid', fechamentoUid);
    if (del.error) throw del.error;
    await refreshState();
  }

  async function estornarVale(id) {
    if (!id) return;
    var r = await sb.from('obra_vales').select('*').eq('id', id).maybeSingle();
    if (r.error) throw r.error;
    var v = r.data;
    if (!v) return;
    if (String(v.status).toUpperCase() === 'ESTORNADO') return;
    if (round2(v.valor_aberto) < round2(v.valor)) throw new Error('Vale ja utilizado em fechamento. Estorne o fechamento antes.');
    await estornarDespesaPorUid(v.despesa_uid);
    var upd = await sb.from('obra_vales').update({ status: 'ESTORNADO', valor_aberto: 0 }).eq('id', id);
    if (upd.error) throw upd.error;
    await refreshState();
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
    round2: round2,
    simularAbatimentos: simularAbatimentos,
    somaVales: somaVales,
    valeAberto: valeAberto,
    filtrarValesAbertos: filtrarValesAbertos,
    listVales: listVales,
    valesAbertos: valesAbertos,
    criarVale: criarVale,
    atualizarVale: atualizarVale,
    registrarAbatimentosVale: registrarAbatimentosVale,
    reverterAbatimentosVale: reverterAbatimentosVale,
    estornarVale: estornarVale,
    refreshState: refreshState
  };
})(typeof window !== 'undefined' ? window : globalThis);
