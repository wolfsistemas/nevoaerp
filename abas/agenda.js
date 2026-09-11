// agenda.js – Módulo de agenda de instalações MDF
// Depende do supabaseClient (global ou importado)

// Data no fuso LOCAL no formato YYYY-MM-DD (o toISOString() usaria UTC e
// poderia deslocar os limites do mês para o dia anterior).
function dataLocalISOAgenda(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

class AgendaManager {
  constructor(container, supabase) {
    this.container = container;
    this.supabase = supabase;
    this.currentDate = new Date(); // mês atual exibido
    this.agendamentos = []; // todos os agendamentos do mês
    this.orcamentosCache = {}; // cache de orçamentos por id
    this.init();
  }

  async init() {
    await this.carregarAgendamentos();
    this.renderizar();
  }

  async carregarAgendamentos() {
    const ano = this.currentDate.getFullYear();
    const mes = this.currentDate.getMonth();
    const startDate = new Date(ano, mes, 1);
    const endDate = new Date(ano, mes + 1, 0);
    const startStr = dataLocalISOAgenda(startDate);
    const endStr = dataLocalISOAgenda(endDate);

    const { data, error } = await this.supabase
      .from('mdf_agenda')
      .select('*, mdf_orcamentos(*)')
      .gte('data_agendada', startStr)
      .lte('data_agendada', endStr)
      .order('data_agendada', { ascending: true })
      .order('horario', { ascending: true });

    if (error) {
      console.error('Erro ao carregar agenda:', error);
      this.agendamentos = [];
    } else {
      this.agendamentos = data;
      // Cache dos orçamentos
      for (const item of data) {
        if (item.mdf_orcamentos) {
          this.orcamentosCache[item.orcamento_id] = item.mdf_orcamentos;
        } else {
          // Buscar orçamento separadamente se não veio no join
          const { data: orc } = await this.supabase
            .from('mdf_orcamentos')
            .select('*')
            .eq('id', item.orcamento_id)
            .single();
          if (orc) this.orcamentosCache[item.orcamento_id] = orc;
        }
      }
    }
  }

  async renderizar() {
    this.container.innerHTML = `
      <div class="flex flex-col h-full">
        <!-- Cabeçalho do calendário -->
        <div class="flex justify-between items-center mb-4">
          <button id="btn-mes-anterior" class="p-2 rounded-full hover:bg-slate-200 transition">
            <i data-lucide="chevron-left" class="w-5 h-5"></i>
          </button>
          <h2 class="text-xl font-bold text-slate-800">
            ${this.currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
          </h2>
          <button id="btn-mes-proximo" class="p-2 rounded-full hover:bg-slate-200 transition">
            <i data-lucide="chevron-right" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Grid de dias da semana -->
        <div class="grid grid-cols-7 gap-1 mb-2 text-center font-bold text-slate-500">
          <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
        </div>

        <!-- Grid do calendário -->
        <div class="grid grid-cols-7 gap-1 flex-1 overflow-y-auto" id="calendario-grid">
          ${this.gerarDiasCalendario()}
        </div>
      </div>
    `;

    // Eventos dos botões de navegação
    document.getElementById('btn-mes-anterior').addEventListener('click', () => this.mudarMes(-1));
    document.getElementById('btn-mes-proximo').addEventListener('click', () => this.mudarMes(1));

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  gerarDiasCalendario() {
    const ano = this.currentDate.getFullYear();
    const mes = this.currentDate.getMonth();
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay(); // 0 = domingo
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();

    const dias = [];
    // Preencher dias vazios antes do primeiro dia do mês
    for (let i = 0; i < primeiroDiaSemana; i++) {
      dias.push(`<div class="bg-slate-50 rounded-lg p-1 min-h-[80px]"></div>`);
    }
    // Preencher dias do mês
    for (let d = 1; d <= ultimoDia; d++) {
      const dataStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const agendamentosDia = this.agendamentos.filter(a => a.data_agendada === dataStr);
      const cards = agendamentosDia.map(ag => `
        <div class="bg-emerald-100 text-emerald-800 rounded-md p-1 mb-1 text-xs cursor-pointer hover:bg-emerald-200 transition"
             data-agenda-id="${ag.id}">
          <strong>${ag.horario.slice(0,5)}</strong> - ${ag.mdf_orcamentos?.cliente_nome || 'Cliente'}
        </div>
      `).join('');

      dias.push(`
        <div class="bg-white border rounded-lg p-1 min-h-[80px] overflow-y-auto" data-data="${dataStr}">
          <div class="text-right text-xs text-slate-400 font-bold">${d}</div>
          <div class="agendamentos-dia">${cards}</div>
        </div>
      `);
    }
    return dias.join('');
  }

  async mudarMes(delta) {
    this.currentDate.setMonth(this.currentDate.getMonth() + delta);
    await this.carregarAgendamentos();
    this.renderizar();
    // Reatribuir eventos de clique nos cards de agendamento
    this.container.querySelectorAll('[data-agenda-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const agendaId = el.dataset.agendaId;
        const agenda = this.agendamentos.find(a => a.id == agendaId);
        if (agenda) this.abrirModalDetalhes(agenda);
      });
    });
    // Também permitir clique em dias vazios para adicionar? (opcional)
  }

  async abrirModalDetalhes(agenda) {
    const orc = this.orcamentosCache[agenda.orcamento_id];
    if (!orc) return;

    // Buscar itens do orçamento
    const { data: itens } = await this.supabase
      .from('mdf_itens')
      .select('*')
      .eq('orcamento_id', orc.id);

    // Criar modal
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4';
    modal.style.backdropFilter = 'blur(2px)';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-emerald-600 text-white p-4 rounded-t-2xl flex justify-between items-center">
          <h3 class="text-xl font-bold flex items-center gap-2">
            <i data-lucide="clipboard-list"></i> Detalhes da Instalação
          </h3>
          <button class="fechar-modal text-white hover:text-emerald-200">
            <i data-lucide="x" class="w-6 h-6"></i>
          </button>
        </div>
        <div class="p-6 space-y-4">
          <!-- Dados do orçamento -->
          <div class="bg-slate-50 p-3 rounded-lg">
            <p class="text-xs text-slate-500 uppercase font-bold">Orçamento / Cliente</p>
            <p class="font-bold">#${orc.id} - ${orc.cliente_nome}</p>
            <p class="text-sm">Status orçamento: ${orc.status}</p>
          </div>

          <!-- Dados da agenda -->
          <div class="grid grid-cols-2 gap-4">
            <div><span class="font-bold">Data:</span> ${new Date(agenda.data_agendada).toLocaleDateString('pt-BR')}</div>
            <div><span class="font-bold">Horário:</span> ${agenda.horario.slice(0,5)}</div>
            <div><span class="font-bold">Status agenda:</span> ${agenda.status}</div>
            <div><span class="font-bold">Instalador:</span> ${agenda.instalador_nome || '-'}</div>
            <div><span class="font-bold">Telefone:</span> ${agenda.instalador_telefone || '-'}</div>
          </div>

          <!-- Observações -->
          <div>
            <span class="font-bold">Observações:</span>
            <p class="text-sm bg-slate-100 p-2 rounded">${agenda.observacoes || 'Nenhuma'}</p>
          </div>

          <!-- Itens do orçamento -->
          <div>
            <span class="font-bold">Itens do Projeto:</span>
            <div class="mt-2 space-y-2 max-h-60 overflow-y-auto">
              ${itens?.map(item => `
                <div class="border rounded p-2 flex gap-2">
                  ${item.foto_url ? `<img src="${item.foto_url}" class="w-16 h-16 object-cover rounded">` : '<div class="w-16 h-16 bg-slate-200 rounded flex items-center justify-center"><i data-lucide="image" class="w-6 h-6 text-slate-400"></i></div>'}
                  <div>
                    <p class="font-bold">${item.nome}</p>
                    <p class="text-xs text-slate-500">${item.descricao || ''}</p>
                    <p class="text-sm">Preço: R$ ${parseFloat(item.preco).toFixed(2)}</p>
                  </div>
                </div>
              `).join('') || '<p class="text-slate-400">Nenhum item cadastrado.</p>'}
            </div>
          </div>

          <!-- Ações -->
          <div class="flex flex-wrap gap-2 pt-4 border-t">
            <button id="btn-reagendar" class="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-2">
              <i data-lucide="calendar-clock"></i> Reagendar
            </button>
            <button id="btn-concluir" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
              <i data-lucide="check-circle"></i> Concluir Instalação
            </button>
            <button id="btn-cancelar" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2">
              <i data-lucide="ban"></i> Cancelar
            </button>
            <button id="btn-whatsapp" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2 ${!agenda.instalador_telefone ? 'opacity-50 cursor-not-allowed' : ''}" ${!agenda.instalador_telefone ? 'disabled' : ''}>
              <i data-lucide="message-circle"></i> WhatsApp Instalador
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Fechar modal
    modal.querySelector('.fechar-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Ações
    modal.querySelector('#btn-reagendar')?.addEventListener('click', () => {
      modal.remove();
      this.reagendarAgenda(agenda.id);
    });
    modal.querySelector('#btn-concluir')?.addEventListener('click', async () => {
      await this.atualizarStatusAgenda(agenda.id, 'CONCLUIDO');
      modal.remove();
      this.atualizarApPosAlteracao();
    });
    modal.querySelector('#btn-cancelar')?.addEventListener('click', async () => {
      if (confirm('Cancelar esta instalação?')) {
        await this.atualizarStatusAgenda(agenda.id, 'CANCELADO');
        modal.remove();
        this.atualizarApPosAlteracao();
      }
    });
    modal.querySelector('#btn-whatsapp')?.addEventListener('click', () => {
      this.enviarWhatsAppInstalador(agenda);
    });
  }

  async reagendarAgenda(agendaId) {
    const agenda = this.agendamentos.find(a => a.id == agendaId);
    if (!agenda) return;
    const novaData = prompt('Nova data (YYYY-MM-DD):', agenda.data_agendada);
    if (!novaData) return;
    const novoHorario = prompt('Novo horário (HH:MM):', agenda.horario.slice(0,5));
    if (!novoHorario) return;

    const { error } = await this.supabase
      .from('mdf_agenda')
      .update({ data_agendada: novaData, horario: novoHorario, status: 'REAGENDADO', updated_at: new Date().toISOString() })
      .eq('id', agendaId);
    if (error) {
      window.showToast('Erro ao reagendar: ' + error.message, true);
    } else {
      window.showToast('Agendamento reagendado!');
      await this.atualizarApPosAlteracao();
    }
  }

  async atualizarStatusAgenda(agendaId, novoStatus) {
    const { error } = await this.supabase
      .from('mdf_agenda')
      .update({ status: novoStatus, updated_at: new Date().toISOString() })
      .eq('id', agendaId);
    if (error) {
      window.showToast('Erro ao atualizar status: ' + error.message, true);
    } else {
      window.showToast(`Status alterado para ${novoStatus}`);
    }
  }

  async atualizarApPosAlteracao() {
    await this.carregarAgendamentos();
    this.renderizar();
    // Reatribuir eventos de clique nos cards
    this.container.querySelectorAll('[data-agenda-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const agendaId = el.dataset.agendaId;
        const agenda = this.agendamentos.find(a => a.id == agendaId);
        if (agenda) this.abrirModalDetalhes(agenda);
      });
    });
  }

  enviarWhatsAppInstalador(agenda) {
    if (!agenda.instalador_telefone) {
      window.showToast('Telefone do instalador não cadastrado.', true);
      return;
    }
    let numero = agenda.instalador_telefone.replace(/\D/g, '');
    if (numero.length === 11) numero = '55' + numero;
    else if (numero.length === 10) numero = '55' + numero;
    const dataFormatada = new Date(agenda.data_agendada + 'T' + agenda.horario).toLocaleString('pt-BR');
    const msg = `Olá ${agenda.instalador_nome || 'instalador'}! Instalação do orçamento #${agenda.orcamento_id} está agendada para ${dataFormatada}. Detalhes: ${agenda.observacoes || ''}`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, '_blank');
  }
}

// Expor globalmente se necessário
window.AgendaManager = AgendaManager;
