// ========== RELATÓRIO DE DESPESAS ==========
function esc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
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
    const company = getCompany();

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
                <td style="border-bottom:1px solid #ccc; border-right:1px solid #000; padding:5px; font-weight:bold;">${esc(e.item)}</td>
                <td style="border-bottom:1px solid #ccc; border-right:1px solid #000; padding:5px;">${esc(providerVal)}</td>
                <td style="border-bottom:1px solid #ccc; border-right:1px solid #000; padding:5px; text-align:center;">
                    <span style="font-weight:bold; ${e.status === 'PAGO' ? 'color:green;' : (isVencido ? 'color:red;' : 'color:orange;')}">${situacao}</span>
                </td>
                <td style="border-bottom:1px solid #ccc; padding:5px; text-align:right; font-weight:bold;">${formatMoney(valor)}</td>
            </tr>
        `;
    }).join('');

    const filtroTexto = `Período: ${formatDate(start + 'T00:00:00')} até ${formatDate(end + 'T00:00:00')} | Categoria: ${category === 'TODAS' ? 'Todas' : esc(category)} | Status: ${statusFilter === 'TODOS' ? 'Todos' : statusFilter}`;

    const el = document.getElementById('print-area');
    el.innerHTML = `
        <div class="invoice-box-orig" style="font-family: 'Helvetica', sans-serif; max-width: 1000px; margin: auto; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                <div style="display: flex; gap: 15px; align-items: center;">
                    <img src="${esc(company.logoUrl)}" style="max-height: 60px;" />
                    <div>
                        <h2 style="margin: 0; color: #059669; font-size: 18px; font-weight: bold;">${esc(company.name)}</h2>
                        ${company.cnpj ? `<p style="margin: 2px 0; font-size: 11px; color: #64748b;">CNPJ: ${esc(company.cnpj)}</p>` : ''}
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
