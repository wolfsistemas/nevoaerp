// equipe.js – Gestão de Equipe (v3.0 – correções e melhorias)
(function () {
  'use strict';

  let subAbaAtiva = 'lancamentos'; // 'lancamentos' | 'cadastro'

  // Aguarda carregamento do sistema principal
  window.addEventListener('load', function () {
    const originalNavigate = window.navigate;
    window.navigate = function (viewId) {
      originalNavigate(viewId);
      if (viewId === 'equipe') renderEquipe();
    };
  });

  // Garantia de funções disponíveis
  function safeCall(fn) {
    if (typeof fn === 'function') fn();
  }

  // ========== RENDERIZAÇÃO PRINCIPAL ==========
 function renderEquipe() {
  const container = document.getElementById('view-equipe');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-4 p-4">
      <!-- Sub-abas -->
      <div class="flex bg-white rounded-xl shadow-sm border p-1 gap-1 w-fit">
        <button id="eq-tab-lancamentos" onclick="alternarSubAbaEquipe('lancamentos')"
          class="px-5 py-2.5 rounded-lg text-sm font-bold transition-all
          ${subAbaAtiva === 'lancamentos' ? 'bg-emerald-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'}">
          <i data-lucide="file-text" class="inline w-4 h-4 mr-1"></i> Lançamentos
        </button>
        <button id="eq-tab-cadastro" onclick="alternarSubAbaEquipe('cadastro')"
          class="px-5 py-2.5 rounded-lg text-sm font-bold transition-all
          ${subAbaAtiva === 'cadastro' ? 'bg-emerald-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'}">
          <i data-lucide="users" class="inline w-4 h-4 mr-1"></i> Cadastro
        </button>
      </div>

      <!-- Container das sub-abas -->
      <div id="eq-aba-lancamentos" class="${subAbaAtiva === 'lancamentos' ? '' : 'hidden'}">
        ${getLancamentosHTML()}
      </div>
      <div id="eq-aba-cadastro" class="${subAbaAtiva === 'cadastro' ? '' : 'hidden'}">
        ${getCadastroHTML()}
      </div>
    </div>
  `;

  // 👇 NOVO: Define o mês anterior no filtro, se estiver na aba Lançamentos
  if (subAbaAtiva === 'lancamentos') {
    const inputMes = document.getElementById('eq-filtro-mes');
    if (inputMes && !inputMes.value) {   // só define se ainda estiver vazio
      const dataAtual = new Date();
      dataAtual.setMonth(dataAtual.getMonth() - 1);
      const mesAnterior = dataAtual.toISOString().slice(0, 7);
      inputMes.value = mesAnterior;
    }
    safeCall(carregarLancamentos);
  } else {
    safeCall(carregarCadastro);
  }

  lucide.createIcons();
  window.alternarSubAbaEquipe = alternarSubAbaEquipe;
}

  // ========== HTML DAS SUB-ABAS ==========
  function getLancamentosHTML() {
    return `
      <div class="space-y-6">
        <!-- Cabeçalho -->
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-bold text-slate-800 flex gap-2 items-center">
            <i data-lucide="file-text" class="text-emerald-600"></i> Folhas de Pagamento
          </h2>
          <div class="flex gap-2">
            <button onclick="abrirModalVale()" class="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow flex items-center gap-2">
              <i data-lucide="minus-circle" class="w-4 h-4"></i> Lançar Vale
            </button>
            <button onclick="abrirModalCriarFolha()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow flex items-center gap-2">
              <i data-lucide="plus-circle" class="w-4 h-4"></i> Criar Folha
            </button>
            <button onclick="imprimirFolhaGeral()" class="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm shadow flex items-center gap-2">
              <i data-lucide="printer" class="w-4 h-4"></i> Imprimir Folha
            </button>
          </div>
        </div>

        <!-- Filtro de mês -->
        <div class="flex items-center gap-3 bg-white p-3 rounded-xl border shadow-sm">
          <label class="text-xs font-bold text-slate-600">Mês Referência:</label>
          <input type="month" id="eq-filtro-mes" class="p-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-600 outline-none" />
          <button onclick="carregarLancamentos()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow">Filtrar</button>
          <button onclick="document.getElementById('eq-filtro-mes').value=''; carregarLancamentos()" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold">Limpar</button>
          <button onclick="refresh()" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-3 rounded-lg text-sm font-bold" title="Atualizar Lista"><i data-lucide="list-restart" class="w-4 h-4"></i></button>          
        </div>

        <!-- Tabela de folhas -->
        <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead class="bg-slate-800 text-white">
                <tr>
                  <th class="p-3">Funcionário</th>
                  <th class="p-3">Tipo</th>
                  <th class="p-3">Mês Ref.</th>
                  <th class="p-3 text-center">Base</th>
                  <th class="p-3 text-center">Vales</th>
                  <th class="p-3 text-center">Líquido</th>
                  <th class="p-3 text-center">Status</th>
                  <th class="p-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody id="eq-lista-folhas" class="divide-y"></tbody>
            </table>
          </div>
        </div>

        <!-- Vales lançados -->
        <div class="bg-white rounded-xl border shadow-sm overflow-hidden mt-4">
          <div class="p-3 bg-slate-50 border-b flex justify-between items-center">
            <h3 class="font-bold text-slate-700 text-sm"><i data-lucide="minus-circle" class="w-4 h-4 inline mr-1 text-amber-600"></i> Vales Lançados</h3>
            <button onclick="imprimirValesGeral()" class="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow flex items-center gap-1">
              <i data-lucide="printer" class="w-3.5 h-3.5"></i> Imprimir Vales do Mês
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead class="bg-slate-100 text-slate-700">
                <tr>
                  <th class="p-3">Funcionário</th>
                  <th class="p-3">Mês Ref.</th>
                  <th class="p-3 text-right">Valor</th>
                  <th class="p-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody id="eq-lista-vales" class="divide-y"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function getCadastroHTML() {
    return `
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-bold text-slate-800 flex gap-2 items-center">
            <i data-lucide="users" class="text-emerald-600"></i> Equipe
          </h2>
          <button onclick="abrirModalFuncionario()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow flex items-center gap-2">
            <i data-lucide="user-plus" class="w-4 h-4"></i> Cadastrar Novo
          </button>
        </div>

        <div class="flex items-center gap-3 bg-white p-3 rounded-xl border shadow-sm">
          <label class="text-xs font-bold text-slate-600">Tipo:</label>
          <select id="eq-filtro-tipo" class="p-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-600 outline-none" onchange="carregarCadastro()">
            <option value="">Todos</option>
            <option value="Mensal">Fixo Mensal</option>
            <option value="Diarista">Diarista</option>
          </select>
        </div>

        <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead class="bg-slate-800 text-white">
                <tr>
                  <th class="p-3">Nome</th>
                  <th class="p-3">Tipo</th>
                  <th class="p-3 text-center">Valor Mensal</th>
                  <th class="p-3 text-center">Valor Diária</th>
                  <th class="p-3">Chave PIX</th>
                  <th class="p-3 text-center">Status</th>
                  <th class="p-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody id="eq-lista-funcionarios" class="divide-y"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ========== MODAL CRIAR FOLHA ==========
  function abrirModalCriarFolha() {
    const mesRef = document.getElementById('eq-filtro-mes')?.value || new Date().toISOString().slice(0,7);
    carregarEquipeParaFolha(mesRef);
  }

  async function carregarEquipeParaFolha(mesRef) {
    showLoading(true);
    const { data: equipe } = await sb.from('equipe').select('*').eq('ativo', true);
    const { data: vales } = await sb.from('vales').select('*').eq('mes_referencia', mesRef);
    const { data: folhasExistentes } = await sb.from('folhas').select('equipe_id').eq('mes_referencia', mesRef);
    const valesMap = {};
    (vales||[]).forEach(v => { valesMap[v.equipe_id] = (valesMap[v.equipe_id]||0) + v.valor; });
    const jaLancados = new Set((folhasExistentes||[]).map(f => f.equipe_id));

    let html = `
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" id="modal-folha">
        <div class="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[85vh]">
          <div class="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
            <h3 class="font-bold text-lg text-slate-800"><i data-lucide="file-plus" class="inline w-5 h-5 text-emerald-600 mr-1"></i> Criar Folha – ${mesRef}</h3>
            <button onclick="document.getElementById('modal-folha').remove()" class="text-slate-400 hover:text-red-500"><i data-lucide="x"></i></button>
          </div>
          <div class="p-4 overflow-y-auto flex-1">
            <table class="w-full text-sm">
              <thead class="bg-slate-100 text-slate-700">
                <tr>
                  <th class="p-2 text-left">Funcionário</th>
                  <th class="p-2 text-center">Tipo</th>
                  <th class="p-2 text-center">Salário Base</th>
                  <th class="p-2 text-center">Vales</th>
                  <th class="p-2 text-center">Dias Trab.</th>
                  <th class="p-2 text-center">Valor Líquido (editável)</th>
                </tr>
              </thead>
              <tbody>`;
    let algumBloqueado = false;
    equipe.forEach(f => {
      const valeFuncionario = valesMap[f.id] || 0;
      const bloqueado = jaLancados.has(f.id);
      if (bloqueado) algumBloqueado = true;
      const base = f.tipo === 'Mensal' ? (f.valor_mensal || 0) : 0; // diarista começa em 0 dia até informar dias trabalhados
      const liquido = base - valeFuncionario;
      html += `
        <tr class="border-b ${bloqueado ? 'opacity-50 bg-slate-50' : ''}" data-id="${f.id}" data-diaria="${f.valor_diaria || 0}" data-vales="${valeFuncionario}" data-bloqueado="${bloqueado ? '1' : '0'}">
          <td class="p-2 font-bold">${f.nome}${bloqueado ? '<span class="ml-2 text-[10px] font-bold text-amber-600 uppercase">Já lançada</span>' : ''}</td>
          <td class="p-2 text-center">${f.tipo}</td>
          <td class="p-2 text-center">${formatMoney(base)}</td>
          <td class="p-2 text-center text-red-600">-${formatMoney(valeFuncionario)}</td>
          <td class="p-2 text-center">
            ${f.tipo === 'Diarista' ? `<input type="number" id="dias-${f.id}" value="0" min="0" ${bloqueado ? 'disabled' : ''} class="w-16 p-1 border rounded text-center text-sm disabled:bg-slate-100" onchange="recalcularFolhaItem('${f.id}')">` : '–'}
          </td>
          <td class="p-2 text-center">
            <input type="number" id="liquido-${f.id}" value="${liquido.toFixed(2)}" step="0.01" ${bloqueado ? 'disabled' : ''} class="w-24 p-1 border rounded text-center font-bold text-sm disabled:bg-slate-100 ${liquido < 0 ? 'text-red-600' : 'text-emerald-700'}" />
          </td>
        </tr>`;
    });
    html += `</tbody></table>
          ${algumBloqueado ? `<p class="text-xs text-amber-600 font-bold mt-2"><i data-lucide="alert-triangle" class="w-3 h-3 inline"></i> Funcionários marcados como "Já lançada" já possuem folha neste mês e não serão duplicados. Exclua a folha existente em Lançamentos caso queira recriá-la.</p>` : ''}
          </div>
          <div class="p-4 border-t bg-slate-50 rounded-b-2xl flex gap-2">
            <button onclick="document.getElementById('modal-folha').remove()" class="flex-1 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg font-bold text-slate-700">Cancelar</button>
            <button onclick="salvarFolha('${mesRef}')" class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow">Salvar Folha</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    lucide.createIcons();
    showLoading(false);
  }

  window.recalcularFolhaItem = function(id) {
    const row = document.querySelector(`#modal-folha tr[data-id="${id}"]`);
    if (!row) return;
    const dias = parseFloat(document.getElementById(`dias-${id}`)?.value) || 0;
    const valDiaria = parseFloat(row.dataset.diaria) || 0;
    const vales = parseFloat(row.dataset.vales) || 0;
    const base = dias * valDiaria;
    const liquido = base - vales;
    const inputLiq = document.getElementById(`liquido-${id}`);
    if (inputLiq) {
      inputLiq.value = liquido.toFixed(2);
      inputLiq.classList.toggle('text-red-600', liquido < 0);
      inputLiq.classList.toggle('text-emerald-700', liquido >= 0);
    }
  };

  async function salvarFolha(mesRef) {
    showLoading(true);
    const { data: equipe } = await sb.from('equipe').select('*').eq('ativo', true);
    const { data: vales } = await sb.from('vales').select('*').eq('mes_referencia', mesRef);
    const valesMap = {};
    (vales||[]).forEach(v => { valesMap[v.equipe_id] = (valesMap[v.equipe_id]||0) + v.valor; });

    const folhas = [];
    equipe.forEach(f => {
      const row = document.querySelector(`#modal-folha tr[data-id="${f.id}"]`);
      if (row && row.dataset.bloqueado === '1') return; // já possui folha neste mês, não duplicar
      const valesTotal = valesMap[f.id] || 0;
      const liquidoEl = document.getElementById(`liquido-${f.id}`);
      if (!liquidoEl) return;
      const valorPago = parseFloat(liquidoEl.value) || 0;
      let dias = 0;
      if (f.tipo === 'Diarista') {
        dias = parseInt(document.getElementById(`dias-${f.id}`)?.value) || 0;
      }
      const base = f.tipo === 'Mensal' ? (f.valor_mensal || 0) : (f.valor_diaria || 0) * dias;
      folhas.push({
        equipe_id: f.id,
        mes_referencia: mesRef,
        tipo: f.tipo,
        salario_base: base,
        vales_total: valesTotal,
        valor_pago: valorPago,
        status: 'PENDENTE',
        dias_trabalhados: dias,
        chave_pix: f.chave_pix,
        data_criacao: new Date().toISOString()
      });
    });

    if (folhas.length === 0) {
      showLoading(false);
      alert('Nenhuma folha nova para salvar (todos os funcionários já possuem folha neste mês).');
      return;
    }

    const { error } = await sb.from('folhas').insert(folhas);
    if (error) { showLoading(false); alert('Erro ao salvar folha: ' + error.message); return; }

    document.getElementById('modal-folha')?.remove();
    showLoading(false);
    alert('Folha criada com sucesso!');
    carregarLancamentos();
  }

  // ========== MODAL VALE ==========
  async function abrirModalVale() {
    const mesRef = document.getElementById('eq-filtro-mes')?.value || new Date().toISOString().slice(0,7);
    const { data: equipe } = await sb.from('equipe').select('*').eq('ativo', true);
    let options = equipe.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');

    const html = `
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" id="modal-vale">
        <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl">
          <div class="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
            <h3 class="font-bold text-lg"><i data-lucide="minus-circle" class="inline w-5 h-5 text-amber-600 mr-1"></i>Lançar Vale</h3>
            <button onclick="document.getElementById('modal-vale').remove()" class="text-slate-400 hover:text-red-500"><i data-lucide="x"></i></button>
          </div>
          <div class="p-4 space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Funcionário</label>
              <select id="vale-funcionario" class="w-full p-2 border rounded-lg text-sm">${options}</select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Valor (R$)</label>
              <input type="number" id="vale-valor" step="0.01" class="w-full p-2 border rounded-lg text-sm font-bold text-red-600" placeholder="0.00">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Mês Referência</label>
              <input type="month" id="vale-mes" value="${mesRef}" class="w-full p-2 border rounded-lg text-sm">
            </div>
          </div>
          <div class="p-4 border-t bg-slate-50 flex gap-2 rounded-b-2xl">
            <button onclick="document.getElementById('modal-vale').remove()" class="flex-1 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg font-bold">Cancelar</button>
            <button onclick="salvarVale()" class="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow">Salvar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    lucide.createIcons();
  }

  async function salvarVale() {
    const funcId = document.getElementById('vale-funcionario')?.value;
    const valor = parseFloat(document.getElementById('vale-valor')?.value);
    const mes = document.getElementById('vale-mes')?.value;
    if (!funcId || isNaN(valor) || valor <= 0 || !mes) return alert('Preencha todos os campos corretamente.');

    const { error } = await sb.from('vales').insert([{
      equipe_id: funcId,
      valor,
      mes_referencia: mes,
      data: new Date().toISOString()
    }]);
    if (error) return alert('Erro: ' + error.message);

    // Se já existir uma folha PENDENTE deste funcionário nesse mês, atualiza o total de vales
    // e o líquido dela automaticamente, para que o recibo/folha final sempre reflita o vale lançado.
    await sincronizarFolhaComVale(funcId, mes, valor);

    document.getElementById('modal-vale')?.remove();
    alert('Vale lançado!');
    carregarLancamentos();
  }

  // Ajusta (delta) o vales_total e o valor_pago de folhas PENDENTES do funcionário/mês,
  // sem sobrescrever eventuais ajustes manuais feitos no valor líquido.
  async function sincronizarFolhaComVale(equipeId, mesRef, delta) {
    const { data: folhasPendentes, error } = await sb.from('folhas')
      .select('id, vales_total, valor_pago')
      .eq('equipe_id', equipeId)
      .eq('mes_referencia', mesRef)
      .eq('status', 'PENDENTE');

    if (error || !folhasPendentes || folhasPendentes.length === 0) return;

    for (const folha of folhasPendentes) {
      const novoValesTotal = (parseFloat(folha.vales_total) || 0) + delta;
      const novoValorPago = (parseFloat(folha.valor_pago) || 0) - delta;
      await sb.from('folhas').update({
        vales_total: novoValesTotal,
        valor_pago: novoValorPago
      }).eq('id', folha.id);
    }
  }

  // ========== LISTAGEM DE FOLHAS ==========
  async function carregarLancamentos() {
    const mesFiltro = document.getElementById('eq-filtro-mes')?.value;
    let query = sb.from('folhas').select('*, equipe(*)').order('mes_referencia', { ascending: false });
    if (mesFiltro) query = query.eq('mes_referencia', mesFiltro);

    const { data: folhas, error } = await query;
    if (error) return alert('Erro ao carregar folhas.');

    const tbody = document.getElementById('eq-lista-folhas');
    if (!folhas || folhas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">Nenhuma folha encontrada.</td></tr>';
    } else {
      tbody.innerHTML = folhas.map(f => `
        <tr class="border-b hover:bg-slate-50">
          <td class="p-3 font-bold">${f.equipe?.nome || '–'}</td>
          <td class="p-3">${f.tipo}</td>
          <td class="p-3">${f.mes_referencia}</td>
          <td class="p-3 text-center">${formatMoney(f.salario_base)}</td>
          <td class="p-3 text-center text-red-600">-${formatMoney(f.vales_total)}</td>
          <td class="p-3 text-center font-bold text-emerald-700">${formatMoney(f.valor_pago)}</td>
          <td class="p-3 text-center">
            <span class="px-2 py-1 rounded text-xs font-bold ${f.status === 'PAGO' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">${f.status}</span>
          </td>
          <td class="p-3 text-center flex gap-2 justify-center">
            <button onclick="imprimirFolha('${f.id}')" class="text-slate-600 hover:text-emerald-600 bg-white border p-1.5 rounded shadow-sm" title="Imprimir Recibo"><i data-lucide="printer" class="w-4 h-4"></i></button>
            ${f.status === 'PENDENTE' ? `<button onclick="baixarFolha('${f.id}')" class="text-green-600 hover:text-green-800 bg-white border p-1.5 rounded shadow-sm" title="Pagar"><i data-lucide="check-circle" class="w-4 h-4"></i></button>` : ''}
            <button onclick="excluirFolha('${f.id}')" class="text-red-500 hover:text-red-700 bg-white border p-1.5 rounded shadow-sm" title="Excluir/Estornar"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </td>
        </tr>
      `).join('');
    }

    // Carregar vales (nova lista)
    let queryVales = sb.from('vales').select('*, equipe(nome)').order('data', { ascending: false });
    if (mesFiltro) queryVales = queryVales.eq('mes_referencia', mesFiltro);
    const { data: vales, error: errVales } = await queryVales;
    if (errVales) return alert('Erro ao carregar vales.');
    preencherTabelaVales(vales || []);

    lucide.createIcons();
  }

  function preencherTabelaVales(vales) {
    const tbody = document.getElementById('eq-lista-vales');
    if (!vales.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Nenhum vale lançado.</td></tr>';
      return;
    }
    tbody.innerHTML = vales.map(v => `
      <tr class="border-b hover:bg-slate-50">
        <td class="p-3 font-medium">${v.equipe?.nome || '–'}</td>
        <td class="p-3">${v.mes_referencia}</td>
        <td class="p-3 text-right font-bold text-red-600">${formatMoney(v.valor)}</td>
        <td class="p-3 text-center flex gap-2 justify-center">
          <button onclick="imprimirReciboVale('${v.id}')" class="text-slate-600 hover:text-emerald-600 bg-white border p-1.5 rounded shadow-sm" title="Imprimir Recibo"><i data-lucide="printer" class="w-4 h-4"></i></button>
          <button onclick="excluirVale('${v.id}')" class="text-red-500 hover:text-red-700 bg-white border p-1.5 rounded shadow-sm" title="Excluir Vale"><i data-lucide="x-circle" class="w-4 h-4"></i></button>
        </td>
      </tr>
    `).join('');
  }

  // ========== AÇÕES ==========
 window.baixarFolha = async function(id) {
    if (!confirm('Confirmar pagamento desta folha? Isso lançará uma despesa no financeiro.')) return;

    // Buscar a folha com dados da equipe
    const { data: folha, error: errFolha } = await sb.from('folhas')
        .select('*, equipe(*)')
        .eq('id', id)
        .single();

    if (errFolha || !folha) return alert('Folha não encontrada.');

    // Obter referências globais (garantir que existem)
    if (typeof STATE === 'undefined' || !STATE.expenses || !STATE.logs) {
        return alert('Erro: dados do sistema não carregados. Recarregue a página.');
    }
    if (typeof getNextId !== 'function') {
        return alert('Erro: função getNextId não disponível.');
    }

    //const descricao = `Salário ${folha.equipe.nome} (${folha.mes_referencia})`;
    // Padrão atual: categoria/observação em CAIXA ALTA e mês entre
    // parênteses — igual às despesas de salário históricas e parseável
    // pelo backfill (que lê "AAAA-MM" na observação).
    const descricao = `SALÁRIO REF. (${folha.mes_referencia})`;
    const forn = `${folha.equipe.nome}`;
    const novoIdDespesa = getNextId(STATE.expenses); // ID único para despesas

    // 1. Inserir a despesa (já paga)
    const { error: errDesp } = await sb.from('despesas').insert([{
        id: novoIdDespesa,          // 🔥 ESSENCIAL: sem isso o banco reclama
        item: 'SALÁRIO',
        equipe_id: folha.equipe_id != null ? folha.equipe_id : null,
        fornecedor: forn,
        quantidade: 1,
        unidade: 'Un',
        custo: folha.valor_pago,
        data: new Date().toISOString(),
        observacao: descricao,
        status: 'PENDENTE'
    }]);

    if (errDesp) {
        console.error('Erro ao inserir despesa:', errDesp);
        return alert('Erro ao lançar despesa: ' + errDesp.message);
    }

    // 2. Atualizar a folha para PAGO e vincular a despesa
    await sb.from('folhas').update({
        status: 'PAGO',
        despesa_id: novoIdDespesa
    }).eq('id', id);

    // 3. Inserir log financeiro (para aparecer no caixa)
    // Observacao segue o padrao do app 'Ref Despesa #id' para o
    // estorno ser preciso (por id, sem depender do nome digitado).
    const novoIdLog = getNextId(STATE.logs);
    const { error: errLog } = await sb.from('logs').insert([{
        id: novoIdLog,
        tipo: 'despesa',
        produto_nome: 'SALÁRIO',
        quantidade: 1,
        data: new Date().toISOString(),
        observacao: descricao + ' | Ref Despesa #' + novoIdDespesa,
        valor_total: folha.valor_pago,
        status: 'ATIVO',
        status_financeiro: 'PAGO',
        valor_pago: folha.valor_pago
    }]);

    if (errLog) {
        console.error('Erro ao gerar log financeiro:', errLog);
        // Não desfaz a despesa, apenas avisa
        alert('Despesa registrada, mas houve erro ao gerar o log financeiro. Atualize a página.');
    } else {
        alert('Pagamento registrado com sucesso!');
    }

    // Recarregar a lista de folhas
    carregarLancamentos();

    // Atualizar STATE global para refletir a nova despesa (opcional, mas recomendado)
    if (typeof loadData === 'function') {
      loadData();       
    }
};

  window.excluirFolha = async function(id) {
    const { data: folha } = await sb.from('folhas').select('*').eq('id', id).single();
    if (!folha) return;

    if (folha.status === 'PAGO' && folha.despesa_id) {
      if (!confirm('Esta folha já foi paga. Deseja estorná-la? A despesa será removida.')) return;
      // Remover despesa e log vinculados (log achado pelo 'Ref Despesa #id',
      // sem depender do nome do funcionário digitado na época)
      await sb.from('despesas').delete().eq('id', folha.despesa_id);
      await sb.from('logs').delete().like('observacao', '%Ref Despesa #' + folha.despesa_id + '%').eq('tipo', 'despesa');
    } else if (folha.status === 'PAGO') {
      if (!confirm('Esta folha está marcada como PAGA, mas não possui vínculo de despesa. Deseja excluí-la mesmo assim?')) return;
    } else {
      if (!confirm('Deseja excluir esta folha pendente?')) return;
    }

    await sb.from('folhas').delete().eq('id', id);
    alert('Folha excluída/estornada com sucesso!');
    loadData();
  };

  window.excluirVale = async function(id) {
    if (!confirm('Excluir este vale?')) return;

    const { data: vale } = await sb.from('vales').select('*').eq('id', id).single();
    await sb.from('vales').delete().eq('id', id);

    // Devolve o valor do vale para o líquido de eventual folha PENDENTE já criada nesse mês
    if (vale) await sincronizarFolhaComVale(vale.equipe_id, vale.mes_referencia, -vale.valor);

    alert('Vale excluído.');
    carregarLancamentos();
  };

  // ========== IMPRESSÃO RECIBO INDIVIDUAL ==========
  window.imprimirFolha = async function(id) {
    const { data: folha } = await sb.from('folhas').select('*, equipe(*)').eq('id', id).single();
    if (!folha) return;

    const corpo = `
      <div style="font-family: 'Helvetica', sans-serif; padding: 30px; max-width: 700px; margin: auto; border: 1px solid #ccc; background: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 25px;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <img src="https://i.postimg.cc/52cvrkkP/LOGRVPORTAL.png" style="max-height: 70px;" alt="Logo">
            <div>
              <h2 style="margin:0; color: #059669; font-size: 20px;">RV PORTAL MADEIRAS</h2>
              <p style="margin:2px 0; font-size: 11px; color: #475569;">CNPJ: 30.942.123/0001-02</p>
              <p style="margin:2px 0; font-size: 11px; color: #475569;">Rua Mineiros, 532 - Jataí - GO</p>
            </div>
          </div>
          <div style="text-align: right;">
            <h3 style="margin:0; font-size: 16px; font-weight: bold;">RECIBO DE PAGAMENTO</h3>
            <p style="margin:2px 0; font-size: 11px;">Mês Ref: ${folha.mes_referencia}</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
          <div>
            <strong>Funcionário:</strong> ${folha.equipe.nome}<br>
            <strong>Tipo:</strong> ${folha.tipo}<br>
            ${folha.tipo === 'Diarista' ? `<strong>Dias Trabalhados:</strong> ${folha.dias_trabalhados}<br>` : ''}
            <strong>Chave PIX:</strong> ${folha.chave_pix || 'Não informada'}
          </div>
          <div style="text-align: right;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
              <tr><td>Salário Base:</td><td style="text-align: right;">${formatMoney(folha.salario_base)}</td></tr>
              <tr><td style="color: #b91c1c;">Vales (-):</td><td style="text-align: right; color: #b91c1c;">-${formatMoney(folha.vales_total)}</td></tr>
              <tr style="border-top: 2px solid #1e293b; font-weight: bold; font-size: 1.1em;"><td>Valor Líquido:</td><td style="text-align: right;">${formatMoney(folha.valor_pago)}</td></tr>
            </table>
          </div>
        </div>

        <div style="border: 1px dashed #94a3b8; padding: 12px; border-radius: 6px; background: #f8fafc; margin-bottom: 25px; font-size: 0.9em;">
          Recebemos de RV PORTAL MADEIRAS a importância acima referente ao pagamento do mês de <strong>${folha.mes_referencia}</strong>.
        </div>

        <div style="margin-top: 60px; text-align: center;">
          <div style="width: 50%; border-top: 1px solid #000; margin: 0 auto 5px auto;"></div>
          <span style="font-weight: bold; font-size: 0.85em;">Assinatura do Funcionário</span>
        </div>

        <div style="margin-top: 30px; font-size: 0.7em; color: #94a3b8; text-align: center;">
          Documento gerado em ${new Date().toLocaleDateString('pt-BR')} pelo sistema RV Portal
        </div>
      </div>
    `;
    const janela = window.open('', '_blank', 'width=800,height=600');
    janela.document.write(corpo);
    janela.document.close();
    janela.print();
  };

  // ========== IMPRIMIR FOLHA GERAL DO MÊS ==========
  window.imprimirFolhaGeral = async function() {
    const mesRef = document.getElementById('eq-filtro-mes')?.value;
    if (!mesRef) {
      alert('Selecione um mês de referência para imprimir a folha.');
      return;
    }

    const { data: folhas } = await sb.from('folhas').select('*, equipe(*)').eq('mes_referencia', mesRef).order('equipe(nome)');
    if (!folhas || folhas.length === 0) {
      alert('Nenhuma folha encontrada para este mês.');
      return;
    }

    let totalBase = 0;
    let totalVales = 0;
    let totalGeral = 0;
    const linhas = folhas.map(f => {
      totalBase += (f.salario_base || 0);
      totalVales += (f.vales_total || 0);
      totalGeral += f.valor_pago;
      return `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 8px 5px;">${f.equipe?.nome || '–'}</td>
          <td style="padding: 8px 5px;">${f.tipo}</td>
          <td style="padding: 8px 5px; text-align: center;">${f.tipo === 'Diarista' ? f.dias_trabalhados : '–'}</td>
          <td style="padding: 8px 5px; text-align: right;">${formatMoney(f.salario_base)}</td>
          <td style="padding: 8px 5px; text-align: right; color: #b91c1c;">-${formatMoney(f.vales_total)}</td>
          <td style="padding: 8px 5px; text-align: right; font-weight: bold;">${formatMoney(f.valor_pago)}</td>
          <td style="padding: 8px 5px; font-size: 0.85em; color: #444;">${f.chave_pix || ''}</td>
        </tr>`;
    }).join('');

    const corpo = `
      <div style="font-family: 'Helvetica', sans-serif; padding: 20px; max-width: 800px; margin: auto; background: white;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="https://i.postimg.cc/52cvrkkP/LOGRVPORTAL.png" style="max-height: 50px;" alt="Logo">
            <div>
              <h2 style="margin:0; color: #059669; font-size: 18px;">RV PORTAL MADEIRAS</h2>
              <p style="margin:2px 0; font-size: 10px; color: #475569;">CNPJ: 30.942.123/0001-02</p>
            </div>
          </div>
          <div style="text-align: right;">
            <h3 style="margin:0; font-size: 16px;">FOLHA DE PAGAMENTO</h3>
            <p style="margin:2px 0; font-size: 12px;">Mês Referência: ${mesRef}</p>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.9em;">
          <thead>
            <tr style="background: #1e293b; color: white;">
              <th style="padding: 10px 8px; text-align: left;">Funcionário</th>
              <th style="padding: 10px 8px; text-align: left;">Tipo</th>
              <th style="padding: 10px 8px; text-align: center;">Dias</th>
              <th style="padding: 10px 8px; text-align: right;">Salário Base</th>
              <th style="padding: 10px 8px; text-align: right;">Vales</th>
              <th style="padding: 10px 8px; text-align: right;">Valor Líquido</th>
              <th style="padding: 10px 8px; text-align: left;">Chave PIX</th>
            </tr>
          </thead>
          <tbody>
            ${linhas}
          </tbody>
          <tfoot>
            <tr style="font-weight: bold; background: #f1f5f9; border-top: 2px solid #1e293b;">
              <td colspan="3" style="padding: 10px 8px; text-align: right;">TOTAIS:</td>
              <td style="padding: 10px 8px; text-align: right;">${formatMoney(totalBase)}</td>
              <td style="padding: 10px 8px; text-align: right; color: #b91c1c;">-${formatMoney(totalVales)}</td>
              <td style="padding: 10px 8px; text-align: right; font-size: 1.1em;">${formatMoney(totalGeral)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div style="font-size: 0.8em; text-align: center; color: #666; margin-top: 30px;">
          Emitido em ${new Date().toLocaleDateString('pt-BR')} pelo sistema RV Portal
        </div>
      </div>
    `;
    const janela = window.open('', '_blank', 'width=850,height=700');
    janela.document.write(corpo);
    janela.document.close();
    janela.print();
  };

  // ========== IMPRIMIR VALES DO MÊS ==========
    window.imprimirValesGeral = async function() {
      const mesRef = document.getElementById('eq-filtro-mes')?.value;
      if (!mesRef) {
        alert('Selecione um mês de referência para imprimir os vales.');
        return;
      }
  
      const { data: vales } = await sb.from('vales').select('*, equipe(nome)')
        .eq('mes_referencia', mesRef).order('equipe(nome)');
      if (!vales || vales.length === 0) {
        alert('Nenhum vale encontrado para este mês.');
        return;
      }
  
      let totalGeral = 0;
      const linhas = vales.map(v => {
        totalGeral += v.valor;
        return `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px 5px;">${v.equipe?.nome || '–'}</td>
            <td style="padding: 8px 5px; text-align: right; color: #b91c1c; font-weight: bold;">${formatMoney(v.valor)}</td>
          </tr>`;
      }).join('');
  
      const corpo = `
        <div style="font-family: 'Helvetica', sans-serif; padding: 20px; max-width: 700px; margin: auto; background: white;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <img src="https://i.postimg.cc/52cvrkkP/LOGRVPORTAL.png" style="max-height: 50px;" alt="Logo">
              <div>
                <h2 style="margin:0; color: #059669; font-size: 18px;">RV PORTAL MADEIRAS</h2>
                <p style="margin:2px 0; font-size: 10px; color: #475569;">CNPJ: 30.942.123/0001-02</p>
              </div>
            </div>
            <div style="text-align: right;">
              <h3 style="margin:0; font-size: 16px;">VALES LANÇADOS</h3>
              <p style="margin:2px 0; font-size: 12px;">Mês Referência: ${mesRef}</p>
            </div>
          </div>
  
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.9em;">
            <thead>
              <tr style="background: #1e293b; color: white;">
                <th style="padding: 10px 8px; text-align: left;">Funcionário</th>
                <th style="padding: 10px 8px; text-align: right;">Valor</th>
              </tr>
            </thead>
            <tbody>
              ${linhas}
            </tbody>
            <tfoot>
              <tr style="font-weight: bold; background: #f1f5f9; border-top: 2px solid #1e293b;">
                <td style="padding: 10px 8px; text-align: right;">TOTAL DE VALES:</td>
                <td style="padding: 10px 8px; text-align: right; font-size: 1.1em; color: #b91c1c;">${formatMoney(totalGeral)}</td>
              </tr>
            </tfoot>
          </table>
  
          <div style="font-size: 0.7em; color: #94a3b8; text-align: center; margin-top: 30px;">
            Emitido em ${new Date().toLocaleDateString('pt-BR')} pelo sistema RV Portal
          </div>
        </div>
      `;
      const janela = window.open('', '_blank', 'width=800,height=600');
      janela.document.write(corpo);
      janela.document.close();
      janela.print();
    };

  // ========== IMPRIMIR RECIBO INDIVIDUAL DE VALE ==========
    window.imprimirReciboVale = async function(id) {
      const { data: vale, error } = await sb.from('vales').select('*, equipe(*)').eq('id', id).single();
      if (error || !vale) return alert('Vale não encontrado.');
  
      const dataVale = vale.data ? new Date(vale.data).toLocaleDateString('pt-BR') : '–';
  
      const corpo = `
        <div style="font-family: 'Helvetica', sans-serif; padding: 30px; max-width: 700px; margin: auto; border: 1px solid #ccc; background: #fff;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 25px;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <img src="https://i.postimg.cc/52cvrkkP/LOGRVPORTAL.png" style="max-height: 70px;" alt="Logo">
              <div>
                <h2 style="margin:0; color: #059669; font-size: 20px;">RV PORTAL MADEIRAS</h2>
                <p style="margin:2px 0; font-size: 11px; color: #475569;">CNPJ: 30.942.123/0001-02</p>
                <p style="margin:2px 0; font-size: 11px; color: #475569;">Rua Mineiros, 532 - Jataí - GO</p>
              </div>
            </div>
            <div style="text-align: right;">
              <h3 style="margin:0; font-size: 16px; font-weight: bold;">RECIBO DE VALE</h3>
              <p style="margin:2px 0; font-size: 11px;">Mês Ref: ${vale.mes_referencia}</p>
            </div>
          </div>
  
          <div style="margin-bottom: 25px;">
            <strong>Funcionário:</strong> ${vale.equipe?.nome || '–'}<br>
            <strong>Data do Lançamento:</strong> ${dataVale}<br>
            <strong>Chave PIX:</strong> ${vale.equipe?.chave_pix || 'Não informada'}
          </div>
  
          <div style="text-align: center; margin: 30px 0;">
            <p style="font-size: 0.9em; color: #475569; margin-bottom: 5px;">Valor do Vale</p>
            <p style="font-size: 2em; font-weight: bold; color: #b91c1c; margin: 0;">${formatMoney(vale.valor)}</p>
          </div>
  
          <div style="border: 1px dashed #94a3b8; padding: 12px; border-radius: 6px; background: #f8fafc; margin-bottom: 25px; font-size: 0.9em;">
            Recebi de RV PORTAL MADEIRAS a importância acima, referente a adiantamento (vale) do mês de <strong>${vale.mes_referencia}</strong>, a ser descontado da folha de pagamento correspondente.
          </div>
  
          <div style="margin-top: 60px; text-align: center;">
            <div style="width: 50%; border-top: 1px solid #000; margin: 0 auto 5px auto;"></div>
            <span style="font-weight: bold; font-size: 0.85em;">Assinatura do Funcionário</span>
          </div>
  
          <div style="margin-top: 30px; font-size: 0.7em; color: #94a3b8; text-align: center;">
            Documento gerado em ${new Date().toLocaleDateString('pt-BR')} pelo sistema RV Portal
          </div>
        </div>
      `;
      const janela = window.open('', '_blank', 'width=800,height=600');
      janela.document.write(corpo);
      janela.document.close();
      janela.print();
    };

  // ========== CADASTRO DE FUNCIONÁRIOS ==========
  async function carregarCadastro() {
    const tipoFiltro = document.getElementById('eq-filtro-tipo')?.value;
    let query = sb.from('equipe').select('*').order('nome');
    if (tipoFiltro) query = query.eq('tipo', tipoFiltro);

    const { data, error } = await query;
    if (error) return alert('Erro ao carregar equipe.');

    const tbody = document.getElementById('eq-lista-funcionarios');
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400">Nenhum funcionário encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(f => `
      <tr class="border-b hover:bg-slate-50">
        <td class="p-3 font-bold">${f.nome}</td>
        <td class="p-3">${f.tipo}</td>
        <td class="p-3 text-center">${f.valor_mensal ? formatMoney(f.valor_mensal) : '–'}</td>
        <td class="p-3 text-center">${f.valor_diaria ? formatMoney(f.valor_diaria) : '–'}</td>
        <td class="p-3 text-sm">${f.chave_pix || '–'}</td>
        <td class="p-3 text-center">
          <span class="px-2 py-1 rounded text-xs font-bold ${f.ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}">${f.ativo ? 'Ativo' : 'Inativo'}</span>
        </td>
        <td class="p-3 text-center flex gap-2 justify-center">
          <button onclick="editarFuncionario('${f.id}')" class="text-indigo-600 hover:text-indigo-800 bg-white border p-1.5 rounded shadow-sm"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
          <button onclick="alternarStatusFuncionario('${f.id}')" class="text-slate-600 hover:text-red-600 bg-white border p-1.5 rounded shadow-sm"><i data-lucide="power" class="w-4 h-4"></i></button>
        </td>
      </tr>
    `).join('');
    lucide.createIcons();
  }

  window.abrirModalFuncionario = function(id = null) {
    const titulo = id ? 'Editar Funcionário' : 'Novo Funcionário';
    let html = `
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" id="modal-func">
        <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl">
          <div class="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
            <h3 class="font-bold text-lg">${titulo}</h3>
            <button onclick="document.getElementById('modal-func').remove()" class="text-slate-400 hover:text-red-500"><i data-lucide="x"></i></button>
          </div>
          <div class="p-4 space-y-3">
            <input type="hidden" id="func-id" value="${id || ''}">
            <div>
              <label class="block text-xs font-bold text-slate-600">Nome</label>
              <input type="text" id="func-nome" class="w-full p-2 border rounded-lg text-sm" placeholder="Nome completo">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600">Tipo</label>
              <select id="func-tipo" class="w-full p-2 border rounded-lg text-sm" onchange="toggleCamposValor()">
                <option value="Mensal">Fixo Mensal</option>
                <option value="Diarista">Diarista</option>
              </select>
            </div>
            <div id="campo-mensal">
              <label class="block text-xs font-bold text-slate-600">Salário Mensal (R$)</label>
              <input type="number" id="func-valor-mensal" step="0.01" class="w-full p-2 border rounded-lg text-sm" placeholder="0.00">
            </div>
            <div id="campo-diaria" class="hidden">
              <label class="block text-xs font-bold text-slate-600">Valor Diária (R$)</label>
              <input type="number" id="func-valor-diaria" step="0.01" class="w-full p-2 border rounded-lg text-sm" placeholder="0.00">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600">Chave PIX</label>
              <input type="text" id="func-pix" class="w-full p-2 border rounded-lg text-sm" placeholder="Chave PIX (CPF/Telefone/E-mail)">
            </div>
          </div>
          <div class="p-4 border-t bg-slate-50 flex gap-2 rounded-b-2xl">
            <button onclick="document.getElementById('modal-func').remove()" class="flex-1 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg font-bold">Cancelar</button>
            <button onclick="salvarFuncionario()" class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow">Salvar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    lucide.createIcons();
    if (id) preencherFormFuncionario(id);
  };

  window.toggleCamposValor = function() {
    const tipo = document.getElementById('func-tipo')?.value;
    document.getElementById('campo-mensal').classList.toggle('hidden', tipo !== 'Mensal');
    document.getElementById('campo-diaria').classList.toggle('hidden', tipo !== 'Diarista');
  };

  async function preencherFormFuncionario(id) {
    const { data } = await sb.from('equipe').select('*').eq('id', id).single();
    if (!data) return;
    document.getElementById('func-id').value = data.id;
    document.getElementById('func-nome').value = data.nome;
    document.getElementById('func-tipo').value = data.tipo;
    document.getElementById('func-valor-mensal').value = data.valor_mensal || '';
    document.getElementById('func-valor-diaria').value = data.valor_diaria || '';
    document.getElementById('func-pix').value = data.chave_pix || '';
    toggleCamposValor();
  }

  window.salvarFuncionario = async function() {
    const id = document.getElementById('func-id')?.value;
    const nome = document.getElementById('func-nome')?.value.trim();
    const tipo = document.getElementById('func-tipo')?.value;
    const valorMensal = parseFloat(document.getElementById('func-valor-mensal')?.value) || 0;
    const valorDiaria = parseFloat(document.getElementById('func-valor-diaria')?.value) || 0;
    const pix = document.getElementById('func-pix')?.value.trim();

    if (!nome) return alert('Nome obrigatório.');

    const payload = {
      nome,
      tipo,
      valor_mensal: tipo === 'Mensal' ? valorMensal : null,
      valor_diaria: tipo === 'Diarista' ? valorDiaria : null,
      chave_pix: pix,
      ativo: true
    };

    let error;
    if (id) {
      const { error: err } = await sb.from('equipe').update(payload).eq('id', id);
      error = err;
    } else {
      const { error: err } = await sb.from('equipe').insert([payload]);
      error = err;
    }

    if (error) return alert('Erro ao salvar: ' + error.message);
    document.getElementById('modal-func')?.remove();
    carregarCadastro();
  };

  window.editarFuncionario = function(id) {
    abrirModalFuncionario(id);
  };

  window.alternarStatusFuncionario = async function(id) {
    const { data } = await sb.from('equipe').select('ativo').eq('id', id).single();
    const novo = !data.ativo;
    await sb.from('equipe').update({ ativo: novo }).eq('id', id);
    carregarCadastro();
  };

  // Expor funções globais
  window.abrirModalCriarFolha = abrirModalCriarFolha;
  window.abrirModalVale = abrirModalVale;
  window.salvarVale = salvarVale;
  window.salvarFolha = salvarFolha;
  window.imprimirFolha = imprimirFolha;
  window.imprimirFolhaGeral = imprimirFolhaGeral;
  window.baixarFolha = baixarFolha;
  window.excluirFolha = excluirFolha;
  window.excluirVale = excluirVale;
  window.carregarLancamentos = carregarLancamentos;
  window.carregarCadastro = carregarCadastro;
  window.imprimirValesGeral = imprimirValesGeral;
  window.imprimirReciboVale = imprimirReciboVale;
  

  // ========== ALTERNAR SUB‑ABA ==========
function alternarSubAbaEquipe(aba) {
  subAbaAtiva = aba;
  renderEquipe(); // recarrega toda a view com a aba ativa
}
window.alternarSubAbaEquipe = alternarSubAbaEquipe;
})();
