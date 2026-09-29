(function () {
  'use strict';
  var A = function () { return window.obraApi || {}; };

  async function renderPrecosObra() {
    var c = document.getElementById('view-obra-precos');
    if (!c) return;
    c.innerHTML = '<div class="p-6 text-slate-400">Carregando...</div>';
    var prods = (typeof STATE !== 'undefined' && STATE.products) ? STATE.products : ((await sb.from('produtos').select('id,nome')).data || []);
    var forn = (await sb.from('fornecedores').select('id,nome').eq('ativo', true).order('nome')).data || [];
    var hist = await sb.from('historico_precos').select('*, produtos:produto_id(nome), fornecedores:fornecedor_id(nome)').order('data_preco', { ascending: false }).limit(200);
    if (hist.error) { c.innerHTML = '<div class="p-6 text-red-600">' + A().esc(hist.error.message) + '</div>'; return; }
    var lista = hist.data || [];
    c.innerHTML = ''
      + '<div class="space-y-4 p-4">'
      +   '<h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="trending-up" class="text-emerald-600"></i> Historico de precos</h2>'
      +   '<form onsubmit="precoSalvarManual(event)" class="bg-white rounded-xl border shadow-sm p-4 grid grid-cols-1 md:grid-cols-5 gap-3">'
      +     '<select id="preco-prod" required class="p-2.5 border rounded-lg"><option value="">Produto *</option>'
      +       prods.map(function (p) { return '<option value="' + p.id + '">' + A().esc(p.nome) + '</option>'; }).join('')
      +     '</select>'
      +     '<select id="preco-forn" class="p-2.5 border rounded-lg"><option value="">Fornecedor</option>'
      +       forn.map(function (f) { return '<option value="' + f.id + '">' + A().esc(f.nome) + '</option>'; }).join('')
      +     '</select>'
      +     '<input id="preco-data" type="date" required value="' + A().hojeISO() + '" class="p-2.5 border rounded-lg">'
      +     '<input id="preco-val" type="number" step="0.01" required placeholder="Preco unit." class="p-2.5 border rounded-lg">'
      +     '<button class="bg-emerald-600 text-white rounded-lg font-bold">Lancar</button>'
      +     '<input id="preco-obs" placeholder="Observacao" class="md:col-span-5 p-2.5 border rounded-lg">'
      +   '</form>'
      +   '<div class="bg-white rounded-xl border shadow-sm overflow-hidden"><table class="w-full text-sm"><thead class="bg-slate-50"><tr>'
      +     '<th class="p-3 text-left">Data</th><th class="p-3 text-left">Produto</th><th class="p-3">Fornecedor</th><th class="p-3 text-right">Preco</th><th class="p-3">Origem</th>'
      +   '</tr></thead><tbody>'
      +   (lista.length ? lista.map(function (h) {
        return '<tr class="border-t"><td class="p-3">' + A().dataBR(h.data_preco) + '</td><td class="p-3">' + A().esc((h.produtos && h.produtos.nome) || '-') + '</td>'
          + '<td class="p-3">' + A().esc((h.fornecedores && h.fornecedores.nome) || '-') + '</td>'
          + '<td class="p-3 text-right font-bold">' + A().money(h.preco_unitario) + '</td><td class="p-3">' + A().esc(h.origem) + '</td></tr>';
      }).join('') : '<tr><td colspan="5" class="p-6 text-center text-slate-400">Sem historico.</td></tr>')
      +   '</tbody></table></div></div>';
    A().icons();
  }

  async function precoSalvarManual(ev) {
    ev.preventDefault();
    var res = await sb.from('historico_precos').insert([{
      produto_id: Number(document.getElementById('preco-prod').value),
      fornecedor_id: document.getElementById('preco-forn').value || null,
      data_preco: document.getElementById('preco-data').value,
      preco_unitario: Number(document.getElementById('preco-val').value) || 0,
      origem: 'manual',
      observacao: document.getElementById('preco-obs').value.trim() || null
    }]);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Preco lancado.');
    renderPrecosObra();
  }

  window.renderPrecosObra = renderPrecosObra;
  window.precoSalvarManual = precoSalvarManual;
})();
