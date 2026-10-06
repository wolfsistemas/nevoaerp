// dashboard-obra.js - Painel moderno do segmento Obra.
// KPIs, graficos (barras e donut em CSS puro, sem dependencias) e atividade
// recente. Consome os dados reais do banco (obras, logs, despesas, producao).
(function () {
  'use strict';

  var A = function () { return window.obraApi || {}; };
  function esc(v) { return A().esc(v); }
  function money(v) { return A().money(v); }
  function dataBR(v) { return A().dataBR(v); }
  function isEst(r) { return A().isEstornado(r); }
  function icons() { A().icons(); }

  function num(v) { return Number(v || 0); }
  function sum(arr, fn) { return (arr || []).reduce(function (s, x) { return s + fn(x); }, 0); }
  function empty(txt) { return '<div class="text-slate-400 text-sm py-6 text-center">' + esc(txt || 'Sem dados.') + '</div>'; }

  function nomeObra(obras, id) {
    var o = (obras || []).find(function (x) { return String(x.id) === String(id); });
    return o ? o.nome : 'Sem obra';
  }

  var PALETA = ['#059669', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];

  function kpi(icon, bg, fg, label, value, sub) {
    return '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow min-w-0 overflow-hidden">'
      + '<div class="w-10 h-10 rounded-xl flex items-center justify-center ' + bg + '">'
      +   '<i data-lucide="' + icon + '" class="w-5 h-5 ' + fg + '"></i></div>'
      + '<div class="text-lg xl:text-xl font-extrabold text-slate-800 mt-3 leading-tight break-words tabular-nums">' + value + '</div>'
      + '<div class="text-[11px] uppercase font-bold text-slate-400 tracking-wide truncate">' + esc(label) + '</div>'
      + (sub ? '<div class="text-xs text-slate-500 mt-1 truncate">' + sub + '</div>' : '')
      + '</div>';
  }

  function bars(entries) {
    if (!entries.length) return empty('Sem dados para exibir.');
    var max = Math.max.apply(null, entries.map(function (e) { return e.v; }).concat([1]));
    return '<div class="space-y-3">' + entries.map(function (e) {
      var pct = Math.max(2, Math.round(e.v / max * 100));
      return '<div class="space-y-1">'
        + '<div class="flex justify-between text-xs gap-3"><span class="font-medium text-slate-600 truncate">' + esc(e.k) + '</span>'
        +   '<b class="text-slate-700 flex-none">' + money(e.v) + '</b></div>'
        + '<div class="h-2.5 bg-slate-100 rounded-full overflow-hidden">'
        +   '<div style="width:' + pct + '%;" class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"></div>'
        + '</div></div>';
    }).join('') + '</div>';
  }

  function donut(entries) {
    var total = sum(entries, function (e) { return e.v; });
    if (!total) return empty('Sem custos lancados.');
    var acc = 0;
    var stops = entries.map(function (e, i) {
      var start = acc / total * 360;
      acc += e.v;
      var end = acc / total * 360;
      return PALETA[i % PALETA.length] + ' ' + start.toFixed(1) + 'deg ' + end.toFixed(1) + 'deg';
    });
    return '<div class="flex items-center gap-5 flex-wrap">'
      + '<div style="width:150px;height:150px;border-radius:50%;background:conic-gradient(' + stops.join(',') + ');position:relative;flex:none;">'
      +   '<div style="position:absolute;inset:28px;background:#fff;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;">'
      +     '<div class="text-[10px] uppercase text-slate-400 font-bold">Total</div>'
      +     '<div class="text-xs font-extrabold text-slate-800 text-center px-1">' + money(total) + '</div>'
      +   '</div></div>'
      + '<div class="flex-1 space-y-1 min-w-[170px]">' + entries.map(function (e, i) {
        return '<div class="flex items-center justify-between text-xs gap-2">'
          + '<span class="flex items-center gap-2 truncate"><span style="width:10px;height:10px;border-radius:3px;background:' + PALETA[i % PALETA.length] + '"></span>' + esc(e.k) + '</span>'
          + '<b class="flex-none">' + Math.round(e.v / total * 100) + '%</b></div>';
      }).join('') + '</div></div>';
  }

  function atividade(logs, obras) {
    var arr = logs.filter(function (l) { return !isEst(l); })
      .sort(function (a, b) { return String(b.data || '').localeCompare(String(a.data || '')); })
      .slice(0, 8);
    if (!arr.length) return empty('Nenhum movimento ainda.');
    var badge = {
      recebimento: ['Recebimento', 'bg-emerald-50 text-emerald-700'],
      despesa: ['Despesa', 'bg-red-50 text-red-600'],
      compra: ['Compra', 'bg-amber-50 text-amber-700']
    };
    return '<div class="divide-y divide-slate-100">' + arr.map(function (l) {
      var b = badge[l.tipo] || ['Movimento', 'bg-slate-100 text-slate-600'];
      var pos = (l.tipo === 'recebimento');
      return '<div class="flex items-center justify-between py-2 gap-3">'
        + '<div class="min-w-0"><div class="text-sm font-medium text-slate-700 truncate">' + esc(l.produto_nome || l.observacao || b[0]) + '</div>'
        +   '<div class="text-[11px] text-slate-400">' + esc(nomeObra(obras, l.obra_id)) + ' &bull; ' + esc(dataBR(l.data)) + '</div></div>'
        + '<div class="text-right flex-none"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full ' + b[1] + '">' + b[0] + '</span>'
        +   '<div class="text-sm font-bold ' + (pos ? 'text-emerald-700' : 'text-slate-700') + '">' + money(l.valor_total) + '</div></div></div>';
    }).join('') + '</div>';
  }

  function obrasLista(obras, custoFn) {
    if (!obras.length) return empty('Nenhuma obra cadastrada.');
    return '<div class="space-y-4">' + obras.slice(0, 8).map(function (o) {
      var custo = custoFn(o.id);
      var contrato = num(o.valor_contrato);
      var pct = contrato > 0 ? Math.min(100, Math.round(custo / contrato * 100)) : 0;
      var cor = pct >= 90 ? 'bg-red-500' : (pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500');
      return '<div class="space-y-1">'
        + '<div class="flex justify-between text-sm gap-2"><span class="font-semibold text-slate-700 truncate">' + esc(o.nome) + '</span>'
        +   '<span class="text-slate-400 text-xs flex-none">' + pct + '% executado</span></div>'
        + '<div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full ' + cor + '" style="width:' + pct + '%"></div></div>'
        + '<div class="flex justify-between text-[11px] text-slate-400"><span>Custo ' + money(custo) + '</span><span>Contrato ' + money(contrato) + '</span></div>'
        + '</div>';
    }).join('') + '</div>';
  }

  function cardBox(title, icon, inner, extraClass) {
    return '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 ' + (extraClass || '') + '">'
      + '<h3 class="font-bold text-slate-700 flex items-center gap-2 mb-4"><i data-lucide="' + icon + '" class="w-4 h-4 text-emerald-600"></i> ' + esc(title) + '</h3>'
      + inner + '</div>';
  }

  async function renderDashboardObra() {
    var c = document.getElementById('view-obra-dashboard');
    if (!c) return;
    c.innerHTML = '<div class="p-6 text-slate-400">Carregando painel...</div>';
    try {
      var res = await Promise.all([
        A().listObras(false),
        sb.from('logs').select('uid,id,tipo,produto_nome,data,valor_total,desconto,acrescimo,status,status_financeiro,obra_id,categoria,observacao'),
        sb.from('despesas').select('uid,custo,status,obra_id,categoria,item,valor_pago'),
        sb.from('producao_terc').select('obra_id,metros,status'),
        sb.from('medicoes_empreita').select('obra_id,valor,status'),
        sb.from('equipe').select('id,ativo'),
        sb.from('fornecedores').select('id')
      ]);
      var obras = res[0] || [];
      var logs = res[1].data || [];
      var desps = res[2].data || [];
      var prod = res[3].data || [];
      var meds = res[4].data || [];
      var equipe = res[5].data || [];
      var fornecs = res[6].data || [];

      var logsAtv = logs.filter(function (l) { return !isEst(l); });
      var despsAtv = desps.filter(function (d) { return !isEst(d); });

      var recebido = A().recebidoDe ? A().recebidoDe(logsAtv)
        : sum(logsAtv.filter(function (l) { return l.tipo === 'recebimento'; }), function (l) { return num(l.valor_total); });
      var pago = sum(logsAtv.filter(function (l) { return l.tipo === 'despesa' && String(l.status_financeiro || '').toUpperCase() === 'PAGO'; }), function (l) { return num(l.valor_total); });
      var aReceber = A().aReceberDe ? A().aReceberDe(logsAtv)
        : sum(logsAtv.filter(function (l) { return l.tipo === 'recebimento' && String(l.status_financeiro || '').toUpperCase() !== 'PAGO'; }), function (l) { return num(l.valor_total); });
      var aPagar = sum(despsAtv.filter(function (d) { return String(d.status || '').toUpperCase() !== 'PAGO'; }), function (d) { return Math.max(0, num(d.custo) - num(d.valor_pago)); });
      var custo = sum(despsAtv, function (d) { return num(d.custo); }) + sum(logsAtv.filter(function (l) { return l.tipo === 'compra'; }), function (l) { return num(l.valor_total); });
      var contratos = sum(obras, function (o) { return num(o.valor_contrato); });
      var saldo = recebido - pago;
      var margem = contratos - custo;

      var ativas = obras.filter(function (o) { return o.ativo !== false && String(o.status || '').toUpperCase() !== 'CONCLUIDA'; }).length;
      var metrosPend = sum(prod.filter(function (p) { return String(p.status || '').toUpperCase() !== 'ESTORNADO' && String(p.status || '').toUpperCase() !== 'PAGO'; }), function (p) { return num(p.metros); });
      var metrosPago = sum(prod.filter(function (p) { return String(p.status || '').toUpperCase() === 'PAGO'; }), function (p) { return num(p.metros); });
      var medPend = sum(meds.filter(function (m) { return String(m.status || '').toUpperCase() !== 'ESTORNADO' && String(m.status || '').toUpperCase() !== 'PAGO'; }), function (m) { return num(m.valor); });
      var eqAtiva = equipe.filter(function (e) { return e.ativo !== false; }).length;

      function custoObra(id) {
        var d = sum(despsAtv.filter(function (x) { return String(x.obra_id) === String(id); }), function (x) { return num(x.custo); });
        var l = sum(logsAtv.filter(function (x) { return String(x.obra_id) === String(id) && x.tipo === 'compra'; }), function (x) { return num(x.valor_total); });
        return d + l;
      }

      var catMap = {};
      despsAtv.forEach(function (d) { var k = d.categoria || d.item || 'Outros'; catMap[k] = (catMap[k] || 0) + num(d.custo); });
      var cats = Object.keys(catMap).map(function (k) { return { k: A().catLabel(k), v: catMap[k] }; }).sort(function (a, b) { return b.v - a.v; });

      var custoObras = obras.map(function (o) { return { k: o.nome, v: custoObra(o.id) }; })
        .filter(function (e) { return e.v > 0; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8);

      var hoje = dataBR(new Date().toISOString());

      c.innerHTML = ''
        + '<div class="space-y-5 ' + (window.OBRA_UI_MOBILE ? '' : 'p-4') + '">'
        +   '<div class="rounded-2xl p-6 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-lg flex items-center justify-between flex-wrap gap-4">'
        +     '<div>'
        +       '<div class="text-emerald-100 text-[11px] font-bold uppercase tracking-widest">N\'evoa Obra</div>'
        +       '<h1 class="text-2xl md:text-3xl font-extrabold">Painel de Obras</h1>'
        +       '<p class="text-emerald-50 text-sm mt-1">Vis\u00e3o geral de contratos, custos e produ\u00e7\u00e3o &bull; ' + esc(hoje) + '</p>'
        +     '</div>'
        +     '<div class="flex gap-2">'
        +       (window.OBRA_UI_MOBILE ? '' : '<button onclick="navigate(\'obra-obras\')" class="bg-white/15 hover:bg-white/25 backdrop-blur px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition"><i data-lucide="building" class="w-4 h-4"></i> Obras</button>')
        +       '<button onclick="navigate(\'obra-relatorios\')" class="bg-white text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition"><i data-lucide="file-text" class="w-4 h-4"></i> Relat\u00f3rios</button>'
        +     '</div>'
        +   '</div>'
        +   '<div class="grid grid-cols-2 md:grid-cols-3 gap-4">'
        +     kpi('building', 'bg-emerald-50', 'text-emerald-600', 'Obras ativas', ativas + '<span class="text-sm text-slate-300 font-bold">/' + obras.length + '</span>', 'contratos ' + money(contratos))
        +     kpi('trending-up', 'bg-sky-50', 'text-sky-600', 'Recebido', money(recebido), 'a receber ' + money(aReceber))
        +     kpi('wallet', 'bg-teal-50', 'text-teal-600', 'Saldo em caixa', money(saldo), 'pago ' + money(pago))
        +     kpi('package', 'bg-red-50', 'text-red-500', 'Custo total', money(custo), 'a pagar ' + money(aPagar))
        +     kpi('calculator', 'bg-violet-50', 'text-violet-600', 'Margem contratual', money(margem), (contratos > 0 ? Math.round((margem / contratos) * 100) : 0) + '% do contrato')
        +     kpi('hard-hat', 'bg-amber-50', 'text-amber-600', 'Equipe ativa', String(eqAtiva), fornecs.length + ' fornecedores')
        +   '</div>'
        +   '<div class="grid lg:grid-cols-3 gap-4">'
        +     cardBox('Custo por obra', 'bar-chart-3', bars(custoObras), 'lg:col-span-2')
        +     cardBox('Custos por categoria', 'pie-chart', donut(cats.slice(0, 8)))
        +   '</div>'
        +   '<div class="grid lg:grid-cols-3 gap-4">'
        +     cardBox('Atividade recente', 'activity', atividade(logs, obras), 'lg:col-span-2')
        +     cardBox('Execu\u00e7\u00e3o das obras', 'gauge', obrasLista(obras, custoObra))
        +   '</div>'
        +   '<div class="grid grid-cols-2 md:grid-cols-4 gap-4">'
        +     '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4"><div class="text-xs uppercase font-bold text-slate-400">Metros pendentes</div><div class="text-xl font-extrabold text-slate-800">' + metrosPend.toFixed(2) + '</div></div>'
        +     '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4"><div class="text-xs uppercase font-bold text-slate-400">Metros pagos</div><div class="text-xl font-extrabold text-slate-800">' + metrosPago.toFixed(2) + '</div></div>'
        +     '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4"><div class="text-xs uppercase font-bold text-slate-400">Medi\u00e7\u00f5es pendentes</div><div class="text-xl font-extrabold text-slate-800">' + money(medPend) + '</div></div>'
        +     '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4"><div class="text-xs uppercase font-bold text-slate-400">Contratos</div><div class="text-xl font-extrabold text-slate-800">' + money(contratos) + '</div></div>'
        +   '</div>'
        + '</div>';
      icons();
    } catch (e) {
      c.innerHTML = '<div class="p-6 text-red-600">Erro ao carregar painel: ' + esc(e.message || e) + '</div>';
    }
  }

  window.renderDashboardObra = renderDashboardObra;
})();
