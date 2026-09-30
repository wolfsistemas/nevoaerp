// equipe-obra.js - Equipe unificada do segmento Obra (padrao RV).
// Lista unica: Diaria, Metragem e Empreita.
// Cadastro, CALCULAR (fechamento/estorno), Checagem e Folha+PIX.
// Estorno nunca apaga: grava ESTORNADO e desfaz a cadeia financeira.
(function () {
  'use strict';

  var A = function () { return window.obraApi || {}; };
  var CACHE = { equipe: [], terc: [], obras: [], ponto: [], producao: [], medicoes: [] };
  var MODAL = 'eqobra-modal';

  function esc(v) { return A().esc(v); }
  function money(v) { return A().money(v); }
  function dataBR(v) { return A().dataBR(v); }
  function hojeISO() { return A().hojeISO(); }
  function toast(m, e) { A().toast(m, e); }
  function icons() { A().icons(); }
  function confirmar(m, o) {
    if (A().confirmar) return A().confirmar(m, o);
    return Promise.resolve(window.confirm(m));
  }
  function loading(on) { if (typeof showLoading === 'function') showLoading(!!on); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function novoUid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
  function firstDay() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01'; }
  function lastDay() {
    var d = new Date();
    var ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(ult);
  }
  function janFirst() { return new Date().getFullYear() + '-01-01'; }
  function el(id) { return document.getElementById(id); }
  function val(id) { var e = el(id); return e ? e.value : ''; }
  function num(id) { return Number(val(id)) || 0; }
  function escAttr(v) { return esc(v).replace(/`/g, ''); }

  // ---------- CPF / CNPJ ----------
  function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function formatDoc(v) {
    var d = soDigitos(v).slice(0, 14);
    if (d.length <= 11) {
      var out = d.slice(0, 3);
      if (d.length > 3) out += '.' + d.slice(3, 6);
      if (d.length > 6) out += '.' + d.slice(6, 9);
      if (d.length > 9) out += '-' + d.slice(9, 11);
      return out;
    }
    var o = d.slice(0, 2);
    if (d.length > 2) o += '.' + d.slice(2, 5);
    if (d.length > 5) o += '.' + d.slice(5, 8);
    if (d.length > 8) o += '/' + d.slice(8, 12);
    if (d.length > 12) o += '-' + d.slice(12, 14);
    return o;
  }
  function validaCPF(v) {
    var c = soDigitos(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    var s = 0, r, i;
    for (i = 0; i < 9; i++) s += parseInt(c[i], 10) * (10 - i);
    r = (s * 10) % 11; if (r === 10) r = 0;
    if (r !== parseInt(c[9], 10)) return false;
    s = 0;
    for (i = 0; i < 10; i++) s += parseInt(c[i], 10) * (11 - i);
    r = (s * 10) % 11; if (r === 10) r = 0;
    return r === parseInt(c[10], 10);
  }
  function validaCNPJ(v) {
    var c = soDigitos(v);
    if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
    function dv(base) {
      var pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      var s = 0;
      for (var i = 0; i < base.length; i++) s += parseInt(base[i], 10) * pesos[i];
      var r = s % 11;
      return r < 2 ? 0 : 11 - r;
    }
    return dv(c.slice(0, 12)) === parseInt(c[12], 10) && dv(c.slice(0, 13)) === parseInt(c[13], 10);
  }
  function validaDoc(v) {
    var d = soDigitos(v);
    if (d.length === 11) return validaCPF(d);
    if (d.length === 14) return validaCNPJ(d);
    return false;
  }
  async function docJaUsado(dig, idAtual, origemAtual) {
    var res = await Promise.all([
      sb.from('equipe').select('id,cpf'),
      sb.from('terceirizados').select('id,cpf_cnpj')
    ]);
    var erro = res.find(function (r) { return r && r.error; });
    if (erro) throw erro.error;
    var dup = false;
    (res[0].data || []).forEach(function (r) {
      if (origemAtual === 'equipe' && String(r.id) === String(idAtual)) return;
      if (soDigitos(r.cpf) === dig) dup = true;
    });
    (res[1].data || []).forEach(function (r) {
      if (origemAtual === 'terceirizado' && String(r.id) === String(idAtual)) return;
      if (soDigitos(r.cpf_cnpj) === dig) dup = true;
    });
    return dup;
  }

  // ---------- Impressao padrao profissional (obraPrint) ----------
  function printDoc(opts) {
    var P = window.obraPrint;
    var html = P ? P.doc(opts) : ('<div style="font-family:Arial;padding:30px">' + ((opts && opts.body) || '') + '</div>');
    var p = el('print-area');
    if (p) { p.innerHTML = html; setTimeout(function () { window.print(); }, 300); }
  }
  function reciboPadrao(o) {
    o = o || {};
    var P = window.obraPrint || {};
    var comp = P.company ? P.company() : ((typeof getCompany === 'function') ? getCompany() : {});
    var nomeEmp = comp.nome || comp.name || 'NÉVOA';
    var logo = comp.logoUrl || comp.logo || 'logo.png';
    var endEmp = comp.endereco || comp.address;
    var telEmp = comp.telefone || comp.phone;
    var hoje = dataBR(hojeISO());
    var linhas = (o.linhas || []).map(function (l) {
      return '<tr><td style="padding:3px 12px 3px 0;color:#475569;">' + esc(l[0]) + '</td>'
        + '<td style="padding:3px 0;text-align:right;font-weight:bold;color:#0f172a;">' + esc(l[1]) + '</td></tr>';
    }).join('');
    return '<div style="font-family:Helvetica,Arial,sans-serif;max-width:800px;margin:auto;padding:20px;background:#fff;color:#0f172a;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #059669;padding-bottom:14px;margin-bottom:20px;">'
      +   '<div style="display:flex;align-items:center;gap:14px;">'
      +     '<img src="' + esc(logo) + '" style="max-height:64px;max-width:130px;" onerror="this.style.display=\'none\';" />'
      +     '<div>'
      +       '<h2 style="margin:0;color:#059669;font-size:20px;text-transform:uppercase;">' + esc(nomeEmp) + '</h2>'
      +       (comp.cnpj ? '<p style="margin:2px 0;font-size:11px;color:#475569;">CNPJ: ' + esc(comp.cnpj) + '</p>' : '')
      +       (endEmp ? '<p style="margin:2px 0;font-size:11px;color:#475569;">' + esc(endEmp) + '</p>' : '')
      +       (telEmp ? '<p style="margin:2px 0;font-size:11px;color:#475569;">Tel: ' + esc(telEmp) + '</p>' : '')
      +     '</div>'
      +   '</div>'
      +   '<div style="text-align:right;">'
      +     '<h3 style="margin:0;font-size:16px;font-weight:bold;text-transform:uppercase;">' + esc(o.titulo || 'Recibo') + '</h3>'
      +     '<p style="margin:2px 0;font-size:12px;">Emissao: ' + esc(hoje) + '</p>'
      +   '</div>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:20px;">'
      +   '<div style="font-size:13px;line-height:1.7;">'
      +     '<div><b>Colaborador:</b> ' + esc(o.funcionario || '') + '</div>'
      +     (o.doc ? '<div><b>CPF/CNPJ:</b> ' + esc(o.doc) + '</div>' : '')
      +     (o.obra ? '<div><b>Obra:</b> ' + esc(o.obra) + '</div>' : '')
      +     (o.periodo ? '<div><b>Periodo:</b> ' + esc(o.periodo) + '</div>' : '')
      +     (linhas ? '<table style="margin-top:8px;border-collapse:collapse;">' + linhas + '</table>' : '')
      +   '</div>'
      +   '<div style="text-align:right;min-width:190px;">'
      +     '<div style="font-size:11px;text-transform:uppercase;color:#475569;">' + esc(o.valorLabel || 'Valor a pagar') + '</div>'
      +     '<div style="font-size:26px;font-weight:bold;color:#047857;">' + esc(o.valor || '') + '</div>'
      +   '</div>'
      + '</div>'
      + '<div style="border:1px dashed #94a3b8;padding:12px;border-radius:6px;background:#f8fafc;margin-bottom:24px;font-size:13px;line-height:1.6;">' + (o.declaracao || '') + '</div>'
      + '<div style="margin-top:60px;text-align:center;">'
      +   '<div style="width:55%;border-top:1px solid #000;margin:0 auto 6px;"></div>'
      +   '<div style="font-weight:bold;font-size:13px;text-transform:uppercase;">' + esc(o.assinatura || o.funcionario || '') + '</div>'
      +   (o.assinaturaObs ? '<div style="font-size:11px;color:#475569;">' + esc(o.assinaturaObs) + '</div>' : '')
      + '</div>'
      + '<div style="margin-top:24px;font-size:11px;color:#94a3b8;text-align:center;">Documento gerado em ' + esc(hoje) + '</div>'
      + '</div>';
  }
  function printRecibo(html) {
    var P = window.obraPrint;
    if (P && typeof P.print === 'function') return P.print(html);
    var p = el('print-area');
    if (p) { p.innerHTML = html; setTimeout(function () { window.print(); }, 300); }
  }
  function nomeObraPorId(id) {
    var o = CACHE.obras.find(function (x) { return String(x.id) === String(id); });
    return o ? (o.nome || '') : '';
  }
  function periodoTexto(iniId, fimId) {
    var i = val(iniId), f = val(fimId);
    if (!i && !f) return '';
    return dataBR(i || f) + ' a ' + dataBR(f || i);
  }

  // ---------- Dados ----------
  async function carregarDados() {
    var res = await Promise.all([
      sb.from('equipe').select('*').in('tipo', ['Diaria', 'Empreita']).order('nome'),
      sb.from('terceirizados').select('*').order('nome'),
      sb.from('obras').select('*').order('nome'),
      sb.from('ponto_diario').select('*').order('hora_registro', { ascending: false }),
      sb.from('producao_terc').select('*').order('data_registro', { ascending: false }),
      sb.from('medicoes_empreita').select('*').order('data_medicao', { ascending: false })
    ]);
    var erro = res.find(function (r) { return r && r.error; });
    if (erro) throw erro.error;
    CACHE.equipe = res[0].data || [];
    CACHE.terc = res[1].data || [];
    CACHE.obras = res[2].data || [];
    CACHE.ponto = res[3].data || [];
    CACHE.producao = res[4].data || [];
    CACHE.medicoes = res[5].data || [];
  }

  function colaboradores() {
    var lista = CACHE.equipe.map(function (e) {
      var isEmp = (e.categoria === 'Empreita') || (e.tipo === 'Empreita');
      return {
        id: e.id,
        origem: 'equipe',
        tipo: isEmp ? 'empreita' : 'diaria',
        nome: e.nome || '',
        categoria: isEmp ? 'Empreita' : 'Diaria',
        valor_base: Number(e.valor_diaria || 0),
        valor_contrato: Number(e.valor_contrato || 0),
        telefone: e.telefone || '',
        cpf: e.cpf || '',
        rg: e.rg || '',
        endereco: e.endereco || '',
        chave_pix: e.chave_pix || '',
        obra_atual_id: e.obra_atual_id,
        ativo: e.ativo !== false,
        data_contrato: e.data_contrato,
        contrato_assinado: !!e.contrato_assinado
      };
    });
    CACHE.terc.forEach(function (t) {
      lista.push({
        id: t.id,
        origem: 'terceirizado',
        tipo: 'metro',
        nome: t.nome || '',
        categoria: 'Metragem',
        valor_base: Number(t.valor_metro || 0),
        valor_contrato: 0,
        telefone: t.telefone || '',
        cpf: t.cpf_cnpj || '',
        rg: t.rg || '',
        endereco: t.endereco || '',
        chave_pix: t.chave_pix || '',
        obra_atual_id: t.obra_atual_id,
        ativo: t.ativo !== false,
        data_contrato: t.data_contrato,
        contrato_assinado: !!t.contrato_assinado
      });
    });
    return lista;
  }

  // ---------- Calculos ----------
  function calcDiaria(funcId, ini, fim) {
    var regs = CACHE.ponto.filter(function (r) {
      return String(r.funcionario_id) === String(funcId) &&
        String(r.status || '').toUpperCase() === 'VALIDADO' &&
        !r.pago_em_fechamento;
    });
    if (ini) regs = regs.filter(function (r) { return String(r.hora_registro) >= ini + 'T00:00:00'; });
    if (fim) regs = regs.filter(function (r) { return String(r.hora_registro) <= fim + 'T23:59:59'; });
    var diarias = (typeof rvCalcularTotalDiarias === 'function') ? rvCalcularTotalDiarias(regs) : 0;
    return { diarias: diarias, registros: regs };
  }

  function calcMetros(tercId, ini, fim) {
    var regs = CACHE.producao.filter(function (p) {
      return String(p.terceirizado_id) === String(tercId) && String(p.status) !== 'ESTORNADO';
    });
    if (ini) regs = regs.filter(function (p) { return p.data_registro >= ini; });
    if (fim) regs = regs.filter(function (p) { return p.data_registro <= fim; });
    var pend = regs.filter(function (p) { return p.status !== 'PAGO'; }).reduce(function (s, p) { return s + Number(p.metros || 0); }, 0);
    var pago = regs.filter(function (p) { return p.status === 'PAGO'; }).reduce(function (s, p) { return s + Number(p.metros || 0); }, 0);
    return { pend: pend, pago: pago, registros: regs };
  }

  function calcEmpreita(eqId, ini, fim) {
    var eq = CACHE.equipe.find(function (e) { return String(e.id) === String(eqId); }) || {};
    var contrato = Number(eq.valor_contrato || 0);
    var meds = CACHE.medicoes.filter(function (m) {
      return String(m.equipe_id) === String(eqId) && String(m.status) !== 'ESTORNADO';
    });
    var medsPer = meds.filter(function (m) {
      return (!ini || m.data_medicao >= ini) && (!fim || m.data_medicao <= fim);
    });
    var pend = meds.filter(function (m) { return m.status !== 'PAGO'; }).reduce(function (s, m) { return s + Number(m.valor || 0); }, 0);
    var pago = meds.filter(function (m) { return m.status === 'PAGO'; }).reduce(function (s, m) { return s + Number(m.valor || 0); }, 0);
    var pctPend = medsPer.filter(function (m) { return m.status !== 'PAGO'; }).reduce(function (s, m) { return s + Number(m.percentual || 0); }, 0);
    var pctExec = meds.reduce(function (s, m) { return s + Number(m.percentual || 0); }, 0);
    return {
      contrato: contrato, pend: pend, pago: pago, pctPend: pctPend, pctExec: pctExec,
      saldo: Math.max(0, contrato - pago - pend), medicoes: medsPer, todas: meds
    };
  }

  function producaoTxt(c, ini, fim) {
    if (c.tipo === 'diaria') {
      var d = calcDiaria(c.id, ini, fim);
      c._pend = d.diarias * c.valor_base;
      c.status_pagamento = d.diarias > 0 ? 'PENDENTE' : 'EM DIA';
      return d.diarias.toFixed(2) + ' dias';
    }
    if (c.tipo === 'empreita') {
      var r = calcEmpreita(c.id, ini, fim);
      c._pend = r.pend;
      c.status_pagamento = r.pend > 0 ? 'PENDENTE' : 'EM DIA';
      return r.pctPend.toFixed(1) + '% medido';
    }
    var m = calcMetros(c.id, ini, fim);
    c._pend = m.pend * c.valor_base;
    c.status_pagamento = m.pend > 0 ? 'PENDENTE' : 'EM DIA';
    return m.pend.toFixed(2) + ' m';
  }

  // ---------- Render principal ----------
  async function renderEquipeObra() {
    var c = document.getElementById('view-obra-equipe') || document.getElementById('view-equipe');
    if (!c) return;
    c.innerHTML = ''
      + '<div class="space-y-4 p-4">'
      +   '<div class="flex items-center justify-between flex-wrap gap-3">'
      +     '<div><h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="hard-hat" class="text-emerald-600"></i> Equipe</h2>'
      +     '<p class="text-sm text-slate-500">Diaria, Metragem e Empreita em um so lugar. CALCULAR fecha o pagamento e gera a despesa.</p></div>'
      +     '<div class="flex gap-2 flex-wrap">'
      +       '<button onclick="eqObraChecagem()" class="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-xl font-bold shadow flex items-center gap-2"><i data-lucide="clipboard-check" class="w-4 h-4"></i> Checagem</button>'
      +       '<button onclick="eqObraFolhaAbrir()" class="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold shadow flex items-center gap-2"><i data-lucide="printer" class="w-4 h-4"></i> Imprimir Folha</button>'
      +       '<button onclick="eqObraOpenForm()" class="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl font-bold shadow flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Cadastrar Membro</button>'
      +     '</div>'
      +   '</div>'
      +   '<div id="eqobra-filtros" class="bg-white p-4 rounded-xl shadow-sm border grid grid-cols-1 md:grid-cols-6 gap-3"></div>'
      +   '<div id="eqobra-total" class="text-right text-xs text-slate-500 font-medium pr-2"></div>'
      +   '<div class="bg-white rounded-xl border shadow-sm overflow-hidden"><div class="overflow-x-auto">'
      +     '<table class="w-full text-sm text-left whitespace-nowrap"><thead class="bg-slate-100 text-slate-700 border-b"><tr>'
      +       '<th class="p-3">Colaborador / Categoria</th><th class="p-3">Obra</th><th class="p-3 text-center">Valor</th>'
      +       '<th class="p-3 text-center">Producao</th><th class="p-3 text-right">Total a Pagar</th>'
      +       '<th class="p-3 text-center">Status</th><th class="p-3 text-center">Acoes</th>'
      +     '</tr></thead><tbody id="eqobra-list" class="divide-y"><tr><td colspan="7" class="p-6 text-center text-slate-400">Carregando...</td></tr></tbody></table>'
      +   '</div></div>'
      + '</div>';
    montarFiltros();
    icons();
    try {
      await carregarDados();
    } catch (e) {
      var body = el('eqobra-list');
      if (body) body.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-red-600">' + esc(e.message || e) + '</td></tr>';
      return;
    }
    eqObraRenderLista();
  }

  function montarFiltros() {
    var box = el('eqobra-filtros');
    if (!box) return;
    box.innerHTML = ''
      + selectFiltro('eqf-status', 'Status', [['true', 'Ativos'], ['false', 'Desativados'], ['todos', 'Todos']], 'true')
      + selectFiltro('eqf-tipo', 'Tipo', [['todos', 'Todos'], ['diaria', 'Diaria'], ['empreita', 'Empreita'], ['metro', 'Metragem']], 'todos')
      + campoFiltro('eqf-ini', 'Inicio', 'date', '')
      + campoFiltro('eqf-fim', 'Fim', 'date', '')
      + '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Obra</label>'
      +   '<select id="eqf-obra" onchange="eqObraRenderLista()" class="w-full p-2 border rounded-lg text-sm bg-slate-50">'
      +     '<option value="">Todas</option>' + CACHE.obras.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.nome) + '</option>'; }).join('') + '</select></div>'
      + campoFiltro('eqf-busca', 'Buscar', 'text', '', 'onkeyup="eqObraRenderLista()"');
  }

  function selectFiltro(id, label, opts, sel) {
    return '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">' + label + '</label>'
      + '<select id="' + id + '" onchange="eqObraRenderLista()" class="w-full p-2 border rounded-lg text-sm bg-slate-50">'
      + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')
      + '</select></div>';
  }
  function campoFiltro(id, label, type, value, extra) {
    return '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">' + label + '</label>'
      + '<input id="' + id + '" type="' + type + '" value="' + esc(value) + '" ' + (extra || '') + ' class="w-full p-2 border rounded-lg text-sm bg-slate-50"></div>';
  }

  function eqObraRenderLista() {
    var body = el('eqobra-list');
    if (!body) return;
    var ini = val('eqf-ini');
    var fim = val('eqf-fim');
    var statusF = val('eqf-status') || 'true';
    var tipoF = val('eqf-tipo') || 'todos';
    var obraF = val('eqf-obra');
    var busca = (val('eqf-busca') || '').toLowerCase();

    var lista = colaboradores().filter(function (c) {
      if (obraF && String(c.obra_atual_id || '') !== String(obraF)) return false;
      if (statusF !== 'todos' && c.ativo !== (statusF === 'true')) return false;
      if (tipoF !== 'todos' && c.tipo !== tipoF) return false;
      if (busca && (c.nome + ' ' + c.categoria + ' ' + (c.cpf || '')).toLowerCase().indexOf(busca) < 0) return false;
      return true;
    });
    lista.sort(function (a, b) { return (a.nome || '').localeCompare(b.nome || ''); });

    var soma = 0;
    var html = '';
    lista.forEach(function (c) {
      var prodTxt = producaoTxt(c, ini, fim);
      soma += c._pend || 0;
      var valorTxt = c.tipo === 'empreita' ? money(c.valor_contrato || c.valor_base) : money(c.valor_base);
      var obra = CACHE.obras.find(function (o) { return String(o.id) === String(c.obra_atual_id); });
      var pend = c.status_pagamento === 'PENDENTE';
      var wpp = (c.telefone || '').replace(/\D/g, '');
      html += '<tr class="border-b hover:bg-slate-50' + (c.ativo ? '' : ' opacity-60') + '">'
        + '<td class="p-3"><div class="font-bold text-slate-800 text-sm">' + esc(c.nome) + (c.ativo ? '' : ' <span class="text-[9px] text-red-500 font-bold">(DESATIVADO)</span>') + '</div>'
        + '<div class="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded uppercase font-bold inline-block mt-0.5">' + esc(c.categoria) + '</div></td>'
        + '<td class="p-3 text-xs font-bold text-blue-700">' + esc(obra ? obra.nome : '-') + '</td>'
        + '<td class="p-3 text-center text-xs font-bold text-slate-700">' + valorTxt + '</td>'
        + '<td class="p-3 text-center text-xs font-black ' + (pend ? 'text-indigo-600' : 'text-slate-400') + '">' + prodTxt + '</td>'
        + '<td class="p-3 text-right font-black text-sm ' + (pend ? 'text-green-700' : 'text-slate-400') + '">' + money(c._pend || 0) + '</td>'
        + '<td class="p-3 text-center"><span class="px-2 py-1 rounded text-[9px] font-bold ' + (pend ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700') + '">' + c.status_pagamento + '</span></td>'
        + '<td class="p-3"><div class="flex items-center justify-center gap-1">'
        +   '<button onclick="eqObraSaldo(\'' + c.id + '\',\'' + c.origem + '\')" class="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow font-bold text-[10px] flex items-center gap-1"><i data-lucide="calculator" class="w-3 h-3"></i> CALCULAR</button>'
        +   '<button onclick="eqObraOpenForm(\'' + c.id + '\',\'' + c.origem + '\')" class="p-1.5 border border-blue-200 text-blue-600 rounded" title="Editar"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i></button>'
        +   '<button onclick="eqObraToggle(\'' + c.id + '\',\'' + c.origem + '\',' + (c.ativo ? 'true' : 'false') + ')" class="p-1.5 border ' + (c.ativo ? 'border-red-200 text-red-500' : 'border-green-200 text-green-600') + ' rounded" title="' + (c.ativo ? 'Desativar' : 'Reativar') + '"><i data-lucide="power" class="w-3.5 h-3.5"></i></button>'
        +   (wpp ? '<a href="https://wa.me/55' + wpp + '" target="_blank" class="p-1.5 border border-green-200 text-green-600 bg-green-50/50 rounded" title="WhatsApp"><i data-lucide="message-circle" class="w-3.5 h-3.5"></i></a>' : '')
        + '</div></td></tr>';
    });
    body.innerHTML = html || '<tr><td colspan="7" class="p-6 text-center text-slate-400">Nenhum colaborador.</td></tr>';
    var total = el('eqobra-total');
    if (total) total.innerHTML = 'Total geral (filtro): <span class="font-bold text-slate-700">' + money(soma) + '</span>';
    icons();
  }

  // ---------- Modal base ----------
  function abrirModal(html, titulo, largura) {
    var m = el(MODAL);
    if (!m) { m = document.createElement('div'); m.id = MODAL; document.body.appendChild(m); }
    m.className = 'fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4';
    m.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full ' + (largura || 'max-w-2xl') + ' max-h-[95vh] flex flex-col overflow-hidden">'
      + '<div class="p-4 border-b flex justify-between items-center shrink-0"><h3 class="font-bold text-slate-800">' + esc(titulo) + '</h3>'
      + '<button onclick="eqObraFecharModal()" class="text-slate-400"><i data-lucide="x"></i></button></div>'
      + '<div class="p-4 overflow-y-auto">' + html + '</div></div>';
    icons();
  }
  function fecharModal() { var m = el(MODAL); if (m) m.remove(); }

  // ---------- Saldo Diaria ----------
  function eqObraSaldo(id, origem) {
    if (origem === 'terceirizado') return eqObraSaldoMetros(id);
    var c = colaboradores().find(function (x) { return String(x.id) === String(id) && x.origem === 'equipe'; });
    if (!c) return toast('Colaborador nao encontrado.', true);
    if (c.tipo === 'empreita') return eqObraSaldoEmpreita(id);
    var html = ''
      + '<input type="hidden" id="eqs-id" value="' + escAttr(c.id) + '">'
      + '<div class="bg-slate-50 rounded-lg p-3 text-sm mb-3">' + esc(c.nome) + ' - Diaria: <b>' + money(c.valor_base) + '</b></div>'
      + '<div class="flex flex-wrap gap-2 mb-3">'
      +   '<button onclick="eqObraSaldoBatida(\'ENTRADA\')" class="bg-emerald-600 text-white px-3 py-2 rounded-lg font-bold text-xs">Batida entrada</button>'
      +   '<button onclick="eqObraSaldoBatida(\'SAIDA\')" class="bg-slate-600 text-white px-3 py-2 rounded-lg font-bold text-xs">Batida saida</button>'
      + '</div>'
      + '<div class="grid grid-cols-3 gap-2 mb-3">'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Inicio</label><input id="eqs-ini" type="date" value="' + janFirst() + '" onchange="eqObraSaldoRender()" class="w-full p-2 border rounded-lg text-sm"></div>'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Fim</label><input id="eqs-fim" type="date" value="' + lastDay() + '" onchange="eqObraSaldoRender()" class="w-full p-2 border rounded-lg text-sm"></div>'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Status</label><select id="eqs-status" onchange="eqObraSaldoRender()" class="w-full p-2 border rounded-lg text-sm"><option value="PENDENTE">Pendentes</option><option value="PAGO">Pagos</option><option value="TODOS">Todos</option></select></div>'
      + '</div>'
      + '<div id="eqs-lista" class="border rounded-lg overflow-hidden mb-3"></div>'
      + '<div class="bg-slate-50 rounded-lg p-3 mb-3"><p class="text-xs font-bold text-slate-600 mb-2">Ajuste manual</p>'
      +   '<div class="grid grid-cols-4 gap-2">'
      +     '<input id="eqs-aj-data" type="date" value="' + hojeISO() + '" class="p-2 border rounded-lg text-xs">'
      +     '<input id="eqs-aj-frac" type="number" step="0.01" min="0" placeholder="0.5" class="p-2 border rounded-lg text-xs">'
      +     '<input id="eqs-aj-desc" type="text" placeholder="Justificativa" class="p-2 border rounded-lg text-xs">'
      +     '<button onclick="eqObraSaldoAjuste()" class="bg-indigo-600 text-white rounded-lg font-bold text-xs">Lancar</button>'
      +   '</div></div>'
      + '<div class="flex items-center justify-between flex-wrap gap-2 border-t pt-3">'
      +   '<div>Diarias: <b id="eqs-tot" class="text-indigo-700">0.00</b> - Valor: <b id="eqs-val" class="text-green-600">R$ 0,00</b></div>'
      +   '<div class="flex gap-2">'
      +     '<button onclick="eqObraSaldoRecibo()" class="bg-slate-700 text-white px-3 py-2 rounded-lg font-bold text-xs">Recibo</button>'
      +     '<button onclick="eqObraSaldoEstornar()" class="bg-amber-600 text-white px-3 py-2 rounded-lg font-bold text-xs">Estornar ultimo</button>'
      +     '<button onclick="eqObraSaldoFechar()" class="bg-blue-700 text-white px-3 py-2 rounded-lg font-bold text-xs">Gerar Pagamento</button>'
      +   '</div></div>';
    abrirModal(html, 'Saldo de Ponto', 'max-w-3xl');
    eqObraSaldoRender();
  }

  function eqObraSaldoRender() {
    var funcId = val('eqs-id');
    var ini = val('eqs-ini');
    var fim = val('eqs-fim');
    var status = val('eqs-status') || 'PENDENTE';
    var c = CACHE.equipe.find(function (e) { return String(e.id) === String(funcId); });
    if (!c) return;
    var regs = CACHE.ponto.filter(function (r) {
      return String(r.funcionario_id) === String(funcId) && String(r.status).toUpperCase() === 'VALIDADO';
    });
    if (ini) regs = regs.filter(function (r) { return String(r.hora_registro) >= ini + 'T00:00:00'; });
    if (fim) regs = regs.filter(function (r) { return String(r.hora_registro) <= fim + 'T23:59:59'; });
    if (status === 'PENDENTE') regs = regs.filter(function (r) { return !r.pago_em_fechamento; });
    else if (status === 'PAGO') regs = regs.filter(function (r) { return r.pago_em_fechamento; });

    var porDia = {};
    regs.forEach(function (r) {
      var d = new Date(r.hora_registro);
      var k = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      if (!porDia[k]) porDia[k] = [];
      porDia[k].push(r);
    });
    var dias = Object.keys(porDia).sort();
    var total = 0;
    var linhas = dias.map(function (k) {
      var frac = (typeof rvFracaoDiaria === 'function') ? rvFracaoDiaria(porDia[k]) : 0;
      total += frac;
      var horarios = porDia[k].map(function (r) { return r.tipo + ' ' + new Date(r.hora_registro).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }).join(' · ');
      var pago = porDia[k][0].pago_em_fechamento;
      var idsDia = porDia[k].map(function (r) { return r.id; }).join(',');
      return '<tr class="border-b"><td class="p-2 text-xs">' + dataBR(k) + '</td><td class="p-2 text-xs text-slate-500">' + esc(horarios) + '</td>'
        + '<td class="p-2 text-center text-xs font-bold">' + frac.toFixed(2) + '</td>'
        + '<td class="p-2 text-center"><span class="px-2 py-0.5 rounded text-[9px] font-bold ' + (pago ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700') + '">' + (pago ? 'PAGO' : 'PENDENTE') + '</span></td>'
        + '<td class="p-2 text-center">' + (pago ? '<span class="text-slate-300 text-xs">-</span>' : '<button onclick="eqObraExcluirLancamento(\'ponto_diario\',\'' + escAttr(idsDia) + '\',\'' + escAttr(c.nome) + '\')" class="text-red-600 hover:text-red-800 text-xs font-bold">Excluir</button>') + '</td></tr>';
    }).join('');
    var lista = el('eqs-lista');
    if (lista) lista.innerHTML = '<table class="w-full"><thead class="bg-slate-100"><tr class="text-left text-slate-500 text-[10px] uppercase"><th class="p-2">Dia</th><th class="p-2">Marcacoes</th><th class="p-2 text-center">Fracao</th><th class="p-2 text-center">Status</th><th class="p-2 text-center">Acoes</th></tr></thead><tbody>'
      + (linhas || '<tr><td colspan="5" class="p-4 text-center text-slate-400 text-xs">Sem registros no periodo.</td></tr>') + '</tbody></table>';
    if (el('eqs-tot')) el('eqs-tot').textContent = total.toFixed(2);
    if (el('eqs-val')) el('eqs-val').textContent = money(total * Number(c.valor_diaria || 0));
  }

  async function eqObraSaldoBatida(tipo) {
    var funcId = val('eqs-id');
    if (!funcId) return;
    var eq = CACHE.equipe.find(function (e) { return String(e.id) === String(funcId); });
    var res = await sb.from('ponto_diario').insert([{
      funcionario_id: funcId,
      obra_id: (eq && eq.obra_atual_id) || null,
      tipo: tipo,
      status: 'VALIDADO',
      hora_registro: new Date().toISOString()
    }]);
    if (res.error) return toast(res.error.message, true);
    toast('Batida registrada.');
    await carregarDados();
    eqObraSaldoRender();
    eqObraRenderLista();
  }

  async function eqObraSaldoAjuste() {
    var funcId = val('eqs-id');
    var data = val('eqs-aj-data');
    var frac = Number(val('eqs-aj-frac')) || 0;
    if (!data || frac <= 0) return toast('Informe data e fracao.', true);
    var eq = CACHE.equipe.find(function (e) { return String(e.id) === String(funcId); });
    var res = await sb.from('ponto_diario').insert([{
      funcionario_id: funcId,
      obra_id: (eq && eq.obra_atual_id) || null,
      tipo: 'AJUSTE_MANUAL',
      status: 'VALIDADO',
      fracao_diaria: frac,
      hora_registro: new Date(data + 'T12:00:00').toISOString(),
      observacao: val('eqs-aj-desc') || 'Ajuste manual'
    }]);
    if (res.error) return toast(res.error.message, true);
    toast('Ajuste lancado.');
    await carregarDados();
    eqObraSaldoRender();
    eqObraRenderLista();
  }

  async function eqObraSaldoFechar() {
    var funcId = val('eqs-id');
    var ini = val('eqs-ini');
    var fim = val('eqs-fim');
    var c = CACHE.equipe.find(function (e) { return String(e.id) === String(funcId); });
    if (!c) return;
    var calc = calcDiaria(funcId, ini, fim);
    if (calc.diarias <= 0) return toast('Nada a fechar neste periodo.', true);
    var valor = calc.diarias * Number(c.valor_diaria || 0);
    var per = dataBR(ini) + ' a ' + dataBR(fim);
    var ok = await confirmar('Fechar ' + calc.diarias.toFixed(2) + ' diarias = ' + money(valor) + '? Gera despesa no financeiro.', { confirmText: 'Fechar' });
    if (!ok) return;
    loading(true);
    try {
      var chain = await A().insertDespesaComLog({
        item: 'DIARIA OBRA',
        equipe_id: c.id,
        fornecedor: c.nome,
        custo: valor,
        observacao: 'Periodo ' + per + ' - ' + calc.diarias.toFixed(2) + ' diarias',
        status: 'PENDENTE',
        obra_id: c.obra_atual_id || null,
        categoria: 'ponto'
      });
      var ids = calc.registros.map(function (r) { return r.id; });
      var upd = await sb.from('ponto_diario').update({
        pago_em_fechamento: true,
        fechamento_uid: chain.despesa.uid,
        despesa_uid: chain.despesa.uid
      }).in('id', ids);
      if (upd.error) {
        await A().estornarDespesaPorUid(chain.despesa.uid);
        loading(false);
        return toast('Fechamento desfeito: ' + upd.error.message, true);
      }
      toast('Periodo fechado. Despesa e log gerados.');
      await carregarDados();
      eqObraSaldoRender();
      eqObraRenderLista();
    } catch (e) {
      toast(e.message || e, true);
    } finally { loading(false); }
  }

  async function eqObraSaldoEstornar() {
    var funcId = val('eqs-id');
    var c = CACHE.equipe.find(function (e) { return String(e.id) === String(funcId); });
    if (!c) return;
    var desp = await sb.from('despesas').select('uid,id,valor_pago,custo,status')
      .eq('equipe_id', c.id).eq('categoria', 'ponto').neq('status', 'ESTORNADO')
      .order('data', { ascending: false }).limit(1);
    if (desp.error) return toast(desp.error.message, true);
    var d = (desp.data || [])[0];
    if (!d) return toast('Nenhum fechamento para estornar.', true);
    var ok = await confirmar('Estornar este fechamento? As batidas voltam a ficar pendentes (nao apaga o historico).', { danger: true, confirmText: 'Estornar' });
    if (!ok) return;
    loading(true);
    try {
      await A().estornarDespesaPorUid(d.uid);
      var upd = await sb.from('ponto_diario').update({ pago_em_fechamento: false, fechamento_uid: null, despesa_uid: null })
        .eq('fechamento_uid', d.uid);
      if (upd.error) throw upd.error;
      toast('Fechamento estornado. Batidas reabertas.');
      await carregarDados();
      eqObraSaldoRender();
      eqObraRenderLista();
    } catch (e) {
      toast(e.message || e, true);
    } finally { loading(false); }
  }

  function eqObraSaldoRecibo() {
    var funcId = val('eqs-id');
    var c = CACHE.equipe.find(function (e) { return String(e.id) === String(funcId); });
    if (!c) return;
    var total = val('eqs-tot') || '0';
    var valor = el('eqs-val') ? el('eqs-val').textContent : '';
    var emp = (typeof getCompany === 'function') ? getCompany() : { name: 'NEVOA' };
    var nomeEmp = emp.name || emp.nome || 'NEVOA';
    printRecibo(reciboPadrao({
      titulo: 'Recibo de Diarias',
      funcionario: c.nome || '',
      doc: c.cpf || '',
      obra: nomeObraPorId(c.obra_atual_id),
      periodo: periodoTexto('eqs-ini', 'eqs-fim'),
      linhas: [['Diarias', total], ['Valor da diaria', money(c.valor_diaria || 0)]],
      valor: valor,
      valorLabel: 'Total a receber',
      declaracao: 'Recebi de <b>' + esc(nomeEmp) + '</b> a importancia de <b>' + esc(valor) + '</b>, referente a <b>' + esc(total) + ' diarias</b>, com a diaria acordada em <b>' + money(c.valor_diaria || 0) + '</b>.',
      assinatura: c.nome || ''
    }));
  }

  async function eqObraExcluirLancamento(tabela, idsCsv, nome) {
    var permitido = { ponto_diario: 1, producao_terc: 1, medicoes_empreita: 1 };
    if (!permitido[tabela]) return;
    var ids = String(idsCsv || '').split(',').filter(Boolean);
    if (!ids.length) return;
    var ok = await confirmar('Excluir ' + ids.length + ' lancamento(s)' + (nome ? ' de ' + nome : '') + '? O historico fica marcado como ESTORNADO.', { danger: true, confirmText: 'Excluir' });
    if (!ok) return;
    loading(true);
    try {
      var q = sb.from(tabela).update({ status: 'ESTORNADO' }).in('id', ids);
      if (tabela === 'ponto_diario') q = q.eq('pago_em_fechamento', false);
      var res = await q;
      if (res.error) throw res.error;
      toast('Lancamento(s) excluido(s).');
      await carregarDados();
      if (tabela === 'ponto_diario') eqObraSaldoRender();
      else if (tabela === 'producao_terc') eqObraSaldoMetrosRender();
      else eqObraSaldoEmpreitaRender();
      eqObraRenderLista();
    } catch (e) {
      toast(e.message || e, true);
    } finally { loading(false); }
  }

  // ---------- Saldo Metros ----------
  function eqObraSaldoMetros(tercId) {
    var t = CACHE.terc.find(function (x) { return String(x.id) === String(tercId); });
    if (!t) return toast('Terceirizado nao encontrado.', true);
    var html = ''
      + '<input type="hidden" id="eqm-id" value="' + escAttr(tercId) + '">'
      + '<div class="bg-slate-50 rounded-lg p-3 text-sm mb-3">' + esc(t.nome) + ' - Metro: <b>' + money(t.valor_metro || 0) + '</b></div>'
      + '<div class="grid grid-cols-3 gap-2 mb-3">'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Inicio</label><input id="eqm-ini" type="date" value="' + janFirst() + '" onchange="eqObraSaldoMetrosRender()" class="w-full p-2 border rounded-lg text-sm"></div>'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Fim</label><input id="eqm-fim" type="date" value="' + lastDay() + '" onchange="eqObraSaldoMetrosRender()" class="w-full p-2 border rounded-lg text-sm"></div>'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Status</label><select id="eqm-status" onchange="eqObraSaldoMetrosRender()" class="w-full p-2 border rounded-lg text-sm"><option value="PENDENTE">Pendentes</option><option value="PAGO">Pagos</option><option value="TODOS">Todos</option></select></div>'
      + '</div>'
      + '<div id="eqm-lista" class="border rounded-lg overflow-hidden mb-3"></div>'
      + '<div class="bg-slate-50 rounded-lg p-3 mb-3"><p class="text-xs font-bold text-slate-600 mb-2">Lancar metros</p>'
      +   '<div class="grid grid-cols-4 gap-2">'
      +     '<input id="eqm-aj-data" type="date" value="' + hojeISO() + '" class="p-2 border rounded-lg text-xs">'
      +     '<input id="eqm-aj-metros" type="number" step="0.01" min="0" placeholder="Metros" class="p-2 border rounded-lg text-xs">'
      +     '<input id="eqm-aj-desc" type="text" placeholder="Justificativa" class="p-2 border rounded-lg text-xs">'
      +     '<button onclick="eqObraSaldoMetrosLancar()" class="bg-indigo-600 text-white rounded-lg font-bold text-xs">Lancar</button>'
      +   '</div></div>'
      + '<div class="flex items-center justify-between flex-wrap gap-2 border-t pt-3">'
      +   '<div>Metros: <b id="eqm-tot" class="text-indigo-700">0.00</b> - Valor: <b id="eqm-val" class="text-green-600">R$ 0,00</b></div>'
      +   '<div class="flex gap-2">'
      +     '<button onclick="eqObraSaldoMetrosRecibo()" class="bg-slate-700 text-white px-3 py-2 rounded-lg font-bold text-xs">Recibo</button>'
      +     '<button onclick="eqObraSaldoMetrosEstornar()" class="bg-amber-600 text-white px-3 py-2 rounded-lg font-bold text-xs">Estornar ultimo</button>'
      +     '<button onclick="eqObraSaldoMetrosFechar()" class="bg-blue-700 text-white px-3 py-2 rounded-lg font-bold text-xs">Gerar Pagamento</button>'
      +   '</div></div>';
    abrirModal(html, 'Saldo de Metros', 'max-w-3xl');
    eqObraSaldoMetrosRender();
  }

  function eqObraSaldoMetrosRender() {
    var tercId = val('eqm-id');
    var ini = val('eqm-ini');
    var fim = val('eqm-fim');
    var status = val('eqm-status') || 'PENDENTE';
    var t = CACHE.terc.find(function (x) { return String(x.id) === String(tercId); });
    if (!t) return;
    var calc = calcMetros(tercId, ini, fim);
    var regs = calc.registros.slice();
    if (status === 'PENDENTE') regs = regs.filter(function (p) { return p.status !== 'PAGO'; });
    else if (status === 'PAGO') regs = regs.filter(function (p) { return p.status === 'PAGO'; });
    var total = regs.reduce(function (s, p) { return s + Number(p.metros || 0); }, 0);
    var linhas = regs.map(function (p) {
      return '<tr class="border-b"><td class="p-2 text-xs">' + dataBR(p.data_registro) + '</td>'
        + '<td class="p-2 text-center text-xs font-bold">' + Number(p.metros || 0).toFixed(2) + ' m</td>'
        + '<td class="p-2 text-center"><span class="px-2 py-0.5 rounded text-[9px] font-bold ' + (p.status === 'PAGO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700') + '">' + (p.status === 'PAGO' ? 'PAGO' : 'PENDENTE') + '</span></td>'
        + '<td class="p-2 text-center">' + (p.status === 'PAGO' ? '<span class="text-slate-300 text-xs">-</span>' : '<button onclick="eqObraExcluirLancamento(\'producao_terc\',\'' + escAttr(p.id) + '\',\'' + escAttr(t.nome) + '\')" class="text-red-600 hover:text-red-800 text-xs font-bold">Excluir</button>') + '</td></tr>';
    }).join('');
    var lista = el('eqm-lista');
    if (lista) lista.innerHTML = '<table class="w-full"><thead class="bg-slate-100"><tr class="text-left text-slate-500 text-[10px] uppercase"><th class="p-2">Data</th><th class="p-2 text-center">Metros</th><th class="p-2 text-center">Status</th><th class="p-2 text-center">Acoes</th></tr></thead><tbody>'
      + (linhas || '<tr><td colspan="4" class="p-4 text-center text-slate-400 text-xs">Sem registros.</td></tr>') + '</tbody></table>';
    if (el('eqm-tot')) el('eqm-tot').textContent = total.toFixed(2);
    if (el('eqm-val')) el('eqm-val').textContent = money(total * Number(t.valor_metro || 0));
  }

  async function eqObraSaldoMetrosLancar() {
    var tercId = val('eqm-id');
    var metros = Number(val('eqm-aj-metros')) || 0;
    var data = val('eqm-aj-data');
    if (!data || metros <= 0) return toast('Informe data e metros.', true);
    var t = CACHE.terc.find(function (x) { return String(x.id) === String(tercId); });
    var res = await sb.from('producao_terc').insert([{
      terceirizado_id: tercId,
      obra_id: (t && t.obra_atual_id) || null,
      data_registro: data,
      metros: metros,
      status: 'PENDENTE',
      observacao: val('eqm-aj-desc') || 'Lancamento manual'
    }]);
    if (res.error) return toast(res.error.message, true);
    toast('Metros lancados.');
    await carregarDados();
    eqObraSaldoMetrosRender();
    eqObraRenderLista();
  }

  async function eqObraSaldoMetrosFechar() {
    var tercId = val('eqm-id');
    var ini = val('eqm-ini');
    var fim = val('eqm-fim');
    var t = CACHE.terc.find(function (x) { return String(x.id) === String(tercId); });
    if (!t) return;
    var calc = calcMetros(tercId, ini, fim);
    var regs = calc.registros.filter(function (p) { return p.status !== 'PAGO'; });
    var metros = regs.reduce(function (s, p) { return s + Number(p.metros || 0); }, 0);
    if (metros <= 0) return toast('Nada pendente.', true);
    var valor = metros * Number(t.valor_metro || 0);
    var ok = await confirmar('Fechar ' + metros.toFixed(2) + ' m = ' + money(valor) + '?', { confirmText: 'Fechar' });
    if (!ok) return;
    loading(true);
    try {
      var chain = await A().insertDespesaComLog({
        item: 'TERCEIRIZADO',
        fornecedor: t.nome,
        custo: valor,
        observacao: 'Producao ' + metros.toFixed(2) + ' m - ' + t.nome,
        status: 'PENDENTE',
        obra_id: t.obra_atual_id || null,
        categoria: 'terceirizado'
      });
      var ids = regs.map(function (p) { return p.id; });
      var upd = await sb.from('producao_terc').update({
        status: 'PAGO',
        fechamento_uid: chain.despesa.uid,
        despesa_uid: chain.despesa.uid
      }).in('id', ids);
      if (upd.error) {
        await A().estornarDespesaPorUid(chain.despesa.uid);
        loading(false);
        return toast('Pagamento desfeito: ' + upd.error.message, true);
      }
      toast('Producao paga. Despesa e log gerados.');
      await carregarDados();
      eqObraSaldoMetrosRender();
      eqObraRenderLista();
    } catch (e) {
      toast(e.message || e, true);
    } finally { loading(false); }
  }

  async function eqObraSaldoMetrosEstornar() {
    var tercId = val('eqm-id');
    var t = CACHE.terc.find(function (x) { return String(x.id) === String(tercId); });
    if (!t) return;
    var desp = await sb.from('despesas').select('uid,id,status')
      .eq('categoria', 'terceirizado').eq('fornecedor', t.nome).neq('status', 'ESTORNADO')
      .order('data', { ascending: false }).limit(1);
    if (desp.error) return toast(desp.error.message, true);
    var d = (desp.data || [])[0];
    if (!d) return toast('Nenhum pagamento para estornar.', true);
    var ok = await confirmar('Estornar este pagamento? Os metros voltam a pendente (nao apaga o historico).', { danger: true, confirmText: 'Estornar' });
    if (!ok) return;
    loading(true);
    try {
      await A().estornarDespesaPorUid(d.uid);
      var upd = await sb.from('producao_terc').update({ status: 'PENDENTE', fechamento_uid: null, despesa_uid: null })
        .eq('fechamento_uid', d.uid).eq('status', 'PAGO');
      if (upd.error) throw upd.error;
      toast('Pagamento estornado. Metros reabertos.');
      await carregarDados();
      eqObraSaldoMetrosRender();
      eqObraRenderLista();
    } catch (e) {
      toast(e.message || e, true);
    } finally { loading(false); }
  }

  function eqObraSaldoMetrosRecibo() {
    var tercId = val('eqm-id');
    var t = CACHE.terc.find(function (x) { return String(x.id) === String(tercId); });
    if (!t) return;
    var emp = (typeof getCompany === 'function') ? getCompany() : { name: 'NEVOA' };
    var nomeEmp = emp.name || emp.nome || 'NEVOA';
    var valor = el('eqm-val') ? el('eqm-val').textContent : '';
    var total = el('eqm-tot') ? el('eqm-tot').textContent : '0';
    printRecibo(reciboPadrao({
      titulo: 'Recibo de Metragem',
      funcionario: t.nome || '',
      doc: t.cpf_cnpj || '',
      obra: nomeObraPorId(t.obra_atual_id),
      periodo: periodoTexto('eqm-ini', 'eqm-fim'),
      linhas: [['Metros', total], ['Valor do metro', money(t.valor_metro || 0)]],
      valor: valor,
      valorLabel: 'Total a receber',
      declaracao: 'Recebi de <b>' + esc(nomeEmp) + '</b> a importancia de <b>' + esc(valor) + '</b>, referente a <b>' + esc(total) + ' metros</b>, ao valor de <b>' + money(t.valor_metro || 0) + '/m</b>.',
      assinatura: t.nome || ''
    }));
  }

  // ---------- Saldo Empreita ----------
  function eqObraSaldoEmpreita(eqId) {
    var c = CACHE.equipe.find(function (e) { return String(e.id) === String(eqId); });
    if (!c) return toast('Empreiteiro nao encontrado.', true);
    var html = ''
      + '<input type="hidden" id="eqe-id" value="' + escAttr(eqId) + '">'
      + '<div class="grid grid-cols-4 gap-2 mb-3">'
      +   '<div class="bg-white p-2 rounded-lg border"><div class="text-[10px] font-bold text-slate-500 uppercase">Contrato</div><div id="eqe-contrato" class="font-black text-slate-800">-</div></div>'
      +   '<div class="bg-white p-2 rounded-lg border"><div class="text-[10px] font-bold text-slate-500 uppercase">Pago</div><div id="eqe-pago" class="font-black text-emerald-700">-</div></div>'
      +   '<div class="bg-amber-50 p-2 rounded-lg border border-amber-200"><div class="text-[10px] font-bold text-amber-700 uppercase">A pagar</div><div id="eqe-pend" class="font-black text-amber-800">-</div></div>'
      +   '<div class="bg-white p-2 rounded-lg border"><div class="text-[10px] font-bold text-slate-500 uppercase">Saldo</div><div id="eqe-saldo" class="font-black text-indigo-700">-</div></div>'
      + '</div>'
      + '<div class="grid grid-cols-3 gap-2 mb-3">'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Inicio</label><input id="eqe-ini" type="date" value="' + janFirst() + '" onchange="eqObraSaldoEmpreitaRender()" class="w-full p-2 border rounded-lg text-sm"></div>'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Fim</label><input id="eqe-fim" type="date" value="' + lastDay() + '" onchange="eqObraSaldoEmpreitaRender()" class="w-full p-2 border rounded-lg text-sm"></div>'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Status</label><select id="eqe-status" onchange="eqObraSaldoEmpreitaRender()" class="w-full p-2 border rounded-lg text-sm"><option value="PENDENTE">Pendentes</option><option value="PAGO">Pagos</option><option value="TODOS">Todos</option></select></div>'
      + '</div>'
      + '<div id="eqe-lista" class="border rounded-lg overflow-hidden mb-3"></div>'
      + '<div class="bg-slate-50 rounded-lg p-3 mb-3"><p class="text-xs font-bold text-slate-600 mb-2">Lancar medicao (% do contrato ou valor medido)</p>'
      +   '<div class="grid grid-cols-2 md:grid-cols-5 gap-2">'
      +     '<input id="eqe-med-data" type="date" value="' + hojeISO() + '" class="p-2 border rounded-lg text-xs">'
      +     '<input id="eqe-med-pct" type="number" step="0.01" min="0" max="100" placeholder="% do contrato" oninput="eqObraEmpreitaSync(\'pct\')" class="p-2 border rounded-lg text-xs">'
      +     '<input id="eqe-med-valor" type="number" step="0.01" min="0" placeholder="Valor medido (R$)" oninput="eqObraEmpreitaSync(\'valor\')" class="p-2 border rounded-lg text-xs">'
      +     '<input id="eqe-med-desc" type="text" placeholder="Servico medido" class="p-2 border rounded-lg text-xs">'
      +     '<button onclick="eqObraSaldoEmpreitaMedir()" class="bg-amber-700 text-white rounded-lg font-bold text-xs">Lancar</button>'
      +   '</div>'
      +   '<p id="eqe-med-hint" class="text-[10px] text-slate-500 mt-1">Informe o percentual ou o valor medido.</p></div>'
      + '<div class="flex items-center justify-between flex-wrap gap-2 border-t pt-3">'
      +   '<div>A pagar: <b id="eqe-tot" class="text-amber-800">R$ 0,00</b></div>'
      +   '<div class="flex gap-2">'
      +     '<button onclick="eqObraSaldoEmpreitaRecibo()" class="bg-slate-700 text-white px-3 py-2 rounded-lg font-bold text-xs">Recibo</button>'
      +     '<button onclick="eqObraSaldoEmpreitaEstornar()" class="bg-amber-600 text-white px-3 py-2 rounded-lg font-bold text-xs">Estornar ultimo</button>'
      +     '<button onclick="eqObraSaldoEmpreitaFechar()" class="bg-blue-700 text-white px-3 py-2 rounded-lg font-bold text-xs">Gerar Pagamento</button>'
      +   '</div></div>';
    abrirModal(html, 'Medicao de Empreita', 'max-w-4xl');
    eqObraSaldoEmpreitaRender();
  }

  function eqObraSaldoEmpreitaRender() {
    var eqId = val('eqe-id');
    var ini = val('eqe-ini');
    var fim = val('eqe-fim');
    var status = val('eqe-status') || 'PENDENTE';
    var c = CACHE.equipe.find(function (e) { return String(e.id) === String(eqId); });
    if (!c) return;
    var r = calcEmpreita(eqId, ini, fim);
    if (el('eqe-contrato')) el('eqe-contrato').textContent = money(r.contrato);
    if (el('eqe-pago')) el('eqe-pago').textContent = money(r.pago);
    if (el('eqe-pend')) el('eqe-pend').textContent = money(r.pend);
    if (el('eqe-saldo')) el('eqe-saldo').textContent = money(r.saldo);
    var regs = r.medicoes.slice();
    if (status === 'PENDENTE') regs = regs.filter(function (m) { return m.status !== 'PAGO'; });
    else if (status === 'PAGO') regs = regs.filter(function (m) { return m.status === 'PAGO'; });
    var total = regs.reduce(function (s, m) { return s + Number(m.valor || 0); }, 0);
    var linhas = regs.map(function (m) {
      return '<tr class="border-b"><td class="p-2 text-xs">' + dataBR(m.data_medicao) + '</td>'
        + '<td class="p-2 text-xs text-slate-600">' + esc(m.descricao || '-') + '</td>'
        + '<td class="p-2 text-center text-xs font-bold text-amber-700">' + Number(m.percentual || 0).toFixed(2) + '%</td>'
        + '<td class="p-2 text-right text-xs font-bold">' + money(m.valor) + '</td>'
        + '<td class="p-2 text-center"><span class="px-2 py-0.5 rounded text-[9px] font-bold ' + (m.status === 'PAGO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700') + '">' + (m.status === 'PAGO' ? 'PAGO' : 'PENDENTE') + '</span></td>'
        + '<td class="p-2 text-center">' + (m.status === 'PAGO' ? '<span class="text-slate-300 text-xs">-</span>' : '<button onclick="eqObraExcluirLancamento(\'medicoes_empreita\',\'' + escAttr(m.id) + '\',\'' + escAttr(c.nome) + '\')" class="text-red-600 hover:text-red-800 text-xs font-bold">Excluir</button>') + '</td></tr>';
    }).join('');
    var lista = el('eqe-lista');
    if (lista) lista.innerHTML = '<table class="w-full"><thead class="bg-slate-100"><tr class="text-left text-slate-500 text-[10px] uppercase"><th class="p-2">Data</th><th class="p-2">Servico</th><th class="p-2 text-center">%</th><th class="p-2 text-right">Valor</th><th class="p-2 text-center">Status</th><th class="p-2 text-center">Acoes</th></tr></thead><tbody>'
      + (linhas || '<tr><td colspan="6" class="p-4 text-center text-slate-400 text-xs">Sem medicoes.</td></tr>') + '</tbody></table>';
    if (el('eqe-tot')) el('eqe-tot').textContent = money(total);
  }

  function eqObraEmpreitaSync(src) {
    var eqId = val('eqe-id');
    var c = CACHE.equipe.find(function (e) { return String(e.id) === String(eqId); });
    var contrato = Number(c && c.valor_contrato || 0);
    var pctEl = el('eqe-med-pct'), valEl = el('eqe-med-valor'), hint = el('eqe-med-hint');
    if (!pctEl || !valEl) return;
    if (src === 'pct') {
      var p = Number(pctEl.value) || 0;
      valEl.value = (contrato > 0 && p > 0) ? (contrato * p / 100).toFixed(2) : '';
    } else {
      var v = Number(valEl.value) || 0;
      pctEl.value = (contrato > 0 && v > 0) ? (v / contrato * 100).toFixed(2) : '';
    }
    if (hint) {
      var p2 = Number(pctEl.value) || 0, v2 = Number(valEl.value) || 0;
      var ok = contrato > 0 && (p2 > 0 || v2 > 0);
      hint.textContent = ok ? (p2.toFixed(2) + '% do contrato = ' + money(v2))
        : (contrato > 0 ? 'Informe o percentual ou o valor medido.' : 'Defina o valor do contrato do empreiteiro.');
      hint.className = 'text-[10px] mt-1 ' + (ok ? 'text-amber-700 font-bold' : 'text-slate-500');
    }
  }

  async function eqObraSaldoEmpreitaMedir() {
    var eqId = val('eqe-id');
    var data = val('eqe-med-data');
    var c = CACHE.equipe.find(function (e) { return String(e.id) === String(eqId); });
    if (!c) return;
    var contrato = Number(c.valor_contrato || 0);
    var pct = Number(val('eqe-med-pct')) || 0;
    var valor = Number(val('eqe-med-valor')) || 0;
    if (!data) return toast('Informe a data.', true);
    if (pct <= 0 && valor <= 0) return toast('Informe o percentual ou o valor medido.', true);
    if (contrato <= 0) return toast('Defina o valor do contrato do empreiteiro.', true);
    if (pct <= 0) pct = (valor / contrato) * 100;
    if (valor <= 0) valor = (contrato * pct) / 100;
    var r = calcEmpreita(eqId);
    if (r.pctExec + pct > 100.01) return toast('Percentual acumulado ultrapassa 100%.', true);
    var res = await sb.from('medicoes_empreita').insert([{
      equipe_id: eqId,
      obra_id: c.obra_atual_id || null,
      data_medicao: data,
      percentual: pct,
      valor: valor,
      descricao: val('eqe-med-desc') || 'Medicao de empreita',
      status: 'PENDENTE'
    }]);
    if (res.error) return toast(res.error.message, true);
    toast('Medicao lancada.');
    if (el('eqe-med-pct')) el('eqe-med-pct').value = '';
    if (el('eqe-med-valor')) el('eqe-med-valor').value = '';
    if (el('eqe-med-desc')) el('eqe-med-desc').value = '';
    await carregarDados();
    eqObraSaldoEmpreitaRender();
    eqObraRenderLista();
  }

  async function eqObraSaldoEmpreitaFechar() {
    var eqId = val('eqe-id');
    var ini = val('eqe-ini');
    var fim = val('eqe-fim');
    var c = CACHE.equipe.find(function (e) { return String(e.id) === String(eqId); });
    if (!c) return;
    var r = calcEmpreita(eqId, ini, fim);
    var regs = r.medicoes.filter(function (m) { return m.status !== 'PAGO'; });
    var valor = regs.reduce(function (s, m) { return s + Number(m.valor || 0); }, 0);
    var pct = regs.reduce(function (s, m) { return s + Number(m.percentual || 0); }, 0);
    if (valor <= 0) return toast('Nada pendente.', true);
    var ok = await confirmar('Fechar ' + money(valor) + ' (' + pct.toFixed(2) + '% do contrato)?', { confirmText: 'Fechar' });
    if (!ok) return;
    loading(true);
    try {
      var chain = await A().insertDespesaComLog({
        item: 'EMPREITA',
        equipe_id: c.id,
        fornecedor: c.nome,
        custo: valor,
        observacao: 'Medicao ' + pct.toFixed(2) + '% - ' + c.nome,
        status: 'PENDENTE',
        obra_id: c.obra_atual_id || null,
        categoria: 'empreita'
      });
      var ids = regs.map(function (m) { return m.id; });
      var upd = await sb.from('medicoes_empreita').update({
        status: 'PAGO',
        fechamento_uid: chain.despesa.uid,
        despesa_uid: chain.despesa.uid
      }).in('id', ids);
      if (upd.error) {
        await A().estornarDespesaPorUid(chain.despesa.uid);
        loading(false);
        return toast('Pagamento desfeito: ' + upd.error.message, true);
      }
      toast('Medicao paga. Despesa e log gerados.');
      await carregarDados();
      eqObraSaldoEmpreitaRender();
      eqObraRenderLista();
    } catch (e) {
      toast(e.message || e, true);
    } finally { loading(false); }
  }

  async function eqObraSaldoEmpreitaEstornar() {
    var eqId = val('eqe-id');
    var desp = await sb.from('despesas').select('uid,id,status')
      .eq('equipe_id', eqId).eq('categoria', 'empreita').neq('status', 'ESTORNADO')
      .order('data', { ascending: false }).limit(1);
    if (desp.error) return toast(desp.error.message, true);
    var d = (desp.data || [])[0];
    if (!d) return toast('Nenhum pagamento para estornar.', true);
    var ok = await confirmar('Estornar esta medicao? Volta a pendente (nao apaga o historico).', { danger: true, confirmText: 'Estornar' });
    if (!ok) return;
    loading(true);
    try {
      await A().estornarDespesaPorUid(d.uid);
      var upd = await sb.from('medicoes_empreita').update({ status: 'PENDENTE', fechamento_uid: null, despesa_uid: null })
        .eq('fechamento_uid', d.uid).eq('status', 'PAGO');
      if (upd.error) throw upd.error;
      toast('Medicao estornada.');
      await carregarDados();
      eqObraSaldoEmpreitaRender();
      eqObraRenderLista();
    } catch (e) {
      toast(e.message || e, true);
    } finally { loading(false); }
  }

  function eqObraSaldoEmpreitaRecibo() {
    var eqId = val('eqe-id');
    var c = CACHE.equipe.find(function (e) { return String(e.id) === String(eqId); });
    if (!c) return;
    var emp = (typeof getCompany === 'function') ? getCompany() : { name: 'NEVOA' };
    var nomeEmp = emp.name || emp.nome || 'NEVOA';
    var valor = el('eqe-tot') ? el('eqe-tot').textContent : '';
    printRecibo(reciboPadrao({
      titulo: 'Recibo de Empreita',
      funcionario: c.nome || '',
      doc: c.cpf || '',
      obra: nomeObraPorId(c.obra_atual_id),
      periodo: periodoTexto('eqe-ini', 'eqe-fim'),
      linhas: [['Contrato', money(c.valor_contrato || 0)]],
      valor: valor,
      valorLabel: 'Total a receber',
      declaracao: 'Recebi de <b>' + esc(nomeEmp) + '</b> a importancia de <b>' + esc(valor) + '</b>, referente a medicao de empreita do contrato de <b>' + money(c.valor_contrato || 0) + '</b>.',
      assinatura: c.nome || ''
    }));
  }

  // ---------- Cadastro ----------
  function eqObraOpenForm(id, origem) {
    var c = {
      id: '', origem: '', nome: '', categoria: 'Diaria', telefone: '', cpf: '', rg: '',
      endereco: '', chave_pix: '', obra_atual_id: '', data_contrato: '', valor: 0, ativo: true
    };
    if (id) {
      var found = colaboradores().find(function (x) { return String(x.id) === String(id) && (!origem || x.origem === origem); });
      if (!found) return toast('Colaborador nao encontrado.', true);
      c.id = found.id;
      c.origem = found.origem;
      c.nome = found.nome;
      c.categoria = found.origem === 'terceirizado' ? 'Metragem' : (found.tipo === 'empreita' ? 'Empreita' : 'Diaria');
      c.telefone = found.telefone;
      c.cpf = found.cpf;
      c.rg = found.rg;
      c.endereco = found.endereco;
      c.chave_pix = found.chave_pix;
      c.obra_atual_id = found.obra_atual_id;
      c.data_contrato = found.data_contrato;
      c.valor = found.tipo === 'empreita' ? found.valor_contrato : found.valor_base;
      c.ativo = found.ativo;
    }
    var obras = CACHE.obras;
    var cats = ['Diaria', 'Metragem', 'Empreita'];
    var html = ''
      + '<input type="hidden" id="eqp-id" value="' + escAttr(c.id) + '">'
      + '<input type="hidden" id="eqp-origem" value="' + escAttr(c.origem) + '">'
      + '<div class="space-y-3">'
      +   '<div><label class="block text-[10px] font-bold text-slate-500 uppercase">Nome completo *</label>'
      +   '<input id="eqp-nome" required value="' + escAttr(c.nome) + '" class="w-full p-2 border rounded-lg"></div>'
      +   '<div class="grid grid-cols-2 gap-3">'
      +     '<div><label class="block text-[10px] font-bold text-slate-500 uppercase">Categoria / Funcao</label>'
      +     '<select id="eqp-cat" onchange="eqObraOnCat()" class="w-full p-2 border rounded-lg">'
      +       cats.map(function (t) { return '<option' + (c.categoria === t ? ' selected' : '') + '>' + t + '</option>'; }).join('')
      +     '</select></div>'
      +     '<div><label class="block text-[10px] font-bold text-slate-500 uppercase">Telefone</label>'
      +     '<input id="eqp-tel" value="' + escAttr(c.telefone) + '" class="w-full p-2 border rounded-lg"></div>'
      +   '</div>'
      +   '<div class="grid grid-cols-2 gap-3">'
      +     '<div><label class="block text-[10px] font-bold text-slate-500 uppercase">CPF / CNPJ</label><input id="eqp-cpf" maxlength="18" placeholder="000.000.000-00 / 00.000.000/0000-00" oninput="eqObraMaskDoc(this)" value="' + escAttr(c.cpf) + '" class="w-full p-2 border rounded-lg"></div>'
      +     '<div><label class="block text-[10px] font-bold text-slate-500 uppercase">RG</label><input id="eqp-rg" value="' + escAttr(c.rg) + '" class="w-full p-2 border rounded-lg"></div>'
      +   '</div>'
      +   '<div><label class="block text-[10px] font-bold text-slate-500 uppercase">Endereco</label><input id="eqp-end" value="' + escAttr(c.endereco) + '" class="w-full p-2 border rounded-lg"></div>'
      +   '<div><label class="block text-[10px] font-bold text-slate-500 uppercase">Chave PIX</label><input id="eqp-pix" value="' + escAttr(c.chave_pix) + '" class="w-full p-2 border rounded-lg"></div>'
      +   '<div><label class="block text-[10px] font-bold text-slate-500 uppercase">Obra vinculada</label>'
      +   '<select id="eqp-obra" class="w-full p-2 border rounded-lg">' + A().optionsObras(obras, c.obra_atual_id) + '</select></div>'
      +   '<div class="grid grid-cols-2 gap-3">'
      +     '<div><label class="block text-[10px] font-bold text-slate-500 uppercase">Data inicio (contrato)</label>'
      +     '<input id="eqp-contrato" type="date" value="' + escAttr((c.data_contrato || '').slice(0, 10)) + '" class="w-full p-2 border rounded-lg"></div>'
      +     '<div><label id="eqp-label-valor" class="block text-[10px] font-bold text-slate-500 uppercase">Valor</label>'
      +     '<input id="eqp-valor" type="number" step="0.01" value="' + (c.valor || 0) + '" class="w-full p-2 border rounded-lg font-bold text-green-700"></div>'
      +   '</div>'
      +   '<label class="flex items-center gap-2"><input id="eqp-ativo" type="checkbox"' + (c.ativo ? ' checked' : '') + '> Ativo</label>'
      + '</div>'
      + '<div class="flex justify-end gap-2 mt-4"><button type="button" onclick="eqObraFecharModal()" class="px-4 py-2 border rounded-lg font-bold">Cancelar</button>'
      + '<button onclick="eqObraSalvar(event)" class="px-4 py-2 bg-blue-700 text-white rounded-lg font-bold">Salvar</button></div>';
    abrirModal(html, id ? 'Editar colaborador' : 'Novo colaborador', 'max-w-lg');
    eqObraOnCat();
  }

  function eqObraOnCat() {
    var cat = val('eqp-cat');
    var label = el('eqp-label-valor');
    if (!label) return;
    if (cat === 'Metragem') label.textContent = 'Valor do metro (R$)';
    else if (cat === 'Empreita') label.textContent = 'Valor total do contrato (R$)';
    else label.textContent = 'Valor da diaria (R$)';
  }

  async function eqObraSalvar(ev) {
    if (ev) ev.preventDefault();
    var id = val('eqp-id');
    var origem = val('eqp-origem');
    var nome = (val('eqp-nome') || '').trim();
    var cat = val('eqp-cat');
    if (!nome || !cat) return toast('Informe nome e categoria.', true);
    var valor = Number(val('eqp-valor')) || 0;
    var docDig = soDigitos(val('eqp-cpf'));
    var docRaw = (val('eqp-cpf') || '').trim();
    if (docRaw && !validaDoc(docDig)) return toast('CPF/CNPJ invalido. Use 000.000.000-00 ou 00.000.000/0000-00.', true);
    var docFinal = docDig ? formatDoc(docDig) : null;
    if (docDig) {
      var dup;
      try { dup = await docJaUsado(docDig, id, origem); }
      catch (e) { return toast('Nao foi possivel validar o documento. Tente novamente.', true); }
      if (dup) return toast('Ja existe um colaborador com este CPF/CNPJ nesta empresa.', true);
    }
    var common = {
      nome: nome,
      telefone: (val('eqp-tel') || '').trim() || null,
      rg: (val('eqp-rg') || '').trim() || null,
      endereco: (val('eqp-end') || '').trim() || null,
      chave_pix: (val('eqp-pix') || '').trim() || null,
      obra_atual_id: val('eqp-obra') || null,
      data_contrato: val('eqp-contrato') || null,
      ativo: el('eqp-ativo') ? el('eqp-ativo').checked : true
    };
    var novoTipo = cat === 'Metragem' ? 'terceirizado' : 'equipe';
    var mudou = !!id && origem && origem !== novoTipo;
    if (mudou) {
      var dep = await contarDependencias(origem, id);
      if (!dep.ok) return toast('Nao foi possivel verificar o historico. Tente novamente.', true);
      if (dep.total > 0) return toast('Este colaborador tem ' + dep.total + ' lancamento(s). Nao e possivel mudar o tipo sem perder o historico.', true);
    }
    loading(true);
    try {
      if (cat === 'Metragem') {
        var payT = Object.assign(common, { cpf_cnpj: docFinal, valor_metro: valor });
        var rt = id && !mudou
          ? await sb.from('terceirizados').update(payT).eq('id', id)
          : await sb.from('terceirizados').insert([payT]);
        if (rt.error) throw rt.error;
        if (mudou) await removerCadastroAntigo(origem, id);
      } else {
        var payE = Object.assign(common, {
          tipo: cat === 'Empreita' ? 'Empreita' : 'Diaria',
          categoria: cat,
          tipo_remuneracao: cat === 'Empreita' ? 'empreita' : 'diaria',
          cpf: docFinal,
          valor_diaria: cat === 'Empreita' ? null : valor,
          valor_contrato: cat === 'Empreita' ? valor : 0,
          valor_metro: 0
        });
        var re;
        if (id && !mudou) {
          re = await sb.from('equipe').update(payE).eq('id', id);
        } else {
          payE.contrato_assinado = false;
          re = await sb.from('equipe').insert([payE]);
        }
        if (re.error) throw re.error;
        if (mudou) await removerCadastroAntigo(origem, id);
      }
      toast('Cadastro salvo.');
      fecharModal();
      await carregarDados();
      eqObraRenderLista();
    } catch (e) {
      toast(e.message || e, true);
    } finally { loading(false); }
  }

  async function contarDependencias(origem, id) {
    try {
      if (origem === 'terceirizado') {
        var a = await sb.from('producao_terc').select('id', { count: 'exact', head: true }).eq('terceirizado_id', id);
        if (a.error) throw a.error;
        return { ok: true, total: a.count || 0 };
      }
      var b = await sb.from('ponto_diario').select('id', { count: 'exact', head: true }).eq('funcionario_id', id);
      var c = await sb.from('medicoes_empreita').select('id', { count: 'exact', head: true }).eq('equipe_id', id);
      if (b.error || c.error) throw (b.error || c.error);
      return { ok: true, total: (b.count || 0) + (c.count || 0) };
    } catch (e) {
      return { ok: false, total: 0 };
    }
  }

  async function removerCadastroAntigo(origem, id) {
    var tabela = origem === 'terceirizado' ? 'terceirizados' : 'equipe';
    var res = await sb.from(tabela).update({ ativo: false }).eq('id', id);
    if (res.error) throw res.error;
  }

  async function eqObraToggle(id, origem, ativoAtual) {
    var ok = await confirmar(ativoAtual ? 'Desativar este colaborador?' : 'Reativar este colaborador?', { confirmText: ativoAtual ? 'Desativar' : 'Reativar' });
    if (!ok) return;
    var tabela = origem === 'terceirizado' ? 'terceirizados' : 'equipe';
    var res = await sb.from(tabela).update({ ativo: !ativoAtual }).eq('id', id);
    if (res.error) return toast(res.error.message, true);
    toast('Status atualizado.');
    await carregarDados();
    eqObraRenderLista();
  }

  function eqObraContrato(id, origem) {
    if (origem === 'terceirizado') return imprimirContratoTerceirizado(id);
    if (typeof imprimirContratoObra === 'function') imprimirContratoObra(id);
    else toast('Modulo de contrato nao carregado.', true);
  }

  // ---------- Checagem ----------
  function eqObraChecagem() {
    var ini = val('eqf-ini');
    var fim = val('eqf-fim');
    var statusF = val('eqf-status') || 'true';
    var tipoF = val('eqf-tipo') || 'todos';
    var obraF = val('eqf-obra');
    var lista = colaboradores().filter(function (c) {
      if (obraF && String(c.obra_atual_id || '') !== String(obraF)) return false;
      if (statusF !== 'todos' && c.ativo !== (statusF === 'true')) return false;
      if (tipoF !== 'todos' && c.tipo !== tipoF) return false;
      return true;
    });
    var dados = [];
    lista.forEach(function (c) {
      var qtd = 0, unidade = '';
      if (c.tipo === 'diaria') { qtd = calcDiaria(c.id, ini, fim).diarias; unidade = 'diarias'; }
      else if (c.tipo === 'empreita') { qtd = calcEmpreita(c.id, ini, fim).pctPend; unidade = '%'; }
      else { qtd = calcMetros(c.id, ini, fim).pend; unidade = 'm'; }
      if (qtd > 0) {
        var obra = CACHE.obras.find(function (o) { return String(o.id) === String(c.obra_atual_id); });
        dados.push({ nome: c.nome, qtd: qtd, unidade: unidade, obra: obra ? obra.nome : 'Sem obra' });
      }
    });
    if (!dados.length) return toast('Nenhum dado para a checagem.', true);
    dados.sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    var P = window.obraPrint;
    var per = (ini || fim) ? (dataBR(ini) + ' a ' + dataBR(fim)) : 'Todo o periodo';
    var rows = dados.map(function (d) {
      return [esc((d.nome || '').toUpperCase()), d.qtd.toFixed(2) + ' ' + d.unidade, esc(d.obra)];
    });
    var body = P ? P.table(
      [{ label: 'Nome' }, { label: 'Diarias / Metros / %', align: 'center' }, { label: 'Obra' }],
      rows
    ) : '';
    printDoc({ title: 'Planilha de Checagem', meta: dataBR(hojeISO()), subtitle: 'Periodo: <b>' + esc(per) + '</b>', body: body });
  }

  // ---------- Folha + PIX ----------
  async function eqObraFolhaAbrir() {
    var html = ''
      + '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Status</label>'
      +   '<select id="eqfolha-status" class="w-full p-2 border rounded-lg text-sm"><option value="PENDENTE">Pendentes</option><option value="PAGO">Pagos</option><option value="TODOS">Todos</option></select></div>'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Inicio</label><input id="eqfolha-ini" type="date" value="' + firstDay() + '" class="w-full p-2 border rounded-lg text-sm"></div>'
      +   '<div><label class="text-[10px] font-bold text-slate-500 uppercase">Fim</label><input id="eqfolha-fim" type="date" value="' + lastDay() + '" class="w-full p-2 border rounded-lg text-sm"></div>'
      +   '<div class="flex items-end"><button onclick="eqObraFolhaImprimir()" class="w-full bg-blue-700 text-white py-2 rounded-lg font-bold">Gerar e imprimir</button></div>'
      + '</div>'
      + '<p class="text-xs text-slate-500">Lista os fechamentos (despesas de mao de obra) no periodo, com a chave PIX de cada colaborador.</p>';
    abrirModal(html, 'Folha de Pagamento', 'max-w-xl');
  }

  async function eqObraFolhaImprimir() {
    var status = val('eqfolha-status') || 'PENDENTE';
    var ini = val('eqfolha-ini');
    var fim = val('eqfolha-fim');
    var q = sb.from('despesas').select('id,uid,item,custo,observacao,data,status,equipe_id,fornecedor,categoria')
      .in('categoria', ['ponto', 'terceirizado', 'empreita']).neq('status', 'ESTORNADO');
    if (status !== 'TODOS') q = q.eq('status', status);
    var res = await q.order('data', { ascending: false });
    if (res.error) return toast(res.error.message, true);
    var rows = (res.data || []).filter(function (d) {
      var dia = String(d.data || '').slice(0, 10);
      if (ini && dia < ini) return false;
      if (fim && dia > fim) return false;
      return true;
    });
    if (!rows.length) return toast('Nenhum registro com os filtros.', true);
    var cols = colaboradores();
    var emp = (typeof getCompany === 'function') ? getCompany() : { name: 'NEVOA' };
    var per = (ini || fim) ? (dataBR(ini) + ' a ' + dataBR(fim)) : 'Todos os periodos';
    var soma = 0;
    var P = window.obraPrint;
    var linhas = rows.map(function (d) {
      var c = cols.find(function (x) {
        if (d.equipe_id != null && x.origem === 'equipe') return String(x.id) === String(d.equipe_id);
        return d.fornecedor && x.nome === d.fornecedor;
      });
      var pix = c ? (c.chave_pix || 'Nao informado') : 'Nao informado';
      soma += Number(d.custo || 0);
      var tipo = d.categoria === 'ponto' ? 'Diaria' : (d.categoria === 'empreita' ? 'Empreita' : 'Metro');
      return [
        '<b>' + esc((d.fornecedor || '-').toUpperCase()) + '</b><div style="font-size:11px;color:#1d4ed8">PIX: ' + esc(pix) + '</div>',
        tipo, esc(d.observacao || ''), money(d.custo)
      ];
    });
    var body = P ? P.table(
      [{ label: 'Funcionario / PIX' }, { label: 'Tipo', align: 'center' }, { label: 'Referencia' }, { label: 'Valor', align: 'right' }],
      linhas
    ) + '<div style="display:flex;justify-content:space-between;border:1px solid #000;border-top:none;padding:10px;background:#fef2f2;font-weight:bold;font-size:14px;">'
      + '<span>TOTAL</span><span>' + money(soma) + '</span></div>' : '';
    fecharModal();
    printDoc({ title: 'Folha de Pagamentos', meta: dataBR(hojeISO()), subtitle: 'Periodo: <b>' + esc(per) + '</b> &middot; Situacao: <b>' + esc(status) + '</b>', body: body });
  }

  // ---------- Contrato terceirizado ----------
  async function imprimirContratoTerceirizado(id) {
    var res = await sb.from('terceirizados').select('*').eq('id', id).single();
    if (res.error || !res.data) return toast('Terceirizado nao encontrado.', true);
    var t = res.data;
    var obra = null;
    if (t.obra_atual_id) {
      var o = await sb.from('obras').select('nome,endereco').eq('id', t.obra_atual_id).single();
      obra = o.data;
    }
    var emp = (typeof getCompany === 'function') ? getCompany() : { name: 'NEVOA', cnpj: '', address: '' };
    var html = '<html><head><title>Contrato</title><style>body{font-family:Georgia,serif;padding:32px;line-height:1.5}h1{font-size:16px;text-align:center}p{text-align:justify}</style></head><body>'
      + '<h1>CONTRATO DE PRESTACAO DE SERVICOS — TERCEIRIZADO (METRO)</h1>'
      + '<p><b>CONTRATANTE:</b> ' + esc(emp.name || emp.nome || 'NEVOA') + (emp.cnpj ? ', CNPJ ' + emp.cnpj : '') + (emp.address ? ', ' + emp.address : '') + '.</p>'
      + '<p><b>CONTRATADO:</b> ' + esc((t.nome || '').toUpperCase()) + (t.cpf_cnpj ? ', CPF/CNPJ ' + esc(t.cpf_cnpj) : '') + (t.endereco ? ', residente em ' + esc(t.endereco) : '') + '.</p>'
      + '<p>O presente contrato tem por objeto a prestacao de servicos de terceirizado por metragem na obra <b>' + esc(obra ? (obra.endereco || obra.nome) : 'Obra nao definida') + '</b>, ao valor de <b>' + money(t.valor_metro || 0) + ' por metro</b>.</p>'
      + '<p>O CONTRATADO declara atuar com autonomia, sem vinculo empregaticio, responsabilizando-se por tributos, EPIs e qualidade dos servicos.</p>'
      + '<p>Jatai, ' + new Date().toLocaleDateString('pt-BR') + '.</p>'
      + '<br><br><p>_________________________________<br>CONTRATANTE</p>'
      + '<br><p>_________________________________<br>CONTRATADO — ' + esc(t.nome || '') + '</p></body></html>';
    var w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  // ---------- Aliases de compatibilidade ----------
  function calcularResumoEmpreita(eqId, ini, fim) {
    var r = calcEmpreita(eqId, ini, fim);
    return { contrato: r.contrato, percentual: r.pctExec, valor: r.pago + r.pend, restante: r.saldo, medicoes: r.todas };
  }

  window.renderEquipeObra = renderEquipeObra;
  window.eqObraRenderLista = eqObraRenderLista;
  window.eqObraSaldo = eqObraSaldo;
  window.eqObraSaldoRender = eqObraSaldoRender;
  window.eqObraSaldoBatida = eqObraSaldoBatida;
  window.eqObraSaldoAjuste = eqObraSaldoAjuste;
  window.eqObraSaldoFechar = eqObraSaldoFechar;
  window.eqObraSaldoEstornar = eqObraSaldoEstornar;
  window.eqObraExcluirLancamento = eqObraExcluirLancamento;
  window.eqObraSaldoRecibo = eqObraSaldoRecibo;
  window.eqObraSaldoMetros = eqObraSaldoMetros;
  window.eqObraSaldoMetrosRender = eqObraSaldoMetrosRender;
  window.eqObraSaldoMetrosLancar = eqObraSaldoMetrosLancar;
  window.eqObraSaldoMetrosFechar = eqObraSaldoMetrosFechar;
  window.eqObraSaldoMetrosEstornar = eqObraSaldoMetrosEstornar;
  window.eqObraSaldoMetrosRecibo = eqObraSaldoMetrosRecibo;
  window.eqObraSaldoEmpreita = eqObraSaldoEmpreita;
  window.eqObraSaldoEmpreitaRender = eqObraSaldoEmpreitaRender;
  window.eqObraSaldoEmpreitaMedir = eqObraSaldoEmpreitaMedir;
  window.eqObraSaldoEmpreitaFechar = eqObraSaldoEmpreitaFechar;
  window.eqObraSaldoEmpreitaEstornar = eqObraSaldoEmpreitaEstornar;
  window.eqObraSaldoEmpreitaRecibo = eqObraSaldoEmpreitaRecibo;
  window.eqObraEmpreitaSync = eqObraEmpreitaSync;
  window.eqObraOpenForm = eqObraOpenForm;
  window.eqObraOnCat = eqObraOnCat;
  window.eqObraSalvar = eqObraSalvar;
  window.eqObraMaskDoc = function (input) { if (input) input.value = formatDoc(input.value); };
  window.eqObraToggle = eqObraToggle;
  window.eqObraContrato = eqObraContrato;
  window.eqObraChecagem = eqObraChecagem;
  window.eqObraFolhaAbrir = eqObraFolhaAbrir;
  window.eqObraFolhaImprimir = eqObraFolhaImprimir;
  window.eqObraFecharModal = fecharModal;
  window.calcularResumoEmpreita = calcularResumoEmpreita;
})();
