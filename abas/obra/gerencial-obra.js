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
      var logs = await sb.from('logs').select('obra_id,fase_id,valor_total,tipo,categoria,status,status_financeiro');
      var prod = await sb.from('producao_terc').select('obra_id,metros,status');
      var med = await sb.from('medicoes_empreita').select('obra_id,valor,percentual,status');
      var fasesQ = await sb.from('obras_fases').select('id,obra_id,nome,ordem,arquivada');
      var despesas = desp.data || [];
      var movimentos = logs.data || [];
      var producao = prod.data || [];
      var medicoes = med.data || [];
      var fases = fasesQ.data || [];

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
        +   '<div class="bg-white rounded-xl border shadow-sm p-4">'
        +     '<h3 class="font-bold mb-2">Custo e receita por fase</h3>'
        +     custoPorFase(obras, despesas, movimentos, fases)
        +   '</div>'
        + '</div>';
      A().icons();
    } catch (e) {
      c.innerHTML = '<div class="p-6 text-red-600">Erro: ' + A().esc(e.message || e) + '</div>';
    }
  }

  function custoPorFase(obras, despesas, movimentos, fases) {
    function nomeObra(id) { var o = (obras || []).find(function (x) { return String(x.id) === String(id); }); return o ? o.nome : '-'; }
    var ativas = (fases || []).filter(function (f) {
      return !f.arquivada && String(f.nome || '').trim().toLowerCase() !== '(removida)';
    }).sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); });
    if (!ativas.length) return '<div class="text-slate-400 text-sm">Nenhuma fase cadastrada.</div>';
    var rows = ativas.map(function (f) {
      var df = despesas.filter(function (d) { return String(d.fase_id) === String(f.id) && String(d.status || '').toUpperCase() !== 'ESTORNADO'; });
      var lf = movimentos.filter(function (l) { return String(l.fase_id) === String(f.id); });
      var custo = df.reduce(function (s, d) { return s + Number(d.custo || 0); }, 0)
        + lf.filter(function (l) { return l.tipo === 'compra' && l.status !== 'ESTORNADO' && l.status_financeiro !== 'ESTORNADO'; })
            .reduce(function (s, l) { return s + Number(l.valor_total || 0); }, 0);
      var recebido = A().recebidoDe ? A().recebidoDe(lf) : 0;
      return { nome: f.nome, obra: nomeObra(f.obra_id), custo: custo, recebido: recebido, saldo: recebido - custo };
    });
    return '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-50 text-slate-600"><tr>'
      + '<th class="p-2 text-left">Fase</th><th class="p-2 text-left">Obra</th><th class="p-2 text-right">Recebido</th><th class="p-2 text-right">Custo</th><th class="p-2 text-right">Saldo</th>'
      + '</tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr class="border-t"><td class="p-2 font-bold text-slate-700">' + A().esc(r.nome) + '</td>'
          + '<td class="p-2 text-slate-500">' + A().esc(r.obra) + '</td>'
          + '<td class="p-2 text-right text-green-700">' + A().money(r.recebido) + '</td>'
          + '<td class="p-2 text-right text-red-600">' + A().money(r.custo) + '</td>'
          + '<td class="p-2 text-right font-bold ' + (r.saldo >= 0 ? 'text-emerald-700' : 'text-red-600') + '">' + A().money(r.saldo) + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';
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
      return '<li class="flex justify-between border-b py-1"><span>' + A().esc(A().catLabel(k)) + '</span><b>' + A().money(map[k]) + '</b></li>';
    }).join('') + '</ul>';
  }

  window.renderGerencialObra = renderGerencialObra;
})();
