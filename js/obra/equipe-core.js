(function (global) {
    'use strict';

    function rvRoundHalfDown(v) {
        if (v <= 0) return 0;
        if (v >= 1) return 1;
        var cents = v * 100;
        var dec = cents - Math.floor(cents);
        if (Math.abs(dec - 0.5) < 0.0001) return Math.floor(cents) / 100;
        return Math.round(cents) / 100;
    }

    function rvHoraDate(r) {
        return new Date(r.hora_registro !== undefined ? r.hora_registro : r.hora);
    }

    function rvDiaLocalISO(r) {
        var d = rvHoraDate(r);
        if (isNaN(d.getTime())) return '';
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function rvFracaoDiaria(registrosDoDia) {
        var validos = (registrosDoDia || []).filter(function (r) {
            return String(r.status || '').toUpperCase() !== 'ESTORNADO';
        });
        var ajustes = validos
            .filter(function (r) { return r.tipo === 'AJUSTE_MANUAL'; })
            .reduce(function (s, r) { return s + (parseFloat(r.fracao_diaria) || 0); }, 0);

        var entradas = validos.filter(function (r) { return r.tipo === 'ENTRADA'; });
        if (entradas.length === 0) return rvRoundHalfDown(Math.min(ajustes, 1));

        var manha = entradas.some(function (r) { return rvHoraDate(r).getHours() < 12; });
        var tarde = entradas.some(function (r) { return rvHoraDate(r).getHours() >= 12; });
        var base = (manha ? 0.5 : 0) + (tarde ? 0.5 : 0);

        return rvRoundHalfDown(Math.min(base + ajustes, 1));
    }

    function rvCalcularTotalDiarias(registros) {
        if (!registros || registros.length === 0) return 0;
        var porChave = new Map();
        registros.forEach(function (p) {
            if (String(p.status || '').toUpperCase() === 'ESTORNADO') return;
            var dia = rvDiaLocalISO(p);
            if (!dia) return;
            var chave = (p.funcionario_id || '') + '|' + dia;
            if (!porChave.has(chave)) porChave.set(chave, []);
            porChave.get(chave).push(p);
        });
        var total = 0;
        porChave.forEach(function (regs) { total += rvFracaoDiaria(regs); });
        return total;
    }

    function rvParsePeriodo(texto) {
        if (!texto) return null;
        var m = String(texto).match(/Per[ií]odo\s+(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/i);
        if (m) {
            return { inicio: m[3] + '-' + m[2] + '-' + m[1], fim: m[6] + '-' + m[5] + '-' + m[4] };
        }
        m = String(texto).match(/Per[ií]odo\s+(\d{2})\/(\d{4})/i);
        if (m) {
            var mes = m[1];
            var ano = m[2];
            var ultimoDia = new Date(parseInt(ano, 10), parseInt(mes, 10), 0).getDate();
            return { inicio: ano + '-' + mes + '-01', fim: ano + '-' + mes + '-' + String(ultimoDia).padStart(2, '0') };
        }
        return null;
    }

    function rvRefLog(query, log) {
        if (log && log.uid) return query.eq('uid', log.uid);
        return query.eq('id', log.id);
    }

    function rvSelecionarVinculadosDiaria(pontos, funcionarioId, despesa, periodo) {
        var d = despesa || {};
        return (pontos || []).filter(function (p) {
            return p.funcionario_id === funcionarioId &&
                p.pago_em_fechamento &&
                ((d.uid && p.fechamento_uid === d.uid) ||
                    (d.id != null && String(p.despesa_uid || p.despesa_id) === String(d.uid || d.id))) &&
                (!periodo || (
                    p.hora_registro >= periodo.inicio + 'T00:00:00' &&
                    p.hora_registro <= periodo.fim + 'T23:59:59'
                ));
        });
    }

    function rvSelecionarVinculadosMetro(producao, tercId, despesa) {
        var d = despesa || {};
        return (producao || []).filter(function (p) {
            return p.terceirizado_id === tercId &&
                p.status === 'PAGO' &&
                !!d.uid &&
                p.fechamento_uid === d.uid;
        });
    }

    var core = {
        rvRoundHalfDown: rvRoundHalfDown,
        rvHoraDate: rvHoraDate,
        rvFracaoDiaria: rvFracaoDiaria,
        rvCalcularTotalDiarias: rvCalcularTotalDiarias,
        rvParsePeriodo: rvParsePeriodo,
        rvRefLog: rvRefLog,
        rvSelecionarVinculadosDiaria: rvSelecionarVinculadosDiaria,
        rvSelecionarVinculadosMetro: rvSelecionarVinculadosMetro
    };

    global.RVEquipeCore = core;
    global.rvRoundHalfDown = rvRoundHalfDown;
    global.rvHoraDate = rvHoraDate;
    global.rvFracaoDiaria = rvFracaoDiaria;
    global.rvCalcularTotalDiarias = rvCalcularTotalDiarias;
    global.rvParsePeriodo = rvParsePeriodo;
    global.rvRefLog = rvRefLog;
    global.filtrarLogPorRef = rvRefLog;
    global.refLog = rvRefLog;
    global.rvSelecionarVinculadosDiaria = rvSelecionarVinculadosDiaria;
    global.rvSelecionarVinculadosMetro = rvSelecionarVinculadosMetro;
})(typeof window !== 'undefined' ? window : globalThis);
