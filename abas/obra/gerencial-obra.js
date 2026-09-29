(function () {
  'use strict';
  var A = function () { return window.obraApi || {}; };

  async function renderGerencialObra() {
    var c = document.getElementById('view-obra-gerencial');
    if (!c) return;
    c.innerHTML = '<div class="p-6 text-slate-400">Carregando gerencial...</div>';
    try {
      var obras = await A().listObras(false);
      var desp = await sb.from('despesas').select('obra_id,fase_id,custo,categoria,status,item');
      var logs = await sb.from('logs').select('obra_id,valor_total,tipo,categoria,status,status_financeiro');
      var prod = await sb.from('producao_terc').select('obra_id,metros,status');
      var med = await sb.from('medicoes_empreita').select('obra_id,valor,percentual,status');
      var despesas = desp.data || [];
      var movimentos = logs.data || [];
      var producao = prod.data || [];
      var medicoes = med.data || [];

      function custoObra(id) {
        var d = despesas.filter(function (x) {
          return String(x.obra_id) === String(id) && String(x.status || '').toUpperCase() !== 'ESTORNADO';
        }).reduce(function (s, x) { return s + Number(x.custo || 0); }, 0);
        var l = movimentos.filter(function (x) {
          return String(x.obra_id) === String(id) && x.tipo === 'compra' && x.status !== 'ESTORNADO' && x.status_financeiro !== 'ESTORNADO';
        }).reduce(function (s, x) { return s + Number(x.valor_total || 0); }, 0);
        return d + l;
      }

      c.innerHTML = ''
        + '<div class="space-y-4 p-4">'
        +   '<h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="calculator" class="text-emerald-600"></i> Gerencial de obra</h2>'
        +   '<p class="text-sm text-slate-500">Custo por obra (despesas + OC confirmadas). Estornos nao entram.</p>'
        +   '<div class="grid md:grid-cols-3 gap-4">'
        +     '<div class="bg-white border rounded-xl p-4"><div class="text-xs uppercase text-slate-400 font-bold">Obras</div><div class="text-2xl font-bold">' + obras.length + '</div></div>'
            +     '<div class="bg-white border rounded-xl p-4"><div class="text-xs uppercase text-slate-400 font-bold">Metros produzidos</div><div class="text-2xl font-bold">' + producao.filter(function (p) { return p.status !== 'ESTORNADO'; }).reduce(function (s, p) { return s + Number(p.metros || 0); }, 0).toFixed(2) + '</div></div>'
            +     '<div class="bg-white border rounded-xl p-4"><div class="text-xs uppercase text-slate-400 font-bold">Medicoes</div><div class="text-2xl font-bold">' + A().money(medicoes.filter(function (m) { return m.status !== 'ESTORNADO'; }).reduce(function (s, m) { return s + Number(m.valor || 0); }, 0)) + '</div></div>'
        +   '</div>'
        +   '<div class="bg-white rounded-xl border shadow-sm overflow-hidden"><table class="w-full text-sm"><thead class="bg-slate-50"><tr>'
        +     '<th class="p-3 text-left">Obra</th><th class="p-3">Status</th><th class="p-3 text-right">Contrato</th><th class="p-3 text-right">Custo</th><th class="p-3 text-right">Saldo</th>'
        +   '</tr></thead><tbody>'
        +   (obras.length ? obras.map(function (o) {
          var custo = custoObra(o.id);
          var saldo = Number(o.valor_contrato || 0) - custo;
          return '<tr class="border-t"><td class="p-3 font-bold">' + A().esc(o.nome) + '</td><td class="p-3">' + A().esc(o.status) + '</td>'
            + '<td class="p-3 text-right">' + A().money(o.valor_contrato) + '</td>'
            + '<td class="p-3 text-right text-red-600">' + A().money(custo) + '</td>'
            + '<td class="p-3 text-right font-bold ' + (saldo >= 0 ? 'text-emerald-700' : 'text-red-600') + '">' + A().money(saldo) + '</td></tr>';
        }).join('') : '<tr><td colspan="5" class="p-6 text-center text-slate-400">Sem obras.</td></tr>')
        +   '</tbody></table></div>'
        +   '<div class="bg-white rounded-xl border shadow-sm p-4">'
        +     '<h3 class="font-bold mb-2">Custo por categoria</h3>'
        +     categorias(despesas)
        +   '</div>'
        + '</div>';
      A().icons();
    } catch (e) {
      c.innerHTML = '<div class="p-6 text-red-600">Erro: ' + A().esc(e.message || e) + '</div>';
    }
  }

  function categorias(despesas) {
    var map = {};
    despesas.forEach(function (d) {
      if (String(d.status || '').toUpperCase() === 'ESTORNADO') return;
      var k = d.categoria || d.item || 'outros';
      map[k] = (map[k] || 0) + Number(d.custo || 0);
    });
    var keys = Object.keys(map);
    if (!keys.length) return '<div class="text-slate-400 text-sm">Sem lancamentos.</div>';
    return '<ul class="text-sm space-y-1">' + keys.map(function (k) {
      return '<li class="flex justify-between border-b py-1"><span>' + A().esc(k) + '</span><b>' + A().money(map[k]) + '</b></li>';
    }).join('') + '</ul>';
  }

  async function renderFinObra() {
    var c = document.getElementById('view-obra-fin');
    if (!c) return;
    var obras = await A().listObras(true);
    c.innerHTML = ''
      + '<div class="space-y-4 p-4">'
      +   '<h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="wallet" class="text-emerald-600"></i> Financeiro de obra</h2>'
      +   '<p class="text-sm text-slate-500">Extrato por obra a partir de despesas e logs com obra_id. Estorno nunca apaga.</p>'
      +   '<div class="flex gap-3"><select id="fin-obra" class="p-2.5 border rounded-lg flex-1">' + A().optionsObras(obras) + '</select>'
      +   '<button onclick="finObraFiltrar()" class="bg-slate-800 text-white px-4 rounded-lg font-bold">Filtrar</button></div>'
      +   '<div id="fin-obra-body" class="bg-white rounded-xl border p-4 text-slate-400">Selecione uma obra.</div>'
      + '</div>';
    A().icons();
  }

  async function finObraFiltrar() {
    var id = document.getElementById('fin-obra').value;
    var body = document.getElementById('fin-obra-body');
    if (!id) { body.innerHTML = 'Selecione uma obra.'; return; }
    var desp = await sb.from('despesas').select('*').eq('obra_id', id).order('data', { ascending: false });
    var logs = await sb.from('logs').select('*').eq('obra_id', id).order('data', { ascending: false });
    var d = desp.data || [];
    var l = logs.data || [];
    var totalD = d.filter(function (x) { return String(x.status || '').toUpperCase() !== 'ESTORNADO'; })
      .reduce(function (s, x) { return s + Number(x.custo || 0); }, 0);
    var totalL = l.filter(function (x) { return x.status !== 'ESTORNADO' && x.status_financeiro !== 'ESTORNADO'; })
      .reduce(function (s, x) { return s + Number(x.valor_total || 0); }, 0);
    body.innerHTML = '<div class="font-bold mb-3">Despesas ' + A().money(totalD) + ' · Movimentos ' + A().money(totalL) + ' (estornos fora do total)</div>'
      + '<table class="w-full text-sm"><thead><tr class="text-left text-slate-500"><th class="py-1">Tipo</th><th>Item</th><th class="text-right">Valor</th><th>Status</th></tr></thead><tbody>'
      + d.map(function (x) {
        var est = String(x.status || '').toUpperCase() === 'ESTORNADO';
        return '<tr class="border-t' + (est ? ' opacity-50' : '') + '"><td>despesa</td><td>' + A().esc(x.item) + '</td><td class="text-right">' + A().money(x.custo) + '</td><td>' + A().esc(x.status) + '</td></tr>';
      }).join('')
      + l.map(function (x) {
        var est = x.status === 'ESTORNADO' || x.status_financeiro === 'ESTORNADO';
        return '<tr class="border-t' + (est ? ' opacity-50' : '') + '"><td>' + A().esc(x.tipo) + '</td><td>' + A().esc(x.produto_nome) + '</td><td class="text-right">' + A().money(x.valor_total) + '</td><td>' + A().esc(x.status_financeiro || x.status) + '</td></tr>';
      }).join('')
      + '</tbody></table>';
  }

  window.renderGerencialObra = renderGerencialObra;
  window.renderFinObra = renderFinObra;
  window.finObraFiltrar = finObraFiltrar;
})();
