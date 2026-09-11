// ============================================================
// CALCULADORA FINANCEIRA – RV PORTAL
// ============================================================
// Este script cria uma calculadora flutuante com funções
// financeiras (juros compostos, parcelas, valor presente,
// valor futuro, etc.) usando a biblioteca mathjs.
// ============================================================

(function() {
    'use strict';

    // Aguarda o DOM estar pronto antes de criar a calculadora
    document.addEventListener('DOMContentLoaded', function() {

        // ---------- Verifica se o mathjs foi carregado ----------
        if (typeof math === 'undefined') {
            console.error('❌ mathjs não encontrado. Verifique o CDN.');
            return;
        }
        console.log('✅ Calculadora Financeira carregada.');

        // ---------- Cria o container da calculadora ----------
        const calcContainer = document.createElement('div');
        calcContainer.id = 'calculadora-financeira';
        calcContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 380px;
            max-width: 90vw;
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            z-index: 9999;
            display: none;
            font-family: 'Segoe UI', sans-serif;
            overflow: hidden;
            border: 1px solid #e2e8f0;
            transition: all 0.3s ease;
        `;

        // ---------- Cabeçalho da calculadora (com botão fechar) ----------
        const header = document.createElement('div');
        header.style.cssText = `
            background: #0f172a;
            color: white;
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            user-select: none;
        `;
        header.innerHTML = `
            <span style="font-weight: bold; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M12 2v4M8 6V2M16 6V2"/></svg>
                Calculadora Financeira
            </span>
            <button id="calc-fechar" style="
                background: none;
                border: none;
                color: #94a3b8;
                font-size: 20px;
                cursor: pointer;
                padding: 0 4px;
                line-height: 1;
                transition: color 0.2s;
            ">✕</button>
        `;
        calcContainer.appendChild(header);

        // ---------- Corpo da calculadora ----------
        const body = document.createElement('div');
        body.style.cssText = `
            padding: 16px;
            max-height: 70vh;
            overflow-y: auto;
            background: #f8fafc;
        `;

        // ---------- Display de entrada e resultado ----------
        body.innerHTML = `
            <div style="margin-bottom: 12px;">
                <input type="text" id="calc-input" placeholder="Ex: 1000 * (1 + 0.05)^12" style="
                    width: 100%;
                    padding: 10px 12px;
                    border: 2px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 14px;
                    font-family: 'Courier New', monospace;
                    outline: none;
                    background: white;
                    transition: border-color 0.2s;
                " onfocus="this.style.borderColor='#059669'" onblur="this.style.borderColor='#e2e8f0'">
            </div>
            <div id="calc-resultado" style="
                background: white;
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 16px;
                font-weight: bold;
                font-size: 18px;
                color: #0f172a;
                border: 2px solid #e2e8f0;
                min-height: 48px;
                display: flex;
                align-items: center;
                font-family: 'Courier New', monospace;
            ">R$ 0,00</div>

            <!-- Botões principais -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px;">
                <button class="calc-btn calc-oper" data-op="7">7</button>
                <button class="calc-btn calc-oper" data-op="8">8</button>
                <button class="calc-btn calc-oper" data-op="9">9</button>
                <button class="calc-btn calc-oper" data-op="/">÷</button>

                <button class="calc-btn calc-oper" data-op="4">4</button>
                <button class="calc-btn calc-oper" data-op="5">5</button>
                <button class="calc-btn calc-oper" data-op="6">6</button>
                <button class="calc-btn calc-oper" data-op="*">×</button>

                <button class="calc-btn calc-oper" data-op="1">1</button>
                <button class="calc-btn calc-oper" data-op="2">2</button>
                <button class="calc-btn calc-oper" data-op="3">3</button>
                <button class="calc-btn calc-oper" data-op="-">−</button>

                <button class="calc-btn calc-oper" data-op="0">0</button>
                <button class="calc-btn calc-oper" data-op=".">.</button>
                <button class="calc-btn calc-oper" data-op="(">(</button>
                <button class="calc-btn calc-oper" data-op=")">)</button>
            </div>

            <!-- Funções financeiras -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px;">
                <button class="calc-fn" data-fn="fv">FV</button>
                <button class="calc-fn" data-fn="pv">PV</button>
                <button class="calc-fn" data-fn="pmt">PMT</button>
                <button class="calc-fn" data-fn="nper">NPER</button>
                <button class="calc-fn" data-fn="rate">TAXA</button>
                <button class="calc-fn" data-fn="compound">JUROS COMP.</button>
            </div>

            <!-- Campos para funções financeiras (aparecem ao clicar em uma função) -->
            <div id="calc-fn-fields" style="display: none; background: white; padding: 12px; border-radius: 8px; border: 2px solid #e2e8f0; margin-bottom: 12px;">
                <div id="calc-fn-content"></div>
                <button id="calc-fn-calcular" style="
                    margin-top: 10px;
                    width: 100%;
                    padding: 8px;
                    background: #059669;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-weight: bold;
                    cursor: pointer;
                ">Calcular</button>
            </div>

            <!-- Botões de ação -->
            <div style="display: flex; gap: 8px;">
                <button id="calc-limpar" style="
                    flex: 1;
                    padding: 10px;
                    background: #e2e8f0;
                    border: none;
                    border-radius: 8px;
                    font-weight: bold;
                    cursor: pointer;
                    color: #1e293b;
                ">Limpar</button>
                <button id="calc-igual" style="
                    flex: 2;
                    padding: 10px;
                    background: #059669;
                    border: none;
                    border-radius: 8px;
                    font-weight: bold;
                    cursor: pointer;
                    color: white;
                ">= Calcular</button>
            </div>
        `;

        calcContainer.appendChild(body);
        document.body.appendChild(calcContainer);

        // ---------- Estilos dos botões ----------
        const style = document.createElement('style');
        style.textContent = `
            .calc-btn {
                padding: 12px 0;
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.15s;
                color: #0f172a;
                font-family: 'Courier New', monospace;
            }
            .calc-btn:hover {
                background: #f1f5f9;
                border-color: #94a3b8;
            }
            .calc-btn:active {
                transform: scale(0.95);
                background: #e2e8f0;
            }
            .calc-fn {
                padding: 10px 0;
                background: #1e293b;
                border: none;
                border-radius: 8px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.15s;
                color: white;
            }
            .calc-fn:hover {
                background: #0f172a;
            }
            .calc-fn:active {
                transform: scale(0.95);
            }
            #calc-fn-fields input {
                width: 100%;
                padding: 8px 10px;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                margin-bottom: 6px;
                font-size: 13px;
                font-family: 'Courier New', monospace;
                outline: none;
            }
            #calc-fn-fields input:focus {
                border-color: #059669;
            }
            #calc-fn-fields label {
                font-size: 12px;
                font-weight: bold;
                color: #475569;
                display: block;
                margin-bottom: 2px;
            }
            #calc-fn-fields .fn-row {
                margin-bottom: 6px;
            }
            .calc-resultado-erro {
                color: #dc2626 !important;
                font-size: 14px !important;
            }
        `;
        document.head.appendChild(style);

        // ---------- Variáveis ----------
        const input = document.getElementById('calc-input');
        const resultado = document.getElementById('calc-resultado');

        // ---------- Funções auxiliares ----------
        function formatMoney(val) {
            if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
            return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }

        function showResult(value) {
            if (typeof value === 'number' && !isNaN(value)) {
                resultado.textContent = formatMoney(value);
                resultado.style.color = '#0f172a';
                resultado.classList.remove('calc-resultado-erro');
            } else {
                resultado.textContent = String(value);
                resultado.style.color = '#dc2626';
                resultado.classList.add('calc-resultado-erro');
            }
        }

        function evaluateExpression(expr) {
            try {
                // Substitui operadores para compatibilidade
                let sanitized = expr
                    .replace(/×/g, '*')
                    .replace(/÷/g, '/')
                    .replace(/−/g, '-')
                    .replace(/,/g, '.')
                    .trim();

                // Se a expressão estiver vazia, retorna 0
                if (!sanitized) return 0;

                // Avalia usando mathjs
                const result = math.evaluate(sanitized);
                if (typeof result === 'number') {
                    return result;
                } else {
                    return String(result);
                }
            } catch (e) {
                return 'Erro: ' + e.message;
            }
        }

        // ---------- Inserir texto no input ----------
        function insertText(text) {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const before = input.value.substring(0, start);
            const after = input.value.substring(end);
            input.value = before + text + after;
            input.focus();
            // Coloca o cursor após o texto inserido
            const newPos = start + text.length;
            input.setSelectionRange(newPos, newPos);
            // Dispara o evento input para atualizar o preview
            input.dispatchEvent(new Event('input'));
        }

        // ---------- Eventos dos botões numéricos ----------
        document.querySelectorAll('.calc-oper').forEach(btn => {
            btn.addEventListener('click', function() {
                const op = this.dataset.op;
                insertText(op);
            });
        });

        // ---------- Limpar ----------
        document.getElementById('calc-limpar').addEventListener('click', function() {
            input.value = '';
            resultado.textContent = 'R$ 0,00';
            resultado.style.color = '#0f172a';
            resultado.classList.remove('calc-resultado-erro');
            // Esconde os campos de função financeira
            document.getElementById('calc-fn-fields').style.display = 'none';
            input.focus();
        });

        // ---------- Calcular (igual) ----------
        document.getElementById('calc-igual').addEventListener('click', function() {
            const expr = input.value.trim();
            if (!expr) {
                resultado.textContent = 'Digite uma expressão';
                resultado.style.color = '#dc2626';
                return;
            }
            const result = evaluateExpression(expr);
            if (typeof result === 'number') {
                showResult(result);
            } else {
                resultado.textContent = result;
                resultado.style.color = '#dc2626';
            }
        });

        // ---------- Fechar calculadora ----------
        document.getElementById('calc-fechar').addEventListener('click', function() {
            calcContainer.style.display = 'none';
        });

        // ---------- Funções financeiras ----------
        const fnFields = document.getElementById('calc-fn-fields');
        const fnContent = document.getElementById('calc-fn-content');

        const fnConfigs = {
            'fv': {
                label: 'Valor Futuro (FV)',
                fields: [
                    { id: 'fv-taxa', label: 'Taxa de juros (ex: 0.05 = 5%)', placeholder: '0.05' },
                    { id: 'fv-nper', label: 'Número de períodos', placeholder: '12' },
                    { id: 'fv-pmt', label: 'Pagamento periódico (R$)', placeholder: '100' },
                    { id: 'fv-pv', label: 'Valor presente (R$)', placeholder: '0' }
                ],
                calc: function(values) {
                    const taxa = parseFloat(values.fvTaxa) || 0;
                    const nper = parseInt(values.fvNper) || 0;
                    const pmt = parseFloat(values.fvPmt) || 0;
                    const pv = parseFloat(values.fvPv) || 0;
                    if (nper <= 0) return 'Número de períodos deve ser maior que zero';
                    return math.fv(taxa, nper, -pmt, -pv);
                }
            },
            'pv': {
                label: 'Valor Presente (PV)',
                fields: [
                    { id: 'pv-taxa', label: 'Taxa de juros (ex: 0.05 = 5%)', placeholder: '0.05' },
                    { id: 'pv-nper', label: 'Número de períodos', placeholder: '12' },
                    { id: 'pv-pmt', label: 'Pagamento periódico (R$)', placeholder: '100' },
                    { id: 'pv-fv', label: 'Valor futuro (R$)', placeholder: '0' }
                ],
                calc: function(values) {
                    const taxa = parseFloat(values.pvTaxa) || 0;
                    const nper = parseInt(values.pvNper) || 0;
                    const pmt = parseFloat(values.pvPmt) || 0;
                    const fv = parseFloat(values.pvFv) || 0;
                    if (nper <= 0) return 'Número de períodos deve ser maior que zero';
                    return math.pv(taxa, nper, -pmt, -fv);
                }
            },
            'pmt': {
                label: 'Pagamento periódico (PMT)',
                fields: [
                    { id: 'pmt-taxa', label: 'Taxa de juros (ex: 0.05 = 5%)', placeholder: '0.05' },
                    { id: 'pmt-nper', label: 'Número de períodos', placeholder: '12' },
                    { id: 'pmt-pv', label: 'Valor presente (R$)', placeholder: '1000' },
                    { id: 'pmt-fv', label: 'Valor futuro (R$)', placeholder: '0' }
                ],
                calc: function(values) {
                    const taxa = parseFloat(values.pmtTaxa) || 0;
                    const nper = parseInt(values.pmtNper) || 0;
                    const pv = parseFloat(values.pmtPv) || 0;
                    const fv = parseFloat(values.pmtFv) || 0;
                    if (nper <= 0) return 'Número de períodos deve ser maior que zero';
                    return math.pmt(taxa, nper, -pv, -fv);
                }
            },
            'nper': {
                label: 'Número de períodos (NPER)',
                fields: [
                    { id: 'nper-taxa', label: 'Taxa de juros (ex: 0.05 = 5%)', placeholder: '0.05' },
                    { id: 'nper-pmt', label: 'Pagamento periódico (R$)', placeholder: '100' },
                    { id: 'nper-pv', label: 'Valor presente (R$)', placeholder: '1000' },
                    { id: 'nper-fv', label: 'Valor futuro (R$)', placeholder: '0' }
                ],
                calc: function(values) {
                    const taxa = parseFloat(values.nperTaxa) || 0;
                    const pmt = parseFloat(values.nperPmt) || 0;
                    const pv = parseFloat(values.nperPv) || 0;
                    const fv = parseFloat(values.nperFv) || 0;
                    return math.nper(taxa, -pmt, -pv, -fv);
                }
            },
            'rate': {
                label: 'Taxa de juros (RATE)',
                fields: [
                    { id: 'rate-nper', label: 'Número de períodos', placeholder: '12' },
                    { id: 'rate-pmt', label: 'Pagamento periódico (R$)', placeholder: '100' },
                    { id: 'rate-pv', label: 'Valor presente (R$)', placeholder: '1000' },
                    { id: 'rate-fv', label: 'Valor futuro (R$)', placeholder: '0' }
                ],
                calc: function(values) {
                    const nper = parseInt(values.rateNper) || 0;
                    const pmt = parseFloat(values.ratePmt) || 0;
                    const pv = parseFloat(values.ratePv) || 0;
                    const fv = parseFloat(values.rateFv) || 0;
                    if (nper <= 0) return 'Número de períodos deve ser maior que zero';
                    const result = math.rate(nper, -pmt, -pv, -fv);
                    return result !== null ? result : 'Não foi possível calcular a taxa';
                }
            },
            'compound': {
                label: 'Juros Compostos',
                fields: [
                    { id: 'comp-capital', label: 'Capital inicial (R$)', placeholder: '1000' },
                    { id: 'comp-taxa', label: 'Taxa de juros (% ao mês)', placeholder: '5' },
                    { id: 'comp-meses', label: 'Número de meses', placeholder: '12' },
                    { id: 'comp-aporte', label: 'Aporte mensal (R$)', placeholder: '0' }
                ],
                calc: function(values) {
                    const capital = parseFloat(values.compCapital) || 0;
                    const taxa = (parseFloat(values.compTaxa) || 0) / 100;
                    const meses = parseInt(values.compMeses) || 0;
                    const aporte = parseFloat(values.compAporte) || 0;
                    if (meses <= 0) return 'Número de meses deve ser maior que zero';
                    let total = capital;
                    for (let i = 0; i < meses; i++) {
                        total = total * (1 + taxa) + aporte;
                    }
                    return total;
                }
            }
        };

        // ---------- Montar campos da função ----------
        function buildFnFields(fnKey) {
            const config = fnConfigs[fnKey];
            if (!config) return;

            // Limpa conteúdo anterior
            fnContent.innerHTML = '';

            // Título
            const title = document.createElement('div');
            title.style.cssText = 'font-weight: bold; margin-bottom: 8px; font-size: 14px; color: #0f172a;';
            title.textContent = config.label;
            fnContent.appendChild(title);

            // Campos
            config.fields.forEach(field => {
                const row = document.createElement('div');
                row.className = 'fn-row';

                const label = document.createElement('label');
                label.htmlFor = field.id;
                label.textContent = field.label;
                row.appendChild(label);

                const inputField = document.createElement('input');
                inputField.type = 'text';
                inputField.id = field.id;
                inputField.placeholder = field.placeholder || '';
                row.appendChild(inputField);
                fnContent.appendChild(row);
            });
        }

        // ---------- Evento: clicar nos botões de função ----------
        document.querySelectorAll('.calc-fn').forEach(btn => {
            btn.addEventListener('click', function() {
                const fn = this.dataset.fn;
                // Mostra o painel de campos
                fnFields.style.display = 'block';
                // Constrói os campos
                buildFnFields(fn);
                // Guarda a função atual para usar no cálculo
                fnFields.dataset.currentFn = fn;
            });
        });

        // ---------- Evento: calcular função financeira ----------
        document.getElementById('calc-fn-calcular').addEventListener('click', function() {
            const fnKey = fnFields.dataset.currentFn;
            const config = fnConfigs[fnKey];
            if (!config) return;

            // Coleta os valores dos campos
            const values = {};
            config.fields.forEach(field => {
                const el = document.getElementById(field.id);
                if (el) {
                    // Converte para o nome da chave (tira hífen, etc)
                    const key = field.id.replace(/-/g, '').replace(/_/g, '');
                    // Tenta converter para o nome esperado no calc (camelCase)
                    const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                    values[camelKey] = el.value;
                }
            });

            // Chama a função de cálculo
            const result = config.calc(values);
            if (typeof result === 'number') {
                showResult(result);
                // Coloca o resultado também no input para referência
                input.value = result.toString();
            } else {
                resultado.textContent = String(result);
                resultado.style.color = '#dc2626';
                resultado.classList.add('calc-resultado-erro');
            }
        });

        // ---------- Tecla Enter no input ----------
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('calc-igual').click();
            }
        });

        // ---------- Preview ao digitar ----------
        input.addEventListener('input', function() {
            const expr = this.value.trim();
            if (!expr) {
                resultado.textContent = 'R$ 0,00';
                resultado.style.color = '#0f172a';
                resultado.classList.remove('calc-resultado-erro');
                return;
            }
            const result = evaluateExpression(expr);
            if (typeof result === 'number') {
                showResult(result);
            } else {
                resultado.textContent = result;
                resultado.style.color = '#dc2626';
            }
        });

        // ---------- Função de toggle (abrir/fechar) ----------
        window.toggleCalculadora = function() {
            const container = document.getElementById('calculadora-financeira');
            if (container.style.display === 'none' || container.style.display === '') {
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
            }
        };

        // ---------- Inicialização: exibir a calculadora ao carregar (opcional) ----------
        // Por padrão, ela fica oculta; o usuário clica no botão para abrir.
        calcContainer.style.display = 'none';

        // ---------- (Opcional) Fechar ao clicar fora ----------
        document.addEventListener('click', function(e) {
            const container = document.getElementById('calculadora-financeira');
            if (!container) return;
            // Se clicou fora do container e não no botão de toggle, não faz nada (usuário fecha pelo X)
        });

    }); // fim do DOMContentLoaded

})();
