(function () {
  'use strict';
  var A = function () { return window.obraApi || {}; };

  async function renderFornecedoresObra() {
    var c = document.getElementById('view-obra-fornecedores');
    if (!c) return;
    c.innerHTML = '<div class="p-6 text-slate-400">Carregando...</div>';
    var res = await sb.from('fornecedores').select('*').order('nome');
    if (res.error) { c.innerHTML = '<div class="p-6 text-red-600">' + A().esc(res.error.message) + '</div>'; return; }
    var lista = res.data || [];
    c.innerHTML = ''
      + '<div class="space-y-4 p-4">'
      +   '<div class="flex items-center justify-between"><div><h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="truck" class="text-emerald-600"></i> Fornecedores</h2>'
      +   '<p class="text-sm text-slate-500">Cadastro usado em OC e historico de precos.</p></div>'
      +   '<button onclick="fornOpenForm()" class="bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold shadow">Novo</button></div>'
      +   '<div class="bg-white rounded-xl border shadow-sm overflow-hidden"><table class="w-full text-sm"><thead class="bg-slate-50"><tr>'
      +     '<th class="p-3 text-left">Nome</th><th class="p-3">Documento</th><th class="p-3">Telefone</th><th class="p-3"></th>'
      +   '</tr></thead><tbody>'
      +   (lista.length ? lista.map(function (f) {
        return '<tr class="border-t"><td class="p-3 font-bold">' + A().esc(f.nome) + '</td><td class="p-3">' + A().esc(f.documento || '-') + '</td><td class="p-3">' + A().esc(f.telefone || '-') + '</td>'
          + '<td class="p-3 text-right"><button onclick="fornOpenForm(\'' + f.id + '\')" class="text-indigo-600 border p-1.5 rounded"><i data-lucide="pencil" class="w-4 h-4"></i></button></td></tr>';
      }).join('') : '<tr><td colspan="4" class="p-6 text-center text-slate-400">Nenhum fornecedor.</td></tr>')
      +   '</tbody></table></div></div>';
    A().icons();
  }

  async function fornOpenForm(id) {
    var f = { nome: '', telefone: '', documento: '', endereco: '', ativo: true };
    if (id) {
      var res = await sb.from('fornecedores').select('*').eq('id', id).single();
      if (res.error) return A().toast(res.error.message, true);
      f = res.data;
    }
    var html = '<form onsubmit="fornSalvar(event)" class="space-y-3">'
      + '<input type="hidden" id="forn-id" value="' + A().esc(f.id || '') + '">'
      + '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nome *</label><input id="forn-nome" required value="' + A().esc(f.nome) + '" class="w-full p-2.5 border rounded-lg"></div>'
      + '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Documento</label><input id="forn-doc" value="' + A().esc(f.documento || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      + '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone</label><input id="forn-tel" value="' + A().esc(f.telefone || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      + '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Endereco</label><input id="forn-end" value="' + A().esc(f.endereco || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      + '<div class="flex justify-end gap-2"><button type="button" onclick="obraFecharModal()" class="px-4 py-2 border rounded-lg font-bold">Cancelar</button>'
      + '<button class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold">Salvar</button></div></form>';
    var el = document.getElementById('obra-modal');
    if (!el) { el = document.createElement('div'); el.id = 'obra-modal'; document.body.appendChild(el); }
    el.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    el.innerHTML = '<div class="bg-white rounded-2xl w-full max-w-lg"><div class="p-4 border-b flex justify-between"><h3 class="font-bold">' + (id ? 'Editar' : 'Novo') + ' fornecedor</h3><button onclick="obraFecharModal()">x</button></div><div class="p-4">' + html + '</div></div>';
  }

  async function fornSalvar(ev) {
    ev.preventDefault();
    var id = document.getElementById('forn-id').value;
    var payload = {
      nome: document.getElementById('forn-nome').value.trim(),
      documento: document.getElementById('forn-doc').value.trim() || null,
      telefone: document.getElementById('forn-tel').value.trim() || null,
      endereco: document.getElementById('forn-end').value.trim() || null
    };
    var res = id ? await sb.from('fornecedores').update(payload).eq('id', id) : await sb.from('fornecedores').insert([payload]);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Fornecedor salvo.');
    if (typeof obraFecharModal === 'function') obraFecharModal();
    renderFornecedoresObra();
  }

  window.renderFornecedoresObra = renderFornecedoresObra;
  window.fornOpenForm = fornOpenForm;
  window.fornSalvar = fornSalvar;
})();
