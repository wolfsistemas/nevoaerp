// financeiro-obra.js - Financeiro exclusivo do segmento Obra (padrao Nevoa ERP).
// Contas a Receber (tabela logs: tipo receita/venda + baixas recebimento) e
// Contas a Pagar (tabela despesas + baixas logs tipo despesa), tudo por obra.
// Sem lancamentos automaticos: apenas o que for lancado aqui. Registros de obra
// (com obra_id) sao ocultados do Financeiro geral do ERP.
(function () {
  'use strict';

  var A = function () { return window.obraApi || {}; };

  var METODOS_PGTO = ['Dinheiro', 'PIX', 'Carteira', 'Cartão Débito', 'Cartão Crédito', 'Boleto 21 dias', 'Boleto 30 dias', 'Boleto Programado', 'Cheque'];
  var CATEGORIAS = ['FORNECEDOR', 'SALÁRIO', 'ENERGIA', 'ESCRITORIO', 'ÁGUA', 'INTERNET', 'IMPOSTO', 'SISTEMA', 'CONTABILIDADE', 'COMBUSTÍVEL', 'MAN. MAQUINAS', 'JUROS/TAXAS', 'VEÍCULOS', 'EPI', 'INSTALAÇÃO', 'PROLABORE', 'VALE', 'OUTROS'];
  var TIPOS_ENTRADA = ['Recebimento de Serviço prestado', 'Medição', 'Entrada Eventual', 'Capital de Giro'];

  var OFIN = {
    obraId: '',
    obras: [],
    logs: [],
    despesas: [],
    fases: [],
    clients: [],
    showCards: true,
    recCtx: null,
    despCtx: null,
    guardSnap: {}
  };

  // ---------- helpers ----------
  function el(id) { return document.getElementById(id); }
  function val(id) { var e = el(id); return e ? e.value : ''; }
  function num(id) { return Number(val(id)) || 0; }
  function esc(v) { return A().esc(v); }
  function money(v) { return A().money(v); }
  function dataBR(v) { return A().dataBR(v); }
  function icons() { A().icons(); }
  function toast(m, e) { A().toast(m, e); }
  function confirmar(m, o) {
    if (A().confirmar) return A().confirmar(m, o);
    return Promise.resolve(window.confirm(m));
  }
  function loading(on) { if (typeof showLoading === 'function') showLoading(!!on); }
  function getHojeLocalStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function formatDate(d) {
    if (!d) return '-';
    var s = String(d).split('T')[0].split('-');
    return s.length === 3 ? s[2] + '/' + s[1] + '/' + s[0] : d;
  }
  function normalizeSearch(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function uidGen() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0; var v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
    });
  }
  async function nextLogId() {
    var r = await sb.from('logs').select('id').order('id', { ascending: false }).limit(1);
    return ((r.data && r.data[0] && Number(r.data[0].id)) || 0) + 1;
  }
  async function nextDespesaId() {
    var r = await sb.from('despesas').select('id').order('id', { ascending: false }).limit(1);
    return ((r.data && r.data[0] && Number(r.data[0].id)) || 0) + 1;
  }
  function optionsPgto(sel) {
    return METODOS_PGTO.map(function (m) { return '<option' + (m === (sel || '') ? ' selected' : '') + '>' + m + '</option>'; }).join('');
  }
  function optionsCategorias(sel) {
    return CATEGORIAS.map(function (m) { return '<option' + (m === (sel || '') ? ' selected' : '') + '>' + m + '</option>'; }).join('');
  }
  function optionsTiposEntrada(sel) {
    return TIPOS_ENTRADA.map(function (t) { return '<option' + (t === (sel || '') ? ' selected' : '') + '>' + t + '</option>'; }).join('');
  }
  function nomeObra(id) {
    var o = OFIN.obras.find(function (x) { return String(x.id) === String(id); });
    return o ? o.nome : '';
  }
  function isEst(l) {
    if (!l) return false;
    var st = String(l.status || '').toUpperCase();
    var sf = String(l.status_financeiro || '').toUpperCase();
    return st === 'CANCELADO' || st === 'ESTORNADO' || sf === 'CANCELADO' || sf === 'ESTORNADO';
  }
  function saldoDespesa(e) {
    return Number(e.custo || 0) + Number(e.acrescimo_total || 0) - Number(e.desconto_total || 0) - Number(e.valor_pago || 0);
  }
  function onlyObraLogs(arr, obraId) {
    return (arr || []).filter(function (l) { return String(l.obra_id) === String(obraId); });
  }
  function onlyObraDesp(arr, obraId) {
    return (arr || []).filter(function (e) { return String(e.obra_id) === String(obraId); });
  }

  // ---------- modal base ----------
  function abrirModal(id) {
    var m = el(id);
    if (!m) return;
    m.classList.remove('hidden');
    if (window.obraModalGuard) OFIN.guardSnap[id] = window.obraModalGuard.capturar(m);
  }
  function fecharModal(id) { var m = el(id); if (m) m.classList.add('hidden'); }

  // ---------- render ----------
  async function renderFinObra() {
    var c = el('view-obra-fin');
    if (!c) return;
    c.innerHTML = skeleton();
    injetarModais();
    icons();
    try {
      var oc = await sb.from('obras').select('*').order('nome');
      var cl = await sb.from('clientes').select('id,nome,telefone');
      OFIN.obras = oc.data || [];
      OFIN.clients = cl.data || [];
    } catch (e) {
      c.innerHTML = '<div class="p-6 text-red-600">Erro ao carregar obras: ' + esc(e.message || e) + '</div>';
      return;
    }
    var sel = el('ofin-obra');
    if (sel) {
      sel.innerHTML = '<option value="__all__">Todas as obras (visao geral)</option>'
        + (OFIN.obras.length
          ? OFIN.obras.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.nome) + (o.ativo === false ? ' (finalizada)' : '') + '</option>'; }).join('')
          : '');
    }
    OFIN.obraId = '__all__';
    await ofinCarregar();
  }

  function skeleton() {
    return ''
      + '<div class="space-y-4 p-2">'
      +   '<div class="flex flex-wrap justify-between items-center gap-3">'
      +     '<div><h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="wallet" class="text-emerald-600"></i> Financeiro da obra</h2>'
      +     '<p class="text-sm text-slate-500">Visao de caixa geral ou por obra. Contas a receber e a pagar exclusivas do segmento Obra.</p></div>'
      +     '<div class="flex items-center gap-2 flex-wrap">'
      +       '<select id="ofin-obra" onchange="ofinTrocaObra()" class="p-2.5 border rounded-lg text-sm font-bold bg-white min-w-[220px]"></select>'
      +       '<button onclick="ofinToggleCards()" id="ofin-eye-btn" class="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-1" title="Mostrar/Ocultar"><i data-lucide="eye-off" class="w-4 h-4"></i></button>'
      +       '<button onclick="ofinOpenReceipt()" class="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-1"><i data-lucide="file-text" class="w-4 h-4"></i> Recibo Avulso</button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="grid grid-cols-1 md:grid-cols-4 gap-4">'
      +     '<div class="bg-green-50 p-4 rounded-xl border border-green-100 shadow-sm"><p class="text-green-800 text-xs font-bold uppercase">Recebido</p><h3 id="ofin-income" class="text-2xl font-bold text-green-600 mt-1">R$ 0,00</h3></div>'
      +     '<div class="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm"><p class="text-red-800 text-xs font-bold uppercase">Pago</p><h3 id="ofin-expenses" class="text-2xl font-bold text-red-600 mt-1">R$ 0,00</h3></div>'
      +     '<div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 shadow-sm"><p class="text-indigo-800 text-xs font-bold uppercase">Saldo de caixa</p><h3 id="ofin-balance" class="text-2xl font-bold text-indigo-600 mt-1">R$ 0,00</h3></div>'
      +     '<div class="bg-amber-50 p-4 rounded-xl border border-amber-100 shadow-sm"><p class="text-amber-800 text-xs font-bold uppercase">Em aberto</p><h3 id="ofin-open" class="text-2xl font-bold text-amber-600 mt-1">R$ 0,00</h3><p class="text-[10px] text-amber-700 mt-0.5">a receber - a pagar</p></div>'
      +   '</div>'
      +   '<div id="ofin-fase-resumo" class="hidden"></div>'
      +   '<div id="ofin-overview" class="hidden"></div>'
      +   '<div id="ofin-detail">'
      +     '<div class="mb-2 border-b border-slate-200">'
      +       '<button id="ofin-tab-receber-btn" onclick="ofinSwitchTab(\'receber\')" class="px-4 py-2 text-sm font-bold rounded-t-lg transition-all bg-indigo-600 text-white shadow">📋 Contas a Receber</button>'
      +       '<button id="ofin-tab-pagar-btn" onclick="ofinSwitchTab(\'pagar\')" class="px-4 py-2 text-sm font-bold rounded-t-lg transition-all bg-slate-200 text-slate-700 hover:bg-slate-300">💰 Contas a Pagar</button>'
      +     '</div>'
      +     '<div id="ofin-receber" class="bg-white rounded-xl border shadow-sm flex flex-col h-[680px]">' + receberSection() + '</div>'
      +     '<div id="ofin-pagar" class="bg-white rounded-xl border shadow-sm flex flex-col h-[680px] hidden">' + pagarSection() + '</div>'
      +   '</div>'
      + '</div>';
  }

  function receberSection() {
    return ''
      + '<div class="p-4 border-b bg-slate-50 rounded-t-xl flex justify-between items-center">'
      +   '<h3 class="font-bold text-slate-700 flex items-center gap-2"><i data-lucide="arrow-down-to-line" class="w-5 h-5 text-indigo-600"></i> Contas a Receber</h3>'
      +   '<div class="flex gap-2">'
      +     '<button onclick="ofinCarregar()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md flex items-center gap-1" title="Atualizar Lista"><i data-lucide="list-restart" class="w-4 h-4"></i></button>'
      +     '<button onclick="ofinOpenRevenue()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md flex items-center gap-1"><i data-lucide="plus" class="w-4 h-4"></i> Nova</button>'
      +     '<button onclick="ofinPrintReceber()" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1"><i data-lucide="printer" class="w-4 h-4"></i> Imprimir</button>'
      +   '</div>'
      + '</div>'
      + '<div class="p-3 border-b bg-white flex flex-col gap-2">'
      +   '<div class="flex gap-2">'
      +     '<div class="relative flex-1"><i data-lucide="search" class="absolute left-2 top-2 text-slate-400 w-4 h-4"></i>'
      +     '<input type="text" id="ofin-rec-search" placeholder="Buscar cliente/descrição..." class="w-full pl-8 p-1.5 border rounded text-xs focus:ring-1 focus:ring-indigo-600 outline-none" onkeyup="ofinRenderReceber()"></div>'
      +     '<select id="ofin-rec-status" class="w-32 p-1.5 border rounded text-xs focus:ring-1 focus:ring-indigo-600 outline-none" onchange="ofinRenderReceber()"><option value="">Todos</option><option value="ABERTOS">Em Aberto</option><option value="VENCIDOS">Vencidos</option><option value="PAGOS">Pagos</option></select>'
      +   '</div>'
      +   '<div class="flex gap-2"><select id="ofin-rec-fase-filter" class="flex-1 p-1.5 border rounded text-xs focus:ring-1 focus:ring-indigo-600 outline-none" onchange="ofinRenderReceber()"></select></div>'
      +   '<div class="flex gap-2 items-center">'
      +     '<input type="date" id="ofin-rec-start" class="p-1.5 border rounded text-xs flex-1" onchange="ofinRenderReceber()">'
      +     '<span class="text-slate-400 text-xs">até</span>'
      +     '<input type="date" id="ofin-rec-end" class="p-1.5 border rounded text-xs flex-1" onchange="ofinRenderReceber()">'
      +     '<button onclick="ofinLimparRec()" class="p-1.5 bg-slate-200 hover:bg-slate-300 rounded text-slate-600" title="Limpar Filtros"><i data-lucide="x" class="w-4 h-4"></i></button>'
      +   '</div>'
      + '</div>'
      + '<div class="overflow-y-auto flex-1 p-0"><table class="w-full text-sm text-left"><thead class="text-slate-500 bg-slate-50 sticky top-0 border-b z-10"><tr>'
      +   '<th class="p-3 font-semibold">Venc/Pagto</th><th class="p-3 font-semibold">Cliente/Ref</th><th class="p-3 font-semibold">Fase</th><th class="p-3 font-semibold">Valor</th><th class="p-3 font-semibold text-right w-40">Ação</th>'
      + '</tr></thead><tbody id="ofin-receivables-list" class="divide-y"></tbody></table></div>'
      + '<div id="ofin-receber-totais" class="border-t bg-slate-50 px-4 py-2.5 text-sm font-black text-slate-700"></div>';
  }

  function pagarSection() {
    return ''
      + '<div class="p-4 border-b bg-slate-50 rounded-t-xl flex flex-wrap justify-between items-center gap-2">'
      +   '<h3 class="font-bold text-slate-700 flex items-center gap-2"><i data-lucide="arrow-up-from-line" class="w-5 h-5 text-red-500"></i> Contas a Pagar</h3>'
      +   '<div class="flex items-center gap-2 flex-wrap">'
      +     '<select id="ofin-exp-category" onchange="ofinRenderPagar()" class="p-1.5 border rounded-lg text-xs font-bold bg-white"><option value="">Todas as Categorias</option>' + CATEGORIAS.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('') + '</select>'
      +     '<button onclick="ofinCarregar()" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md flex items-center gap-1" title="Atualizar Lista"><i data-lucide="list-restart" class="w-4 h-4"></i></button>'
      +     '<button onclick="ofinOpenNewExpense()" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md flex items-center gap-1"><i data-lucide="minus-circle" class="w-4 h-4"></i> Lançar Saída</button>'
      +     '<button onclick="ofinPrintPagar()" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1"><i data-lucide="printer" class="w-4 h-4"></i> Imprimir</button>'
      +   '</div>'
      + '</div>'
      + '<div class="p-3 border-b bg-white flex flex-col gap-2">'
      +   '<div class="flex gap-2">'
      +     '<div class="relative flex-1"><i data-lucide="search" class="absolute left-2 top-2 text-slate-400 w-4 h-4"></i>'
      +     '<input type="text" id="ofin-exp-search" placeholder="Buscar fornecedor/item..." class="w-full pl-8 p-1.5 border rounded text-xs focus:ring-1 focus:ring-red-500 outline-none" onkeyup="ofinRenderPagar()"></div>'
      +     '<select id="ofin-exp-status" class="w-32 p-1.5 border rounded text-xs focus:ring-1 focus:ring-red-500 outline-none" onchange="ofinRenderPagar()"><option value="">Todos</option><option value="PENDENTE">Pendentes</option><option value="PAGO">Pagos</option><option value="VENCIDOS">Vencidos</option></select>'
      +   '</div>'
      +   '<div class="flex gap-2"><select id="ofin-exp-fase-filter" class="flex-1 p-1.5 border rounded text-xs focus:ring-1 focus:ring-red-500 outline-none" onchange="ofinRenderPagar()"></select></div>'
      +   '<div class="flex gap-2 items-center">'
      +     '<input type="date" id="ofin-exp-start" class="p-1.5 border rounded text-xs flex-1" onchange="ofinRenderPagar()">'
      +     '<span class="text-slate-400 text-xs">até</span>'
      +     '<input type="date" id="ofin-exp-end" class="p-1.5 border rounded text-xs flex-1" onchange="ofinRenderPagar()">'
      +     '<button onclick="ofinLimparPagar()" class="p-1.5 bg-slate-200 hover:bg-slate-300 rounded text-slate-600" title="Limpar Filtros"><i data-lucide="x" class="w-4 h-4"></i></button>'
      +   '</div>'
      + '</div>'
      + '<div class="overflow-y-auto flex-1 p-0"><table class="w-full text-sm text-left"><thead class="text-slate-500 bg-slate-50 sticky top-0 border-b z-10"><tr>'
      +   '<th class="p-3 font-semibold">Data</th><th class="p-3 font-semibold text-center w-12">ID</th><th class="p-3 font-semibold">Fornecedor</th><th class="p-3 font-semibold">Fase</th><th class="p-3 font-semibold">Valor</th><th class="p-3 font-semibold text-right w-44">Ação</th>'
      + '</tr></thead><tbody id="ofin-expenses-list" class="divide-y"></tbody></table></div>'
      + '<div id="ofin-expenses-totais" class="border-t bg-slate-50 px-4 py-2.5 text-sm font-black text-slate-700"></div>';
  }

  // ---------- dados ----------
  function allMode() { return OFIN.obraId === '__all__'; }
  function scopedLogs() { return allMode() ? OFIN.logs : onlyObraLogs(OFIN.logs, OFIN.obraId); }
  function scopedDespesas() { return allMode() ? OFIN.despesas : onlyObraDesp(OFIN.despesas, OFIN.obraId); }

  // ---------- fases ----------
  function faseValida(f) {
    return f && !f.arquivada && String(f.nome || '').trim().toLowerCase() !== '(removida)';
  }
  function activeFases() {
    return (OFIN.fases || []).filter(function (f) {
      return faseValida(f) && String(f.obra_id) === String(OFIN.obraId);
    });
  }
  function faseName(id) {
    if (!id) return '';
    var f = (OFIN.fases || []).find(function (x) { return String(x.id) === String(id); });
    return f ? f.nome : '';
  }
  function preencherFaseSelect(selId, selected) {
    var s = el(selId);
    if (!s) return;
    var fases = (!allMode() && OFIN.obraId) ? activeFases() : [];
    s.innerHTML = A().fasesOptions ? A().fasesOptions(fases, selected) : '';
  }
  function preencherFaseFiltro(selId) {
    var s = el(selId);
    if (!s) return;
    var cur = s.value;
    var fases = (!allMode() && OFIN.obraId) ? activeFases() : (OFIN.fases || []).filter(faseValida);
    s.innerHTML = '<option value="">Todas as fases</option>'
      + fases.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.nome) + '</option>'; }).join('');
    s.value = cur || '';
  }
  function faseCell(id) {
    var n = faseName(id);
    return n ? '<span class="text-[10px] font-bold uppercase text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">' + esc(n) + '</span>' : '<span class="text-slate-300 text-xs">-</span>';
  }

  async function ofinCarregar() {
    var recvBody = el('ofin-receivables-list');
    var pagBody = el('ofin-expenses-list');
    var recvFoot = el('ofin-receber-totais');
    var pagFoot = el('ofin-expenses-totais');
    if (recvFoot) recvFoot.innerHTML = '';
    if (pagFoot) pagFoot.innerHTML = '';
    if (!OFIN.obraId) {
      if (recvBody) recvBody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400">Selecione uma obra.</td></tr>';
      if (pagBody) pagBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400">Selecione uma obra.</td></tr>';
      renderCards();
      return;
    }
    if (recvBody) recvBody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400">Carregando...</td></tr>';
    if (pagBody) pagBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400">Carregando...</td></tr>';
    try {
      var lq = sb.from('logs').select('*');
      var dq = sb.from('despesas').select('*');
      var fq = sb.from('obras_fases').select('id,obra_id,nome,ordem,arquivada').order('ordem');
      if (allMode()) {
        lq = lq.not('obra_id', 'is', null);
        dq = dq.not('obra_id', 'is', null);
      } else {
        lq = lq.eq('obra_id', OFIN.obraId);
        dq = dq.eq('obra_id', OFIN.obraId);
        fq = fq.eq('obra_id', OFIN.obraId);
      }
      var r = await Promise.all([lq, dq, fq]);
      if (r[0].error) throw r[0].error;
      if (r[1].error) throw r[1].error;
      if (r[2].error) throw r[2].error;
      OFIN.logs = r[0].data || [];
      OFIN.despesas = r[1].data || [];
      OFIN.fases = r[2].data || [];
    } catch (e) {
      if (recvBody) recvBody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-red-600">' + esc(e.message || e) + '</td></tr>';
      return;
    }
    renderCards();
    var ov = el('ofin-overview');
    var det = el('ofin-detail');
    if (allMode()) {
      renderOverview();
      if (ov) ov.classList.remove('hidden');
      if (det) det.classList.add('hidden');
    } else {
      if (ov) ov.classList.add('hidden');
      if (det) det.classList.remove('hidden');
      preencherFaseFiltro('ofin-rec-fase-filter');
      preencherFaseFiltro('ofin-exp-fase-filter');
      ofinRenderReceber();
      ofinRenderPagar();
      renderFaseResumo();
    }
  }

  function ofinTrocaObra() {
    OFIN.obraId = val('ofin-obra');
    ofinCarregar();
  }

  function ofinSwitchTab(tab) {
    var rec = el('ofin-receber'), pag = el('ofin-pagar');
    var bRec = el('ofin-tab-receber-btn'), bPag = el('ofin-tab-pagar-btn');
    if (!rec || !pag) return;
    if (tab === 'pagar') {
      rec.classList.add('hidden'); pag.classList.remove('hidden');
      bPag.className = 'px-4 py-2 text-sm font-bold rounded-t-lg transition-all bg-red-500 text-white shadow';
      bRec.className = 'px-4 py-2 text-sm font-bold rounded-t-lg transition-all bg-slate-200 text-slate-700 hover:bg-slate-300';
    } else {
      pag.classList.add('hidden'); rec.classList.remove('hidden');
      bRec.className = 'px-4 py-2 text-sm font-bold rounded-t-lg transition-all bg-indigo-600 text-white shadow';
      bPag.className = 'px-4 py-2 text-sm font-bold rounded-t-lg transition-all bg-slate-200 text-slate-700 hover:bg-slate-300';
    }
  }

  function ofinToggleCards() {
    OFIN.showCards = !OFIN.showCards;
    var b = el('ofin-eye-btn');
    if (b) b.innerHTML = '<i data-lucide="' + (OFIN.showCards ? 'eye-off' : 'eye') + '" class="w-4 h-4"></i>';
    icons();
    renderCards();
  }

  function fmtCard(v) { return OFIN.showCards ? money(v) : 'R$ ****'; }

  function renderCards() {
    var income = ofinTotalRecebido();
    var expenses = ofinTotalPago();
    var aReceber = openARFrom(scopedLogs());
    var aPagar = scopedDespesas().filter(function (e) {
      return !isEst(e) && String(e.status || '').toUpperCase() !== 'PAGO';
    }).reduce(function (s, e) { return s + Math.max(0, saldoDespesa(e)); }, 0);
    var iEl = el('ofin-income'), eEl = el('ofin-expenses'), bEl = el('ofin-balance'), oEl = el('ofin-open');
    if (iEl) iEl.textContent = fmtCard(income);
    if (eEl) eEl.textContent = fmtCard(expenses);
    if (bEl) bEl.textContent = fmtCard(income - expenses);
    if (oEl) oEl.textContent = fmtCard(aReceber - aPagar);
  }

  function ofinTotalRecebido() {
    // Soma o recebido dos titulos que existem. Baixas orfas (titulo excluido)
    // nao entram, evitando inflar o caixa com registros fantasmas.
    if (A().recebidoDe) return A().recebidoDe(scopedLogs());
    return scopedLogs().filter(function (l) { return l.tipo === 'recebimento' && !isEst(l); })
      .reduce(function (s, l) { return s + Number(l.valor_total || 0); }, 0);
  }
  function ofinTotalPago() {
    return scopedLogs().filter(function (l) { return l.tipo === 'despesa' && !isEst(l) && String(l.status_financeiro || '').toUpperCase() === 'PAGO'; })
      .reduce(function (s, l) { return s + Number(l.valor_total || 0); }, 0);
  }

  function openARFrom(logs) {
    var ids = {};
    (logs || []).forEach(function (l) {
      if ((l.tipo === 'venda' || l.tipo === 'receita') && !isEst(l) && String(l.status_financeiro || '').toUpperCase() !== 'PARCELADO') ids[l.id] = true;
    });
    var total = 0;
    Object.keys(ids).forEach(function (id) {
      var c = calcTituloFrom(logs, id);
      if (c.saldo > 0.005) total += c.saldo;
    });
    return total;
  }

  function resumoObra(obraId) {
    var logs = onlyObraLogs(OFIN.logs, obraId);
    var desps = onlyObraDesp(OFIN.despesas, obraId);
    var recebido = A().recebidoDe ? A().recebidoDe(logs)
      : logs.filter(function (l) { return l.tipo === 'recebimento' && !isEst(l); })
          .reduce(function (s, l) { return s + Number(l.valor_total || 0); }, 0);
    var pago = logs.filter(function (l) { return l.tipo === 'despesa' && !isEst(l) && String(l.status_financeiro || '').toUpperCase() === 'PAGO'; })
      .reduce(function (s, l) { return s + Number(l.valor_total || 0); }, 0);
    var aReceber = openARFrom(logs);
    var aPagar = desps.filter(function (e) { return !isEst(e) && String(e.status || '').toUpperCase() !== 'PAGO'; })
      .reduce(function (s, e) { return s + Math.max(0, saldoDespesa(e)); }, 0);
    return { recebido: recebido, pago: pago, saldo: recebido - pago, aReceber: aReceber, aPagar: aPagar, emAberto: aReceber - aPagar };
  }

  // Resumo de caixa por fase da obra atual (receita/custo atribuidos).
  function renderFaseResumo() {
    var box = el('ofin-fase-resumo');
    if (!box) return;
    if (allMode() || !OFIN.obraId) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    var fases = (OFIN.fases || []).filter(function (f) { return String(f.obra_id) === String(OFIN.obraId) && faseValida(f); });

    var logs = onlyObraLogs(OFIN.logs, OFIN.obraId);
    var desps = onlyObraDesp(OFIN.despesas, OFIN.obraId);
    function linha(nome, lf, df) {
      var recebido = A().recebidoDe ? A().recebidoDe(lf) : 0;
      var aReceber = openARFrom(lf);
      var pago = lf.filter(function (l) { return l.tipo === 'despesa' && !isEst(l) && String(l.status_financeiro || '').toUpperCase() === 'PAGO'; })
        .reduce(function (s, l) { return s + Number(l.valor_total || 0); }, 0);
      var aPagar = df.filter(function (e) { return !isEst(e) && String(e.status || '').toUpperCase() !== 'PAGO'; })
        .reduce(function (s, e) { return s + Math.max(0, saldoDespesa(e)); }, 0);
      return { nome: nome, recebido: recebido, aReceber: aReceber, pago: pago, aPagar: aPagar, saldo: recebido - pago };
    }
    var rows = fases.map(function (f) {
      return linha(f.nome, logs.filter(function (l) { return String(l.fase_id) === String(f.id); }),
                          desps.filter(function (d) { return String(d.fase_id) === String(f.id); }));
    });
    rows.push(linha('Sem fase', logs.filter(function (l) { return !l.fase_id; }), desps.filter(function (d) { return !d.fase_id; })));

    box.innerHTML = ''
      + '<div class="bg-white rounded-xl border shadow-sm overflow-hidden">'
      +   '<div class="p-4 border-b bg-slate-50 flex items-center justify-between"><h3 class="font-bold text-slate-700 flex items-center gap-2"><i data-lucide="layers" class="w-5 h-5 text-emerald-600"></i> Resumo por fase</h3>'
      +   '<span class="text-[11px] text-slate-400">Receita e custo atribuidos a cada fase</span></div>'
      +   '<div class="overflow-x-auto"><table class="w-full text-sm text-left">'
      +     '<thead class="bg-slate-100 text-slate-600"><tr>'
      +       '<th class="p-3">Fase</th><th class="p-3 text-right">Recebido</th><th class="p-3 text-right">A receber</th>'
      +       '<th class="p-3 text-right">Pago</th><th class="p-3 text-right">A pagar</th><th class="p-3 text-right">Saldo</th>'
      +     '</tr></thead><tbody>'
      +     rows.map(function (r) {
        var cls = r.saldo >= 0 ? 'text-emerald-700' : 'text-red-600';
        return '<tr class="border-t"><td class="p-3 font-bold text-slate-700">' + esc(r.nome) + '</td>'
          + '<td class="p-3 text-right text-green-700">' + money(r.recebido) + '</td>'
          + '<td class="p-3 text-right text-amber-700">' + money(r.aReceber) + '</td>'
          + '<td class="p-3 text-right text-red-600">' + money(r.pago) + '</td>'
          + '<td class="p-3 text-right text-orange-600">' + money(r.aPagar) + '</td>'
          + '<td class="p-3 text-right font-bold ' + cls + '">' + money(r.saldo) + '</td></tr>';
      }).join('')
      +     '</tbody></table></div></div>';
    box.classList.remove('hidden');
  }

  function renderOverview() {
    var box = el('ofin-overview');
    if (!box) return;
    var tot = { recebido: 0, pago: 0, saldo: 0, aReceber: 0, aPagar: 0, emAberto: 0 };
    var rows = OFIN.obras.map(function (o) {
      var r = resumoObra(o.id);
      tot.recebido += r.recebido; tot.pago += r.pago; tot.saldo += r.saldo;
      tot.aReceber += r.aReceber; tot.aPagar += r.aPagar; tot.emAberto += r.emAberto;
      var saldoCls = r.saldo >= 0 ? 'text-indigo-700' : 'text-red-600';
      return '<tr class="border-t hover:bg-slate-50">'
        + '<td class="p-3 font-bold text-slate-800">' + esc(o.nome) + (o.ativo === false ? ' <span class="text-[9px] font-bold text-slate-400">(finalizada)</span>' : '') + '</td>'
        + '<td class="p-3 text-right text-green-700">' + money(r.recebido) + '</td>'
        + '<td class="p-3 text-right text-red-600">' + money(r.pago) + '</td>'
        + '<td class="p-3 text-right font-bold ' + saldoCls + '">' + money(r.saldo) + '</td>'
        + '<td class="p-3 text-right text-amber-700">' + money(r.aReceber) + '</td>'
        + '<td class="p-3 text-right text-orange-600">' + money(r.aPagar) + '</td>'
        + '<td class="p-3 text-right"><button onclick="ofinAbrirObra(\'' + esc(o.id) + '\')" class="text-xs font-bold text-indigo-600 border border-indigo-200 rounded px-2 py-1">Abrir</button></td>'
        + '</tr>';
    }).join('');
    box.innerHTML = ''
      + '<div class="bg-white rounded-xl border shadow-sm overflow-hidden">'
      +   '<div class="p-4 border-b bg-slate-50 flex items-center justify-between"><h3 class="font-bold text-slate-700 flex items-center gap-2"><i data-lucide="layout-dashboard" class="w-5 h-5 text-emerald-600"></i> Visao geral de caixa (todas as obras)</h3>'
      +   '<button onclick="ofinPrintOverview()" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1"><i data-lucide="printer" class="w-4 h-4"></i> Imprimir</button></div>'
      +   '<div class="overflow-x-auto"><table class="w-full text-sm text-left">'
      +     '<thead class="bg-slate-100 text-slate-600"><tr>'
      +       '<th class="p-3">Obra</th><th class="p-3 text-right">Recebido</th><th class="p-3 text-right">Pago</th>'
      +       '<th class="p-3 text-right">Saldo caixa</th><th class="p-3 text-right">A receber</th><th class="p-3 text-right">A pagar</th><th class="p-3"></th>'
      +     '</tr></thead><tbody>'
      +     (rows || '<tr><td colspan="7" class="p-6 text-center text-slate-400">Nenhuma obra cadastrada.</td></tr>')
      +     '<tr class="bg-slate-100 font-black text-slate-800"><td class="p-3" colspan="1">TOTAL GERAL</td>'
      +       '<td class="p-3 text-right text-green-700">' + money(tot.recebido) + '</td>'
      +       '<td class="p-3 text-right text-red-600">' + money(tot.pago) + '</td>'
      +       '<td class="p-3 text-right text-indigo-700">' + money(tot.saldo) + '</td>'
      +       '<td class="p-3 text-right text-amber-700">' + money(tot.aReceber) + '</td>'
      +       '<td class="p-3 text-right text-orange-600">' + money(tot.aPagar) + '</td><td></td></tr>'
      +     '</tbody></table></div>'
      + '</div>';
    icons();
  }

  function ofinAbrirObra(id) {
    OFIN.obraId = id;
    var sel = el('ofin-obra');
    if (sel) sel.value = id;
    ofinCarregar();
  }

  // ---------- titulo (a receber) ----------
  function calcTituloFrom(logs, parentId) {
    var rows = (logs || []).filter(function (l) {
      return String(l.id) === String(parentId) && (l.tipo === 'venda' || l.tipo === 'receita') && !isEst(l);
    });
    var baixas = (logs || []).filter(function (l) {
      return l.tipo === 'recebimento' && !isEst(l) && /#(\d+)/.test(l.observacao || '') && String((l.observacao.match(/#(\d+)/) || [])[1]) === String(parentId);
    });
    var total = rows.reduce(function (a, r) { return a + Number(r.valor_total || 0); }, 0);
    var pago = baixas.reduce(function (a, l) { return a + Number(l.valor_total || 0); }, 0);
    var disc = baixas.reduce(function (a, l) { return a + Number(l.desconto || 0); }, 0);
    var jur = baixas.reduce(function (a, l) { return a + Number(l.acrescimo || 0); }, 0);
    var saldo = total + jur - disc - pago;
    var status = saldo <= 0.005 ? 'PAGO' : (pago > 0 ? 'PARCIAL' : 'PENDENTE');
    return { rows: rows, baixas: baixas, total: total, pago: pago, disc: disc, jur: jur, saldo: saldo, status: status };
  }

  function calcTituloObra(parentId) { return calcTituloFrom(OFIN.logs, parentId); }

  function ofinRenderReceber() {
    var body = el('ofin-receivables-list');
    if (!body) return;
    var term = normalizeSearch(el('ofin-rec-search') ? el('ofin-rec-search').value : '');
    var st = el('ofin-rec-status') ? el('ofin-rec-status').value : '';
    var ini = el('ofin-rec-start') ? el('ofin-rec-start').value : '';
    var fim = el('ofin-rec-end') ? el('ofin-rec-end').value : '';
    var faseF = el('ofin-rec-fase-filter') ? el('ofin-rec-fase-filter').value : '';
    var hoje = getHojeLocalStr();

    var ids = {};
    OFIN.logs.forEach(function (l) {
      if ((l.tipo === 'venda' || l.tipo === 'receita') && !isEst(l) && String(l.status_financeiro || '').toUpperCase() !== 'PARCELADO') ids[l.id] = true;
    });
    var lista = Object.keys(ids).map(function (id) {
      var c = calcTituloObra(id);
      var r0 = c.rows[0] || {};
      return { id: id, clientName: r0.cliente_nome || 'Consumidor Final', desc: r0.produto_nome || ('Título #' + id), dueDate: r0.vencimento, payment: r0.forma_pagamento, faseId: r0.fase_id, calc: c };
    });
    lista = lista.filter(function (r) {
      if (term && normalizeSearch(r.clientName + ' ' + r.desc + ' ' + r.id).indexOf(term) < 0) return false;
      if (faseF && String(r.faseId || '') !== String(faseF)) return false;
      if (st === 'PAGOS' && r.calc.status !== 'PAGO') return false;
      if (st === 'ABERTOS' && (r.calc.status === 'PAGO' || (r.dueDate || '').split('T')[0] < hoje)) return false;
      if (st === 'VENCIDOS' && (r.calc.status === 'PAGO' || (r.dueDate || '').split('T')[0] >= hoje)) return false;
      if (ini && (r.dueDate || '').split('T')[0] < ini) return false;
      if (fim && (r.dueDate || '').split('T')[0] > fim) return false;
      return true;
    });
    lista.sort(function (a, b) { return String(b.dueDate || '').localeCompare(String(a.dueDate || '')); });

    var totalVal = lista.reduce(function (a, r) { return a + (r.calc.total + r.calc.jur - r.calc.disc); }, 0);
    var totalPago = lista.reduce(function (a, r) { return a + Math.max(r.calc.pago, 0); }, 0);
    var foot = el('ofin-receber-totais');
    if (foot) foot.innerHTML = '<div class="flex items-center justify-between gap-3"><span class="uppercase text-xs">Totais</span>'
      + '<span class="flex items-baseline gap-4"><span class="text-indigo-700">' + money(totalVal) + '</span>'
      + '<span class="text-[10px] font-semibold text-slate-500">Recebido ' + money(totalPago) + ' · Falta ' + money(Math.max(totalVal - totalPago, 0)) + '</span></span></div>';
    if (!lista.length) {
      body.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400">Nenhum registro encontrado.</td></tr>';
      icons();
      return;
    }
    var rows = lista.map(function (r) {
      var dv = (r.dueDate || '').split('T')[0];
      var vencido = dv && dv < hoje && r.calc.status !== 'PAGO';
      var pago = r.calc.status === 'PAGO';
      var temBaixa = r.calc.pago > 0.005;
      var bg = vencido ? 'bg-red-50/50' : (pago ? 'bg-green-50/50 opacity-80' : '');
      var aviso = vencido ? '<span class="text-[9px] bg-red-500 text-white px-1 rounded ml-1">VENCIDO</span>' : '';
      var saldo = r.calc.saldo;
      var zap = '';
      if (!pago) {
        var cli = OFIN.clients.find(function (c) { return normalizeSearch(c.nome) === normalizeSearch(r.clientName); });
        if (cli && cli.telefone) {
          var n = String(cli.telefone).replace(/\D/g, '');
          if (n.length >= 10) {
            if (n.indexOf('55') !== 0) n = '55' + n;
            var msg = encodeURIComponent('Olá *' + r.clientName + '*.\n\nAqui é da ' + 'Névoa' + '. Você possui um pagamento pendente referente à *' + r.desc + '*.\n\nVencimento: *' + formatDate(r.dueDate) + '*\nValor: *' + money(saldo) + '*\n\nCaso já tenha realizado o pagamento, desconsidere.');
            zap = '<a href="https://wa.me/' + n + '?text=' + msg + '" target="_blank" class="p-1.5 rounded shadow text-green-600 bg-green-50 hover:bg-green-100" title="Cobrar via WhatsApp"><i data-lucide="message-circle" class="w-4 h-4"></i></a>';
          }
        }
      }
      return '<tr class="border-b ' + bg + '">'
        + '<td class="p-3"><div class="font-bold text-slate-800 text-xs">' + dataBR(r.dueDate) + '</div>'
        + '<div class="text-[10px] font-bold uppercase ' + (pago ? 'text-green-600' : (vencido ? 'text-red-600' : 'text-orange-500')) + '">' + esc(r.calc.status) + aviso + '</div></td>'
        + '<td class="p-3"><div class="font-bold text-slate-700 text-sm">' + esc(r.clientName) + '</div><div class="text-xs text-slate-500">' + esc(r.desc) + '</div></td>'
        + '<td class="p-3">' + faseCell(r.faseId) + '</td>'
        + '<td class="p-3"><div class="font-bold text-indigo-700">' + money(r.calc.total + r.calc.jur - r.calc.disc) + '</div><div class="text-[10px] text-slate-400">Recebido ' + money(r.calc.pago) + (saldo > 0.005 ? ' · Falta ' + money(saldo) : ' · Quitado') + '</div></td>'
        + '<td class="p-3"><div class="flex items-center justify-end gap-1">'
        +   zap
        +   (pago ? '' : '<button onclick="ofinBaixarRecebimento(\'' + r.id + '\')" class="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow" title="Baixar / Receber"><i data-lucide="check-circle" class="w-3.5 h-3.5"></i></button>')
        +   (temBaixa
            ? '<button disabled class="p-1.5 border border-slate-200 text-slate-300 rounded cursor-not-allowed" title="Conta já baixada — estorne o recebimento para editar"><i data-lucide="lock" class="w-3.5 h-3.5"></i></button>'
            : '<button onclick="ofinEditReceivable(\'' + r.id + '\')" class="p-1.5 border border-blue-200 text-blue-600 rounded" title="Editar"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i></button>')
        +   (r.calc.status !== 'PAGO' ? '<button onclick="ofinOpenParcelarReceber(\'' + r.id + '\')" class="p-1.5 border border-amber-200 text-amber-600 rounded" title="Parcelar"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>' : '')
        +   (r.calc.pago > 0 ? '<button onclick="ofinEstornarRecebimento(\'' + r.id + '\')" class="p-1.5 border border-orange-200 text-orange-600 rounded" title="Estornar baixa"><i data-lucide="undo-2" class="w-3.5 h-3.5"></i></button>' : '')
        +   '<button onclick="ofinExcluirReceita(\'' + r.id + '\')" class="p-1.5 border border-red-200 text-red-500 rounded" title="Excluir"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>'
        + '</div></td></tr>';
    }).join('');
    body.innerHTML = rows;
    icons();
  }

  // Lista de despesas a pagar ja filtrada/ordenada conforme os filtros da tela.
  // Reutilizada pelo render da tabela e pela impressao (mesmo resultado da tela).
  function ofinPagarFiltradas() {
    var term = normalizeSearch(el('ofin-exp-search') ? el('ofin-exp-search').value : '');
    var st = el('ofin-exp-status') ? el('ofin-exp-status').value : '';
    var ini = el('ofin-exp-start') ? el('ofin-exp-start').value : '';
    var fim = el('ofin-exp-end') ? el('ofin-exp-end').value : '';
    var cat = el('ofin-exp-category') ? el('ofin-exp-category').value : '';
    var faseF = el('ofin-exp-fase-filter') ? el('ofin-exp-fase-filter').value : '';
    var hoje = getHojeLocalStr();

    var lista = OFIN.despesas.slice().filter(function (e) {
      var dt = String(e.data || '').split('T')[0];
      if (isEst(e)) return false;
      if (cat && String(e.item) !== cat) return false;
      if (faseF && String(e.fase_id || '') !== String(faseF)) return false;
      if (term && normalizeSearch((e.fornecedor || '') + ' ' + (e.item || '') + ' ' + (e.observacao || '') + ' ' + e.id).indexOf(term) < 0) return false;
      if (st === 'PAGO' && e.status !== 'PAGO') return false;
      if (st === 'PENDENTE' && e.status === 'PAGO') return false;
      if (st === 'VENCIDOS' && (e.status === 'PAGO' || dt >= hoje)) return false;
      if (ini && dt < ini) return false;
      if (fim && dt > fim) return false;
      return true;
    });
    lista.sort(function (a, b) { return String(b.data || '').localeCompare(String(a.data || '')); });
    return lista;
  }

  // Texto dos filtros ativos, exibido no cabecalho da impressao.
  function ofinPagarFiltrosTexto() {
    var out = [];
    var st = el('ofin-exp-status') ? el('ofin-exp-status').value : '';
    var ini = el('ofin-exp-start') ? el('ofin-exp-start').value : '';
    var fim = el('ofin-exp-end') ? el('ofin-exp-end').value : '';
    var cat = el('ofin-exp-category') ? el('ofin-exp-category').value : '';
    var term = el('ofin-exp-search') ? el('ofin-exp-search').value : '';
    var faseEl = el('ofin-exp-fase-filter');
    var fase = (faseEl && faseEl.value) ? (faseEl.options[faseEl.selectedIndex] ? faseEl.options[faseEl.selectedIndex].text : faseEl.value) : '';
    if (st) out.push('Status: ' + (st === 'PENDENTE' ? 'Pendentes' : st === 'PAGO' ? 'Pagos' : 'Vencidos'));
    if (cat) out.push('Categoria: ' + cat);
    if (ini) out.push('De: ' + dataBR(ini));
    if (fim) out.push('Ate: ' + dataBR(fim));
    if (term) out.push('Busca: "' + term + '"');
    if (fase) out.push('Fase: ' + fase);
    return out;
  }

  function ofinRenderPagar() {
    var body = el('ofin-expenses-list');
    if (!body) return;
    var hoje = getHojeLocalStr();
    var lista = ofinPagarFiltradas();

    var totalVal = lista.reduce(function (a, e) { return a + Number(e.custo || 0) + Number(e.acrescimo_total || 0) - Number(e.desconto_total || 0); }, 0);
    var totalPago = lista.reduce(function (a, e) { return a + Math.max(Number(e.valor_pago || 0), 0); }, 0);
    var foot = el('ofin-expenses-totais');
    if (foot) foot.innerHTML = '<div class="flex items-center justify-between gap-3"><span class="uppercase text-xs">Totais</span>'
      + '<span class="flex items-baseline gap-4"><span class="text-red-600">' + money(totalVal) + '</span>'
      + '<span class="text-[10px] font-semibold text-slate-500">Pago ' + money(totalPago) + ' · Falta ' + money(Math.max(totalVal - totalPago, 0)) + '</span></span></div>';
    if (!lista.length) {
      body.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400">Nenhum registro encontrado.</td></tr>';
      icons();
      return;
    }
    var rows = lista.map(function (e) {
      var dt = String(e.data || '').split('T')[0];
      var pago = e.status === 'PAGO';
      var temBaixa = Number(e.valor_pago || 0) > 0.005;
      var vencido = !pago && dt < hoje;
      var saldo = Number(e.custo || 0) + Number(e.acrescimo_total || 0) - Number(e.desconto_total || 0) - Number(e.valor_pago || 0);
      var bg = vencido ? 'bg-red-50/50' : (pago ? 'bg-green-50/50 opacity-80' : '');
      var aviso = vencido ? '<span class="text-[9px] bg-red-500 text-white px-1 rounded ml-1">VENCIDO</span>' : '';
      return '<tr class="border-b ' + bg + '">'
        + '<td class="p-3"><div class="font-bold text-slate-800 text-xs">' + dataBR(e.data) + '</div>'
        + '<div class="text-[10px] font-bold uppercase ' + (pago ? 'text-green-600' : (vencido ? 'text-red-600' : 'text-orange-500')) + '">' + esc(e.status || 'PENDENTE') + aviso + '</div></td>'
        + '<td class="p-3 text-center text-xs text-slate-500 font-bold">#' + esc(e.id) + '</td>'
        + '<td class="p-3"><div class="font-bold text-slate-700 text-sm">' + esc(e.fornecedor || '—') + '</div><div class="text-xs text-slate-500">' + esc(e.item || '') + (e.observacao ? ' · ' + esc(e.observacao) : '') + '</div></td>'
        + '<td class="p-3">' + faseCell(e.fase_id) + '</td>'
        + '<td class="p-3"><div class="font-bold text-red-600">' + money(Number(e.custo || 0) + Number(e.acrescimo_total || 0) - Number(e.desconto_total || 0)) + '</div><div class="text-[10px] text-slate-400">Pago ' + money(e.valor_pago) + (saldo > 0.005 ? ' · Falta ' + money(saldo) : ' · Quitado') + '</div></td>'
        + '<td class="p-3"><div class="flex items-center justify-end gap-1">'
        +   (pago ? '' : '<button onclick="ofinPayExpense(\'' + e.uid + '\')" class="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded shadow" title="Baixar / Pagar"><i data-lucide="check-circle" class="w-3.5 h-3.5"></i></button>')
        +   (temBaixa
            ? '<button disabled class="p-1.5 border border-slate-200 text-slate-300 rounded cursor-not-allowed" title="Despesa já baixada — estorne o pagamento para editar"><i data-lucide="lock" class="w-3.5 h-3.5"></i></button>'
            : '<button onclick="ofinEditExpense(\'' + e.uid + '\')" class="p-1.5 border border-blue-200 text-blue-600 rounded" title="Editar"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i></button>')
        +   '<button onclick="ofinDuplicarDespesa(\'' + e.uid + '\')" class="p-1.5 border border-slate-200 text-slate-600 rounded" title="Duplicar (+30d)"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>'
        +   (Number(e.valor_pago || 0) > 0 ? '<button onclick="ofinEstornarDespesa(\'' + e.uid + '\')" class="p-1.5 border border-orange-200 text-orange-600 rounded" title="Estornar pagamento"><i data-lucide="undo-2" class="w-3.5 h-3.5"></i></button>' : '')
        +   '<button onclick="ofinOpenReceiptFromExpense(\'' + e.uid + '\')" class="p-1.5 border border-emerald-200 text-emerald-600 rounded" title="Recibo"><i data-lucide="file-text" class="w-3.5 h-3.5"></i></button>'
        +   '<button onclick="ofinExcluirDespesa(\'' + e.uid + '\')" class="p-1.5 border border-red-200 text-red-500 rounded" title="Excluir"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>'
        + '</div></td></tr>';
    }).join('');
    body.innerHTML = rows;
    icons();
  }

  function ofinLimparRec() {
    if (el('ofin-rec-search')) el('ofin-rec-search').value = '';
    if (el('ofin-rec-status')) el('ofin-rec-status').value = '';
    if (el('ofin-rec-start')) el('ofin-rec-start').value = '';
    if (el('ofin-rec-end')) el('ofin-rec-end').value = '';
    ofinRenderReceber();
  }
  function ofinLimparPagar() {
    if (el('ofin-exp-search')) el('ofin-exp-search').value = '';
    if (el('ofin-exp-status')) el('ofin-exp-status').value = '';
    if (el('ofin-exp-start')) el('ofin-exp-start').value = '';
    if (el('ofin-exp-end')) el('ofin-exp-end').value = '';
    if (el('ofin-exp-category')) el('ofin-exp-category').value = '';
    ofinRenderPagar();
  }

  // ---------- modais ----------
  function injetarModais() {
    if (el('ofin-modals')) return;
    var d = document.createElement('div');
    d.id = 'ofin-modals';
    d.className = 'no-print';
    d.innerHTML = modalRevenueHtml() + modalExpenseHtml() + modalRecReceiveHtml() + modalPayExpenseHtml() + modalParcelHtml() + modalReceiptHtml();
    document.body.appendChild(d);
  }

  function modalWrap(id, title, icon, color, body, footer) {
    return '<div id="' + id + '" class="hidden fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4">'
      + '<div class="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">'
      + '<div class="p-5 border-b flex justify-between items-center ' + color + '"><h3 class="font-bold text-slate-800 text-lg flex items-center gap-2"><i data-lucide="' + icon + '"></i> <span id="' + id + '-title">' + title + '</span></h3>'
      + '<button onclick="ofinCloseModal(\'' + id + '\')" class="text-slate-400 hover:text-red-500"><i data-lucide="x"></i></button></div>'
      + '<div class="p-6 space-y-4 overflow-y-auto">' + body + '</div>'
      + '<div class="p-5 border-t bg-slate-50 flex gap-3">' + footer + '</div>'
      + '</div></div>';
  }

  function modalRevenueHtml() {
    var body = ''
      + '<input type="hidden" id="ofin-rev-id">'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Tipo de Entrada</label><select id="ofin-rev-tipo" class="w-full p-3 border rounded-xl bg-white">' + optionsTiposEntrada() + '</select></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Fase (opcional)</label><select id="ofin-rev-fase" class="w-full p-3 border rounded-xl bg-white"></select></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Nome do Cliente (opcional)</label><input type="text" id="ofin-rev-client" class="w-full p-3 border rounded-xl" placeholder="Ex: João Silva"></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Valor a Receber (R$)</label><input type="number" id="ofin-rev-val" class="w-full p-3 border rounded-xl font-bold text-indigo-700" placeholder="0.00"></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Data de Vencimento</label><input type="date" id="ofin-rev-due" class="w-full p-3 border rounded-xl"></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Forma de Pagto Base</label><select id="ofin-rev-method" class="w-full p-3 border rounded-xl">' + optionsPgto('Dinheiro') + '</select></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Observação (opcional)</label><input type="text" id="ofin-rev-note" class="w-full p-3 border rounded-xl" placeholder="Ex: 1a medição, entrada de sinal..."></div>';
    var footer = '<button onclick="ofinCloseModal(\'ofin-modal-revenue\')" class="flex-1 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-600">Cancelar</button>'
      + '<button id="ofin-rev-submit" onclick="ofinSaveRevenue()" class="flex-1 py-3 bg-indigo-700 rounded-xl font-bold text-white">Lançar Pendente</button>';
    return modalWrap('ofin-modal-revenue', 'Lançar Receita', 'plus-circle', 'bg-slate-50', body, footer);
  }

  function modalExpenseHtml() {
    var body = ''
      + '<input type="hidden" id="ofin-exp-id">'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Categoria da Despesa</label><select id="ofin-exp-item" class="w-full p-3 border rounded-xl">' + optionsCategorias('FORNECEDOR') + '</select></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Fase (opcional)</label><select id="ofin-exp-fase" class="w-full p-3 border rounded-xl bg-white"></select></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Nome / Fornecedor</label><input type="text" id="ofin-exp-provider" class="w-full p-3 border rounded-xl" placeholder="Ex: João da Silva..."></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Custo Total (R$)</label><input type="number" id="ofin-exp-cost" class="w-full p-3 border rounded-xl font-bold text-red-600" placeholder="0.00"></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Data de Vencimento</label><input type="date" id="ofin-exp-date" class="w-full p-3 border rounded-xl"></div>'
      + '<div class="flex gap-3"><div class="flex-1"><label class="block text-sm font-bold text-slate-700 mb-1">Parcelas</label><input type="number" id="ofin-exp-parcelas" value="1" min="1" max="48" class="w-full p-3 border rounded-xl"></div>'
      + '<div class="flex-1"><label class="block text-sm font-bold text-slate-700 mb-1">Intervalo (dias)</label><input type="number" id="ofin-exp-parcel-int" value="30" min="1" class="w-full p-3 border rounded-xl"></div></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Observação</label><input type="text" id="ofin-exp-note" class="w-full p-3 border rounded-xl" placeholder="Descrição ou detalhes..."></div>';
    var footer = '<button onclick="ofinCloseModal(\'ofin-modal-expense\')" class="flex-1 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-600">Cancelar</button>'
      + '<button onclick="ofinSaveExpense()" class="flex-1 py-3 bg-red-600 rounded-xl font-bold text-white">Salvar Pendente</button>';
    return modalWrap('ofin-modal-expense', 'Registrar Saída', 'minus-circle', 'bg-slate-50', body, footer);
  }

  function modalRecReceiveHtml() {
    var body = ''
      + '<input type="hidden" id="ofin-rec-id">'
      + '<div class="flex justify-between items-center bg-slate-100 p-3 rounded"><span class="text-sm font-bold text-slate-600">Total: <span id="ofin-rec-total-lbl" class="text-indigo-700"></span></span>'
      + '<span class="text-sm font-bold text-slate-600">Restante: <span id="ofin-rec-pending-lbl" class="text-red-600"></span></span></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Data do Recebimento</label><input type="date" id="ofin-rec-pay-date" class="w-full p-3 border rounded-xl"></div>'
      + '<div class="pt-3 border-t mt-2"><div class="flex justify-between items-center mb-2"><label class="block text-sm font-bold text-green-700">Receber (formas de pagamento)</label>'
      + '<button type="button" onclick="ofinAddRecRow()" class="text-xs font-bold text-green-700 bg-green-100 px-2.5 py-1.5 rounded-lg">+ Adicionar forma</button></div>'
      + '<div id="ofin-rec-pgto-rows" class="space-y-2"></div><p class="text-[11px] text-slate-400 mt-1">*Pagamento parcial deixa o restante pendente (PARCIAL).</p></div>'
      + '<div class="grid grid-cols-2 gap-3 pt-2"><div><label class="block text-sm font-bold text-slate-700 mb-1">Desconto (R$)</label><input type="number" id="ofin-rec-disc" value="0" min="0" step="0.01" class="w-full p-3 border rounded-xl" oninput="ofinAtualizarResumoRec(true)"></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Juros/Multa (R$)</label><input type="number" id="ofin-rec-jur" value="0" min="0" step="0.01" class="w-full p-3 border rounded-xl" oninput="ofinAtualizarResumoRec(true)"></div></div>'
      + '<div id="ofin-rec-summary" class="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-xs font-bold text-slate-600 space-y-0.5"></div>';
    var footer = '<button onclick="ofinCloseModal(\'ofin-modal-receivable-receive\')" class="flex-1 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-600">Cancelar</button>'
      + '<button onclick="ofinSaveReceivableReceive()" class="flex-1 py-3 bg-indigo-700 rounded-xl font-bold text-white">Confirmar Recebimento</button>';
    return modalWrap('ofin-modal-receivable-receive', 'Baixar Recebimento', 'check-circle', 'bg-indigo-50', body, footer);
  }

  function modalPayExpenseHtml() {
    var body = ''
      + '<input type="hidden" id="ofin-dexp-id">'
      + '<div class="flex justify-between items-center bg-red-50 p-3 rounded"><span class="text-sm font-bold text-slate-600">Total: <span id="ofin-dexp-total-lbl" class="text-red-700"></span></span>'
      + '<span class="text-sm font-bold text-slate-600">Restante: <span id="ofin-dexp-rest-lbl" class="text-red-600"></span></span></div>'
      + '<div class="grid grid-cols-2 gap-3"><div><label class="block text-sm font-bold text-slate-700 mb-1">Desconto (R$)</label><input type="number" id="ofin-dexp-disc" value="0" min="0" step="0.01" class="w-full p-3 border rounded-xl" oninput="ofinAtualizarResumoDesp(true)"></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Juros/Multa (R$)</label><input type="number" id="ofin-dexp-jur" value="0" min="0" step="0.01" class="w-full p-3 border rounded-xl" oninput="ofinAtualizarResumoDesp(true)"></div></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Data do Pagamento</label><input type="date" id="ofin-dexp-date" class="w-full p-3 border rounded-xl"></div>'
      + '<div class="pt-3 border-t mt-1"><div class="flex justify-between items-center mb-2"><label class="block text-sm font-bold text-red-700">Pagar com (formas de pagamento)</label>'
      + '<button type="button" onclick="ofinAddDespRow()" class="text-xs font-bold text-red-700 bg-red-100 px-2.5 py-1.5 rounded-lg">+ Adicionar forma</button></div>'
      + '<div id="ofin-dexp-pgto-rows" class="space-y-2"></div><p class="text-[11px] text-slate-400 mt-1">*Pagamento parcial deixa o restante pendente (PARCIAL).</p></div>'
      + '<div id="ofin-dexp-summary" class="bg-red-50 border border-red-100 rounded-lg p-3 text-xs font-bold text-slate-600 space-y-0.5"></div>';
    var footer = '<button onclick="ofinCloseModal(\'ofin-modal-payexpense\')" class="flex-1 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-600">Cancelar</button>'
      + '<button onclick="ofinSavePayExpense()" class="flex-1 py-3 bg-red-600 rounded-xl font-bold text-white">Confirmar Pagamento</button>';
    return modalWrap('ofin-modal-payexpense', 'Baixar / Pagar Despesa', 'check-circle', 'bg-red-50', body, footer);
  }

  function modalParcelHtml() {
    var body = ''
      + '<input type="hidden" id="ofin-parcel-id">'
      + '<div class="bg-amber-50 border border-amber-200 rounded-xl p-3"><div class="text-sm font-black text-slate-700">Título <span id="ofin-parcel-venda" class="text-amber-700">#</span></div>'
      + '<div class="text-xs text-slate-500 mt-0.5 truncate" id="ofin-parcel-client">-</div>'
      + '<div class="text-right"><div class="text-[10px] font-bold text-slate-400 uppercase">Saldo a parcelar</div><div class="font-black text-2xl text-amber-700" id="ofin-parcel-total">-</div></div></div>'
      + '<div class="grid grid-cols-2 gap-3"><div><label class="block text-sm font-bold text-slate-700 mb-1">Nº de parcelas</label><select id="ofin-parcel-n" onchange="ofinUpdateParcelarPreview()" class="w-full p-3 border rounded-xl bg-white font-bold"></select></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Intervalo (dias)</label><select id="ofin-parcel-interval" onchange="ofinUpdateParcelarPreview()" class="w-full p-3 border rounded-xl bg-white"><option value="15">15 dias</option><option value="30" selected>30 dias</option><option value="45">45 dias</option><option value="60">60 dias</option><option value="90">90 dias</option></select></div></div>'
      + '<div class="border border-slate-200 rounded-xl overflow-hidden bg-white"><div id="ofin-parcel-preview-rows" class="max-h-44 overflow-y-auto divide-y divide-slate-100"></div>'
      + '<div class="flex justify-between items-center bg-slate-100 px-3 py-2"><span class="text-xs font-bold text-slate-500 uppercase">Total</span><span class="text-sm font-black text-slate-700" id="ofin-parcel-total-check"></span></div></div>';
    var footer = '<button onclick="ofinCloseModal(\'ofin-modal-parcel-rec\')" class="flex-1 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-600">Cancelar</button>'
      + '<button onclick="ofinSaveParcelar()" class="flex-1 py-3 bg-amber-500 rounded-xl font-bold text-white">Confirmar Parcelamento</button>';
    return modalWrap('ofin-modal-parcel-rec', 'Parcelar Conta', 'copy', 'bg-amber-50', body, footer);
  }

  function modalReceiptHtml() {
    var body = ''
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Cliente / Pagador *</label><input type="text" id="ofin-receipt-client" class="w-full p-3 border rounded-xl"></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Valor (R$) *</label><input type="number" id="ofin-receipt-amount" step="0.01" class="w-full p-3 border rounded-xl font-bold text-emerald-700"></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Data *</label><input type="date" id="ofin-receipt-date" class="w-full p-3 border rounded-xl"></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Descrição (opcional)</label><input type="text" id="ofin-receipt-desc" class="w-full p-3 border rounded-xl"></div>'
      + '<div><label class="block text-sm font-bold text-slate-700 mb-1">Forma de Pagamento</label><select id="ofin-receipt-payment" class="w-full p-3 border rounded-xl"><option value="">Selecione</option><option>Dinheiro</option><option>PIX</option><option>Cartão Débito</option><option>Cartão Crédito</option><option>Transferência</option><option>Boleto</option><option>Cheque</option><option>Permuta</option></select></div>';
    var footer = '<button onclick="ofinCloseModal(\'ofin-modal-receipt\')" class="flex-1 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-600">Cancelar</button>'
      + '<button onclick="ofinPrintReceipt()" class="flex-1 py-3 bg-emerald-600 rounded-xl font-bold text-white flex items-center justify-center gap-2"><i data-lucide="printer" class="w-4 h-4"></i> Imprimir Recibo</button>';
    return modalWrap('ofin-modal-receipt', 'Gerar Recibo', 'file-text', 'bg-slate-50', body, footer);
  }

  function ofinCloseModal(id) {
    var m = el(id);
    if (!m) return;
    if (window.obraModalGuard) {
      window.obraModalGuard.fecharComGuarda(m, OFIN.guardSnap[id], function () { fecharModal(id); });
      return;
    }
    fecharModal(id);
  }

  var OFIN_MODAIS = ['ofin-modal-revenue', 'ofin-modal-expense', 'ofin-modal-receivable-receive', 'ofin-modal-payexpense', 'ofin-modal-parcel-rec', 'ofin-modal-receipt'];
  function ofinModalAberto() {
    for (var i = 0; i < OFIN_MODAIS.length; i++) {
      var m = el(OFIN_MODAIS[i]);
      if (m && !m.classList.contains('hidden')) return OFIN_MODAIS[i];
    }
    return null;
  }
  if (window.obraModalGuard) {
    window.obraModalGuard.registrar({
      visivel: function () { return !!ofinModalAberto(); },
      pedirFechar: function () { var id = ofinModalAberto(); if (id) ofinCloseModal(id); }
    });
  }

  // ---------- receita (a receber) ----------
  function ofinOpenRevenue() {
    if (!OFIN.obraId || OFIN.obraId === '__all__') return toast('Selecione uma obra especifica no topo para lançar receitas.', true);
    el('ofin-rev-id').value = '';
    setSelectValue(el('ofin-rev-tipo'), TIPOS_ENTRADA[0]);
    preencherFaseSelect('ofin-rev-fase', '');
    el('ofin-rev-client').value = '';
    el('ofin-rev-val').value = '';
    el('ofin-rev-note').value = '';
    el('ofin-rev-due').value = getHojeLocalStr();
    setSelectValue(el('ofin-rev-method'), METODOS_PGTO[0]);
    var ttl = el('ofin-modal-revenue-title'); if (ttl) ttl.innerText = 'Lançar Receita';
    var sub = el('ofin-rev-submit'); if (sub) sub.innerText = 'Lançar Pendente';
    abrirModal('ofin-modal-revenue');
  }

  async function ofinSaveRevenue() {
    if (!OFIN.obraId || OFIN.obraId === '__all__') return toast('Selecione uma obra especifica no topo.', true);
    var editId = val('ofin-rev-id');
    var tipo = val('ofin-rev-tipo') || TIPOS_ENTRADA[0];
    var client = val('ofin-rev-client').trim() || 'Consumidor Final';
    var v = parseFloat(val('ofin-rev-val')) || 0;
    var method = val('ofin-rev-method');
    var due = val('ofin-rev-due') || getHojeLocalStr();
    var note = val('ofin-rev-note').trim();
    var fase = val('ofin-rev-fase') || null;
    if (!v) return toast('Informe o valor a receber!', true);
    loading(true);
    try {
      if (editId) {
        var st = calcTituloObra(editId);
        if (!st.rows.length) { loading(false); return toast('Registro não encontrado', true); }
        var pagoEfetivo = Math.max.apply(null, [st.pago].concat(st.rows.map(function (r) { return Number(r.valor_pago) || 0; })));
        if (pagoEfetivo > 0.005) { loading(false); return toast('Esta conta já tem baixa registrada. Estorne o recebimento antes de editar.', true); }
        for (var i = 0; i < st.rows.length; i++) {
          var upd = await sb.from('logs').update({
            produto_nome: tipo, categoria: tipo, cliente_nome: client, valor_total: v,
            vencimento: due, forma_pagamento: method, observacao: note, fase_id: fase
          }).eq('uid', st.rows[i].uid);
          if (upd.error) throw upd.error;
        }
        el('ofin-rev-id').value = '';
        fecharModal('ofin-modal-revenue');
        toast('Receita atualizada!');
        await ofinCarregar();
        loading(false);
        return;
      }
      var payload = {
        id: await nextLogId(), uid: uidGen(), tipo: 'receita',
        produto_nome: tipo, categoria: tipo, quantidade: 1, data: getHojeLocalStr(),
        observacao: note || ('Receita de obra: ' + nomeObra(OFIN.obraId)), valor_total: v, cliente_nome: client,
        forma_pagamento: method, status: 'ATIVO', status_entrega: 'ENTREGUE', qtd_entregue: 1,
        desconto: 0, status_financeiro: 'PENDENTE', vencimento: due, valor_pago: 0,
        endereco_entrega: '', obra_id: OFIN.obraId, fase_id: fase
      };
      var res = await sb.from('logs').insert([payload]);
      if (res.error) throw res.error;
      fecharModal('ofin-modal-revenue');
      toast('Receita lançada (pendente)!');
      await ofinCarregar();
      loading(false);
    } catch (e) { loading(false); toast('Erro: ' + (e.message || e), true); }
  }

  function addPgtoRow(containerId, prefix, metodo, valor, resumoFn) {
    var wrap = el(containerId);
    if (!wrap) return;
    var div = document.createElement('div');
    div.className = 'flex gap-2 items-center ofin-pgto-row' + (prefix ? ' ' + prefix : '');
    div.innerHTML = '<select class="ofin-pgto-metodo flex-1 p-2 border rounded-lg text-sm bg-slate-50">' + optionsPgto(metodo || METODOS_PGTO[0]) + '</select>'
      + '<input type="number" min="0" step="0.01" class="ofin-pgto-valor w-32 p-2 border rounded-lg text-sm font-bold" placeholder="0.00" value="' + (valor || '') + '" oninput="' + resumoFn + '(false)">'
      + '<button type="button" onclick="ofinRemovePgtoRow(this)" class="text-slate-400 hover:text-red-500 px-1.5 text-sm font-black">x</button>';
    wrap.appendChild(div);
  }
  function ofinRemovePgtoRow(btn) {
    if (btn) { var row = btn.closest('.ofin-pgto-row'); if (row) row.remove(); }
    ofinAtualizarResumoRec(false);
    ofinAtualizarResumoDesp(false);
  }
  function coletarPgto(containerId) {
    return Array.prototype.slice.call(document.querySelectorAll('#' + containerId + ' .ofin-pgto-row')).map(function (r) {
      return { metodo: r.querySelector('.ofin-pgto-metodo').value, valor: Number(r.querySelector('.ofin-pgto-valor').value) || 0 };
    }).filter(function (f) { return f.valor > 0; });
  }

  function ofinAddRecRow(metodo, valor) { addPgtoRow('ofin-rec-pgto-rows', '', metodo, valor, 'ofinAtualizarResumoRec'); ofinAtualizarResumoRec(false); }

  function ofinAtualizarResumoRec(ajustar) {
    var ctx = OFIN.recCtx; var box = el('ofin-rec-summary');
    if (!ctx || !box) return;
    var disc = num('ofin-rec-disc'), jur = num('ofin-rec-jur');
    var devido = Math.max(0, ctx.saldoBase + jur - disc);
    if (ajustar) {
      var inputs = document.querySelectorAll('#ofin-rec-pgto-rows .ofin-pgto-valor');
      if (inputs.length === 1) inputs[0].value = devido > 0 ? devido.toFixed(2) : '';
      var p = el('ofin-rec-pending-lbl'); if (p) p.innerText = money(devido);
    }
    var receber = coletarPgto('ofin-rec-pgto-rows').reduce(function (a, f) { return a + f.valor; }, 0);
    var saldo = ctx.saldoBase + jur - disc - receber;
    box.innerHTML = '<div>Receber agora: <span class="text-indigo-700">' + money(receber) + '</span></div>'
      + (jur > 0 ? '<div>+ Juros/Multa: <span class="text-red-600">' + money(jur) + '</span></div>' : '')
      + (disc > 0 ? '<div>- Desconto: <span class="text-green-600">' + money(disc) + '</span></div>' : '')
      + '<div class="pt-1 text-sm font-black ' + (saldo <= 0.005 ? 'text-green-700' : 'text-orange-600') + '">' + (saldo <= 0.005 ? 'Fica QUITADO' : 'Fica devendo ' + money(saldo)) + '</div>';
  }

  function ofinBaixarRecebimento(id) {
    var st = calcTituloObra(id);
    if (!st.rows.length) return toast('Registro não encontrado', true);
    var r0 = st.rows[0];
    var pagoEfetivo = Math.max.apply(null, [st.pago].concat(st.rows.map(function (r) { return Number(r.valor_pago) || 0; })));
    var saldoBase = st.total + st.jur - st.disc - pagoEfetivo;
    if (saldoBase <= 0.005) return toast('Esta conta já está quitada.', true);
    OFIN.recCtx = { id: id, saldoBase: saldoBase };
    el('ofin-rec-id').value = id;
    el('ofin-rec-total-lbl').innerText = money(st.total);
    el('ofin-rec-pending-lbl').innerText = money(Math.max(0, saldoBase));
    el('ofin-rec-pay-date').value = getHojeLocalStr();
    el('ofin-rec-disc').value = '';
    el('ofin-rec-jur').value = '';
    el('ofin-rec-pgto-rows').innerHTML = '';
    ofinAddRecRow(r0.forma_pagamento || METODOS_PGTO[0], saldoBase > 0 ? saldoBase : '');
    abrirModal('ofin-modal-receivable-receive');
  }

  function setSelectValue(sel, value) {
    if (!sel) return;
    sel.value = value;
    if (value && sel.value !== value) {
      var o = document.createElement('option');
      o.value = value; o.textContent = value;
      sel.appendChild(o); sel.value = value;
    }
  }

  function ofinEditReceivable(id) {
    var st = calcTituloObra(id);
    if (!st.rows.length) return toast('Registro não encontrado', true);
    var pagoEfetivo = Math.max.apply(null, [st.pago].concat(st.rows.map(function (r) { return Number(r.valor_pago) || 0; })));
    if (pagoEfetivo > 0.005) return toast('Esta conta já tem baixa registrada. Estorne o recebimento antes de editar.', true);
    var r0 = st.rows[0];
    el('ofin-rev-id').value = id;
    setSelectValue(el('ofin-rev-tipo'), r0.categoria || r0.produto_nome || TIPOS_ENTRADA[0]);
    preencherFaseSelect('ofin-rev-fase', r0.fase_id || '');
    el('ofin-rev-client').value = r0.cliente_nome || '';
    el('ofin-rev-val').value = Number(r0.valor_total || 0) || '';
    el('ofin-rev-due').value = String(r0.vencimento || '').split('T')[0] || getHojeLocalStr();
    setSelectValue(el('ofin-rev-method'), r0.forma_pagamento || METODOS_PGTO[0]);
    el('ofin-rev-note').value = r0.observacao || '';
    var ttl = el('ofin-modal-revenue-title'); if (ttl) ttl.innerText = 'Editar Receita';
    var sub = el('ofin-rev-submit'); if (sub) sub.innerText = 'Salvar Alterações';
    abrirModal('ofin-modal-revenue');
  }

  async function ofinSaveReceivableReceive() {
    var id = val('ofin-rec-id');
    var dataPgto = val('ofin-rec-pay-date') || getHojeLocalStr();
    var st = calcTituloObra(id);
    if (!st.rows.length) return toast('Registro não encontrado', true);
    // Evita duplo clique / duplo envio criando baixas duplicadas.
    if (OFIN.savingRec) return;
    var formas = coletarPgto('ofin-rec-pgto-rows');
    var moneyTotal = formas.reduce(function (a, f) { return a + f.valor; }, 0);
    var desconto = num('ofin-rec-disc'), juros = num('ofin-rec-jur');
    if (moneyTotal <= 0) return toast('Informe o valor recebido (pelo menos uma forma).', true);
    OFIN.savingRec = true;
    loading(true);
    try {
      var pagoBase = Math.max.apply(null, [st.pago].concat(st.rows.map(function (r) { return Number(r.valor_pago) || 0; })));
      var newMoney = pagoBase + moneyTotal;
      var newDisc = st.disc + desconto, newJur = st.jur + juros;
      var newSaldo = st.total + newJur - newDisc - newMoney;
      // Não permite receber mais do que a conta deve (evita baixa duplicada / valor acima do saldo).
      if (newSaldo < -0.005) {
        loading(false);
        return toast('O valor recebido (' + money(moneyTotal) + ') é maior que o saldo devedor (' + money(Math.max(0, st.saldo)) + '). Ajuste o valor, o desconto ou os juros.', true);
      }
      var finStatus = newSaldo <= 0.005 ? 'PAGO' : 'PARCIAL';
      var metodoPrincipal = formas[0].metodo;
      for (var k = 0; k < formas.length; k++) {
        var f = formas[k]; var isPrimeira = (k === 0);
        var res = await sb.from('logs').insert([{
          id: await nextLogId(), uid: uidGen(), tipo: 'recebimento', produto_nome: 'Baixa de Conta',
          quantidade: 0, data: dataPgto, observacao: 'Ref Lanc #' + id, valor_total: f.valor,
          desconto: isPrimeira ? desconto : 0, acrescimo: isPrimeira ? juros : 0,
          cliente_nome: st.rows[0].cliente_nome, cliente_id: st.rows[0].cliente_id || null,
          forma_pagamento: f.metodo, status: 'ATIVO', status_financeiro: 'PAGO', valor_pago: f.valor,
          obra_id: OFIN.obraId, fase_id: st.rows[0].fase_id || null
        }]);
        if (res.error) throw res.error;
      }
      for (var j = 0; j < st.rows.length; j++) {
        var upd = { valor_pago: newMoney, status_financeiro: finStatus, forma_pagamento: metodoPrincipal };
        await sb.from('logs').update(upd).eq('uid', st.rows[j].uid);
      }
      fecharModal('ofin-modal-receivable-receive');
      toast(newSaldo <= 0.005 ? 'Conta quitada!' : 'Recebimento parcial registrado!');
      await ofinCarregar(); loading(false);
    } catch (e) { loading(false); toast('Erro: ' + (e.message || e), true); }
    finally { OFIN.savingRec = false; }
  }

  async function ofinEstornarRecebimento(id) {
    var baixas = OFIN.logs.filter(function (l) {
      return l.tipo === 'recebimento' && !isEst(l) && /#(\d+)/.test(l.observacao || '') && String((l.observacao.match(/#(\d+)/) || [])[1]) === String(id);
    });
    var porUid = OFIN.logs.find(function (l) { return l.tipo === 'recebimento' && String(l.uid) === String(id); });
    var alvo = porUid ? [porUid] : (function () {
      var datas = baixas.map(function (b) { return b.data || ''; }).sort();
      var ult = datas[datas.length - 1];
      return baixas.filter(function (b) { return String(b.data || '') === String(ult); });
    })();
    if (!alvo.length) return toast('Nenhuma baixa encontrada para estornar', true);
    var ok = await confirmar('Deseja estornar a última baixa desta conta? Ela voltará a ficar pendente.', { danger: true, confirmText: 'Estornar' });
    if (!ok) return;
    loading(true);
    try {
      var parentId = String((alvo[0].observacao.match(/#(\d+)/) || [])[1]);
      for (var i = 0; i < alvo.length; i++) { await sb.from('logs').update({ status: 'ESTORNADO', status_financeiro: 'ESTORNADO' }).eq('uid', alvo[i].uid); }
      var st = calcTituloObra(parentId);
      for (var j = 0; j < st.rows.length; j++) {
        await sb.from('logs').update({ valor_pago: st.pago, status_financeiro: st.status }).eq('uid', st.rows[j].uid);
      }
      toast('Baixa estornada!');
      await ofinCarregar(); loading(false);
    } catch (e) { loading(false); toast('Erro: ' + (e.message || e), true); }
  }

  async function ofinExcluirReceita(id) {
    var st = calcTituloObra(id);
    if (!st.rows.length) return toast('Registro não encontrado', true);
    var msg = st.pago > 0
      ? 'Esta conta já tem baixa(s) recebida(s) de ' + money(st.pago) + '. Excluir remove a conta E as baixas recebidas. Continuar?'
      : 'Excluir esta receita pendente permanentemente?';
    var ok = await confirmar(msg, { danger: true, confirmText: 'Excluir' });
    if (!ok) return;
    loading(true);
    try {
      // Remove primeiro as baixas (recebimentos) vinculadas para não deixar órfãs.
      for (var i = 0; i < st.baixas.length; i++) {
        var rb = await sb.from('logs').delete().eq('uid', st.baixas[i].uid);
        if (rb.error) throw rb.error;
      }
      // Exclui pelo uid (id não é único globalmente na tabela logs).
      for (var j = 0; j < st.rows.length; j++) {
        var res = await sb.from('logs').delete().eq('uid', st.rows[j].uid);
        if (res.error) throw res.error;
      }
      toast('Receita e baixas excluídas!');
      await ofinCarregar(); loading(false);
    } catch (e) { loading(false); toast('Erro: ' + (e.message || e), true); }
  }

  // ---------- parcelamento (a receber) ----------
  function ofinOpenParcelarReceber(id) {
    var st = calcTituloObra(id);
    if (!st.rows.length) return toast('Registro não encontrado', true);
    var saldo = Math.max(0, st.saldo);
    if (saldo <= 0.005) return toast('Nada a parcelar.', true);
    el('ofin-parcel-id').value = id;
    el('ofin-parcel-venda').innerText = '#' + id;
    el('ofin-parcel-client').innerText = st.rows[0].cliente_nome || '-';
    el('ofin-parcel-total').innerText = money(saldo);
    var sel = el('ofin-parcel-n');
    sel.innerHTML = '';
    for (var n = 2; n <= 12; n++) sel.innerHTML += '<option value="' + n + '"' + (n === 3 ? ' selected' : '') + '>' + n + 'x</option>';
    abrirModal('ofin-modal-parcel-rec');
    ofinUpdateParcelarPreview();
  }

  function ofinParcelasPreview() {
    var id = val('ofin-parcel-id');
    var st = calcTituloObra(id);
    var saldo = Math.max(0, st.saldo);
    var n = Math.max(2, parseInt(val('ofin-parcel-n')) || 2);
    var inter = parseInt(val('ofin-parcel-interval')) || 30;
    var base = Math.round(saldo * 100);
    var cBase = Math.floor(base / n), resto = base - cBase * n;
    var out = [], hoje = new Date();
    for (var k = 1; k <= n; k++) {
      var cents = k <= resto ? cBase + 1 : cBase;
      var d = new Date(hoje.getTime()); d.setDate(d.getDate() + k * inter);
      out.push({ k: k, n: n, valor: cents / 100, data: d.toISOString().split('T')[0] });
    }
    return out;
  }

  function ofinUpdateParcelarPreview() {
    var rows = ofinParcelasPreview();
    var box = el('ofin-parcel-preview-rows');
    if (box) box.innerHTML = rows.map(function (r) {
      return '<div class="flex justify-between px-3 py-2 text-sm"><span class="text-slate-500">' + r.k + '/' + r.n + ' · ' + dataBR(r.data) + '</span><b class="text-slate-700">' + money(r.valor) + '</b></div>';
    }).join('');
    var tot = rows.reduce(function (a, r) { return a + r.valor; }, 0);
    var chk = el('ofin-parcel-total-check'); if (chk) chk.innerText = money(tot);
  }

  async function ofinSaveParcelar() {
    var id = val('ofin-parcel-id');
    var rows = ofinParcelasPreview();
    if (!rows.length) return;
    var st = calcTituloObra(id);
    var r0 = st.rows[0] || {};
    var ok = await confirmar('Parcelar o saldo em ' + rows.length + 'x? A conta original sai da lista e vira parcelas.', { confirmText: 'Parcelar' });
    if (!ok) return;
    loading(true);
    try {
      for (var i = 0; i < rows.length; i++) {
        var p = rows[i];
        var res = await sb.from('logs').insert([{
          id: await nextLogId(), uid: uidGen(), tipo: 'receita',
          produto_nome: 'Parcela ' + p.k + '/' + p.n + ' - Lanc #' + id,
          quantidade: 1, data: getHojeLocalStr(), observacao: 'Parcela ' + p.k + '/' + p.n + ' Ref Lanc #' + id,
          valor_total: p.valor, cliente_nome: r0.cliente_nome || 'Consumidor Final', cliente_id: r0.cliente_id || null,
          forma_pagamento: r0.forma_pagamento || null, status: 'ATIVO', status_entrega: 'ENTREGUE', qtd_entregue: 1,
          desconto: 0, status_financeiro: 'PENDENTE', vencimento: p.data, valor_pago: 0, endereco_entrega: '',
          obra_id: OFIN.obraId, fase_id: r0.fase_id || null
        }]);
        if (res.error) throw res.error;
      }
      for (var j = 0; j < st.rows.length; j++) {
        await sb.from('logs').update({ status_financeiro: 'PARCELADO' }).eq('uid', st.rows[j].uid);
      }
      fecharModal('ofin-modal-parcel-rec');
      toast('Parcelamento criado!');
      await ofinCarregar(); loading(false);
    } catch (e) { loading(false); toast('Erro: ' + (e.message || e), true); }
  }

  // ---------- despesa (a pagar) ----------
  function ofinResetExpenseForm() {
    el('ofin-exp-id').value = '';
    el('ofin-exp-item').value = 'FORNECEDOR';
    el('ofin-exp-provider').value = '';
    el('ofin-exp-cost').value = '';
    el('ofin-exp-date').value = getHojeLocalStr();
    el('ofin-exp-parcelas').value = '1';
    el('ofin-exp-parcel-int').value = '30';
    el('ofin-exp-note').value = '';
    preencherFaseSelect('ofin-exp-fase', '');
  }

  function ofinOpenNewExpense() {
    if (!OFIN.obraId) return toast('Selecione uma obra.', true);
    ofinResetExpenseForm();
    abrirModal('ofin-modal-expense');
  }

  function ofinEditExpense(uid) {
    var e = OFIN.despesas.find(function (x) { return String(x.uid) === String(uid); });
    if (!e) return toast('Despesa não encontrada', true);
    if (Number(e.valor_pago || 0) > 0.005) return toast('Esta despesa já tem baixa registrada. Estorne o pagamento antes de editar.', true);
    el('ofin-exp-id').value = e.uid;
    el('ofin-exp-item').value = e.item || 'FORNECEDOR';
    el('ofin-exp-provider').value = e.fornecedor || '';
    el('ofin-exp-cost').value = e.custo || '';
    el('ofin-exp-date').value = String(e.data || '').split('T')[0] || getHojeLocalStr();
    el('ofin-exp-parcelas').value = '1';
    el('ofin-exp-parcel-int').value = '30';
    el('ofin-exp-note').value = e.observacao || '';
    preencherFaseSelect('ofin-exp-fase', e.fase_id || '');
    abrirModal('ofin-modal-expense');
  }

  async function ofinSaveExpense() {
    var idVal = val('ofin-exp-id');
    var isNew = !idVal;
    if (!isNew) {
      var atual = OFIN.despesas.find(function (x) { return String(x.uid) === String(idVal); });
      if (atual && Number(atual.valor_pago || 0) > 0.005) return toast('Esta despesa já tem baixa registrada. Estorne o pagamento antes de editar.', true);
    }
    var item = val('ofin-exp-item');
    var provider = val('ofin-exp-provider').trim();
    var cost = parseFloat(val('ofin-exp-cost'));
    var date = val('ofin-exp-date') || getHojeLocalStr();
    var note = val('ofin-exp-note').trim();
    if (!item || isNaN(cost) || cost <= 0) return toast('Preencha a categoria e o valor corretamente', true);
    var parcelas = isNew ? Math.max(1, parseInt(val('ofin-exp-parcelas')) || 1) : 1;
    var intervalo = isNew ? Math.max(1, parseInt(val('ofin-exp-parcel-int')) || 30) : 30;
    loading(true);
    try {
      var make = function (custo, data, obs) {
        return { item: item, quantidade: 1, unidade: 'Un', custo: custo, data: data, fornecedor: provider, observacao: obs, status: 'PENDENTE', valor_pago: 0, desconto_total: 0, acrescimo_total: 0, obra_id: OFIN.obraId, categoria: item, fase_id: val('ofin-exp-fase') || null };
      };
      var res;
      if (isNew && parcelas > 1) {
        var cents = Math.round(cost * 100), cBase = Math.floor(cents / parcelas), resto = cents - cBase * parcelas;
        var arr = [], idBase = await nextDespesaId();
        for (var k = 1; k <= parcelas; k++) {
          var vc = k <= resto ? cBase + 1 : cBase;
          var dt = new Date(date + 'T12:00:00'); dt.setDate(dt.getDate() + (k - 1) * intervalo);
          var obsParc = [note, 'Parcela ' + k + '/' + parcelas].filter(function (s) { return s; }).join(' — ');
          arr.push(Object.assign(make(vc / 100, dt.toISOString().split('T')[0], obsParc), { id: idBase + (k - 1) }));
        }
        res = await sb.from('despesas').insert(arr);
      } else if (isNew) {
        res = await sb.from('despesas').insert([Object.assign(make(cost, date, note), { id: await nextDespesaId() })]);
      } else {
        var upd = make(cost, date, note); delete upd.status; delete upd.valor_pago; delete upd.desconto_total; delete upd.acrescimo_total;
        res = await sb.from('despesas').update(upd).eq('uid', idVal);
      }
      if (res.error) throw res.error;
      fecharModal('ofin-modal-expense');
      toast(isNew ? (parcelas > 1 ? 'Despesa parcelada em ' + parcelas + 'x!' : 'Despesa lançada!') : 'Despesa atualizada!');
      await ofinCarregar(); loading(false);
    } catch (e) { loading(false); toast('Erro ao salvar: ' + (e.message || e), true); }
  }

  function ofinAddDespRow(metodo, valor) { addPgtoRow('ofin-dexp-pgto-rows', '', metodo, valor, 'ofinAtualizarResumoDesp'); ofinAtualizarResumoDesp(false); }

  function ofinAtualizarResumoDesp(ajustar) {
    var ctx = OFIN.despCtx; var box = el('ofin-dexp-summary');
    if (!ctx || !box) return;
    var disc = num('ofin-dexp-disc'), jur = num('ofin-dexp-jur');
    var devido = Math.max(0, ctx.saldoBase + jur - disc);
    if (ajustar) {
      var inputs = document.querySelectorAll('#ofin-dexp-pgto-rows .ofin-pgto-valor');
      if (inputs.length === 1) inputs[0].value = devido > 0 ? devido.toFixed(2) : '';
      var p = el('ofin-dexp-rest-lbl'); if (p) p.innerText = money(devido);
    }
    var pagar = coletarPgto('ofin-dexp-pgto-rows').reduce(function (a, f) { return a + f.valor; }, 0);
    var saldo = ctx.saldoBase + jur - disc - pagar;
    box.innerHTML = '<div>Pagar agora: <span class="text-red-700">' + money(pagar) + '</span></div>'
      + (jur > 0 ? '<div>+ Juros/Multa: <span class="text-red-600">' + money(jur) + '</span></div>' : '')
      + (disc > 0 ? '<div>- Desconto: <span class="text-green-600">' + money(disc) + '</span></div>' : '')
      + '<div class="pt-1 text-sm font-black ' + (saldo <= 0.005 ? 'text-green-700' : 'text-orange-600') + '">' + (saldo <= 0.005 ? 'Fica QUITADO' : 'Fica devendo ' + money(saldo)) + '</div>';
  }

  function ofinPayExpense(uid) {
    var e = OFIN.despesas.find(function (x) { return String(x.uid) === String(uid); });
    if (!e) return toast('Despesa não encontrada', true);
    if (e.status === 'PAGO') return toast('Esta despesa já foi paga!', true);
    var saldo = Number(e.custo || 0) + Number(e.acrescimo_total || 0) - Number(e.desconto_total || 0) - Number(e.valor_pago || 0);
    OFIN.despCtx = { uid: e.uid, id: e.id, custo: Number(e.custo || 0), saldoBase: saldo };
    el('ofin-dexp-id').value = e.uid;
    el('ofin-dexp-total-lbl').innerText = money(e.custo);
    el('ofin-dexp-rest-lbl').innerText = money(Math.max(0, saldo));
    el('ofin-dexp-disc').value = '';
    el('ofin-dexp-jur').value = '';
    el('ofin-dexp-date').value = getHojeLocalStr();
    el('ofin-dexp-pgto-rows').innerHTML = '';
    ofinAddDespRow(METODOS_PGTO[0], saldo > 0 ? saldo : '');
    abrirModal('ofin-modal-payexpense');
  }

  async function ofinSavePayExpense() {
    var uid = (OFIN.despCtx && OFIN.despCtx.uid) || val('ofin-dexp-id');
    var e = OFIN.despesas.find(function (x) { return String(x.uid) === String(uid); });
    if (!e) return toast('Despesa não encontrada', true);
    var formas = coletarPgto('ofin-dexp-pgto-rows');
    var moneyTotal = formas.reduce(function (a, f) { return a + f.valor; }, 0);
    var desconto = num('ofin-dexp-disc'), juros = num('ofin-dexp-jur');
    var dataPgto = val('ofin-dexp-date') || getHojeLocalStr();
    if (moneyTotal <= 0) return toast('Informe o valor pago (pelo menos uma forma)', true);
    loading(true);
    try {
      var newMoney = Number(e.valor_pago || 0) + moneyTotal;
      var newDisc = Number(e.desconto_total || 0) + desconto;
      var newJur = Number(e.acrescimo_total || 0) + juros;
      var saldo = Number(e.custo || 0) + newJur - newDisc - newMoney;
      var novoStatus = saldo <= 0.005 ? 'PAGO' : 'PARCIAL';
      for (var k = 0; k < formas.length; k++) {
        var f = formas[k]; var isPrimeira = (k === 0);
        var res = await sb.from('logs').insert([{
          id: await nextLogId(), uid: uidGen(), tipo: 'despesa', produto_nome: e.item || 'Despesa',
          quantidade: Number(e.quantidade) || 1, data: dataPgto, observacao: 'Ref Despesa #' + e.id,
          valor_total: f.valor, desconto: isPrimeira ? desconto : 0, acrescimo: isPrimeira ? juros : 0,
          forma_pagamento: f.metodo, status: 'ATIVO', status_financeiro: 'PAGO', valor_pago: f.valor,
          obra_id: e.obra_id || OFIN.obraId, fase_id: e.fase_id || null
        }]);
        if (res.error) throw res.error;
      }
      var upd = await sb.from('despesas').update({ valor_pago: newMoney, desconto_total: newDisc, acrescimo_total: newJur, status: novoStatus }).eq('uid', e.uid);
      if (upd.error) throw upd.error;
      fecharModal('ofin-modal-payexpense');
      toast(novoStatus === 'PAGO' ? 'Despesa baixada com sucesso!' : 'Pagamento parcial registrado!');
      await ofinCarregar(); loading(false);
    } catch (e2) { loading(false); toast('Erro ao baixar despesa: ' + (e2.message || e2), true); }
  }

  async function ofinEstornarDespesa(uid) {
    var e = OFIN.despesas.find(function (x) { return String(x.uid) === String(uid); });
    if (!e) return toast('Despesa não encontrada', true);
    var baixas = OFIN.logs.filter(function (l) {
      return l.tipo === 'despesa' && !isEst(l) && String(l.status_financeiro || '').toUpperCase() === 'PAGO' && /#(\d+)/.test(l.observacao || '') && String((l.observacao.match(/#(\d+)/) || [])[1]) === String(e.id);
    });
    var alvo = (function () {
      var datas = baixas.map(function (b) { return b.data || ''; }).sort();
      var ult = datas[datas.length - 1];
      return baixas.filter(function (b) { return String(b.data || '') === String(ult); });
    })();
    if (!alvo.length) return toast('Nenhum pagamento para estornar', true);
    var ok = await confirmar('Estornar o último pagamento desta despesa? Ela voltará a ficar pendente.', { danger: true, confirmText: 'Estornar' });
    if (!ok) return;
    loading(true);
    try {
      for (var i = 0; i < alvo.length; i++) { await sb.from('logs').update({ status: 'ESTORNADO', status_financeiro: 'ESTORNADO' }).eq('uid', alvo[i].uid); }
      var restantes = baixas.filter(function (l) { return !alvo.some(function (a) { return String(a.uid) === String(l.uid); }); });
      var pago = restantes.reduce(function (a, l) { return a + Number(l.valor_total || 0); }, 0);
      var disc = restantes.reduce(function (a, l) { return a + Number(l.desconto || 0); }, 0);
      var jur = restantes.reduce(function (a, l) { return a + Number(l.acrescimo || 0); }, 0);
      var saldo = Number(e.custo || 0) + jur - disc - pago;
      var novoStatus = restantes.length ? (saldo <= 0.005 ? 'PAGO' : 'PARCIAL') : 'PENDENTE';
      var upd = await sb.from('despesas').update({ valor_pago: pago, desconto_total: disc, acrescimo_total: jur, status: novoStatus }).eq('uid', e.uid);
      if (upd.error) throw upd.error;
      toast('Pagamento estornado!');
      await ofinCarregar(); loading(false);
    } catch (e2) { loading(false); toast('Erro ao estornar: ' + (e2.message || e2), true); }
  }

  async function ofinExcluirDespesa(uid) {
    var ok = await confirmar('Excluir esta despesa permanentemente?', { danger: true, confirmText: 'Excluir' });
    if (!ok) return;
    loading(true);
    try {
      var res = await sb.from('despesas').delete().eq('uid', uid);
      if (res.error) throw res.error;
      toast('Despesa excluída!');
      await ofinCarregar(); loading(false);
    } catch (e) { loading(false); toast('Erro ao excluir: ' + (e.message || e), true); }
  }

  async function ofinDuplicarDespesa(uid) {
    var e = OFIN.despesas.find(function (x) { return String(x.uid) === String(uid); });
    if (!e) return toast('Despesa não encontrada', true);
    var ok = await confirmar('Duplicar esta despesa (vencimento +30 dias)?', { confirmText: 'Duplicar' });
    if (!ok) return;
    loading(true);
    try {
      var nd = new Date(); nd.setDate(nd.getDate() + 30);
      var res = await sb.from('despesas').insert([{
        id: await nextDespesaId(), item: e.item, quantidade: Number(e.quantidade) || 1, unidade: e.unidade || 'Un',
        custo: e.custo, data: nd.toISOString().split('T')[0], fornecedor: e.fornecedor || '', observacao: e.observacao || '',
        status: 'PENDENTE', valor_pago: 0, desconto_total: 0, acrescimo_total: 0, obra_id: e.obra_id || OFIN.obraId, categoria: e.item, fase_id: e.fase_id || null
      }]);
      if (res.error) throw res.error;
      toast('Despesa duplicada (venc. +30 dias)!');
      await ofinCarregar(); loading(false);
    } catch (e2) { loading(false); toast('Erro ao duplicar: ' + (e2.message || e2), true); }
  }

  // ---------- recibo ----------
  function ofinOpenReceipt() {
    el('ofin-receipt-client').value = '';
    el('ofin-receipt-amount').value = '';
    el('ofin-receipt-date').value = getHojeLocalStr();
    el('ofin-receipt-desc').value = '';
    el('ofin-receipt-payment').value = '';
    abrirModal('ofin-modal-receipt');
  }

  function ofinOpenReceiptFromExpense(uid) {
    var e = OFIN.despesas.find(function (x) { return String(x.uid) === String(uid); });
    if (!e) return;
    el('ofin-receipt-client').value = e.fornecedor || '';
    el('ofin-receipt-amount').value = e.custo || '';
    el('ofin-receipt-date').value = getHojeLocalStr();
    el('ofin-receipt-desc').value = (e.item || '') + (e.observacao ? ' - ' + e.observacao : '');
    el('ofin-receipt-payment').value = '';
    abrirModal('ofin-modal-receipt');
  }

  function scopeLabel() { return allMode() ? 'Todas as obras' : (nomeObra(OFIN.obraId) || '-'); }

  function ofinPrintReceipt() {
    var c = val('ofin-receipt-client').trim();
    var v = parseFloat(val('ofin-receipt-amount')) || 0;
    var d = val('ofin-receipt-date') || getHojeLocalStr();
    var desc = val('ofin-receipt-desc').trim();
    var pg = val('ofin-receipt-payment');
    if (!c || !v) return toast('Informe cliente e valor.', true);
    var P = window.obraPrint;
    var body = ''
      + '<div style="border:1px solid #000;border-top:none;padding:24px;font-size:15px;line-height:1.8;">'
      +   '<h2 style="margin:0 0 16px;font-size:18px;text-transform:uppercase;">Recibo</h2>'
      +   '<p style="margin:0 0 12px;">Recebi de <b>' + esc(c) + '</b> a importancia de <b>' + money(v) + '</b>'
      +     (desc ? ', referente a <b>' + esc(desc) + '</b>' : '') + (pg ? ', pago via <b>' + esc(pg) + '</b>' : '') + '.</p>'
      +   (!allMode() ? '<p style="margin:0 0 12px;color:#475569;">Obra: <b>' + esc(nomeObra(OFIN.obraId)) + '</b></p>' : '')
      +   '<p style="margin:0;color:#64748b;font-size:12px;">Valor: ' + money(v) + ' &middot; Data: ' + dataBR(d) + '</p>'
      +   '<div style="margin-top:70px;text-align:center;">'
      +     '<div style="border-top:1px solid #000;width:60%;margin:0 auto 6px;"></div>'
      +     '<div style="font-size:11px;font-weight:bold;text-transform:uppercase;">' + esc(nomeObra(OFIN.obraId) || 'Névoa') + '</div>'
      +     '<div style="font-size:10px;color:#64748b;">' + esc((window.getCompany ? (getCompany().nome || getCompany().name) : 'NÉVOA')) + '</div>'
      +   '</div>'
      + '</div>';
    printHtml(P ? P.doc({ title: 'Recibo', meta: dataBR(d), body: body }) : body);
    fecharModal('ofin-modal-receipt');
  }

  function printHtml(html) {
    if (window.obraPrint && typeof window.obraPrint.print === 'function') return window.obraPrint.print(html);
    var p = el('print-area');
    if (p) { p.innerHTML = html; setTimeout(function () { window.print(); }, 300); }
  }

  function docTotalRow(label, value) {
    return '<div style="display:flex;justify-content:space-between;border:1px solid #000;border-top:none;padding:10px;background:#f0fdf4;font-weight:bold;font-size:13px;">'
      + '<span>' + esc(label) + '</span><span>' + money(value) + '</span></div>';
  }

  function ofinPrintReceber() {
    var P = window.obraPrint;
    if (!P) return;
    var hoje = getHojeLocalStr();
    var ids = {};
    OFIN.logs.forEach(function (l) { if ((l.tipo === 'venda' || l.tipo === 'receita') && !isEst(l) && String(l.status_financeiro || '').toUpperCase() !== 'PARCELADO') ids[l.id] = true; });
    var lista = Object.keys(ids).map(function (id) {
      var c = calcTituloObra(id); var r0 = c.rows[0] || {};
      var dv = String(r0.vencimento || '').split('T')[0];
      var sit = c.status === 'PAGO' ? 'PAGO' : (dv && dv < hoje ? 'VENCIDO' : 'ABERTO');
      return { venc: r0.vencimento, nome: (r0.cliente_nome || 'Consumidor Final') + ' - ' + (r0.produto_nome || ('#' + id)), sit: sit, valor: c.saldo };
    }).sort(function (a, b) { return String(a.venc || '').localeCompare(String(b.venc || '')); });
    if (!lista.length) return toast('Nenhum registro para imprimir.', true);
    var total = lista.reduce(function (s, r) { return s + Number(r.valor || 0); }, 0);
    var rows = lista.map(function (r) { return [P.dataBR(r.venc), esc(r.nome), r.sit, P.money(r.valor > 0 ? r.valor : 0)]; });
    var body = P.table(
      [{ label: 'Vencimento' }, { label: 'Cliente / Referencia' }, { label: 'Situacao', align: 'center' }, { label: 'Saldo', align: 'right' }],
      rows
    ) + docTotalRow('TOTAL A RECEBER', total);
    printHtml(P.doc({ title: 'Contas a Receber', meta: dataBR(hoje), subtitle: 'Obra: <b>' + esc(scopeLabel()) + '</b>', body: body }));
  }

  function ofinPrintPagar() {
    var P = window.obraPrint;
    var lista = ofinPagarFiltradas();
    if (!lista.length) return toast('Nenhum registro para imprimir.', true);
    var hoje = getHojeLocalStr();
    var rows = lista.map(function (e) {
      var dv = String(e.data || '').split('T')[0];
      var sit = String(e.status || '').toUpperCase() === 'PAGO' ? 'PAGO' : (dv && dv < hoje ? 'VENCIDO' : 'PENDENTE');
      var valor = Number(e.custo || 0) + Number(e.acrescimo_total || 0) - Number(e.desconto_total || 0);
      return {
        data: e.data,
        item: e.item,
        fornecedor: e.fornecedor,
        obs: e.observacao,
        status: sit,
        valor: valor > 0 ? valor : 0
      };
    });
    var total = rows.reduce(function (s, r) { return s + Number(r.valor || 0); }, 0);
    if (P && typeof P.contasPagar === 'function') {
      return P.contasPagar({
        subtitle: 'Obra: <b>' + esc(scopeLabel()) + '</b>',
        filters: ofinPagarFiltrosTexto(),
        rows: rows,
        total: total,
        totalLabel: 'TOTAL A PAGAR'
      });
    }
    return toast('Recurso de impressao indisponivel.', true);
  }

  function ofinPrintOverview() {
    var P = window.obraPrint;
    if (!P) return;
    var tot = { recebido: 0, pago: 0, saldo: 0, aReceber: 0, aPagar: 0 };
    var rows = OFIN.obras.map(function (o) {
      var r = resumoObra(o.id);
      tot.recebido += r.recebido; tot.pago += r.pago; tot.saldo += r.saldo; tot.aReceber += r.aReceber; tot.aPagar += r.aPagar;
      return [esc(o.nome), P.money(r.recebido), P.money(r.pago), P.money(r.saldo), P.money(r.aReceber), P.money(r.aPagar)];
    });
    var body = P.table(
      [{ label: 'Obra' }, { label: 'Recebido', align: 'right' }, { label: 'Pago', align: 'right' }, { label: 'Saldo', align: 'right' }, { label: 'A receber', align: 'right' }, { label: 'A pagar', align: 'right' }],
      rows
    ) + docTotalRow('SALDO GERAL DE CAIXA', tot.saldo);
    printHtml(P.doc({ title: 'Caixa Geral - Obras', meta: dataBR(getHojeLocalStr()), subtitle: 'Consolidado de todas as obras', body: body }));
  }

  // ---------- exports ----------
  window.renderFinObra = renderFinObra;
  window.ofinCarregar = ofinCarregar;
  window.ofinTrocaObra = ofinTrocaObra;
  window.ofinSwitchTab = ofinSwitchTab;
  window.ofinToggleCards = ofinToggleCards;
  window.ofinRenderReceber = ofinRenderReceber;
  window.ofinRenderPagar = ofinRenderPagar;
  window.ofinLimparRec = ofinLimparRec;
  window.ofinLimparPagar = ofinLimparPagar;
  window.ofinCloseModal = ofinCloseModal;
  window.ofinOpenRevenue = ofinOpenRevenue;
  window.ofinSaveRevenue = ofinSaveRevenue;
  window.ofinAddRecRow = ofinAddRecRow;
  window.ofinRemovePgtoRow = ofinRemovePgtoRow;
  window.ofinAtualizarResumoRec = ofinAtualizarResumoRec;
  window.ofinBaixarRecebimento = ofinBaixarRecebimento;
  window.ofinSaveReceivableReceive = ofinSaveReceivableReceive;
  window.ofinEditReceivable = ofinEditReceivable;
  window.ofinEstornarRecebimento = ofinEstornarRecebimento;
  window.ofinExcluirReceita = ofinExcluirReceita;
  window.ofinOpenParcelarReceber = ofinOpenParcelarReceber;
  window.ofinUpdateParcelarPreview = ofinUpdateParcelarPreview;
  window.ofinSaveParcelar = ofinSaveParcelar;
  window.ofinOpenNewExpense = ofinOpenNewExpense;
  window.ofinEditExpense = ofinEditExpense;
  window.ofinSaveExpense = ofinSaveExpense;
  window.ofinAddDespRow = ofinAddDespRow;
  window.ofinAtualizarResumoDesp = ofinAtualizarResumoDesp;
  window.ofinPayExpense = ofinPayExpense;
  window.ofinSavePayExpense = ofinSavePayExpense;
  window.ofinEstornarDespesa = ofinEstornarDespesa;
  window.ofinExcluirDespesa = ofinExcluirDespesa;
  window.ofinDuplicarDespesa = ofinDuplicarDespesa;
  window.ofinOpenReceipt = ofinOpenReceipt;
  window.ofinOpenReceiptFromExpense = ofinOpenReceiptFromExpense;
  window.ofinPrintReceipt = ofinPrintReceipt;
  window.ofinPrintReceber = ofinPrintReceber;
  window.ofinPrintPagar = ofinPrintPagar;
  window.ofinPrintOverview = ofinPrintOverview;
  window.ofinAbrirObra = ofinAbrirObra;
})();
