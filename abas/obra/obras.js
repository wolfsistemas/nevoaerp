(function () {
  'use strict';

  var A = function () { return window.obraApi || {}; };

  async function renderObras() {
    var c = document.getElementById('view-obra-obras');
    if (!c) return;
    c.innerHTML = '<div class="p-6 text-slate-400">Carregando obras...</div>';
    try {
      var obras = await A().listObras(false);
      var fasesRes = await sb.from('obras_fases').select('*').order('ordem');
      var fases = fasesRes.data || [];
      var porObra = {};
      fases.forEach(function (f) {
        if (!porObra[f.obra_id]) porObra[f.obra_id] = [];
        porObra[f.obra_id].push(f);
      });
      c.innerHTML = ''
        + '<div class="space-y-4 p-4">'
        +   '<div class="flex items-center justify-between flex-wrap gap-3">'
        +     '<div><h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="building" class="text-emerald-600"></i> Obras</h2>'
        +     '<p class="text-sm text-slate-500">Cadastro de obras e fases. Equipe e terceirizados usam a obra atual.</p></div>'
        +     '<button onclick="obraOpenForm()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold shadow flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Nova obra</button>'
        +   '</div>'
        +   '<div class="bg-white rounded-xl border shadow-sm overflow-hidden">'
        +     '<table class="w-full text-sm"><thead class="bg-slate-50 text-slate-600"><tr>'
        +       '<th class="p-3 text-left">Nome</th><th class="p-3 text-left">Solicitante</th><th class="p-3 text-right">Contrato</th>'
        +       '<th class="p-3">Status</th><th class="p-3">Fases</th><th class="p-3 text-center">Acoes</th>'
        +     '</tr></thead><tbody>'
        +     (obras.length ? obras.map(function (o) {
          var fs = porObra[o.id] || [];
          return '<tr class="border-t hover:bg-slate-50 ' + (o.ativo ? '' : 'opacity-60') + '">'
            + '<td class="p-3 font-bold text-slate-800">' + A().esc(o.nome) + '<div class="text-xs text-slate-400">' + A().esc(o.endereco || '') + '</div></td>'
            + '<td class="p-3">' + A().esc(o.solicitante || '-') + '</td>'
            + '<td class="p-3 text-right font-bold">' + A().money(o.valor_contrato) + '</td>'
            + '<td class="p-3"><span class="text-[10px] font-bold uppercase px-2 py-1 rounded ' + badgeStatus(o.status) + '">' + A().esc(o.status) + '</span></td>'
            + '<td class="p-3 text-xs text-slate-600">' + (fs.length ? fs.map(function (f) { return A().esc(f.nome); }).join(', ') : '-') + '</td>'
            + '<td class="p-3 text-center"><div class="flex gap-2 justify-center">'
            +   '<button onclick="obraOpenForm(\'' + o.id + '\')" class="text-indigo-600 border p-1.5 rounded" title="Editar"><i data-lucide="pencil" class="w-4 h-4"></i></button>'
            +   '<button onclick="obraOpenFases(\'' + o.id + '\')" class="text-emerald-600 border p-1.5 rounded" title="Fases"><i data-lucide="layers" class="w-4 h-4"></i></button>'
            +   (o.ativo && o.status !== 'CONCLUIDA'
                  ? '<button onclick="obraFinalizar(\'' + o.id + '\')" class="text-amber-600 border p-1.5 rounded" title="Finalizar obra"><i data-lucide="flag" class="w-4 h-4"></i></button>'
                  : '<button onclick="obraReabrir(\'' + o.id + '\')" class="text-emerald-600 border p-1.5 rounded" title="Reabrir obra"><i data-lucide="rotate-ccw" class="w-4 h-4"></i></button>')
            + '</div></td></tr>';
        }).join('') : '<tr><td colspan="6" class="p-6 text-center text-slate-400">Nenhuma obra cadastrada.</td></tr>')
        +     '</tbody></table></div></div>';
      A().icons();
    } catch (e) {
      c.innerHTML = '<div class="p-6 text-red-600">Erro: ' + A().esc(e.message || e) + '</div>';
    }
  }

  function badgeStatus(st) {
    if (st === 'ATIVA') return 'bg-emerald-100 text-emerald-700';
    if (st === 'PARALISADA') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-200 text-slate-600';
  }

  async function obraOpenForm(id) {
    var o = { nome: '', endereco: '', solicitante: '', valor_contrato: 0, data_inicio: '', data_termino: '', status: 'ATIVA', ativo: true };
    if (id) {
      var res = await sb.from('obras').select('*').eq('id', id).single();
      if (res.error) return A().toast(res.error.message, true);
      o = res.data;
    }
    abrirModal(''
      + '<form onsubmit="obraSalvar(event)" class="space-y-3">'
      +   '<input type="hidden" id="obra-id" value="' + A().esc(o.id || '') + '">'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nome *</label>'
      +   '<input id="obra-nome" required value="' + A().esc(o.nome) + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Endereco</label>'
      +   '<input id="obra-endereco" value="' + A().esc(o.endereco || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Solicitante</label>'
      +   '<input id="obra-solicitante" value="' + A().esc(o.solicitante || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div class="grid grid-cols-2 gap-3">'
      +     '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Valor contrato</label>'
      +     '<input id="obra-valor" type="number" step="0.01" value="' + (o.valor_contrato || 0) + '" class="w-full p-2.5 border rounded-lg"></div>'
      +     '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>'
      +     '<select id="obra-status" class="w-full p-2.5 border rounded-lg">'
      +       ['ATIVA','PARALISADA','CONCLUIDA'].map(function (s) {
            return '<option' + (o.status === s ? ' selected' : '') + '>' + s + '</option>';
          }).join('')
      +     '</select></div>'
      +   '</div>'
      +   '<div class="grid grid-cols-2 gap-3">'
      +     '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Inicio</label>'
      +     '<input id="obra-inicio" type="date" value="' + A().esc((o.data_inicio || '').slice(0,10)) + '" class="w-full p-2.5 border rounded-lg"></div>'
      +     '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Termino</label>'
      +     '<input id="obra-termino" type="date" value="' + A().esc((o.data_termino || '').slice(0,10)) + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '</div>'
      +   '<label class="flex items-center gap-2"><input id="obra-ativo" type="checkbox"' + (o.ativo !== false ? ' checked' : '') + '> Ativa</label>'
      +   '<div class="flex justify-end gap-2 pt-2">'
      +     '<button type="button" onclick="obraFecharModal()" class="px-4 py-2 border rounded-lg font-bold">Cancelar</button>'
      +     '<button type="submit" class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold">Salvar</button>'
      +   '</div></form>', id ? 'Editar obra' : 'Nova obra');
  }

  async function obraSalvar(ev) {
    ev.preventDefault();
    var id = document.getElementById('obra-id').value;
    var payload = {
      nome: document.getElementById('obra-nome').value.trim(),
      endereco: document.getElementById('obra-endereco').value.trim() || null,
      solicitante: document.getElementById('obra-solicitante').value.trim() || null,
      valor_contrato: Number(document.getElementById('obra-valor').value) || 0,
      status: document.getElementById('obra-status').value,
      data_inicio: document.getElementById('obra-inicio').value || null,
      data_termino: document.getElementById('obra-termino').value || null,
      ativo: document.getElementById('obra-ativo').checked,
      updated_at: new Date().toISOString()
    };
    if (!payload.nome) return A().toast('Informe o nome.', true);
    var res = id
      ? await sb.from('obras').update(payload).eq('id', id)
      : await sb.from('obras').insert([payload]).select();
    if (res.error) return A().toast(res.error.message, true);
    var novoId = id || (res.data && res.data[0] && res.data[0].id);
    var lancouRecebimento = false;
    if (!id && novoId && payload.valor_contrato > 0) {
      try {
        await criarRecebimentoContrato(novoId, payload);
        lancouRecebimento = true;
      } catch (e) { A().toast('Obra salva, mas o recebimento do contrato falhou: ' + (e.message || e), true); }
    }
    A().toast(id ? 'Obra salva.' : (lancouRecebimento ? 'Obra salva e recebimento do contrato lançado em Contas a Receber.' : 'Obra salva.'));
    obraFecharModal();
    renderObras();
  }

  async function criarRecebimentoContrato(obraId, obra) {
    if (!obraId || !A().insertLog) return;
    await A().insertLog({
      tipo: 'receita',
      produto_nome: 'Recebimento de Serviço prestado',
      categoria: 'Recebimento de Serviço prestado',
      valor_total: Number(obra.valor_contrato) || 0,
      cliente_nome: obra.solicitante || 'Consumidor Final',
      observacao: 'Contrato da obra ' + (obra.nome || ''),
      vencimento: obra.data_inicio || A().hojeISO(),
      status: 'ATIVO',
      status_financeiro: 'PENDENTE',
      valor_pago: 0,
      obra_id: obraId
    });
  }

  async function obraOpenFases(obraId) {
    var o = await sb.from('obras').select('nome').eq('id', obraId).single();
    var f = await sb.from('obras_fases').select('*').eq('obra_id', obraId).order('ordem');
    var fases = f.data || [];
    abrirModal(''
      + '<div class="space-y-3">'
      +   '<form onsubmit="obraSalvarFase(event,\'' + obraId + '\')" class="flex gap-2">'
      +     '<input id="fase-nome" required placeholder="Nome da fase" class="flex-1 p-2.5 border rounded-lg">'
      +     '<button class="bg-emerald-600 text-white px-4 rounded-lg font-bold">Adicionar</button>'
      +   '</form>'
      +   '<ul class="divide-y">'
      +     (fases.length ? fases.map(function (x) {
        var rem = x.nome === '(removida)';
        return '<li class="py-2 flex justify-between items-center' + (rem ? ' opacity-50' : '') + '"><span>' + A().esc(x.ordem) + '. ' + A().esc(x.nome) + '</span>'
          + (!rem ? '<button onclick="obraExcluirFase(\'' + x.id + '\',\'' + obraId + '\')" class="text-red-500 text-xs font-bold">Remover</button>' : '') + '</li>';
      }).join('') : '<li class="text-slate-400 text-sm py-2">Nenhuma fase.</li>')
      +   '</ul></div>', 'Fases — ' + ((o.data && o.data.nome) || ''));
  }

  async function obraSalvarFase(ev, obraId) {
    ev.preventDefault();
    var nome = document.getElementById('fase-nome').value.trim();
    if (!nome) return;
    var q = await sb.from('obras_fases').select('ordem').eq('obra_id', obraId).order('ordem', { ascending: false }).limit(1);
    var ordem = (q.data && q.data[0] && q.data[0].ordem) ? q.data[0].ordem + 1 : 1;
    var res = await sb.from('obras_fases').insert([{ obra_id: obraId, nome: nome, ordem: ordem }]);
    if (res.error) return A().toast(res.error.message, true);
    obraOpenFases(obraId);
    renderObras();
  }

  async function obraExcluirFase(id, obraId) {
    var ok = typeof confirmDialog === 'function' ? await confirmDialog('Marcar esta fase como removida? Nao apaga o registro.', { danger: true, confirmText: 'Remover' }) : true;
    if (!ok) return;
    var res = await sb.from('obras_fases').update({ nome: '(removida)' }).eq('id', id);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Fase marcada como removida.');
    obraOpenFases(obraId);
    renderObras();
  }

  function abrirModal(html, titulo) {
    var el = document.getElementById('obra-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'obra-modal';
      document.body.appendChild(el);
    }
    el.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    el.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">'
      + '<div class="p-4 border-b flex justify-between items-center"><h3 class="font-bold text-slate-800">' + A().esc(titulo) + '</h3>'
      + '<button onclick="obraFecharModal()" class="text-slate-400"><i data-lucide="x"></i></button></div>'
      + '<div class="p-4">' + html + '</div></div>';
    A().icons();
  }

  function obraFecharModal() {
    var el = document.getElementById('obra-modal');
    if (el) el.remove();
  }

  async function obraFinalizar(id) {
    var ok = await A().confirmar('Finalizar esta obra? Ela fica CONCLUIDA e inativa, mas permanece em todos os registros (financeiro, equipe, historico).', { confirmText: 'Finalizar' });
    if (!ok) return;
    var res = await sb.from('obras').update({
      status: 'CONCLUIDA',
      ativo: false,
      data_termino: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Obra finalizada.');
    renderObras();
  }

  async function obraReabrir(id) {
    var ok = await A().confirmar('Reabrir esta obra? Ela volta a ficar ATIVA.', { confirmText: 'Reabrir' });
    if (!ok) return;
    var res = await sb.from('obras').update({ status: 'ATIVA', ativo: true, updated_at: new Date().toISOString() }).eq('id', id);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Obra reaberta.');
    renderObras();
  }

  window.renderObras = renderObras;
  window.obraOpenForm = obraOpenForm;
  window.obraSalvar = obraSalvar;
  window.obraOpenFases = obraOpenFases;
  window.obraSalvarFase = obraSalvarFase;
  window.obraExcluirFase = obraExcluirFase;
  window.obraFinalizar = obraFinalizar;
  window.obraReabrir = obraReabrir;
  window.obraFecharModal = obraFecharModal;
})();
