// ui.js - Componentes de interface compartilhados (toast + confirmacao moderna).
//
// Substitui os dialogos nativos do navegador (alert/confirm) por componentes
// do proprio sistema, mantendo o mesmo fluxo nos cliques.
(function () {
  'use strict';

  // ----- Confirmacao moderna (Promise<boolean>) -----
  // Uso: var ok = await confirmDialog('Mensagem', { title, confirmText, cancelText, danger });
  if (typeof window.confirmDialog !== 'function') {
    window.confirmDialog = function (message, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var danger = !!opts.danger;

        var backdrop = document.createElement('div');
        backdrop.className = 'fixed inset-0 bg-black/50 flex items-center justify-center p-4';
        backdrop.style.zIndex = '2147483000';

        var card = document.createElement('div');
        card.className = 'bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden';

        var body = document.createElement('div');
        body.className = 'p-5 flex items-start gap-3';

        var badge = document.createElement('div');
        badge.className = 'shrink-0 w-10 h-10 rounded-full flex items-center justify-center ' +
          (danger ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600');
        badge.innerHTML = danger
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';

        var textBox = document.createElement('div');
        textBox.className = 'pt-0.5 min-w-0';

        var title = document.createElement('div');
        title.className = 'font-bold text-slate-800';
        title.textContent = opts.title || (danger ? 'Confirmar' : 'Confirmar acao');

        var msg = document.createElement('div');
        msg.className = 'text-sm text-slate-600 mt-1 whitespace-pre-line break-words';
        msg.textContent = message || 'Tem certeza?';

        textBox.appendChild(title);
        textBox.appendChild(msg);
        body.appendChild(badge);
        body.appendChild(textBox);

        var footer = document.createElement('div');
        footer.className = 'p-4 bg-slate-50 flex gap-2 justify-end';

        var btnNo = document.createElement('button');
        btnNo.type = 'button';
        btnNo.className = 'px-4 py-2 rounded-lg font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition';
        btnNo.textContent = opts.cancelText || 'Cancelar';

        var btnYes = document.createElement('button');
        btnYes.type = 'button';
        btnYes.className = 'px-4 py-2 rounded-lg font-bold text-white transition ' +
          (danger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700');
        btnYes.textContent = opts.confirmText || 'Confirmar';

        footer.appendChild(btnNo);
        footer.appendChild(btnYes);
        card.appendChild(body);
        card.appendChild(footer);
        backdrop.appendChild(card);

        var done = false;
        function close(value) {
          if (done) return;
          done = true;
          try { backdrop.remove(); } catch (e) { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }
          document.removeEventListener('keydown', onKey);
          resolve(value);
        }
        function onKey(e) {
          if (e.key === 'Escape') close(false);
          else if (e.key === 'Enter') close(true);
        }

        btnNo.addEventListener('click', function () { close(false); });
        btnYes.addEventListener('click', function () { close(true); });
        backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(false); });
        document.addEventListener('keydown', onKey);

        document.body.appendChild(backdrop);
        setTimeout(function () { try { btnYes.focus(); } catch (e) {} }, 30);
      });
    };
  }

  // ----- Entrada moderna (Promise<string|null>) -----
  // Substitui window.prompt. Uso:
  //   var v = await promptDialog('Mensagem', valorAtual, { title, type:'date' });
  if (typeof window.promptDialog !== 'function') {
    window.promptDialog = function (message, defaultValue, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var backdrop = document.createElement('div');
        backdrop.className = 'fixed inset-0 bg-black/50 flex items-center justify-center p-4';
        backdrop.style.zIndex = '2147483000';

        var card = document.createElement('div');
        card.className = 'bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden';

        var body = document.createElement('div');
        body.className = 'p-5';

        var title = document.createElement('div');
        title.className = 'font-bold text-slate-800';
        title.textContent = opts.title || 'Informação';

        var msgEl = document.createElement('div');
        msgEl.className = 'text-sm text-slate-600 mt-1 whitespace-pre-line break-words';
        msgEl.textContent = message || '';

        var input = document.createElement('input');
        input.type = opts.type || 'text';
        input.className = 'w-full mt-3 p-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium';
        input.value = defaultValue == null ? '' : String(defaultValue);
        if (opts.placeholder) input.placeholder = opts.placeholder;
        if (opts.min) input.min = opts.min;
        if (opts.max) input.max = opts.max;
        if (opts.step) input.step = opts.step;

        body.appendChild(title);
        body.appendChild(msgEl);
        body.appendChild(input);

        var footer = document.createElement('div');
        footer.className = 'p-4 bg-slate-50 flex gap-2 justify-end';

        var btnNo = document.createElement('button');
        btnNo.type = 'button';
        btnNo.className = 'px-4 py-2 rounded-lg font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition';
        btnNo.textContent = opts.cancelText || 'Cancelar';

        var btnYes = document.createElement('button');
        btnYes.type = 'button';
        btnYes.className = 'px-4 py-2 rounded-lg font-bold text-white transition bg-indigo-600 hover:bg-indigo-700';
        btnYes.textContent = opts.confirmText || 'Confirmar';

        footer.appendChild(btnNo);
        footer.appendChild(btnYes);
        card.appendChild(body);
        card.appendChild(footer);
        backdrop.appendChild(card);

        var done = false;
        function close(value) {
          if (done) return;
          done = true;
          try { backdrop.remove(); } catch (e) { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }
          document.removeEventListener('keydown', onKey);
          resolve(value);
        }
        function submit() {
          var v = input.value;
          if (opts.required !== false && String(v).trim() === '') return;
          close(v);
        }
        function onKey(e) {
          if (e.key === 'Escape') close(null);
          else if (e.key === 'Enter') { e.preventDefault(); submit(); }
        }

        btnNo.addEventListener('click', function () { close(null); });
        btnYes.addEventListener('click', submit);
        backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(null); });
        document.addEventListener('keydown', onKey);

        document.body.appendChild(backdrop);
        setTimeout(function () { try { input.focus(); input.select && input.select(); } catch (e) {} }, 30);
      });
    };
  }

  // Alias usado em telas que nao tem showToast carregado.
  if (typeof window.uiAlert !== 'function') {    window.uiAlert = function (message, isError) {
      if (typeof window.showToast === 'function') window.showToast(message, !!isError);
      else window.alert(message);
    };
  }

  // ----- modalGuard: fechar com ESC + confirmar valores nao salvos -----
  // Compartilhado por todo o sistema (desktop e mobile).
  // Uso dinamico (modulo monta o modal em JS):
  //   var snap = modalGuard.capturar(modalEl);            // logo apos abrir
  //   modalGuard.registrar({ visivel, pedirFechar });      // uma vez por modulo
  //   modalGuard.fecharComGuarda(modalEl, snap, fechar);   // no X/Cancelar/ESC
  // Uso estatico (modal no HTML com classe 'hidden'):
  //   modalGuard.registrarEstatico('id-do-modal', { proteger: true, fechar: fn });
  //   modalGuard.fechar('id-do-modal');                    // no X/Cancelar
  if (typeof window.modalGuard !== 'function') {
    (function () {
      var gerentes = [];
      var estaticos = {};
      var escLigado = false;
      var confirmando = false;
      var MSG = 'Existem valores não salvos, deseja sair mesmo assim?';

      function capturar(el) {
        var out = [];
        if (!el) return out;
        var campos = el.querySelectorAll('input, textarea, select');
        for (var i = 0; i < campos.length; i++) {
          var c = campos[i];
          if (c.type === 'hidden') continue;
          out.push(c.type === 'checkbox' || c.type === 'radio'
            ? (c.checked ? '1' : '0')
            : String(c.value == null ? '' : c.value));
        }
        return out;
      }

      function mudou(el, snap) {
        if (!el || !snap) return false;
        var agora = capturar(el);
        if (agora.length !== snap.length) return true;
        for (var i = 0; i < agora.length; i++) {
          if (agora[i] !== snap[i]) return true;
        }
        return false;
      }

      async function confirmarSaida(doClose) {
        if (typeof window.confirmDialog === 'function') {
          confirmando = true;
          var ok = false;
          try {
            ok = await window.confirmDialog(MSG, {
              title: 'Valores não salvos',
              confirmText: 'Sim',
              cancelText: 'Cancelar',
              danger: true
            });
          } finally {
            confirmando = false;
          }
          if (!ok) return;
        }
        if (typeof doClose === 'function') doClose();
      }

      function fecharComGuarda(el, snap, doClose) {
        if (mudou(el, snap)) return confirmarSaida(doClose);
        if (typeof doClose === 'function') doClose();
      }

      function estaAberto(el) { return !!(el && !el.classList.contains('hidden')); }

      function registrarEstatico(id, opts) {
        opts = opts || {};
        var el = document.getElementById(id);
        if (!el) return;
        var reg = {
          el: el,
          snap: null,
          proteger: opts.proteger !== false,
          fechar: opts.fechar || function () { el.classList.add('hidden'); }
        };
        estaticos[id] = reg;
        try {
          var obs = new MutationObserver(function () {
            if (estaAberto(el)) reg.snap = capturar(el);
          });
          obs.observe(el, { attributes: true, attributeFilter: ['class'] });
        } catch (e) {}
        gerentes.push({
          visivel: function () { return estaAberto(el); },
          pedirFechar: function () { fecharEstatico(id); }
        });
        ligarEsc();
      }

      function fecharEstatico(id) {
        var reg = estaticos[id];
        if (!reg) return;
        var doClose = function () { reg.fechar(); reg.snap = null; };
        if (!reg.proteger) { doClose(); return; }
        return fecharComGuarda(reg.el, reg.snap, doClose);
      }

      function ligarEsc() {
        if (escLigado) return;
        escLigado = true;
        document.addEventListener('keydown', function (event) {
          if (event.key !== 'Escape' && event.key !== 'Esc') return;
          if (confirmando) return; // deixa o confirmDialog tratar o ESC
          var tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea' || tag === 'select') return; // nao fecha digitando
          for (var i = gerentes.length - 1; i >= 0; i--) {
            var g = gerentes[i];
            if (g && g.visivel && g.visivel()) {
              if (g.pedirFechar) g.pedirFechar();
              return;
            }
          }
        });
      }

      window.modalGuard = {
        capturar: capturar,
        mudou: mudou,
        fecharComGuarda: fecharComGuarda,
        registrar: function (gerente) { gerentes.push(gerente); ligarEsc(); return gerente; },
        registrarEstatico: registrarEstatico,
        fechar: function (id) { return fecharEstatico(id); }
      };
      // Compatibilidade com os modulos do modulo Obra ja publicados.
      window.obraModalGuard = window.modalGuard;
    })();
  }
})();
