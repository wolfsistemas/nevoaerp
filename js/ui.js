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

  // Alias usado em telas que nao tem showToast carregado.
  if (typeof window.uiAlert !== 'function') {
    window.uiAlert = function (message, isError) {
      if (typeof window.showToast === 'function') window.showToast(message, !!isError);
      else window.alert(message);
    };
  }
})();
