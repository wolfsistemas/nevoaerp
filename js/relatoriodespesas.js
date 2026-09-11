// ========== RELATÓRIO DE DESPESAS ==========
function openExpenseReportModal() {
    // Preenche com o mês atual
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    document.getElementById('exp-report-start').value = getLocalISODate(primeiroDia);
    document.getElementById('exp-report-end').value = getLocalISODate(ultimoDia);
    document.getElementById('exp-report-category').value = 'TODAS';
    document.getElementById('exp-report-status').value = 'TODOS';
    document.getElementById('modal-expense-report').classList.remove('hidden');
}

function closeExpenseReportModal() {
    document.getElementById('modal-expense-report').classList.add('hidden');
}

function clearExpenseReportFilters() {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    document.getElementById('exp-report-start').value = getLocalISODate(primeiroDia);
    document.getElementById('exp-report-end').value = getLocalISODate(ultimoDia);
    document.getElementById('exp-report-category').value = 'TODAS';
    document.getElementById('exp-report-status').value = 'TODOS';
}



function applyExpenseFilters() {
    const start = document.getElementById('exp-report-start').value;
    const end = document.getElementById('exp-report-end').value;
    const category = document.getElementById('exp-report-category').value;
    const status = document.getElementById('exp-report-status').value;
    const hojeLocalStr = getHojeLocalStr();

    let filtered = STATE.expenses.slice();

    // Filtro por data
    if (start) {
        filtered = filtered.filter(e => (e.date || '').split('T')[0] >= start);
    }
    if (end) {
        filtered = filtered.filter(e => (e.date || '').split('T')[0] <= end);
    }

    // Filtro por categoria
    if (category) {
        filtered = filtered.filter(e => e.item === category);
    }

    // Filtro por status
    if (status) {
        if (status === 'PENDENTE') {
            filtered = filtered.filter(e => e.status === 'PENDENTE' && (e.date || '').split('T')[0] >= hojeLocalStr);
        } else if (status === 'VENCIDO') {
            filtered = filtered.filter(e => e.status === 'PENDENTE' && (e.date || '').split('T')[0] < hojeLocalStr);
        } else if (status === 'PAGO') {
            filtered = filtered.filter(e => e.status === 'PAGO');
        } else if (status === 'NAO_PAGO') {
            filtered = filtered.filter(e => e.status === 'PENDENTE');
        }
    }

    // Ordena por data (mais recentes primeiro)
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Renderiza os resultados
    renderExpenseReportResults(filtered);
}

function renderExpenseReportResults(expenses) {
    const container = document.getElementById('expense-report-results');
    if (!container) return;

    if (expenses.length === 0) {
        container.innerHTML = `
            <div class="text-center text-slate-400 py-10">
                <i data-lucide="file-search" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
                <p class="font-medium">Nenhuma despesa encontrada com os filtros selecionados.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // Calcula totais
    const totalGeral = expenses.reduce((acc, e) => acc + e.cost, 0);
    const totalPendente = expenses.filter(e => e.status === 'PENDENTE').reduce((acc, e) => acc + e.cost, 0);
    const totalPago = expenses.filter(e => e.status === 'PAGO').reduce((acc, e) => acc + e.cost, 0);

    let html = `
        <div class="bg-white rounded-xl border shadow-sm overflow-hidden mb-4">
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-700 sticky top-0">
                        <tr>
                            <th class="p-3">Data</th>
                            <th class="p-3">Categoria</th>
                            <th class="p-3">Fornecedor / Obs</th>
                            <th class="p-3 text-right">Valor</th>
                            <th class="p-3 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
    `;

    expenses.forEach(e => {
        let providerVal = e.note || '-';
        if (providerVal.startsWith('Fornecedor:')) {
            providerVal = providerVal.replace('Fornecedor:', '').trim();
        }

        const dataVencStr = (e.date || '').split('T')[0];
        const isVencido = dataVencStr < getHojeLocalStr() && e.status !== 'PAGO';
        const statusLabel = e.status === 'PAGO' ? 'PAGO' : (isVencido ? 'VENCIDO' : 'PENDENTE');
        const statusColor = e.status === 'PAGO' ? 'bg-green-100 text-green-700' : (isVencido ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700');

        html += `
            <tr class="hover:bg-slate-50">
                <td class="p-3 text-xs font-medium">${formatDate(e.date)}</td>
                <td class="p-3 font-bold text-slate-700">${e.item}</td>
                <td class="p-3 text-sm text-slate-600">${providerVal}</td>
                <td class="p-3 text-right font-bold text-red-600">${formatMoney(e.cost)}</td>
                <td class="p-3 text-center">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${statusColor}">${statusLabel}</span>
                </td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-red-50 p-4 rounded-xl border border-red-200">
                <p class="text-xs font-bold uppercase text-red-600">Total Geral</p>
                <p class="text-2xl font-bold text-red-700">${formatMoney(totalGeral)}</p>
            </div>
            <div class="bg-orange-50 p-4 rounded-xl border border-orange-200">
                <p class="text-xs font-bold uppercase text-orange-600">Pendentes (Abertos)</p>
                <p class="text-2xl font-bold text-orange-700">${formatMoney(totalPendente)}</p>
            </div>
            <div class="bg-green-50 p-4 rounded-xl border border-green-200">
                <p class="text-xs font-bold uppercase text-green-600">Já Pagos</p>
                <p class="text-2xl font-bold text-green-700">${formatMoney(totalPago)}</p>
            </div>
        </div>
    `;

    container.innerHTML = html;
    lucide.createIcons();
}

// Função de impressão do relatório de despesas
function printExpenseReport() {
    const container = document.getElementById('expense-report-results');
    const content = container.cloneNode(true);
    
    // Remove os ícones Lucide (que não imprimem bem)
    const icons = content.querySelectorAll('[data-lucide]');
    icons.forEach(icon => {
        const span = document.createElement('span');
        span.textContent = icon.getAttribute('data-lucide') || '';
        icon.replaceWith(span);
    });

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    const company = {
        name: "RV PORTAL MADEIRAS",
        cnpj: "30.942.123/0001-02",
        logoUrl: "https://i.postimg.cc/52cvrkkP/LOGRVPORTAL.png"
    };

    const start = document.getElementById('exp-report-start').value;
    const end = document.getElementById('exp-report-end').value;
    const category = document.getElementById('exp-report-category').value;
    const status = document.getElementById('exp-report-status').value;
    const statusMap = {
        'PENDENTE': 'Pendentes (Abertos)',
        'VENCIDO': 'Vencidos',
        'PAGO': 'Pagos',
        'NAO_PAGO': 'Não Pagos (Pendentes + Vencidos)',
        '': 'Todos'
    };

    const filtroTexto = `Período: ${start ? formatDate(start + 'T00:00:00') : 'Início'} até ${end ? formatDate(end + 'T00:00:00') : 'Hoje'} | Categoria: ${category || 'Todas'} | Status: ${statusMap[status] || 'Todos'}`;

    printWindow.document.write(`
        <html>
            <head>
                <title>Relatório de Despesas - RV PORTAL</title>
                <style>
                    body { font-family: 'Helvetica', Arial, sans-serif; padding: 30px; background: white; color: #1e293b; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px; }
                    .header h1 { margin: 0; color: #059669; font-size: 22px; }
                    .header p { margin: 2px 0; font-size: 12px; color: #475569; }
                    .filters { background: #f8fafc; padding: 10px 15px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; font-size: 13px; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    th { background: #f1f5f9; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #0f172a; }
                    td { padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
                    .totals { display: flex; gap: 20px; margin-top: 20px; }
                    .totals div { flex: 1; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
                    .totals .red { background: #fef2f2; border-color: #fca5a5; }
                    .totals .orange { background: #fff7ed; border-color: #fdba74; }
                    .totals .green { background: #f0fdf4; border-color: #86efac; }
                    .totals .label { font-size: 11px; font-weight: bold; text-transform: uppercase; }
                    .totals .value { font-size: 22px; font-weight: bold; }
                    .status-badge { padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; }
                    .status-pago { background: #d1fae5; color: #065f46; }
                    .status-vencido { background: #fecaca; color: #991b1b; }
                    .status-pendente { background: #fed7aa; color: #9a3412; }
                    .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1>${company.name}</h1>
                        <p>CNPJ: ${company.cnpj}</p>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0; font-size: 18px; color: #0f172a;">RELATÓRIO DE DESPESAS</h2>
                        <p style="margin: 2px 0; font-size: 12px; color: #64748b;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
                    </div>
                </div>
                <div class="filters">
                    <strong>Filtros aplicados:</strong> ${filtroTexto}
                </div>
                ${content.innerHTML}
                <div class="footer">
                    Documento emitido por sistema RV PORTAL - Relatório de despesas.
                </div>
                <div class="no-print" style="text-align: center; margin-top: 20px;">
                    <button onclick="window.print()" style="padding: 10px 30px; background: #059669; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">🖨️ Imprimir / Salvar PDF</button>
                    <button onclick="window.close()" style="padding: 10px 30px; background: #e2e8f0; color: #0f172a; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; margin-left: 10px;">Fechar</button>
                </div>
            </body>
        </html>
    `);
    printWindow.document.close();
}

function printFilteredExpenses() {
    const start = document.getElementById('exp-report-start').value;
    const end = document.getElementById('exp-report-end').value;
    const category = document.getElementById('exp-report-category').value;
    const statusFilter = document.getElementById('exp-report-status').value;

    if (!start || !end) {
        showToast("Selecione as datas", true);
        return;
    }

    // Filtra as despesas
    let filtered = STATE.expenses.slice();

    // Filtro por data
    filtered = filtered.filter(e => {
        const eDate = (e.date || '').split('T')[0];
        return eDate >= start && eDate <= end;
    });

    // Filtro por categoria
    if (category !== 'TODAS') {
        filtered = filtered.filter(e => e.item === category);
    }

    // Filtro por status
    const hojeLocalStr = getHojeLocalStr();
    if (statusFilter === 'PAGO') {
        filtered = filtered.filter(e => e.status === 'PAGO');
    } else if (statusFilter === 'PENDENTE') {
        filtered = filtered.filter(e => e.status !== 'PAGO');
    } else if (statusFilter === 'VENCIDO') {
        filtered = filtered.filter(e => {
            const venc = (e.date || '').split('T')[0];
            return e.status !== 'PAGO' && venc < hojeLocalStr;
        });
    } else if (statusFilter === 'NAO_BAIXADOS') {
        filtered = filtered.filter(e => e.status !== 'PAGO');
    }
    // 'TODOS' não filtra

    if (filtered.length === 0) {
        showToast("Nenhuma despesa encontrada com os filtros selecionados.", true);
        return;
    }

    // Ordena por data (mais recente primeiro)
    filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Monta o HTML para impressão
    const company = {
        name: "RV PORTAL MADEIRAS",
        cnpj: "30.942.123/0001-02",
        logoUrl: "https://i.postimg.cc/52cvrkkP/LOGRVPORTAL.png"
    };

    let totalGeral = 0;
    let totalPagos = 0;
    let totalPendentes = 0;

    const rowsHtml = filtered.map(e => {
        const venc = (e.date || '').split('T')[0];
        const isVencido = venc < hojeLocalStr && e.status !== 'PAGO';
        const situacao = e.status === 'PAGO' ? 'PAGO' : (isVencido ? 'VENCIDO' : 'PENDENTE');
        const valor = e.cost;        

        totalGeral += valor;
        if (e.status === 'PAGO') totalPagos += valor;
        else totalPendentes += valor;

        let providerVal = e.note || '-';
        if (providerVal.startsWith('Fornecedor:')) {
            providerVal = providerVal.replace('Fornecedor:', '').trim();
        }        

        return `
            <tr>
                <td style="border-bottom:1px solid #ccc; border-right:1px solid #000; padding:5px;">${formatDate(e.date)}</td>
                <td style="border-bottom:1px solid #ccc; border-right:1px solid #000; padding:5px; font-weight:bold;">${e.item}</td>
                <td style="border-bottom:1px solid #ccc; border-right:1px solid #000; padding:5px;">${providerVal}</td>
                <td style="border-bottom:1px solid #ccc; border-right:1px solid #000; padding:5px; text-align:center;">
                    <span style="font-weight:bold; ${e.status === 'PAGO' ? 'color:green;' : (isVencido ? 'color:red;' : 'color:orange;')}">${situacao}</span>
                </td>
                <td style="border-bottom:1px solid #ccc; padding:5px; text-align:right; font-weight:bold;">${formatMoney(valor)}</td>
            </tr>
        `;
    }).join('');

    const filtroTexto = `Período: ${formatDate(start + 'T00:00:00')} até ${formatDate(end + 'T00:00:00')} | Categoria: ${category === 'TODAS' ? 'Todas' : category} | Status: ${statusFilter === 'TODOS' ? 'Todos' : statusFilter}`;

    const el = document.getElementById('print-area');
    el.innerHTML = `
        <div class="invoice-box-orig" style="font-family: 'Helvetica', sans-serif; max-width: 1000px; margin: auto; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                <div style="display: flex; gap: 15px; align-items: center;">
                    <img src="${company.logoUrl}" style="max-height: 60px;" />
                    <div>
                        <h2 style="margin: 0; color: #059669; font-size: 18px; font-weight: bold;">${company.name}</h2>
                        <p style="margin: 2px 0; font-size: 11px; color: #64748b;">CNPJ: ${company.cnpj}</p>
                    </div>
                </div>
                <div style="text-align: right;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: bold;">RELATÓRIO DE DESPESAS</h3>
                    <p style="margin: 2px 0; font-size: 11px;">Impresso em: ${new Date().toLocaleString('pt-BR')}</p>
                </div>
            </div>

            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 10px; margin-bottom: 20px; font-size: 12px; border-radius: 6px;">
                <strong>Filtros aplicados:</strong> ${filtroTexto}
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #000;">
                <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 2px solid #0f172a;">
                        <th style="border-right:1px solid #000; padding: 6px; text-align:left;">Data</th>
                        <th style="border-right:1px solid #000; padding: 6px; text-align:left;">Categoria</th>
                        <th style="border-right:1px solid #000; padding: 6px; text-align:left;">Fornecedor / Obs</th>
                        <th style="border-right:1px solid #000; padding: 6px; text-align:center;">Status</th>
                        <th style="padding: 6px; text-align:right;">Valor</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
                <tfoot style="border-top: 2px solid #000; background-color: #f0fdf4;">
                    <tr>
                        <td colspan="4" style="padding: 6px; text-align:right; font-weight:bold;">TOTAL GERAL:</td>
                        <td style="padding: 6px; text-align:right; font-weight:bold;">${formatMoney(totalGeral)}</td>
                    </tr>
                    <tr style="background-color: #fef2f2;">
                        <td colspan="4" style="padding: 6px; text-align:right; font-weight:bold;">Total Pagos:</td>
                        <td style="padding: 6px; text-align:right; font-weight:bold; color: #059669;">${formatMoney(totalPagos)}</td>
                    </tr>
                    <tr style="background-color: #fef2f2;">
                        <td colspan="4" style="padding: 6px; text-align:right; font-weight:bold;">Total Pendentes (inclui vencidos):</td>
                        <td style="padding: 6px; text-align:right; font-weight:bold; color: #dc2626;">${formatMoney(totalPendentes)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    closeExpenseReportModal();
    setTimeout(() => window.print(), 500);
}
