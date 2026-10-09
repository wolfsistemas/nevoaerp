(function () {
  'use strict';

  var A = function () { return window.obraApi || {}; };

  function toast(msg, err) {
    if (typeof showToast === 'function') showToast(msg, !!err);
    else A().toast(msg, err);
  }

  function confirmar(msg, opts) {
    if (A().confirmar) return A().confirmar(msg, opts);
    if (typeof confirmDialog === 'function') return confirmDialog(msg, opts || {});
    return Promise.resolve(window.confirm(msg));
  }

  async function mobObraPonto() {
    var body = document.getElementById('mob-ponto-body');
    if (!body) return;
    var funcs = await sb.from('equipe').select('*').eq('tipo', 'Diaria').eq('ativo', true).order('nome');
    if (funcs.error) { body.innerHTML = '<div class="text-red-600">' + A().esc(funcs.error.message) + '</div>'; return; }
    var lista = funcs.data || [];
    var hoje = A().hojeISO();
    body.innerHTML = ''
      + '<div class="space-y-3">'
      +   '<div><label class="text-[10px] font-bold text-slate-400 uppercase">Funcionario</label>'
      +   '<select id="mob-ponto-func" class="w-full p-3 border rounded-xl bg-white font-bold" onchange="mobObraCarregarPonto()">'
      +     lista.map(function (f) { return '<option value="' + f.id + '">' + A().esc(f.nome) + '</option>'; }).join('')
      +   '</select></div>'
      +   '<div class="grid grid-cols-2 gap-2">'
      +     '<button onclick="mobObraBater(\'ENTRADA\')" class="bg-emerald-600 text-white py-3 rounded-xl font-black">Entrada</button>'
      +     '<button onclick="mobObraBater(\'SAIDA\')" class="bg-slate-700 text-white py-3 rounded-xl font-black">Saida</button>'
      +   '</div>'
      +   '<button onclick="mobObraAjuste()" class="w-full bg-amber-500 text-white py-3 rounded-xl font-bold">Ajuste 0,5 / 1,0</button>'
      +   '<button onclick="mobObraValeDoPonto()" class="w-full bg-rose-700 text-white py-3 rounded-xl font-bold">Lancar vale / adiantamento</button>'
      +   '<div id="mob-ponto-resumo" class="text-sm text-slate-600 bg-white p-3 rounded-xl border"></div>'
      +   '<div id="mob-ponto-lista" class="flex flex-col gap-2 pb-8"></div>'
      + '</div>';
    if (lista.length) mobObraCarregarPonto();
    else body.innerHTML = '<p class="text-slate-400 text-center py-8">Nenhum diarista ativo.</p>';
    A().icons();
  }

  async function mobObraCarregarPonto() {
    var funcId = Number(document.getElementById('mob-ponto-func').value);
    var hoje = A().hojeISO();
    var iniMes = hoje.slice(0, 8) + '01';
    var res = await sb.from('ponto_diario').select('*')
      .eq('funcionario_id', funcId)
      .gte('hora_registro', iniMes + 'T00:00:00')
      .lte('hora_registro', hoje + 'T23:59:59')
      .order('hora_registro', { ascending: false });
    if (res.error) return toast(res.error.message, true);
    var regs = (res.data || []).filter(function (r) { return r.status !== 'ESTORNADO'; });
    var diarias = (typeof rvCalcularTotalDiarias === 'function') ? rvCalcularTotalDiarias(regs) : 0;
    var func = (await sb.from('equipe').select('valor_diaria,nome').eq('id', funcId).single()).data || {};
    var valor = diarias * Number(func.valor_diaria || 0);
    var vales = await A().valesAbertos('equipe', funcId);
    var valesSum = (A().somaVales ? A().somaVales(vales) : 0);
    var resumo = document.getElementById('mob-ponto-resumo');
    if (resumo) resumo.innerHTML = 'Mes: <b>' + diarias.toFixed(2) + '</b> diarias · <b>' + A().money(valor) + '</b>'
      + (valesSum > 0 ? ' · Vales abertos: <b class="text-rose-600">' + A().money(valesSum) + '</b>' : '');
    var lista = document.getElementById('mob-ponto-lista');
    if (!lista) return;
    lista.innerHTML = regs.length ? regs.slice(0, 40).map(function (r) {
      var pago = r.pago_em_fechamento;
      return '<div class="bg-white border rounded-xl p-3 flex justify-between items-center">'
        + '<div><p class="font-bold text-slate-800 text-sm">' + A().esc(r.tipo) + (pago ? ' · pago' : '') + '</p>'
        + '<p class="text-[11px] text-slate-500">' + new Date(r.hora_registro).toLocaleString('pt-BR') + '</p></div>'
        + '<div class="text-right">'
        + '<span class="text-xs font-bold text-slate-500">' + (r.fracao_diaria != null ? r.fracao_diaria : '-') + '</span>'
        + (!pago ? '<button onclick="mobObraEstornarBatida(\'' + r.id + '\')" class="block text-red-600 text-[10px] font-bold mt-1">Estornar</button>' : '')
        + '</div></div>';
    }).join('') : '<p class="text-center text-slate-400 py-4">Sem batidas neste mes.</p>';
  }

  async function mobObraBater(tipo) {
    var funcId = Number(document.getElementById('mob-ponto-func').value);
    if (!funcId) return toast('Selecione o funcionario.', true);
    var eq = await sb.from('equipe').select('obra_atual_id').eq('id', funcId).single();
    var res = await sb.from('ponto_diario').insert([{
      funcionario_id: funcId,
      obra_id: (eq.data && eq.data.obra_atual_id) || null,
      tipo: tipo,
      status: 'VALIDADO',
      hora_registro: new Date().toISOString()
    }]);
    if (res.error) return toast(res.error.message, true);
    toast('Batida ' + tipo.toLowerCase() + ' registrada.');
    mobObraCarregarPonto();
  }

  async function mobObraAjuste() {
    var fracao = await promptDialog('Fração da diária', '0.5', {
      title: 'Ajuste de diária', type: 'number', min: '0.5', step: '0.5', confirmText: 'Lançar'
    });
    if (fracao == null) return;
    fracao = Number(fracao);
    if (fracao !== 0.5 && fracao !== 1) return toast('Use 0.5 ou 1.', true);
    var funcId = Number(document.getElementById('mob-ponto-func').value);
    if (!funcId) return toast('Selecione o funcionario.', true);
    var eq = await sb.from('equipe').select('obra_atual_id').eq('id', funcId).single();
    var res = await sb.from('ponto_diario').insert([{
      funcionario_id: funcId,
      obra_id: (eq.data && eq.data.obra_atual_id) || null,
      tipo: 'AJUSTE_MANUAL',
      status: 'VALIDADO',
      fracao_diaria: fracao,
      hora_registro: new Date().toISOString(),
      observacao: 'Ajuste mobile'
    }]);
    if (res.error) return toast(res.error.message, true);
    toast('Ajuste lancado.');
    mobObraCarregarPonto();
  }

  async function mobObraEstornarBatida(id) {
    var ok = await confirmar('Estornar esta batida? O registro permanece.');
    if (!ok) return;
    var row = (await sb.from('ponto_diario').select('*').eq('id', id).single()).data;
    if (!row) return toast('Batida nao encontrada.', true);
    if (row.pago_em_fechamento) return toast('Batida ja fechada. Estorne o fechamento no desktop.', true);
    if (row.status === 'ESTORNADO') return toast('Ja estornada.', true);
    var res = await sb.from('ponto_diario').update({ status: 'ESTORNADO' }).eq('id', id);
    if (res.error) return toast(res.error.message, true);
    toast('Batida estornada.');
    mobObraCarregarPonto();
  }

  async function mobObraMedicao() {
    var body = document.getElementById('mob-med-body');
    if (!body) return;
    var funcs = await sb.from('equipe').select('*').eq('tipo', 'Empreita').eq('ativo', true).order('nome');
    if (funcs.error) { body.innerHTML = '<div class="text-red-600">' + A().esc(funcs.error.message) + '</div>'; return; }
    var lista = funcs.data || [];
    if (!lista.length) {
      body.innerHTML = '<p class="text-slate-400 text-center py-8">Nenhum empreiteiro ativo.</p>';
      return;
    }
    body.innerHTML = ''
      + '<div class="space-y-3">'
      +   '<div><label class="text-[10px] font-bold text-slate-400 uppercase">Empreiteiro</label>'
      +   '<select id="mob-med-func" class="w-full p-3 border rounded-xl bg-white font-bold" onchange="mobObraCarregarMedicao()">'
      +     lista.map(function (f) { return '<option value="' + f.id + '">' + A().esc(f.nome) + '</option>'; }).join('')
      +   '</select></div>'
      +   '<form onsubmit="mobObraLancarMedicao(event)" class="bg-white border rounded-xl p-3 space-y-2">'
      +     '<input type="hidden" id="mob-med-contrato" value="0">'
      +     '<input type="date" id="mob-med-data" required value="' + A().hojeISO() + '" class="w-full p-3 border rounded-xl">'
      +     '<input type="number" step="0.01" min="0" id="mob-med-pct" placeholder="% medido" oninput="mobObraMedSync(\'pct\')" class="w-full p-3 border rounded-xl">'
      +     '<input type="number" step="0.01" min="0" id="mob-med-valor" placeholder="Valor medido (R$)" oninput="mobObraMedSync(\'valor\')" class="w-full p-3 border rounded-xl">'
      +     '<p id="mob-med-hint" class="text-[10px] text-slate-500"></p>'
      +     '<input type="text" id="mob-med-desc" placeholder="Descricao" class="w-full p-3 border rounded-xl">'
      +     '<button class="w-full bg-emerald-600 text-white py-3 rounded-xl font-black">Lancar medicao</button>'
      +   '</form>'
      +   '<div id="mob-med-resumo" class="text-sm bg-white p-3 rounded-xl border"></div>'
      +   '<div id="mob-med-lista" class="flex flex-col gap-2 pb-8"></div>'
      + '</div>';
    mobObraCarregarMedicao();
    A().icons();
  }

  async function mobObraCarregarMedicao() {
    var funcId = Number(document.getElementById('mob-med-func').value);
    var func = (await sb.from('equipe').select('*').eq('id', funcId).single()).data;
    var med = await sb.from('medicoes_empreita').select('*').eq('equipe_id', funcId).order('data_medicao', { ascending: false });
    var rows = med.data || [];
    var vigentes = rows.filter(function (m) { return m.status !== 'ESTORNADO'; });
    var contrato = Number(func.valor_contrato || 0);
    var contratoEl = document.getElementById('mob-med-contrato');
    if (contratoEl) contratoEl.value = contrato;
    var pct = vigentes.reduce(function (s, m) { return s + Number(m.percentual || 0); }, 0);
    var valor = vigentes.reduce(function (s, m) { return s + Number(m.valor || 0); }, 0);
    var resumo = document.getElementById('mob-med-resumo');
    if (resumo) resumo.innerHTML = 'Contrato <b>' + A().money(contrato) + '</b> · Medido <b>' + pct.toFixed(2) + '%</b> (' + A().money(valor) + ')';
    var lista = document.getElementById('mob-med-lista');
    if (!lista) return;
    lista.innerHTML = rows.length ? rows.map(function (m) {
      var est = m.status === 'ESTORNADO';
      var acao = '';
      if (m.status === 'PENDENTE') acao = '<button onclick="mobObraEstornarMedicao(\'' + m.id + '\')" class="text-red-600 text-[10px] font-bold">Estornar</button>';
      return '<div class="bg-white border rounded-xl p-3 flex justify-between items-center' + (est ? ' opacity-50' : '') + '">'
        + '<div><p class="font-bold text-sm">' + A().dataBR(m.data_medicao) + ' · ' + Number(m.percentual).toFixed(2) + '%</p>'
        + '<p class="text-[11px] text-slate-500">' + A().money(m.valor) + ' · ' + A().esc(m.status) + '</p></div>'
        + acao + '</div>';
    }).join('') : '<p class="text-center text-slate-400 py-4">Sem medicoes.</p>';
  }

  function mobObraMedSync(src) {
    var contrato = Number((document.getElementById('mob-med-contrato') || {}).value) || 0;
    var pEl = document.getElementById('mob-med-pct');
    var vEl = document.getElementById('mob-med-valor');
    var hint = document.getElementById('mob-med-hint');
    if (!pEl || !vEl) return;
    if (src === 'pct') {
      var p = Number(pEl.value) || 0;
      vEl.value = (contrato > 0 && p > 0) ? (contrato * p / 100).toFixed(2) : '';
    } else {
      var v = Number(vEl.value) || 0;
      pEl.value = (contrato > 0 && v > 0) ? (v / contrato * 100).toFixed(2) : '';
    }
    if (hint) {
      var p2 = Number(pEl.value) || 0, v2 = Number(vEl.value) || 0;
      hint.textContent = (contrato > 0 && (p2 > 0 || v2 > 0)) ? (p2.toFixed(2) + '% = ' + A().money(v2)) : '';
    }
  }

  async function mobObraLancarMedicao(ev) {
    ev.preventDefault();
    var funcId = Number(document.getElementById('mob-med-func').value);
    var func = (await sb.from('equipe').select('*').eq('id', funcId).single()).data;
    var contrato = Number(func.valor_contrato || 0);
    var pct = Number(document.getElementById('mob-med-pct').value) || 0;
    var valor = Number(document.getElementById('mob-med-valor').value) || 0;
    if (pct <= 0 && valor <= 0) return toast('Informe o percentual ou o valor medido.', true);
    if (contrato <= 0) return toast('Defina o valor do contrato do empreiteiro.', true);
    if (pct <= 0) pct = (valor / contrato) * 100;
    if (valor <= 0) valor = (contrato * pct) / 100;
    var med = await sb.from('medicoes_empreita').select('percentual,status').eq('equipe_id', funcId);
    var ja = (med.data || []).filter(function (m) { return m.status !== 'ESTORNADO'; })
      .reduce(function (s, m) { return s + Number(m.percentual || 0); }, 0);
    if (ja + pct > 100.01) return toast('Percentual acumulado ultrapassa 100%.', true);
    var res = await sb.from('medicoes_empreita').insert([{
      equipe_id: funcId,
      obra_id: func.obra_atual_id || null,
      data_medicao: document.getElementById('mob-med-data').value,
      percentual: pct,
      valor: valor,
      descricao: document.getElementById('mob-med-desc').value.trim() || null,
      status: 'PENDENTE'
    }]);
    if (res.error) return toast(res.error.message, true);
    toast('Medicao lancada.');
    document.getElementById('mob-med-pct').value = '';
    document.getElementById('mob-med-valor').value = '';
    document.getElementById('mob-med-desc').value = '';
    mobObraCarregarMedicao();
  }

  async function mobObraEstornarMedicao(id) {
    var ok = await confirmar('Estornar esta medicao? Nao apaga o historico.');
    if (!ok) return;
    var m = (await sb.from('medicoes_empreita').select('*').eq('id', id).single()).data;
    if (!m || m.status === 'ESTORNADO') return;
    if (m.status === 'PAGO' && m.fechamento_uid) {
      return toast('Medicao paga. Estorne no desktop para reabrir a cadeia financeira.', true);
    }
    var upd = await sb.from('medicoes_empreita').update({ status: 'ESTORNADO' }).eq('id', id);
    if (upd.error) return toast(upd.error.message, true);
    toast('Medicao estornada.');
    mobObraCarregarMedicao();
  }

  // ---------- Metros (Metragem) ----------
  async function mobObraMetros() {
    var body = document.getElementById('mob-metros-body');
    if (!body) return;
    var terc = await sb.from('terceirizados').select('*').eq('ativo', true).order('nome');
    if (terc.error) { body.innerHTML = '<div class="text-red-600">' + A().esc(terc.error.message) + '</div>'; return; }
    var lista = terc.data || [];
    if (!lista.length) {
      body.innerHTML = '<p class="text-slate-400 text-center py-8">Nenhum colaborador de metragem ativo.</p>';
      return;
    }
    body.innerHTML = ''
      + '<div class="space-y-3">'
      +   '<div><label class="text-[10px] font-bold text-slate-400 uppercase">Metragem</label>'
      +   '<select id="mob-metros-terc" class="w-full p-3 border rounded-xl bg-white font-bold" onchange="mobObraCarregarMetros()">'
      +     lista.map(function (t) { return '<option value="' + A().esc(t.id) + '">' + A().esc(t.nome) + '</option>'; }).join('')
      +   '</select></div>'
      +   '<form onsubmit="mobObraLancarMetros(event)" class="bg-white border rounded-xl p-3 space-y-2">'
      +     '<input type="date" id="mob-metros-data" required value="' + A().hojeISO() + '" class="w-full p-3 border rounded-xl">'
      +     '<input type="number" step="0.01" min="0" id="mob-metros-qtd" required placeholder="Metros" class="w-full p-3 border rounded-xl">'
      +     '<input type="text" id="mob-metros-desc" placeholder="Justificativa" class="w-full p-3 border rounded-xl">'
      +     '<button class="w-full bg-emerald-600 text-white py-3 rounded-xl font-black">Lancar metros</button>'
      +   '</form>'
      +   '<div id="mob-metros-resumo" class="text-sm bg-white p-3 rounded-xl border"></div>'
      +   '<button onclick="mobObraValeDosMetros()" class="w-full bg-rose-700 text-white py-3 rounded-xl font-bold">Lancar vale / adiantamento</button>'
      +   '<button id="mob-metros-pagar" onclick="mobObraFecharMetros()" class="hidden w-full bg-blue-700 text-white py-3 rounded-xl font-black">Fechar pendente</button>'
      +   '<div id="mob-metros-lista" class="flex flex-col gap-2 pb-8"></div>'
      + '</div>';
    mobObraCarregarMetros();
    A().icons();
  }

  async function mobObraCarregarMetros() {
    var sel = document.getElementById('mob-metros-terc');
    if (!sel) return;
    var tercId = sel.value;
    if (!tercId) return;
    var t = (await sb.from('terceirizados').select('*').eq('id', tercId).single()).data || {};
    var prod = await sb.from('producao_terc').select('*').eq('terceirizado_id', tercId).order('data_registro', { ascending: false });
    var rows = prod.data || [];
    var pendentes = rows.filter(function (p) { return p.status !== 'PAGO' && p.status !== 'ESTORNADO'; });
    var metrosPend = pendentes.reduce(function (s, p) { return s + Number(p.metros || 0); }, 0);
    var valorPend = metrosPend * Number(t.valor_metro || 0);
    var vales = await A().valesAbertos('terceirizado', tercId);
    var valesSum = (A().somaVales ? A().somaVales(vales) : 0);
    var liquido = Math.max(0, valorPend - valesSum);
    var resumo = document.getElementById('mob-metros-resumo');
    if (resumo) resumo.innerHTML = 'Valor/m <b>' + A().money(t.valor_metro) + '</b> · Pendente <b>' + metrosPend.toFixed(2) + ' m</b> = <b>' + A().money(valorPend) + '</b>'
      + (valesSum > 0 ? ' · Vales <b class="text-rose-600">' + A().money(valesSum) + '</b> · Liquido <b>' + A().money(liquido) + '</b>' : '');
    var btn = document.getElementById('mob-metros-pagar');
    if (btn) {
      btn.classList.toggle('hidden', valorPend <= 0);
      btn.textContent = 'Fechar pendente (' + A().money(liquido) + ')';
    }
    var lista = document.getElementById('mob-metros-lista');
    if (!lista) return;
    lista.innerHTML = rows.length ? rows.slice(0, 60).map(function (p) {
      var est = p.status === 'ESTORNADO';
      var acao = '';
      if (p.status === 'PENDENTE') acao = '<button onclick="mobObraEstornarMetros(\'' + p.id + '\')" class="text-red-600 text-[10px] font-bold">Estornar</button>';
      else if (p.status === 'PAGO' && p.fechamento_uid) acao = '<button onclick="mobObraEstornarPagamentoMetros(\'' + p.fechamento_uid + '\')" class="text-red-600 text-[10px] font-bold">Estornar pgto</button>';
      return '<div class="bg-white border rounded-xl p-3 flex justify-between items-center' + (est ? ' opacity-50' : '') + '">'
        + '<div><p class="font-bold text-sm">' + A().dataBR(p.data_registro) + ' · ' + Number(p.metros || 0).toFixed(2) + ' m</p>'
        + '<p class="text-[11px] text-slate-500">' + A().money(Number(p.metros || 0) * Number(t.valor_metro || 0)) + ' · ' + A().esc(p.status) + '</p></div>'
        + acao + '</div>';
    }).join('') : '<p class="text-center text-slate-400 py-4">Sem lancamentos.</p>';
  }

  async function mobObraLancarMetros(ev) {
    ev.preventDefault();
    var sel = document.getElementById('mob-metros-terc');
    var tercId = sel ? sel.value : '';
    var metros = Number(document.getElementById('mob-metros-qtd').value) || 0;
    if (!tercId) return toast('Selecione o terceirizado.', true);
    if (metros <= 0) return toast('Informe os metros.', true);
    var t = (await sb.from('terceirizados').select('obra_atual_id').eq('id', tercId).single()).data || {};
    var res = await sb.from('producao_terc').insert([{
      terceirizado_id: tercId,
      obra_id: t.obra_atual_id || null,
      data_registro: document.getElementById('mob-metros-data').value,
      metros: metros,
      status: 'PENDENTE',
      observacao: document.getElementById('mob-metros-desc').value.trim() || 'Lancamento mobile'
    }]);
    if (res.error) return toast(res.error.message, true);
    toast('Metros lancados.');
    document.getElementById('mob-metros-qtd').value = '';
    document.getElementById('mob-metros-desc').value = '';
    mobObraCarregarMetros();
  }

  async function mobObraFecharMetros() {
    var sel = document.getElementById('mob-metros-terc');
    var tercId = sel ? sel.value : '';
    if (!tercId) return;
    var ok = await confirmar('Fechar producao pendente? Gera despesa e log no financeiro.');
    if (!ok) return;
    var t = (await sb.from('terceirizados').select('*').eq('id', tercId).single()).data || {};
    var prod = await sb.from('producao_terc').select('*').eq('terceirizado_id', tercId).eq('status', 'PENDENTE');
    var rows = prod.data || [];
    var metros = rows.reduce(function (s, p) { return s + Number(p.metros || 0); }, 0);
    var bruto = metros * Number(t.valor_metro || 0);
    if (bruto <= 0) return toast('Nada pendente.', true);
    var sim = A().simularAbatimentos(await A().valesAbertos('terceirizado', tercId), bruto);
    var obraId = (A().obraMaisFrequente && A().obraMaisFrequente(rows)) || t.obra_atual_id || null;
    try {
      var obs = 'Producao ' + metros.toFixed(2) + ' m - ' + t.nome;
      if (sim.total > 0) obs += ' | Bruto ' + A().money(bruto) + ' - vales ' + A().money(sim.total) + ' = ' + A().money(sim.liquido);
      var chain = await A().insertDespesaComLog({
        item: 'TERCEIRIZADO',
        fornecedor: t.nome,
        custo: sim.liquido,
        observacao: obs,
        status: 'PENDENTE',
        obra_id: obraId,
        categoria: 'terceirizado'
      });
      var ids = rows.map(function (p) { return p.id; });
      var upd = await sb.from('producao_terc').update({
        status: 'PAGO',
        fechamento_uid: chain.despesa.uid,
        despesa_uid: chain.despesa.uid
      }).in('id', ids);
      if (upd.error) {
        await A().estornarDespesaPorUid(chain.despesa.uid);
        return toast('Pagamento desfeito: falha ao vincular producao. ' + upd.error.message, true);
      }
      if (sim.itens.length) {
        try { await A().registrarAbatimentosVale(chain.despesa.uid, sim.itens); }
        catch (ve) { toast('Fechado, mas falhou ao abater os vales: ' + (ve.message || ve), true); }
      }
      toast('Producao paga. Despesa e log gerados.');
      mobObraCarregarMetros();
    } catch (e) {
      toast(e.message || e, true);
    }
  }

  async function mobObraEstornarMetros(id) {
    var ok = await confirmar('Estornar este lancamento de metros? Nao apaga.');
    if (!ok) return;
    var row = (await sb.from('producao_terc').select('*').eq('id', id).single()).data;
    if (!row || row.status !== 'PENDENTE') return toast('So lancamento pendente pode ser estornado aqui.', true);
    var res = await sb.from('producao_terc').update({ status: 'ESTORNADO' }).eq('id', id);
    if (res.error) return toast(res.error.message, true);
    toast('Lancamento estornado.');
    mobObraCarregarMetros();
  }

  async function mobObraEstornarPagamentoMetros(uid) {
    var ok = await confirmar('Estornar este pagamento? Metros voltam a pendente. Despesa/log ficam ESTORNADO.');
    if (!ok) return;
    try {
      await A().estornarDespesaPorUid(uid);
      var upd = await sb.from('producao_terc').update({
        status: 'PENDENTE',
        fechamento_uid: null,
        despesa_uid: null
      }).eq('fechamento_uid', uid).eq('status', 'PAGO');
      if (upd.error) throw upd.error;
      await A().reverterAbatimentosVale(uid);
      toast('Pagamento estornado. Metros reabertos.');
      mobObraCarregarMetros();
    } catch (e) {
      toast(e.message || e, true);
    }
  }

  // ---------- Vales / adiantamentos ----------
  function mobObraValeFechar() {
    var m = document.getElementById('mob-vale-modal');
    if (m) m.remove();
  }

  async function mobObraValeAbrir(pessoaTipo, id, nome) {
    if (!id) return toast('Selecione o colaborador.', true);
    mobObraValeFechar();
    var abertos = [];
    try { abertos = await A().valesAbertos(pessoaTipo, id); } catch (e) { abertos = []; }
    var totalAberto = A().somaVales ? A().somaVales(abertos) : 0;
    var listaHtml = abertos.length ? abertos.map(function (v) {
      return '<div class="flex justify-between items-center border-b py-1.5">'
        + '<div><p class="text-xs font-bold text-slate-700">' + A().dataBR(v.data) + '</p>'
        + '<p class="text-[10px] text-slate-400">' + A().esc(v.observacao || 'Vale / Adiantamento') + '</p></div>'
        + '<div class="text-right"><p class="text-sm font-black text-rose-700">' + A().money(v.valor_aberto != null ? v.valor_aberto : v.valor) + '</p>'
        + '<button onclick="mobObraValeEstornar(\'' + v.id + '\')" class="text-red-600 text-[10px] font-bold">Estornar</button></div>'
        + '</div>';
    }).join('') : '<p class="text-center text-slate-400 text-xs py-3">Nenhum vale em aberto.</p>';
    var m = document.createElement('div');
    m.id = 'mob-vale-modal';
    m.className = 'fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-3 no-print';
    m.innerHTML = ''
      + '<div class="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">'
      +   '<div class="bg-rose-700 p-4 text-white flex justify-between items-center shrink-0">'
      +     '<h3 class="font-black">Vale / Adiantamento</h3>'
      +     '<button onclick="mobObraValeFechar()" class="text-white text-2xl leading-none">&times;</button></div>'
      +   '<div class="p-4 space-y-3 overflow-y-auto">'
      +     '<div class="text-xs text-slate-500">' + A().esc(nome || '') + ' · Em aberto: <b class="text-rose-700">' + A().money(totalAberto) + '</b></div>'
      +     '<input id="mob-vale-valor" type="number" step="0.01" min="0.01" placeholder="Valor (R$)" class="w-full p-3 border rounded-xl">'
      +     '<input id="mob-vale-data" type="date" value="' + A().hojeISO() + '" class="w-full p-3 border rounded-xl">'
      +     '<input id="mob-vale-obs" type="text" placeholder="Observacao" class="w-full p-3 border rounded-xl">'
      +     '<p class="text-[11px] text-slate-500">Vira despesa PENDENTE e sera abatido no fechamento.</p>'
      +     '<button onclick="mobObraValeSalvar(\'' + pessoaTipo + '\',\'' + A().esc(String(id)) + '\')" class="w-full bg-rose-700 text-white py-3 rounded-xl font-black">Lancar vale</button>'
      +     '<div class="pt-1"><p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Vales em aberto</p>' + listaHtml + '</div>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(m);
    A().icons();
  }

  async function mobObraValeEstornar(id) {
    var ok = await confirmar('Estornar este vale? A despesa sera cancelada no financeiro.');
    if (!ok) return;
    try {
      await A().estornarVale(id);
      toast('Vale estornado.');
      mobObraValeFechar();
      if (document.getElementById('mob-ponto-func')) mobObraCarregarPonto();
      if (document.getElementById('mob-metros-terc')) mobObraCarregarMetros();
    } catch (e) { toast(e.message || e, true); }
  }

  async function mobObraValeSalvar(pessoaTipo, id) {
    var valor = Number((document.getElementById('mob-vale-valor') || {}).value) || 0;
    var data = (document.getElementById('mob-vale-data') || {}).value || A().hojeISO();
    var obs = (document.getElementById('mob-vale-obs') || {}).value || '';
    if (!(valor > 0)) return toast('Informe o valor do vale.', true);
    var nome = '', obraId = null;
    if (pessoaTipo === 'terceirizado') {
      var t = (await sb.from('terceirizados').select('nome,obra_atual_id').eq('id', id).single()).data || {};
      nome = t.nome || ''; obraId = t.obra_atual_id || null;
    } else {
      var f = (await sb.from('equipe').select('nome,obra_atual_id').eq('id', id).single()).data || {};
      nome = f.nome || ''; obraId = f.obra_atual_id || null;
    }
    var ok = await confirmar('Lancar vale de ' + A().money(valor) + ' para ' + nome + '?');
    if (!ok) return;
    try {
      await A().criarVale({
        pessoa_tipo: pessoaTipo,
        equipe_id: pessoaTipo === 'equipe' ? id : null,
        terceirizado_id: pessoaTipo === 'terceirizado' ? id : null,
        nome: nome, valor: valor, data: data, observacao: obs, obra_id: obraId
      });
      toast('Vale lancado.');
      mobObraValeFechar();
      if (pessoaTipo === 'terceirizado') mobObraCarregarMetros();
      else mobObraCarregarPonto();
    } catch (e) { toast(e.message || e, true); }
  }

  function mobObraValeDoPonto() {
    var sel = document.getElementById('mob-ponto-func');
    if (!sel) return;
    var nome = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
    mobObraValeAbrir('equipe', sel.value, nome);
  }

  function mobObraValeDosMetros() {
    var sel = document.getElementById('mob-metros-terc');
    if (!sel) return;
    var nome = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
    mobObraValeAbrir('terceirizado', sel.value, nome);
  }

  window.mobObraPonto = mobObraPonto;
  window.mobObraCarregarPonto = mobObraCarregarPonto;
  window.mobObraBater = mobObraBater;
  window.mobObraAjuste = mobObraAjuste;
  window.mobObraMedicao = mobObraMedicao;
  window.mobObraCarregarMedicao = mobObraCarregarMedicao;
  window.mobObraLancarMedicao = mobObraLancarMedicao;
  window.mobObraMedSync = mobObraMedSync;
  window.mobObraEstornarBatida = mobObraEstornarBatida;
  window.mobObraEstornarMedicao = mobObraEstornarMedicao;
  window.mobObraMetros = mobObraMetros;
  window.mobObraCarregarMetros = mobObraCarregarMetros;
  window.mobObraLancarMetros = mobObraLancarMetros;
  window.mobObraFecharMetros = mobObraFecharMetros;
  window.mobObraEstornarMetros = mobObraEstornarMetros;
  window.mobObraEstornarPagamentoMetros = mobObraEstornarPagamentoMetros;
  window.mobObraValeFechar = mobObraValeFechar;
  window.mobObraValeSalvar = mobObraValeSalvar;
  window.mobObraValeEstornar = mobObraValeEstornar;
  window.mobObraValeDoPonto = mobObraValeDoPonto;
  window.mobObraValeDosMetros = mobObraValeDosMetros;
})();
