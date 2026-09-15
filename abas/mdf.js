// mdf.js – Módulo completo para gestão de projetos e orçamentos MDF
// Versão corrigida – com busca de clientes via modal

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ==================== CONFIGURAÇÃO SUPABASE ====================
// Credenciais vem de config.js (injeta no deploy via GitHub Actions secrets)
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_KEY = window.SUPABASE_ANON_KEY;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==================== GERAÇÃO DE PDF COM PDFMAKE ====================
const LOGO_APP = 'logo.png';
const _cacheImagensPDF = new Map();
let _pdfMakePromise = null;

function carregarPdfMake() {
  if (window.pdfMake) return Promise.resolve(window.pdfMake);
  if (_pdfMakePromise) return _pdfMakePromise;
  const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/';
  _pdfMakePromise = new Promise((resolve, reject) => {
    const s1 = document.createElement('script');
    s1.src = base + 'pdfmake.min.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = base + 'vfs_fonts.js';
      s2.onload = () => resolve(window.pdfMake);
      s2.onerror = () => reject(new Error('Falha ao carregar fontes do pdfmake.'));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error('Falha ao carregar o pdfmake.'));
    document.head.appendChild(s1);
  });
  return _pdfMakePromise;
}

async function imagemParaBase64PDF(url, opcoes = {}) {
  if (!url) return null;
  const chaveCache = url + (opcoes.quadrada ? '|quadrada' : '');
  if (_cacheImagensPDF.has(chaveCache)) return _cacheImagensPDF.get(chaveCache);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          // Fotos de itens viram um quadrado padrão (letterbox branco): todas as
          // fotos ocupam a MESMA área no PDF, independente da proporção original.
          if (opcoes.quadrada) {
            const LADO = 640;
            const canvas = document.createElement('canvas');
            canvas.width = LADO;
            canvas.height = LADO;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, LADO, LADO);
            const escala = Math.min(LADO / img.width, LADO / img.height);
            const dw = Math.round(img.width * escala);
            const dh = Math.round(img.height * escala);
            ctx.drawImage(img, (LADO - dw) / 2, (LADO - dh) / 2, dw, dh);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
            return;
          }
          const MAX = opcoes.max || 800;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            const scale = MAX / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Falha ao carregar a imagem.'));
      };
      img.src = objectUrl;
    });
    _cacheImagensPDF.set(chaveCache, dataUrl);
    return dataUrl;
  } catch (e) {
    console.warn('Falha ao carregar imagem para o PDF:', url, e);
    _cacheImagensPDF.set(chaveCache, null);
    return null;
  }
}


// Formatação monetária em R$ para o PDF (milhar com ponto, centavos com vírgula).
function formatarMoedaPDF(valor) {
  return (parseFloat(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00A0/g, ' ');
}

// Formatação monetária no padrão brasileiro (R$ 1.234,56) para a UI.
function formatarMoedaBR(valor) {
  return (parseFloat(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Escapa HTML ao interpolar dados de usuário (evita XSS e quebra de
// layout por aspas / < > / &).
function escaparHTML(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Data de HOJE no fuso local no formato YYYY-MM-DD (evita o "dia errado"
// que o toISOString() causa por causa do UTC).
function dataLocalISO(d = new Date()) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Upload de imagem para o imgbb (usado no resumo 3D e nos itens).
const IMGBB_KEY = 'c201a949389ed2c50aabd3731b4d1932';
async function enviarImagemImgBB(arquivoOuBlob) {
  const formData = new FormData();
  formData.append('image', arquivoOuBlob);
  const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: formData });
  if (!resp.ok) throw new Error('Falha de conexão no upload da imagem.');
  const data = await resp.json();
  if (!data.success) throw new Error(data.error?.message || 'Falha no upload da imagem.');
  return data.data.url;
}

// Labels amigáveis dos status de orçamento MDF.
const STATUS_LABEL_MDF = {
  'ABERTO': 'Aberto',
  'EM NEGOCIAÇÃO': 'Em Negociação',
  'APROVADO': 'Aprovado',
  'PERDIDO': 'Perdido'
};

// ==================== CLASSE PRINCIPAL DO MÓDULO MDF (CORRIGIDA) ====================
class MDFManager {
  constructor(container) {
    this.container = container;
    this.profundidade = 60;
    this.linhas = [];
    this.preenchimentos = [];
    this.activeSubTab = 'projetos';
    this.projetosManager = null;
    this.orcamentosManager = null;
    this.init();
  }

  init() {
    this.renderizarInterface();
    lucide.createIcons();
    this.mostrarSubAba('projetos');
  }

  renderizarInterface() {
    this.container.innerHTML = `
      <div class="flex flex-col h-full">      
       <div class="flex items-center gap-2 ml-auto bg-white/80 backdrop-blur-sm p-1 rounded-2xl shadow-md border border-emerald-100">
        <button data-subaba="projetos" class="subaba-mdf-btn relative flex-1 md:flex-none px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2">
            <i data-lucide="box" class="w-4 h-4"></i> 
            <span>Projetos</span>
          </button>
          <button data-subaba="orcamentos" class="subaba-mdf-btn relative flex-1 md:flex-none px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2">
            <i data-lucide="file-text" class="w-4 h-4"></i> 
            <span>Orçamentos</span>
          </button>
          <button data-subaba="agenda" class="subaba-mdf-btn relative flex-1 md:flex-none px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2">
            <i data-lucide="calendar" class="w-4 h-4"></i> 
            <span>Agenda</span>
          </button>
        </div>
        <div id="subaba-mdf-projetos" class="subaba-mdf-content flex-1"></div>
        <div id="subaba-mdf-orcamentos" class="subaba-mdf-content flex-1 hidden"></div>
        <div id="subaba-mdf-agenda" class="subaba-mdf-content flex-1 hidden"></div>
      </div>
    `;

    this.container.querySelectorAll('.subaba-mdf-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const aba = e.currentTarget.dataset.subaba;
        if (aba) this.mostrarSubAba(aba);
      });
    });
  }

  // Método auxiliar para atualizar o estilo dos botões (ativo vs inativo)
 atualizarEstiloBotoes(abaAtiva) {
  const botoes = {
    projetos: this.container.querySelector('[data-subaba="projetos"]'),
    orcamentos: this.container.querySelector('[data-subaba="orcamentos"]'),
    agenda: this.container.querySelector('[data-subaba="agenda"]')
  };
  const estiloAtivo = 'bg-emerald-600 text-white shadow-md border-transparent';
  const estiloInativo = 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50';

  for (const [aba, btn] of Object.entries(botoes)) {
    if (!btn) continue;
    if (aba === abaAtiva) {
      btn.classList.remove(...btn.classList);
      btn.classList.add('subaba-mdf-btn', 'relative', 'flex-1', 'md:flex-none', 'px-6', 'py-2.5', 'rounded-xl', 'font-bold', 'text-sm', 'transition-all', 'duration-200', 'flex', 'items-center', 'justify-center', 'gap-2', ...estiloAtivo.split(' '));
    } else {
      btn.classList.remove(...btn.classList);
      btn.classList.add('subaba-mdf-btn', 'relative', 'flex-1', 'md:flex-none', 'px-6', 'py-2.5', 'rounded-xl', 'font-bold', 'text-sm', 'transition-all', 'duration-200', 'flex', 'items-center', 'justify-center', 'gap-2', ...estiloInativo.split(' '));
    }
  }
}

 mostrarSubAba(nome) {
  this.activeSubTab = nome;
  this.atualizarEstiloBotoes(nome);

  this.container.querySelectorAll('.subaba-mdf-content').forEach(el => el.classList.add('hidden'));
  const area = document.getElementById(`subaba-mdf-${nome}`);
  if (area) area.classList.remove('hidden');

  if (nome === 'projetos') {
    if (!this.projetosManager) {
      this.projetosManager = new ProjetosMDF(area, this);
    }
  } else if (nome === 'orcamentos') {
    if (!this.orcamentosManager) {
      this.orcamentosManager = new OrcamentosMDF(area, this);
    } else {
      this.orcamentosManager.renderizarOrcamentos();
    }
  } else if (nome === 'agenda') {
    if (!this.agendaManager) {
      // Importa o módulo agenda.js (já carregado via script no HTML)
      this.agendaManager = new AgendaManager(area, supabaseClient);
    } else {
      // Recarrega para refletir agendamentos criados/alterados no orçamento
      this.agendaManager.atualizarApPosAlteracao();
    }
  }
}
  // Métodos auxiliares compartilhados com o editor 2D
  obterDimensoesGerais() {
    if (this.linhas.length > 0) {
      const xs = this.linhas.flatMap(l => [l.x1, l.x2]);
      const ys = this.linhas.flatMap(l => [l.y1, l.y2]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return {
        largura: (maxX - minX) || 80,
        altura: (maxY - minY) || 220,
        offsetX: minX,
        offsetY: minY
      };
    }
    return null;
  }

  obterResumoProjeto() {
    const dims = this.obterDimensoesGerais();
    if (!dims) return null;
    const { largura, altura } = dims;
    const profundidade = this.profundidade;
    let numPortas = 0, numGavetas = 0;
    this.preenchimentos.forEach(p => {
      if (p.tipo === 'porta') numPortas += (p.subdivisoes || 1);
      else if (p.tipo === 'gaveta') numGavetas += (p.subdivisoes || 1);
    });
    const cor = "Branco";
    return {
      descricao: `Armário ${largura.toFixed(0)}x${altura.toFixed(0)}x${profundidade}cm, ${numPortas} porta(s) + ${numGavetas} gaveta(s), ${cor}`,
      largura, altura, profundidade, numPortas, numGavetas, cor
    };
  }

  gerarListaPecas() {
    const pecas = [];
    const d = 1.8;
    const dims = this.obterDimensoesGerais();
    if (!dims) return pecas;
    const { largura, altura, offsetX, offsetY } = dims;
    const profundidade = this.profundidade;

    pecas.push({ nome: 'Lateral Esquerda', qtd: 1, dim: `${d} x ${altura} x ${profundidade}` });
    pecas.push({ nome: 'Lateral Direita', qtd: 1, dim: `${d} x ${altura} x ${profundidade}` });
    pecas.push({ nome: 'Fundo', qtd: 1, dim: `${largura - 2*d} x ${d} x ${profundidade}` });
    pecas.push({ nome: 'Teto', qtd: 1, dim: `${largura} x ${d} x ${profundidade}` });

    this.linhas.forEach(linha => {
      const y = linha.y1;
      if (Math.abs(linha.y1 - linha.y2) < 0.1 && y > offsetY + 5 && y < offsetY + altura - 5) {
        pecas.push({ nome: `Prateleira Fixa (y=${y.toFixed(0)})`, qtd: 1, dim: `${largura - 2*d} x ${d} x ${profundidade - 2*d}` });
      } else if (Math.abs(linha.x1 - linha.x2) < 0.1) {
        const x = linha.x1;
        if (x > offsetX + 5 && x < offsetX + largura - 5) {
          pecas.push({ nome: `Divisória Vertical (x=${x.toFixed(0)})`, qtd: 1, dim: `${d} x ${altura} x ${profundidade - 2*d}` });
        }
      }
    });

    this.preenchimentos.forEach(p => {
      const sub = p.subdivisoes || 1;
      const subW = p.w / sub;
      if (p.tipo === 'porta') {
        pecas.push({ nome: `Porta (${p.w.toFixed(0)}x${p.h.toFixed(0)})`, qtd: sub, dim: `${subW.toFixed(0)} x ${p.h.toFixed(0)} x 1.2` });
      } else if (p.tipo === 'gaveta') {
        pecas.push({ nome: `Frente Gaveta (${subW.toFixed(0)}x${p.h.toFixed(0)})`, qtd: sub, dim: `${subW.toFixed(0)} x ${p.h.toFixed(0)} x 1.2` });
        pecas.push({ nome: `Lateral Gaveta (${subW.toFixed(0)}x${profundidade - 2*d - 2})`, qtd: sub * 2, dim: `${d} x ${p.h.toFixed(0)} x ${profundidade - 2*d - 2}` });
        pecas.push({ nome: `Fundo Gaveta (${subW.toFixed(0)}x${profundidade - 2*d - 2})`, qtd: sub, dim: `${subW.toFixed(0)} x ${d} x ${profundidade - 2*d - 2}` });
      } else if (p.tipo === 'fundo') {
        pecas.push({ nome: `Painel de Fundo (${p.w.toFixed(0)}x${p.h.toFixed(0)})`, qtd: 1, dim: `${p.w.toFixed(0)} x ${p.h.toFixed(0)} x ${d}` });
      }
    });

    return pecas;
  }
}

// ==================== EDITOR DE FACHADA 2D ====================
class EditorFachada2DMDF {
  constructor(container, manager) {
    this.container = container;
    this.manager = manager;
    this.escala = 2;
    this.grade = 10;
    this.modo = 'linha';
    this.drawing = false;
    this.startX = 0; this.startY = 0;
    this.currentPreview = null;
    this.renderizar();
  }

  renderizar() {
    this.container.innerHTML = `
      <div class="flex flex-col gap-2 h-full">
        <div class="flex gap-2 bg-white p-2 rounded-lg shadow-sm border items-center flex-wrap">
          <button class="tool-btn-mdf px-3 py-1 rounded text-sm font-bold bg-[#b8a94e] text-white flex items-center gap-1" data-tool="linha"><i data-lucide="pen-tool" class="w-4 h-4"></i> Linha</button>
          <button class="tool-btn-mdf px-3 py-1 rounded text-sm font-bold bg-slate-200 text-slate-700 flex items-center gap-1" data-tool="retangulo"><i data-lucide="door-open" class="w-4 h-4"></i> Porta / Gaveta / Fundo</button>
          <button class="tool-btn-mdf px-3 py-1 rounded text-sm font-bold bg-red-100 text-red-700 flex items-center gap-1" data-tool="desfazer"><i data-lucide="undo-2" class="w-4 h-4"></i> Desfazer</button>
          <button class="tool-btn-mdf px-3 py-1 rounded text-sm font-bold bg-red-300 text-red-900 flex items-center gap-1" data-tool="limpar"><i data-lucide="trash-2" class="w-4 h-4"></i> Limpar Tudo</button>
          <span class="text-xs text-slate-500 ml-2">Grade: ${this.grade}cm | Arraste para desenhar</span>
        </div>
        <div class="flex-1 bg-white rounded-xl border shadow-sm relative overflow-hidden" id="canvas-fachada-mdf" style="min-height:500px;">
          <canvas id="fachada-canvas-mdf" class="absolute inset-0 w-full h-full"></canvas>
        </div>
      </div>
      <div id="modal-tipo-preenchimento-mdf" class="hidden fixed inset-0 bg-black/40 z-[60] flex items-center justify-center">
        <div class="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full">
          <h3 class="font-bold text-lg mb-4">Selecionar tipo</h3>
          <div class="grid grid-cols-1 gap-2" id="opcoes-modal-mdf"></div>
          <button onclick="document.getElementById('modal-tipo-preenchimento-mdf').classList.add('hidden')" class="mt-4 w-full py-2 bg-slate-200 rounded-lg font-bold">Cancelar</button>
        </div>
      </div>
    `;

    this.canvas = document.getElementById('fachada-canvas-mdf');
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.desenhar();
    this.bindEventos();

    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Modal de tipo de preenchimento: fecha com Esc ou clique fora
    const modalTipo = document.getElementById('modal-tipo-preenchimento-mdf');
    if (modalTipo) {
      modalTipo.addEventListener('click', (e) => {
        if (e.target === modalTipo) modalTipo.classList.add('hidden');
      });
      document.addEventListener('keydown', function fecharPorEsc(e) {
        if (e.key === 'Escape' && !modalTipo.classList.contains('hidden')) {
          modalTipo.classList.add('hidden');
        }
      });
    }
  }

  resizeCanvas() {
    const c = document.getElementById('canvas-fachada-mdf');
    if (!c) return;
    this.canvas.width = c.clientWidth;
    this.canvas.height = c.clientHeight;
    this.desenhar();
  }

  snap(v) { return Math.round(v / this.grade) * this.grade; }

  obterCoordenadas(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / this.escala, y: (e.clientY - rect.top) / this.escala };
  }

  desenhar() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const passo = this.grade * this.escala;
    ctx.strokeStyle = '#e8ecf0'; ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += passo) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += passo) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 3;
    this.manager.linhas.forEach(l => {
      ctx.beginPath();
      ctx.moveTo(l.x1 * this.escala, l.y1 * this.escala);
      ctx.lineTo(l.x2 * this.escala, l.y2 * this.escala);
      ctx.stroke();
    });

    this.manager.preenchimentos.forEach(p => {
      let color;
      if (p.tipo === 'porta') color = 'rgba(139,90,43,0.6)';
      else if (p.tipo === 'gaveta') color = 'rgba(160,120,60,0.6)';
      else color = 'rgba(200,200,200,0.5)';
      ctx.fillStyle = color;
      ctx.fillRect(p.x * this.escala, p.y * this.escala, p.w * this.escala, p.h * this.escala);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2;
      ctx.strokeRect(p.x * this.escala, p.y * this.escala, p.w * this.escala, p.h * this.escala);
      ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif';
      ctx.fillText(p.tipo + (p.subdivisoes ? ` (${p.subdivisoes}x)` : ''), p.x * this.escala + 4, p.y * this.escala + 14);
    });

    if (this.currentPreview) {
      const { x, y, w, h, tipo } = this.currentPreview;
      if (tipo === 'linha') {
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(w, h); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
      }
    }
  }

  bindEventos() {
    this.container.querySelectorAll('.tool-btn-mdf').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tool = e.currentTarget.dataset.tool;
        if (tool === 'desfazer') {
          if (this.manager.preenchimentos.length) this.manager.preenchimentos.pop();
          else if (this.manager.linhas.length) this.manager.linhas.pop();
          this.desenhar();
        } else if (tool === 'limpar') {
          this.manager.linhas = [];
          this.manager.preenchimentos = [];
          this.desenhar();
        } else {
          this.modo = tool;
          this.container.querySelectorAll('.tool-btn-mdf').forEach(b => { b.classList.remove('bg-[#b8a94e]', 'text-white'); b.classList.add('bg-slate-200', 'text-slate-700'); });
          e.currentTarget.classList.add('bg-[#b8a94e]', 'text-white');
          e.currentTarget.classList.remove('bg-slate-200', 'text-slate-700');
        }
      });
    });

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
  }

  onMouseDown(e) {
    const { x, y } = this.obterCoordenadas(e);
    this.startX = this.snap(x);
    this.startY = this.snap(y);
    this.drawing = true;
    this.currentPreview = null;
    this.desenhar();
  }

  onMouseMove(e) {
    if (!this.drawing) return;
    const { x, y } = this.obterCoordenadas(e);
    const sx = this.snap(x), sy = this.snap(y);
    if (this.modo === 'linha') {
      const dx = Math.abs(sx - this.startX), dy = Math.abs(sy - this.startY);
      let x2 = sx, y2 = sy;
      if (dx > dy) y2 = this.startY; else x2 = this.startX;
      this.currentPreview = { tipo: 'linha', x: this.startX * this.escala, y: this.startY * this.escala, w: x2 * this.escala, h: y2 * this.escala };
    } else {
      const w = Math.abs(sx - this.startX) * this.escala;
      const h = Math.abs(sy - this.startY) * this.escala;
      const px = (sx >= this.startX ? this.startX : sx) * this.escala;
      const py = (sy >= this.startY ? this.startY : sy) * this.escala;
      this.currentPreview = { tipo: 'retangulo', x: px, y: py, w, h };
    }
    this.desenhar();
  }

  onMouseUp(e) {
    if (!this.drawing) return;
    this.drawing = false;
    const { x, y } = this.obterCoordenadas(e);
    const sx = this.snap(x), sy = this.snap(y);

    if (this.modo === 'linha') {
      const dx = Math.abs(sx - this.startX), dy = Math.abs(sy - this.startY);
      let x1 = this.startX, y1 = this.startY, x2 = sx, y2 = sy;
      if (dx > dy) y2 = y1; else x2 = x1;
      if (x1 !== x2 || y1 !== y2) {
        this.manager.linhas.push({ x1, y1, x2, y2 });
      }
    } else {
      const w = Math.abs(sx - this.startX);
      const h = Math.abs(sy - this.startY);
      if (w > 0 && h > 0) {
        const px = Math.min(this.startX, sx);
        const py = Math.min(this.startY, sy);
        this.abrirModalPreenchimento(px, py, w, h);
      }
    }
    this.currentPreview = null;
    this.desenhar();
  }

  abrirModalPreenchimento(px, py, w, h) {
    const modal = document.getElementById('modal-tipo-preenchimento-mdf');
    const opcoes = document.getElementById('opcoes-modal-mdf');
    const opcoesTipo = [
      { label: 'Porta (1 folha)', tipo: 'porta', sub: 1 },
      { label: 'Porta (2 folhas)', tipo: 'porta', sub: 2 },
      { label: 'Porta (3 folhas)', tipo: 'porta', sub: 3 },
      { label: 'Porta (4 folhas)', tipo: 'porta', sub: 4 },
      { label: '1 Gaveta', tipo: 'gaveta', sub: 1 },
      { label: '2 Gavetas', tipo: 'gaveta', sub: 2 },
      { label: '3 Gavetas', tipo: 'gaveta', sub: 3 },
      { label: '4 Gavetas', tipo: 'gaveta', sub: 4 },
      { label: 'Fundo / Painel Cego', tipo: 'fundo', sub: 1 },
    ];
    opcoes.innerHTML = opcoesTipo.map(o => `
      <button class="w-full py-3 border rounded-lg font-bold hover:bg-amber-50 transition text-left px-4"
              data-tipo="${o.tipo}" data-sub="${o.sub}">${o.label}</button>
    `).join('');
    opcoes.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const tipo = btn.dataset.tipo;
        const sub = parseInt(btn.dataset.sub);
        this.manager.preenchimentos.push({ x: px, y: py, w, h, tipo, subdivisoes: sub });
        modal.classList.add('hidden');
        this.desenhar();
      });
    });
    modal.classList.remove('hidden');
  }
}

// ==================== CONFIGURADOR 3D COMPLETO (igual ao original) ====================
class ConfiguradorArmarioMDF {
  constructor(container, manager) {
    this.container = container;
    this.manager = manager;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.armarioGrupo = null;
    this.init();
  }

  init() {
    this.container.innerHTML = '';
    this.criarCena();
    this.reconstruirModelo();
    this.animar();
  }

  criarCena() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#f1f5f9');

    const w = this.container.clientWidth || 600;
    const h = this.container.clientHeight || 400;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 10, 2000);
    this.camera.position.set(250, 180, 350);
    this.camera.lookAt(0, 100, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(0, 200, 200);
    this.scene.add(dir);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 100, 0);
    this.controls.update();

    const gridHelper = new THREE.GridHelper(400, 20, 0xcccccc, 0xe0e0e0);
    this.scene.add(gridHelper);
  }

  reconstruirModelo() {
    if (this.armarioGrupo) {
      this.scene.remove(this.armarioGrupo);
      this.armarioGrupo = null;
    }

    const dims = this.manager.obterDimensoesGerais();
    if (!dims) return;

    const { largura, altura, offsetX, offsetY } = dims;
    const profundidade = this.manager.profundidade;
    const d = 1.8;
    const matCorpo = new THREE.MeshStandardMaterial({ color: '#A67B5B', roughness: 0.5 });
    const matPorta = new THREE.MeshStandardMaterial({ color: '#8B5A2B', roughness: 0.4 });
    const matGaveta = new THREE.MeshStandardMaterial({ color: '#b89a6b', roughness: 0.5 });
    const matFundo = new THREE.MeshStandardMaterial({ color: '#d0c8b0', roughness: 0.6 });

    this.armarioGrupo = new THREE.Group();

    const to3D = (canvasX, canvasY) => {
      const x3D = canvasX - offsetX - largura / 2;
      const y3D = altura - (canvasY - offsetY);
      return { x: x3D, y: y3D };
    };

    // Estrutura fixa
    const leftX = offsetX;
    const rightX = offsetX + largura;
    this.armarioGrupo.add(new THREE.Mesh(new THREE.BoxGeometry(d, altura, profundidade), matCorpo).translateX(to3D(leftX, 0).x).translateY(altura / 2));
    this.armarioGrupo.add(new THREE.Mesh(new THREE.BoxGeometry(d, altura, profundidade), matCorpo).translateX(to3D(rightX, 0).x).translateY(altura / 2));
    this.armarioGrupo.add(new THREE.Mesh(new THREE.BoxGeometry(largura - 2 * d, d, profundidade), matCorpo).translateY(d / 2));
    this.armarioGrupo.add(new THREE.Mesh(new THREE.BoxGeometry(largura, d, profundidade), matCorpo).translateY(altura - d / 2));

    // Prateleiras
    this.manager.linhas.forEach(linha => {
      if (Math.abs(linha.y1 - linha.y2) < 0.1) {
        const yCanvas = linha.y1;
        if (yCanvas > offsetY + 5 && yCanvas < offsetY + altura - 5) {
          const y3D = to3D(0, yCanvas).y;
          this.armarioGrupo.add(new THREE.Mesh(new THREE.BoxGeometry(largura - 2 * d, d, profundidade - 2 * d), matCorpo).translateY(y3D));
        }
      }
    });

    // Divisórias
    this.manager.linhas.forEach(linha => {
      if (Math.abs(linha.x1 - linha.x2) < 0.1) {
        const xCanvas = linha.x1;
        if (xCanvas > offsetX + 5 && xCanvas < offsetX + largura - 5) {
          const x3D = to3D(xCanvas, 0).x;
          this.armarioGrupo.add(new THREE.Mesh(new THREE.BoxGeometry(d, altura, profundidade - 2 * d), matCorpo).translateX(x3D).translateY(altura / 2));
        }
      }
    });

    // Portas, gavetas e fundos
    const espessuraFrente = d * 0.8;
    this.manager.preenchimentos.forEach(p => {
      const baseX3D = to3D(p.x, 0).x;
      const centroY3D = to3D(0, p.y + p.h / 2).y;
      const faceFrontalZ = profundidade / 2;

      if (p.tipo === 'porta') {
        const sub = p.subdivisoes || 1;
        const subW = p.w / sub;
        for (let i = 0; i < sub; i++) {
          const cx = baseX3D + subW / 2 + i * subW;
          const porta = new THREE.Mesh(new THREE.BoxGeometry(subW, p.h, espessuraFrente), matPorta);
          porta.position.set(cx, centroY3D, faceFrontalZ - espessuraFrente / 2);
          this.armarioGrupo.add(porta);
          porta.add(new THREE.LineSegments(new THREE.EdgesGeometry(porta.geometry), new THREE.LineBasicMaterial({ color: '#1e293b' })));
          const puxador = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), new THREE.MeshStandardMaterial({ color: '#c0c0c0', metalness: 0.9, roughness: 0.2 }));
          puxador.position.set(subW / 2 - 4, p.h / 2 - 10, espessuraFrente / 2 + 0.5);
          porta.add(puxador);
        }
      } else if (p.tipo === 'gaveta') {
        const sub = p.subdivisoes || 1;
        const subH = p.h / sub;
        const centroX = baseX3D + p.w / 2;
        for (let i = 0; i < sub; i++) {
          const cy = centroY3D + (p.h / 2) - subH / 2 - i * subH;
          const frenteGeom = new THREE.BoxGeometry(p.w, subH, espessuraFrente);
          const frente = new THREE.Mesh(frenteGeom, matGaveta);
          frente.position.set(centroX, cy, faceFrontalZ - espessuraFrente / 2);
          this.armarioGrupo.add(frente);
          frente.add(new THREE.LineSegments(new THREE.EdgesGeometry(frenteGeom), new THREE.LineBasicMaterial({ color: '#1e293b' })));
          const friso = new THREE.Mesh(new THREE.BoxGeometry(p.w - 0.4, 0.4, espessuraFrente + 0.3), new THREE.MeshBasicMaterial({ color: '#1e293b' }));
          friso.position.set(0, -subH / 2 + 2.5, 0);
          frente.add(friso);
          // Corpo da gaveta
          const profundidadeCorpo = profundidade - 2 * d - 2;
          const alturaCorpo = subH - d * 2;
          const larguraCorpo = p.w - d * 2;
          const zFrenteTraseira = faceFrontalZ - espessuraFrente;
          const zCentroCorpo = zFrenteTraseira - profundidadeCorpo / 2;
          const geoLat = new THREE.BoxGeometry(d, alturaCorpo, profundidadeCorpo);
          this.armarioGrupo.add(new THREE.Mesh(geoLat, matGaveta).translateX(centroX - p.w / 2 + d / 2).translateY(cy).translateZ(zCentroCorpo));
          this.armarioGrupo.add(new THREE.Mesh(geoLat, matGaveta).translateX(centroX + p.w / 2 - d / 2).translateY(cy).translateZ(zCentroCorpo));
          this.armarioGrupo.add(new THREE.Mesh(new THREE.BoxGeometry(larguraCorpo, d, profundidadeCorpo), matGaveta).translateX(centroX).translateY(cy - alturaCorpo / 2 + d / 2).translateZ(zCentroCorpo));
        }
      } else if (p.tipo === 'fundo') {
        const centroX = baseX3D + p.w / 2;
        this.armarioGrupo.add(new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, d), matFundo).translateX(centroX).translateY(centroY3D).translateZ(-profundidade / 2 + d / 2));
      }
    });

    this.scene.add(this.armarioGrupo);
  }

  animar() {
    requestAnimationFrame(() => this.animar());
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  }
}

// ==================== SUB-ABA PROJETOS ====================
class ProjetosMDF {
  constructor(container, parentManager) {
    this.container = container;
    this.parentManager = parentManager;
    this.editor2D = null;
    this.configurador3D = null;
    this.init();
  }

  init() {
    this.renderizar();
    this.mostrarSubSubAba('fachada');
  }

  renderizar() {
   this.container.innerHTML = `
    <div class="flex flex-col h-full">
      <div class="flex flex-wrap justify-between items-center gap-2 mb-4 bg-white p-2 rounded-xl shadow-sm border">
        <div class="flex gap-2">
          <button data-subsubaba="fachada" class="subsubaba-mdf-btn px-4 py-2 rounded-lg font-bold text-sm bg-[#b8a94e] text-white shadow flex items-center gap-1"><i data-lucide="ruler" class="w-4 h-4"></i> Fachada 2D</button>
          <button data-subsubaba="3d" class="subsubaba-mdf-btn px-4 py-2 rounded-lg font-bold text-sm text-slate-600 hover:bg-slate-100 flex items-center gap-1"><i data-lucide="box" class="w-4 h-4"></i> 3D</button>
          <button data-subsubaba="detalhamento" class="subsubaba-mdf-btn px-4 py-2 rounded-lg font-bold text-sm text-slate-600 hover:bg-slate-100 flex items-center gap-1"><i data-lucide="clipboard-list" class="w-4 h-4"></i> Detalhamento</button>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-xs font-bold text-slate-600">Profundidade (cm):</label>
          <input type="number" id="profundidade-input-mdf" value="60" min="30" max="80" class="w-16 p-1 border rounded text-xs">
          <button onclick="window.open('https://flatma.com/pt/create/designer', '_blank')" title="Abrir Flatma" class="px-3 py-1 border border-[#b8a94e] text-[#b8a94e] rounded text-xs font-bold hover:bg-amber-50 transition flex items-center gap-1"><i data-lucide="external-link" class="w-4 h-4"></i> Flatma</button>
        </div>
      </div>
      <div id="subsubaba-fachada" class="subsubaba-mdf-content flex-1"></div>
      <div id="subsubaba-3d" class="subsubaba-mdf-content flex-1 hidden"></div>
      <div id="subsubaba-detalhamento" class="subsubaba-mdf-content flex-1 hidden"></div>
    </div>
  `;

    // Sincronizar profundidade com o manager principal
    const profundidadeInput = document.getElementById('profundidade-input-mdf');
    if (profundidadeInput) {
      profundidadeInput.value = this.parentManager.profundidade;
      profundidadeInput.addEventListener('change', (e) => {
        const novaProfundidade = parseFloat(e.target.value) || 60;
        this.parentManager.profundidade = novaProfundidade;
        if (this.configurador3D) {
          this.configurador3D.reconstruirModelo();
        }
        const areaDetalhamento = document.getElementById('subsubaba-detalhamento');
        if (areaDetalhamento && !areaDetalhamento.classList.contains('hidden')) {
          this.atualizarDetalhamento(areaDetalhamento);
        }
      });
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();

    this.container.querySelectorAll('.subsubaba-mdf-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.mostrarSubSubAba(e.currentTarget.dataset.subsubaba));
    });
  }

  mostrarSubSubAba(nome) {
    this.container.querySelectorAll('.subsubaba-mdf-btn').forEach(btn => {
      btn.classList.remove('bg-[#b8a94e]', 'text-white', 'shadow');
      btn.classList.add('text-slate-600', 'hover:bg-slate-100');
    });
    const btnAtivo = this.container.querySelector(`[data-subsubaba="${nome}"]`);
    if (btnAtivo) {
      btnAtivo.classList.add('bg-[#b8a94e]', 'text-white', 'shadow');
      btnAtivo.classList.remove('text-slate-600', 'hover:bg-slate-100');
    }

    this.container.querySelectorAll('.subsubaba-mdf-content').forEach(el => el.classList.add('hidden'));
    const area = document.getElementById(`subsubaba-${nome}`);
    if (area) area.classList.remove('hidden');

    if (nome === 'fachada' && !this.editor2D) {
      this.editor2D = new EditorFachada2DMDF(area, this.parentManager);
    } else if (nome === '3d') {
      if (!this.configurador3D) {
        this.configurador3D = new ConfiguradorArmarioMDF(area, this.parentManager);
      } else {
        this.configurador3D.reconstruirModelo();
      }
    } else if (nome === 'detalhamento') {
      this.atualizarDetalhamento(area);
    }
  }

  atualizarDetalhamento(area) {
    const pecas = this.parentManager.gerarListaPecas();
    area.innerHTML = `
      <div class="bg-white rounded-xl shadow border p-4 flex flex-col h-full">
        <h3 class="font-bold text-lg mb-3">Detalhamento do Projeto</h3>
        <div class="flex-1 overflow-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-100"><tr><th class="p-2 text-left">Peça</th><th class="p-2 text-center">Qtd</th><th class="p-2 text-right">Dimensões (cm)</th></tr></thead>
            <tbody>${pecas.map(p => `<tr class="border-b"><td class="p-2">${p.nome}</td><td class="p-2 text-center">${p.qtd}</td><td class="p-2 text-right">${p.dim}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="mt-4 flex gap-2 justify-end">
          <button id="btn-imprimir-detalhamento-mdf" class="btn-outline px-4 py-2 rounded-lg font-bold flex items-center gap-1"><i data-lucide="printer" class="w-4 h-4"></i> Imprimir Detalhamento</button>
          <button id="btn-enviar-resumo-mdf" class="btn-primary px-6 py-2 rounded-lg font-bold shadow flex items-center gap-1"><i data-lucide="send" class="w-4 h-4"></i> Enviar para Orçamento (Resumo)</button>
        </div>
      </div>`;

    document.getElementById('btn-imprimir-detalhamento-mdf').addEventListener('click', () => {
      this.imprimirDetalhamento(pecas);
    });
    document.getElementById('btn-enviar-resumo-mdf').addEventListener('click', () => {
      this.enviarResumoParaOrcamento();
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  imprimirDetalhamento(pecas) {
    const html = `
      <div style="font-family: Helvetica; padding: 20px; max-width: 800px; margin: auto; background: white;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2>${window.getCompany ? window.getCompany().name : 'NÉVOA'}</h2>
          <h3>Detalhamento do Projeto</h3>
        </div>
        <table style="width:100%; border-collapse: collapse; font-size: 12px;">
          <thead><tr style="background:#eee;"><th style="padding:6px; text-align:left;">Peça</th><th style="padding:6px; text-align:center;">Qtd</th><th style="padding:6px; text-align:right;">Dimensões</th></tr></thead>
          <tbody>${pecas.map(p => `<tr><td style="padding:6px;">${p.nome}</td><td style="text-align:center;">${p.qtd}</td><td style="text-align:right;">${p.dim}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    `;
    const w = window.open('', '', 'width=800,height=600');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  }

  async enviarResumoParaOrcamento() {
    const resumo = this.parentManager.obterResumoProjeto();
    if (!resumo) {
      window.showToast("Desenhe o projeto primeiro.", true);
      return;
    }

    let fotoUrl = '';
    if (this.configurador3D && this.configurador3D.renderer) {
      try {
        const canvas = this.configurador3D.renderer.domElement;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          fotoUrl = await enviarImagemImgBB(blob);
        }
      } catch (e) {
        console.warn("Erro ao capturar imagem 3D:", e);
        window.showToast("Não foi possível gerar a imagem 3D do projeto.", true);
      }
    }

    this.modalSelecaoOrcamento(resumo, fotoUrl);
  }

  modalSelecaoOrcamento(resumo, fotoUrl) {
    const overlay = document.createElement('div');
    overlay.id = 'modal-selecao-orcamento-mdf';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;';
    overlay.innerHTML = `
      <div style="background:white; border-radius:16px; box-shadow:0 20px 40px rgba(0,0,0,0.2); max-width:400px; width:90%; padding:20px; position:relative;">
        <button style="position:absolute; top:10px; right:15px; background:none; border:none; font-size:1.5rem; cursor:pointer; color:#64748b;" 
                onclick="this.closest('#modal-selecao-orcamento-mdf').remove()">&times;</button>
        <h3 style="font-size:1.2rem; font-weight:700; margin-bottom:15px;">Enviar para Orçamento</h3>
        <p style="margin-bottom:20px;">Deseja criar um <strong>novo orçamento</strong> ou adicionar a um <strong>existente</strong>?</p>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="btn-novo-orcamento-mdf" style="padding:10px 20px; background:#b8a94e; color:#1e293b; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Novo Orçamento</button>
          <button id="btn-orcamento-existente-mdf" style="padding:10px 20px; background:transparent; border:1.5px solid #b8a94e; color:#b8a94e; border-radius:8px; font-weight:bold; cursor:pointer;">Adicionar a Existente</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('btn-novo-orcamento-mdf').addEventListener('click', () => {
      overlay.remove();
      this.criarNovoOrcamento(resumo, fotoUrl);
    });
    document.getElementById('btn-orcamento-existente-mdf').addEventListener('click', () => {
      overlay.remove();
      this.selecionarOrcamentoExistente(resumo, fotoUrl);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  obterOrcamentosManager() {
    if (this.parentManager.orcamentosManager) return this.parentManager.orcamentosManager;
    const areaOrc = document.getElementById('subaba-mdf-orcamentos');
    if (!areaOrc) return null;
    const orcManager = new OrcamentosMDF(areaOrc, this.parentManager);
    this.parentManager.orcamentosManager = orcManager;
    return orcManager;
  }

  criarNovoOrcamento(resumo, fotoUrl) {
    const orcManager = this.obterOrcamentosManager();
    if (!orcManager) {
      window.showToast("Módulo de orçamentos não disponível.", true);
      return;
    }
    orcManager.abrirNovoOrcamento();
    setTimeout(() => {
      orcManager.adicionarItem({
        nome: resumo.descricao,
        descricao: 'Projeto gerado automaticamente.',
        preco: 0,
        desconto: 0,
        foto_url: fotoUrl
      });
    }, 600);
    this.parentManager.mostrarSubAba('orcamentos');
  }

  async selecionarOrcamentoExistente(resumo, fotoUrl) {
    try {
      const { data: orcamentos, error } = await supabaseClient
        .from('mdf_orcamentos')
        .select('id, cliente_nome, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      if (!orcamentos || orcamentos.length === 0) {
        window.showToast("Nenhum orçamento encontrado. Crie um novo primeiro.", true);
        return;
      }
      this.modalListaOrcamentos(resumo, fotoUrl, orcamentos);
    } catch (err) {
      console.error(err);
      window.showToast("Erro ao carregar orçamentos.", true);
    }
  }

  modalListaOrcamentos(resumo, fotoUrl, orcamentos) {
    const overlay = document.createElement('div');
    overlay.id = 'modal-lista-orcamentos-mdf';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;';
    overlay.innerHTML = `
      <div style="background:white; border-radius:16px; box-shadow:0 20px 40px rgba(0,0,0,0.2); max-width:500px; width:90%; padding:20px; position:relative;">
        <button style="position:absolute; top:10px; right:15px; background:none; border:none; font-size:1.5rem; cursor:pointer; color:#64748b;" 
                onclick="this.closest('#modal-lista-orcamentos-mdf').remove()">&times;</button>
        <h3 style="font-size:1.2rem; font-weight:700; margin-bottom:15px;">Selecione o Orçamento</h3>
        <p style="font-size:0.9rem; margin-bottom:15px;">Escolha um orçamento existente para adicionar o item:</p>
        <div style="max-height:300px; overflow-y:auto;">
          ${orcamentos.map(o => `
            <div class="orcamento-item-mdf" data-id="${o.id}" style="padding:12px; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:white; transition:background 0.2s;">
              <div>
                <span style="font-weight:600;">#${o.id} - ${escaparHTML(o.cliente_nome) || 'Sem nome'}</span><br>
                <span style="font-size:0.8rem; color:#64748b;">${new Date(o.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
              <i data-lucide="plus-circle" style="color:#b8a94e;"></i>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:15px; text-align:right;">
          <button style="padding:8px 16px; border:1.5px solid #b8a94e; color:#b8a94e; background:transparent; border-radius:8px; font-weight:bold; cursor:pointer;" 
                  onclick="this.closest('#modal-lista-orcamentos-mdf').remove()">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    overlay.querySelectorAll('.orcamento-item-mdf').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.dataset.id;
        overlay.remove();
        await this.adicionarItemAOrcamento(id, resumo, fotoUrl);
      });
    });
  }

  async adicionarItemAOrcamento(orcamentoId, resumo, fotoUrl) {
    const orcManager = this.obterOrcamentosManager();
    if (!orcManager) {
      window.showToast("Módulo de orçamentos não disponível.", true);
      return;
    }
    await orcManager.editarOrcamento(orcamentoId);
    setTimeout(() => {
      orcManager.adicionarItem({
        nome: resumo.descricao,
        descricao: 'Projeto gerado automaticamente.',
        preco: 0,
        desconto: 0,
        foto_url: fotoUrl
      });
    }, 800);
    this.parentManager.mostrarSubAba('orcamentos');
  }
}

// ==================== SUB-ABA ORÇAMENTOS (COMPLETA) ====================
class OrcamentosMDF {
  constructor(container, parentManager) {
    this.container = container;
    this.parentManager = parentManager;
    this.itens = [];
    this.orcamentoAtualId = null;
    this.renderizarInterface();
  }

  renderizarInterface() {
    this.container.innerHTML = `
      <div class="flex flex-col h-full">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <i data-lucide="folder-open" class="text-emerald-600"></i> Orçamentos MDF
          </h2>
          <div class="flex flex-col md:flex-row gap-2 w-full md:w-auto">
            <div class="relative w-full md:w-64">
              <i data-lucide="search" class="absolute left-2 top-2.5 text-slate-400 w-4 h-4"></i>
              <input type="text" id="search-quotes-mdf" placeholder="Buscar cliente..." class="w-full pl-8 p-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm" onkeyup="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.buscarDebounce()">
            </div>
            <select id="status-filter-mdf" class="w-full md:w-auto p-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm font-medium text-slate-600" onchange="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.renderizarOrcamentos()">
              <option value="">Todos os Status</option>
              <option value="ABERTO">Abertos</option>
              <option value="EM NEGOCIAÇÃO">Em Negociação</option>
              <option value="APROVADO">Aprovados (Faturados)</option>
              <option value="PERDIDO">Perdidos</option>
            </select>
            <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.abrirNovoOrcamento()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold shadow flex items-center gap-2 whitespace-nowrap">
              <i data-lucide="plus"></i> Novo Orçamento
            </button>
          </div>
        </div>

        <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead class="bg-slate-50 text-slate-700">
                <tr>
                  <th class="p-4 w-32">Orçamento</th>
                  <th class="p-4">Cliente / Info</th>
                  <th class="p-4">Valor</th>
                  <th class="p-4 text-center">Status</th>
                  <th class="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody id="lista-orcamentos-mdf" class="divide-y">
                <tr><td colspan="5" class="p-8 text-center text-slate-400">Carregando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal de Orçamento MDF -->
      <div id="modal-orcamento-mdf" class="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-[70] hidden">
        <div class="modal-container bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div class="p-5 border-b flex justify-between items-center bg-amber-50 rounded-t-2xl">
            <h3 class="font-bold text-slate-800 text-lg flex items-center gap-2">
              <i data-lucide="file-text" class="text-emerald-600"></i>
              <span id="modal-titulo-mdf">Novo Orçamento</span>
            </h3>
            <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.fecharModal()" class="text-slate-400 hover:text-red-500"><i data-lucide="x"></i></button>
          </div>
          <div class="p-6 space-y-4">
            <input type="hidden" id="orcamento-id-mdf">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-bold text-slate-700 mb-1">Cliente *</label>
                <div class="flex gap-2">
                  <input type="text" id="cliente-nome-mdf" readonly placeholder="Nenhum cliente selecionado" 
                         class="flex-1 p-2 border rounded-lg bg-slate-50 text-sm cursor-pointer" 
                         onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.abrirModalClientes()">
                  <button type="button" onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.abrirModalClientes()" 
                          class="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1 hover:bg-emerald-700">
                    <i data-lucide="search" class="w-4 h-4"></i> Buscar
                  </button>
                </div>
                <input type="hidden" id="cliente-id-mdf" value="">
              </div>
              <div>
                <label class="block text-sm font-bold text-slate-700 mb-1">Status</label>
                <select id="status-mdf" class="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="ABERTO">Aberto</option>
                  <option value="EM NEGOCIAÇÃO">Em Negociação</option>
                  <option value="APROVADO">Aprovado</option>
                  <option value="PERDIDO">Perdido</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-1">Observações</label>
              <textarea id="observacoes-mdf" rows="2" placeholder="Detalhes do projeto..." class="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"></textarea>
            </div>
            <div class="border-t pt-4">
              <div class="flex justify-between items-center mb-3">
                <h4 class="font-bold text-slate-700">Itens do Projeto</h4>
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.adicionarItem()" class="border border-emerald-600 text-emerald-700 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 hover:bg-emerald-50">
                  <i data-lucide="plus" class="w-4 h-4"></i> Adicionar Item
                </button>
              </div>
              <div id="container-itens-mdf" class="space-y-3"></div>
            </div>
            <div class="bg-slate-50 p-4 rounded-xl border">
              <div class="flex justify-between text-sm mb-1"><span>Subtotal</span> <span id="subtotal-mdf">R$ 0,00</span></div>
              <div class="flex justify-between text-sm mb-1">
                <span>Desconto</span>
                <div class="flex items-center gap-1">
                  <select id="tipo-desconto-mdf" class="text-xs border rounded p-0.5 bg-white" onchange="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.atualizarTotais()">
                    <option value="$">R$</option>
                    <option value="%">%</option>
                  </select>
                  <input type="number" id="valor-desconto-mdf" value="0" step="0.01" class="w-20 p-1 border rounded text-sm text-right" onchange="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.atualizarTotais()">
                </div>
              </div>
              <div class="flex justify-between font-bold text-lg border-t pt-2 mt-1">
                <span>Total</span> <span id="total-geral-mdf" class="text-emerald-700">R$ 0,00</span>
              </div>
            </div>
          </div>
          <div class="p-5 border-t bg-slate-50 rounded-b-2xl flex justify-end gap-3">
            <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.fecharModal()" class="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-100 transition">Cancelar</button>
            <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.salvarOrcamento()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold shadow flex items-center gap-2">
              <i data-lucide="save"></i> Salvar Orçamento
            </button>
            <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.gerarPDF()" class="px-4 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900 transition flex items-center gap-2">
              <i data-lucide="download"></i> Baixar PDF
            </button>
            <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.imprimirOrcamento()" class="px-4 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900 transition flex items-center gap-2">
              <i data-lucide="printer"></i> Imprimir
            </button>
          </div>
        </div>
      </div>
    `;
    this.renderizarOrcamentos();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  buscarDebounce() {
    clearTimeout(this._debounceBusca);
    this._debounceBusca = setTimeout(() => this.renderizarOrcamentos(), 350);
  }

  async renderizarOrcamentos() {
    const lista = document.getElementById('lista-orcamentos-mdf');
    if (!lista) return;
    lista.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400">Carregando...</td></tr>';

    const search = document.getElementById('search-quotes-mdf')?.value.toLowerCase() || '';
    const statusFiltro = document.getElementById('status-filter-mdf')?.value || '';

    let query = supabaseClient.from('mdf_orcamentos').select('*').order('created_at', { ascending: false });
    if (statusFiltro) query = query.eq('status', statusFiltro);

    const { data: orcamentos, error } = await query;
    if (error) {
      lista.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400">Erro ao carregar: ${escaparHTML(error.message)}</td></tr>`;
      return;
    }

    // Mapa de clientes para exibir o NOME ATUAL (renomeio reflete em cadeia)
    const { data: clientesLista } = await supabaseClient.from('clientes').select('id, nome');
    const mapClientes = {};
    (clientesLista || []).forEach(c => { mapClientes[c.id] = c.nome; });
    const nomeCliente = (o) =>
      o.cliente_id != null && mapClientes[o.cliente_id] ? mapClientes[o.cliente_id] : (o.cliente_nome || 'Consumidor Final');

    const filtrados = orcamentos.filter(o => {
      if (!search) return true;
      const alvo = (nomeCliente(o) || o.cliente_nome || '').toLowerCase();
      return alvo.includes(search);
    });

    if (!filtrados.length) {
      lista.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400">Nenhum orçamento encontrado.</td></tr>';
      return;
    }

    // Busca os itens de TODOS os orçamentos visíveis em uma única consulta
    // (evita o N+1 de uma query por orçamento).
    const ids = filtrados.map(o => o.id);
    const { data: itensTodos, error: errItens } = ids.length
      ? await supabaseClient.from('mdf_itens').select('orcamento_id, preco, desconto').in('orcamento_id', ids)
      : { data: [], error: null };
    if (errItens) {
      lista.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400">Erro ao carregar itens: ${escaparHTML(errItens.message)}</td></tr>`;
      return;
    }
    const itensPorOrcamento = {};
    (itensTodos || []).forEach(i => {
      (itensPorOrcamento[i.orcamento_id] = itensPorOrcamento[i.orcamento_id] || []).push(i);
    });

    const dados = filtrados.map((orc) => {
      const itensData = itensPorOrcamento[orc.id] || [];
      let total = itensData.reduce((s, i) => s + parseFloat(i.preco) - parseFloat(i.desconto || 0), 0);
      // Aplica desconto geral do orçamento
      if (orc.desconto && orc.desconto > 0) {
        const descontoAplicado = orc.tipo_desconto === '%' ? total * (orc.desconto / 100) : orc.desconto;
        total = Math.max(0, total - descontoAplicado);
      }
      return { ...orc, total, itensCount: itensData.length };
    });

    lista.innerHTML = dados.map(orc => {
      const statusClass = {
        'ABERTO': 'bg-amber-100 text-amber-800',
        'EM NEGOCIAÇÃO': 'bg-blue-100 text-blue-800',
        'APROVADO': 'bg-green-100 text-green-800',
        'PERDIDO': 'bg-red-100 text-red-800'
      }[orc.status] || 'bg-gray-100 text-gray-800';

      const isAprovado = orc.status === 'APROVADO';
      
      return `
        <tr class="hover:bg-slate-50 transition border-b">
          <td class="p-4">
            <div class="font-black text-slate-700">#${orc.id}</div>
            <div class="text-[10px] text-slate-400">${new Date(orc.created_at).toLocaleDateString('pt-BR')}</div>
          </td>
          <td class="p-4">
            <div class="font-bold text-slate-800">${escaparHTML(nomeCliente(orc))}</div>
            <div class="text-xs text-slate-500">${orc.itensCount} itens</div>
          </td>
          <td class="p-4 font-bold text-slate-800">${formatarMoedaBR(orc.total)}</td>
          <td class="p-4 text-center"><span class="px-2 py-1 rounded-full text-xs font-bold ${statusClass}">${STATUS_LABEL_MDF[orc.status] || escaparHTML(orc.status)}</span></td>
          <td class="p-4">
            <div class="flex items-center justify-center gap-2 flex-wrap">
              ${isAprovado ? `
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.estornarOrcamento(${orc.id})" class="p-2 border border-red-200 bg-white text-red-500 hover:bg-red-50 rounded-lg shadow-sm" title="Estornar Venda">
                  <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
                </button>
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.agendarInstalacao(${orc.id})" class="p-2 border border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50 rounded-lg shadow-sm" title="Agendar Instalação">
                  <i data-lucide="calendar" class="w-4 h-4"></i>
                </button>
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.baixarPDF(${orc.id})" class="p-2 border border-blue-200 bg-white text-blue-600 hover:bg-blue-50 rounded-lg shadow-sm" title="Baixar PDF">
                  <i data-lucide="download" class="w-4 h-4"></i>
                </button>
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.imprimirOrcamento(${orc.id})" class="p-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 rounded-lg shadow-sm" title="Imprimir">
                  <i data-lucide="printer" class="w-4 h-4"></i>
                </button>
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.duplicarOrcamento(${orc.id})" class="p-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 rounded-lg shadow-sm" title="Duplicar">
                  <i data-lucide="copy" class="w-4 h-4"></i>
                </button>
              ` : `
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.faturarOrcamento(${orc.id})" class="p-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg shadow-sm" title="Faturar">
                  <i data-lucide="credit-card" class="w-4 h-4"></i>
                </button>
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.editarOrcamento(${orc.id})" class="p-2 border border-emerald-600 bg-white text-emerald-600 hover:bg-emerald-50 rounded-lg shadow-sm" title="Editar">
                  <i data-lucide="edit-3" class="w-4 h-4"></i>
                </button>                
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.baixarPDF(${orc.id})" class="p-2 border border-blue-200 bg-white text-blue-600 hover:bg-blue-50 rounded-lg shadow-sm" title="Baixar PDF">
                  <i data-lucide="download" class="w-4 h-4"></i>
                </button>
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.imprimirOrcamento(${orc.id})" class="p-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 rounded-lg shadow-sm" title="Imprimir">
                  <i data-lucide="printer" class="w-4 h-4"></i>
                </button>                
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.duplicarOrcamento(${orc.id})" class="p-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 rounded-lg shadow-sm" title="Duplicar">
                  <i data-lucide="copy" class="w-4 h-4"></i>
                </button>
                <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.excluirOrcamento(${orc.id})" class="p-2 border border-red-200 bg-white text-red-500 hover:bg-red-50 rounded-lg shadow-sm" title="Excluir">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  abrirNovoOrcamento() {
    this.orcamentoAtualId = null;
    document.getElementById('modal-titulo-mdf').innerText = 'Novo Orçamento';
    document.getElementById('orcamento-id-mdf').value = '';
    document.getElementById('cliente-nome-mdf').value = '';
    document.getElementById('cliente-id-mdf').value = '';
    document.getElementById('status-mdf').value = 'ABERTO';
    document.getElementById('observacoes-mdf').value = '';
    document.getElementById('tipo-desconto-mdf').value = '$';
    document.getElementById('valor-desconto-mdf').value = '0';
    this.itens = [];
    this.renderizarItens();
    this.atualizarTotais();
    document.getElementById('modal-orcamento-mdf').classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  fecharModal() {
    document.getElementById('modal-orcamento-mdf').classList.add('hidden');
  }

  async editarOrcamento(id) {
    this.orcamentoAtualId = id;
    document.getElementById('modal-titulo-mdf').innerText = `Editar Orçamento #${id}`;

    const { data: orc, error: errOrc } = await supabaseClient.from('mdf_orcamentos').select('*').eq('id', id).single();
    if (errOrc || !orc) {
      window.showToast('Não foi possível carregar o orçamento.', true);
      return;
    }
    if (orc) {
      document.getElementById('status-mdf').value = orc.status || 'ABERTO';
      document.getElementById('observacoes-mdf').value = orc.observacoes || '';
      document.getElementById('tipo-desconto-mdf').value = orc.tipo_desconto || '$';
      document.getElementById('valor-desconto-mdf').value = orc.desconto || 0;
      
      // Preencher cliente (resolve por cliente_id; fallback por nome p/ registros antigos)
      if (orc.cliente_nome) {
        document.getElementById('cliente-nome-mdf').value = orc.cliente_nome;
        let clienteId = orc.cliente_id != null ? orc.cliente_id : null;
        if (clienteId != null) {
          // Nome atual do cliente (renomeio reflete em cadeia)
          const { data: cliente } = await supabaseClient
            .from('clientes')
            .select('id, nome')
            .eq('id', clienteId)
            .maybeSingle();
          if (cliente) {
            clienteId = cliente.id;
            document.getElementById('cliente-nome-mdf').value = cliente.nome;
          } else {
            clienteId = null;
          }
        } else {
          const { data: cliente } = await supabaseClient
            .from('clientes')
            .select('id')
            .eq('nome', orc.cliente_nome)
            .maybeSingle();
          clienteId = cliente?.id || null;
        }
        document.getElementById('cliente-id-mdf').value = clienteId != null ? clienteId : '';
      } else {
        document.getElementById('cliente-nome-mdf').value = '';
        document.getElementById('cliente-id-mdf').value = '';
      }
    }

    const { data: itensData } = await supabaseClient.from('mdf_itens').select('*').eq('orcamento_id', id);
    this.itens = itensData ? itensData.map(i => ({
      id: i.id,
      nome: i.nome,
      descricao: i.descricao || '',
      preco: parseFloat(i.preco),
      desconto: parseFloat(i.desconto || 0),
      foto_url: i.foto_url || '',
      removido: false
    })) : [];

    this.renderizarItens();
    this.atualizarTotais();
    document.getElementById('modal-orcamento-mdf').classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  adicionarItem(dados = {}) {
    this.itens.push({
      id: null,
      nome: dados.nome || '',
      descricao: dados.descricao || '',
      preco: dados.preco || 0,
      desconto: dados.desconto || 0,
      foto_url: dados.foto_url || '',
      removido: false
    });
    this.renderizarItens();
    this.atualizarTotais();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  removerItem(index) {
    if (this.itens[index].id) {
      this.itens[index].removido = true;
    } else {
      this.itens.splice(index, 1);
    }
    this.renderizarItens();
    this.atualizarTotais();
  }

  renderizarItens() {
    const container = document.getElementById('container-itens-mdf');
    if (!container) return;
    container.innerHTML = this.itens.filter(i => !i.removido).map((item, idx) => `
      <div class="flex flex-col md:flex-row gap-3 items-start border border-slate-200 rounded-xl p-3 bg-white">
        <div class="relative w-40 h-40 rounded-lg border bg-slate-100 overflow-hidden">
          ${item.foto_url
            ? `<img src="${escaparHTML(item.foto_url)}" class="w-full h-full object-cover" alt="Foto" style="position: absolute; inset: 0;">
               <button type="button" onclick="event.stopPropagation(); if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.removerFotoItem(${idx})" title="Excluir foto" class="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
               <button type="button" onclick="this.parentElement.querySelector('input[type=file]').click()" title="Trocar foto" class="absolute bottom-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"><i data-lucide="camera" class="w-4 h-4"></i></button>`
            : `<div class="w-full h-full flex items-center justify-center cursor-pointer hover:bg-slate-200 transition" onclick="this.parentElement.querySelector('input[type=file]').click()">
                 <i data-lucide="camera" class="w-12 h-12 text-slate-400"></i>
               </div>`
          }
          <input type="file" accept="image/*" class="hidden" onchange="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.uploadImagemItem(this, ${idx})">
        </div>
        <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
          <input type="text" placeholder="Nome do móvel" value="${escaparHTML(item.nome)}" onchange="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.atualizarItem(${idx}, 'nome', this.value)" class="p-2 border rounded text-sm w-full">
          <input type="text" placeholder="Medidas / descrição" value="${escaparHTML(item.descricao)}" onchange="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.atualizarItem(${idx}, 'descricao', this.value)" class="p-2 border rounded text-sm w-full">
          <input type="number" placeholder="Preço R$" value="${item.preco}" onchange="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.atualizarItem(${idx}, 'preco', parseFloat(this.value) || 0)" class="p-2 border rounded text-sm w-full" step="0.01">
          <input type="number" placeholder="Desconto R$" value="${item.desconto}" onchange="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.atualizarItem(${idx}, 'desconto', parseFloat(this.value) || 0)" class="p-2 border rounded text-sm w-full" step="0.01">
        </div>
        <button onclick="if(window.mdfOrcamentosManager) window.mdfOrcamentosManager.removerItem(${idx})" class="text-red-400 hover:text-red-600 p-2"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
      </div>
    `).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  atualizarItem(index, campo, valor) {
    this.itens[index][campo] = valor;
    this.atualizarTotais();
  }

  async uploadImagemItem(input, index) {
    const file = input.files[0];
    if (!file) return;
    try {
      const url = await enviarImagemImgBB(file);
      this.itens[index].foto_url = url;
      this.renderizarItens();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
      console.error(e);
      window.showToast(e.message || 'Erro ao enviar imagem.', true);
    }
  }

  removerFotoItem(index) {
    if (!this.itens[index]) return;
    this.itens[index].foto_url = '';
    this.renderizarItens();
    if (typeof lucide !== 'undefined') lucide.createIcons();
    window.showToast('Foto removida do item.');
  }

  atualizarTotais() {
    const subtotal = this.itens.filter(i => !i.removido).reduce((s, i) => s + i.preco, 0);
    const tipo = document.getElementById('tipo-desconto-mdf').value;
    const valor = parseFloat(document.getElementById('valor-desconto-mdf').value) || 0;
    const desconto = tipo === '%' ? subtotal * (valor / 100) : valor;
    const total = Math.max(0, subtotal - desconto);
    document.getElementById('subtotal-mdf').innerText = formatarMoedaBR(subtotal);
    document.getElementById('total-geral-mdf').innerText = formatarMoedaBR(total);
  }

  async salvarOrcamento() {
    const clienteId = document.getElementById('cliente-id-mdf').value;
    const clienteNome = document.getElementById('cliente-nome-mdf').value.trim() || 'Consumidor Final';
    if (!clienteId) {
      window.showToast('Selecione um cliente válido.', true);
      return;
    }
    const status = document.getElementById('status-mdf').value;
    const obs = document.getElementById('observacoes-mdf').value.trim();
    const descontoValor = parseFloat(document.getElementById('valor-desconto-mdf').value) || 0;
    const tipoDesconto = document.getElementById('tipo-desconto-mdf').value;

    if (!clienteNome) {
      window.showToast("Selecione um cliente.", true);
      return;
    }

    const itensAtivos = this.itens.filter(i => !i.removido);
    if (itensAtivos.length === 0) {
      window.showToast("Adicione pelo menos um item ao orçamento.", true);
      return;
    }

    itensAtivos.forEach(item => {
      item.preco = parseFloat(item.preco) || 0;
      item.desconto = parseFloat(item.desconto) || 0;
    });

    if (this.orcamentoAtualId) {
      // Atualização
      const { error: errOrc } = await supabaseClient
        .from('mdf_orcamentos')
        .update({
          cliente_nome: clienteNome,
          cliente_id: clienteId ? Number(clienteId) : null,
          status,
          observacoes: obs,
          desconto: descontoValor,
          tipo_desconto: tipoDesconto
        })
        .eq('id', this.orcamentoAtualId);
      if (errOrc) {
        window.showToast('Erro ao atualizar orçamento: ' + errOrc.message, true);
        return;
      }

      const itensParaRemover = this.itens.filter(i => i.removido && i.id);
      for (const item of itensParaRemover) {
        const { error: errRemover } = await supabaseClient.from('mdf_itens').delete().eq('id', item.id);
        if (errRemover) {
          console.error("Erro ao remover item:", errRemover);
          window.showToast('Erro ao remover item do orçamento.', true);
          return;
        }
      }

      for (const item of itensAtivos) {
        const payload = {
          orcamento_id: this.orcamentoAtualId,
          nome: item.nome,
          descricao: item.descricao || '',
          preco: item.preco,
          desconto: item.desconto,
          foto_url: item.foto_url || ''
        };
        const { error: errItem } = item.id
          ? await supabaseClient.from('mdf_itens').update(payload).eq('id', item.id)
          : await supabaseClient.from('mdf_itens').insert(payload);
        if (errItem) {
          console.error("Erro ao salvar item:", errItem);
          window.showToast('Erro ao salvar item do orçamento.', true);
          return;
        }
      }
    } else {
      // Novo orçamento
      const { data: novoOrc, error: errOrc } = await supabaseClient
        .from('mdf_orcamentos')
        .insert({
          cliente_nome: clienteNome,
          cliente_id: clienteId ? Number(clienteId) : null,
          status,
          observacoes: obs,
          desconto: descontoValor,
          tipo_desconto: tipoDesconto
        })
        .select()
        .single();
      if (errOrc) {
        window.showToast('Erro ao criar orçamento: ' + errOrc.message, true);
        return;
      }

      const itensParaInserir = itensAtivos.map(item => ({
        orcamento_id: novoOrc.id,
        nome: item.nome,
        descricao: item.descricao || '',
        preco: item.preco,
        desconto: item.desconto,
        foto_url: item.foto_url || ''
      }));
      const { error: errItens } = await supabaseClient.from('mdf_itens').insert(itensParaInserir);
      if (errItens) {
        console.error("Erro ao inserir itens:", errItens);
        window.showToast('Erro ao salvar itens do orçamento.', true);
        return;
      }
    }

    this.itens = [];
    this.fecharModal();
    this.renderizarOrcamentos();
    window.showToast('Orçamento salvo com sucesso!');
  }

  async excluirOrcamento(id) {
    if (!await confirmDialog('Excluir este orçamento?', { danger: true, confirmText: 'Excluir' })) return;
    const { error: errItens } = await supabaseClient.from('mdf_itens').delete().eq('orcamento_id', id);
    if (errItens) {
      console.error(errItens);
      window.showToast('Erro ao excluir os itens do orçamento.', true);
      return;
    }
    const { error: errOrc } = await supabaseClient.from('mdf_orcamentos').delete().eq('id', id);
    if (errOrc) {
      console.error(errOrc);
      window.showToast('Erro ao excluir o orçamento.', true);
      return;
    }
    this.renderizarOrcamentos();
    window.showToast('Orçamento excluído.');
  }

  async duplicarOrcamento(id) {
    if (!await confirmDialog('Duplicar este orçamento?')) return;
    const { data: orc, error: errOrc } = await supabaseClient.from('mdf_orcamentos').select().eq('id', id).single();
    if (errOrc || !orc) {
      window.showToast('Orçamento não encontrado.', true);
      return;
    }
    const { data: itensData, error: errItens } = await supabaseClient.from('mdf_itens').select().eq('orcamento_id', id);
    if (errItens) {
      window.showToast('Erro ao carregar itens do orçamento.', true);
      return;
    }
    const { data: novo, error: errNovo } = await supabaseClient.from('mdf_orcamentos').insert({
      cliente_nome: orc.cliente_nome,
      cliente_id: orc.cliente_id != null ? orc.cliente_id : null,
      status: 'ABERTO',
      observacoes: orc.observacoes,
      desconto: orc.desconto,
      tipo_desconto: orc.tipo_desconto
    }).select().single();
    if (errNovo || !novo) {
      window.showToast('Erro ao duplicar o orçamento.', true);
      return;
    }
    if (itensData && itensData.length) {
      const novosItens = itensData.map(i => ({
        orcamento_id: novo.id,
        nome: i.nome,
        descricao: i.descricao,
        preco: i.preco,
        desconto: i.desconto,
        foto_url: i.foto_url
      }));
      const { error: errInserir } = await supabaseClient.from('mdf_itens').insert(novosItens);
      if (errInserir) {
        console.error(errInserir);
        window.showToast('Orçamento duplicado, mas itens falharam ao copiar.', true);
        return;
      }
    }
    this.renderizarOrcamentos();
    window.showToast('Orçamento duplicado!');
  }

  sanitizarNomeArquivo(clienteNome, id) {
    const nomeLimpo = (clienteNome || 'orcamento').replace(/[^a-zA-Z0-9]+/g, '_');
    return `orcamento_${nomeLimpo}${id ? '_#' + id : ''}.pdf`;
  }

  async obterDadosOrcamentoBanco(id) {
    const { data: orc } = await supabaseClient.from('mdf_orcamentos').select('*').eq('id', id).single();
    if (!orc) return null;
    const { data: itensData } = await supabaseClient.from('mdf_itens').select('*').eq('orcamento_id', id);
    return {
      orcId: id,
      clienteNome: orc.cliente_nome || 'Consumidor Final',
      data: new Date(orc.created_at).toLocaleDateString('pt-BR'),
      observacoes: orc.observacoes || '',
      itens: (itensData || []).map(i => ({
        nome: i.nome || '',
        descricao: i.descricao || '',
        preco: i.preco,
        desconto: i.desconto || 0,
        foto_url: i.foto_url || ''
      })),
      descontoValor: orc.desconto || 0,
      tipoDesconto: orc.tipo_desconto || '$',
      filename: this.sanitizarNomeArquivo(orc.cliente_nome, id)
    };
  }

  obterDadosOrcamentoModal() {
    const orcId = this.orcamentoAtualId;
    const clienteNome = document.getElementById('cliente-nome-mdf').value || 'Consumidor Final';
    return {
      orcId,
      clienteNome,
      data: new Date().toLocaleDateString('pt-BR'),
      observacoes: document.getElementById('observacoes-mdf').value || '',
      itens: this.itens.filter(i => !i.removido),
      descontoValor: parseFloat(document.getElementById('valor-desconto-mdf').value) || 0,
      tipoDesconto: document.getElementById('tipo-desconto-mdf').value || '$',
      filename: this.sanitizarNomeArquivo(clienteNome, orcId)
    };
  }

  async montarDocumentoOrcamento({ orcId, clienteNome, data, observacoes, itens, descontoValor, tipoDesconto, filename, acao = 'download' }) {
    const pdfMake = await carregarPdfMake();

    const itensNormalizados = (itens || []).map(i => ({
      nome: i.nome || '',
      descricao: i.descricao || '',
      preco: parseFloat(i.preco) || 0,
      desconto: parseFloat(i.desconto || 0) || 0,
      foto_url: i.foto_url || ''
    }));

    const subtotal = itensNormalizados.reduce((s, i) => s + i.preco - i.desconto, 0);
    let descontoTotal = parseFloat(descontoValor) || 0;
    if (tipoDesconto === '%') descontoTotal = subtotal * (descontoTotal / 100);
    const total = Math.max(0, subtotal - descontoTotal);

    const [logoBase64, ...fotosBase64] = await Promise.all([
      imagemParaBase64PDF(LOGO_APP, { max: 220 }),
      ...itensNormalizados.map(i => imagemParaBase64PDF(i.foto_url, { quadrada: true }))
    ]);

    const imagens = {};
    if (logoBase64) imagens.logo = logoBase64;

    const linhasTabela = itensNormalizados.map((item, idx) => {
      const fotoBase64 = fotosBase64[idx] || null;
      let celulaItem;
      if (fotoBase64) {
        const chaveFoto = 'foto_' + idx;
        imagens[chaveFoto] = fotoBase64;
        // Miniatura QUADRADA padrão (84x84) independente do tamanho/arquivo da foto
        celulaItem = {
          columns: [
            { width: 84, image: chaveFoto, fit: [84, 84], alignment: 'left' },
            {
              width: '*',
              stack: [
                { text: item.nome, bold: true, fontSize: 11, margin: [0, 0, 0, 3] },
                item.descricao ? { text: item.descricao, fontSize: 9, color: '#475569' } : ''
              ]
            }
          ],
          columnGap: 8
        };
      } else {
        celulaItem = {
          stack: [
            { text: item.nome, bold: true, fontSize: 11, margin: [0, 0, 0, 3] },
            item.descricao ? { text: item.descricao, fontSize: 9, color: '#475569' } : ''
          ]
        };
      }
      return [
        celulaItem,
        { text: formatarMoedaPDF(item.preco), alignment: 'right', fontSize: 10 },
        { text: item.desconto ? formatarMoedaPDF(item.desconto) : '—', alignment: 'right', fontSize: 10 },
        { text: formatarMoedaPDF(item.preco - item.desconto), alignment: 'right', fontSize: 11, bold: true }
      ];
    });

    const content = [];
    const empresa = window.getCompany ? window.getCompany() : { name: 'NÉVOA', cnpj: '', address: '', phone: '' };
    if (logoBase64) content.push({ image: 'logo', width: 58, alignment: 'center', margin: [0, 0, 0, 4] });
    content.push(
      { text: empresa.name, fontSize: 20, bold: true, color: '#b8a94e', alignment: 'center', margin: [0, 2, 0, 2] },
      { text: [empresa.cnpj ? 'CNPJ: ' + empresa.cnpj : '', empresa.address, empresa.phone ? 'Tel: ' + empresa.phone : ''].filter(Boolean).join(' | '), fontSize: 9, color: '#475569', alignment: 'center', margin: [0, 0, 0, 12] },
      { text: orcId ? `ORÇAMENTO #${orcId}` : 'ORÇAMENTO', fontSize: 14, bold: true, alignment: 'center', margin: [0, 0, 0, 14] },
      { text: [{ text: 'Cliente: ', bold: true }, clienteNome], fontSize: 10, margin: [0, 0, 0, 3] },
      { text: [{ text: 'Data: ', bold: true }, data], fontSize: 10, margin: [0, 0, 0, 3] }
    );
    if (observacoes) content.push({ text: [{ text: 'Observações: ', bold: true }, observacoes], fontSize: 10, margin: [0, 0, 0, 6] });
    content.push(
      {
        table: {
          headerRows: 1,
          widths: ['*', 90, 80, 100],
          body: [
            [
              { text: 'Produto', style: 'tableHeader' },
              { text: 'Preço', style: 'tableHeader', alignment: 'right' },
              { text: 'Desconto', style: 'tableHeader', alignment: 'right' },
              { text: 'Total', style: 'tableHeader', alignment: 'right' }
            ],
            ...linhasTabela
          ]
        },
        layout: {
          fillColor: (rowIndex) => (rowIndex === 0 ? '#1e293b' : (rowIndex % 2 === 0 ? '#ffffff' : '#f9fafb')),
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.6 : 0.3),
          vLineWidth: () => 0,
          hLineColor: () => '#e2e8f0'
        },
        margin: [0, 8, 0, 0]
      },
      { text: [{ text: 'Total Geral: ', bold: true }, formatarMoedaPDF(total)], fontSize: 15, bold: true, alignment: 'right', margin: [0, 14, 0, 0] },
      { text: 'Obrigado pela preferência!', fontSize: 10, color: '#64748b', alignment: 'center', margin: [0, 30, 0, 0] }
    );

    const docDefinition = {
      info: { title: filename, author: empresa.name },
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 60],
      defaultStyle: { fontSize: 10, font: 'Roboto' },
      content,
      images: imagens,
      styles: {
        tableHeader: { bold: true, color: 'white', fontSize: 10 }
      },
      footer: (currentPage, pageCount) => ({
        text: `Página ${currentPage} de ${pageCount}`,
        alignment: 'center',
        fontSize: 8,
        color: '#94a3b8',
        margin: [0, 10, 0, 0]
      })
    };

    const pdf = pdfMake.createPdf(docDefinition);
    if (acao === 'print') {
      pdf.print();
    } else {
      pdf.download(filename);
    }
  }

  async baixarPDF(id) {
    if (typeof showLoading === 'function') showLoading(true);
    try {
      const dados = await this.obterDadosOrcamentoBanco(id);
      if (dados) await this.montarDocumentoOrcamento({ ...dados, acao: 'download' });
    } catch (e) {
      console.error(e);
      window.showToast('Erro ao baixar PDF: ' + e.message, true);
    } finally {
      if (typeof showLoading === 'function') showLoading(false);
    }
  }

  async gerarPDF() {
    try {
      const dados = this.obterDadosOrcamentoModal();
      await this.montarDocumentoOrcamento({ ...dados, acao: 'download' });
    } catch (e) {
      console.error(e);
      window.showToast('Erro ao gerar PDF: ' + e.message, true);
    }
  }

  async imprimirOrcamento(id) {
    try {
      let dados;
      if (id) {
        dados = await this.obterDadosOrcamentoBanco(id);
      } else {
        dados = this.obterDadosOrcamentoModal();
      }
      if (dados) await this.montarDocumentoOrcamento({ ...dados, acao: 'print' });
    } catch (e) {
      console.error(e);
      window.showToast('Erro ao imprimir: ' + e.message, true);
    }
  }

  // ========== NOVOS MÉTODOS DE FATURAMENTO E AGENDA ==========
  async faturarOrcamento(id) {
    if (!await confirmDialog(`Faturar orçamento #${id}? Isso criará uma venda no sistema financeiro.`, { confirmText: 'Faturar' })) return;
    if (typeof showLoading === 'function') showLoading(true);

    try {
      // 1. Buscar orçamento e itens
      const { data: orc, error: errOrc } = await supabaseClient
        .from('mdf_orcamentos')
        .select('*')
        .eq('id', id)
        .single();
      if (errOrc) throw errOrc;
      if (orc.status === 'APROVADO') {
        window.showToast(`Orçamento #${id} já está faturado.`, true);
        return;
      }

      const { data: itens, error: errItens } = await supabaseClient
        .from('mdf_itens')
        .select('*')
        .eq('orcamento_id', id);
      if (errItens) throw errItens;
      if (!itens.length) throw new Error('Orçamento sem itens');

      // 2. Calcular totais e distribuir desconto
      const subtotal = itens.reduce((acc, i) => acc + parseFloat(i.preco), 0);
      let descontoTotal = parseFloat(orc.desconto) || 0;
      if (orc.tipo_desconto === '%') {
        descontoTotal = subtotal * (descontoTotal / 100);
      }
      const totalLiquido = Math.max(0, subtotal - descontoTotal);
      const fator = subtotal > 0 ? totalLiquido / subtotal : 0;

      // 3. Buscar cliente (para log) - resolve por cliente_id quando existir
      let cliente = null;
      if (orc.cliente_id != null) {
        const { data: cl } = await supabaseClient
          .from('clientes')
          .select('id, nome')
          .eq('id', orc.cliente_id)
          .maybeSingle();
        cliente = cl;
      }
      if (!cliente && orc.cliente_nome) {
        const { data: cl } = await supabaseClient
          .from('clientes')
          .select('id, nome')
          .eq('nome', orc.cliente_nome)
          .maybeSingle();
        cliente = cl;
      }
      const nomeCliente = cliente?.nome || orc.cliente_nome || 'Consumidor Final';
      const clienteIdLog = cliente?.id != null ? cliente.id : (orc.cliente_id != null ? orc.cliente_id : null);

      // 4. Buscar o próximo ID disponível na tabela logs
      const { data: maxIdData, error: maxIdError } = await supabaseClient
        .from('logs')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
      if (maxIdError) throw maxIdError;
      let novoId = 1;
      if (maxIdData && maxIdData.length > 0) {
        novoId = maxIdData[0].id + 1;
      }
      const vendaId = novoId;

      // 5. Criar logs de venda (tipo 'venda')
      // Usa o relógio LOCAL deslocado para UTC (sem toISOString direto), assim
      // a data/hora gravada bate com o horário do estabelecimento.
      const timestamp = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString();
      const logs = itens.map(item => ({
        id: vendaId,
        tipo: 'venda',
        produto_nome: item.nome,
        quantidade: 1,
        data: timestamp,
        observacao: `MDF Orçamento #${id} - ${item.descricao || ''}`,
        valor_total: parseFloat(item.preco) * fator,
        cliente_nome: nomeCliente,
        cliente_id: clienteIdLog,
        forma_pagamento: 'A Faturar',
        status: 'ATIVO',
        status_entrega: '',
        qtd_entregue: 0,
        desconto: 0,
        status_financeiro: 'PENDENTE',
        vencimento: timestamp,
        valor_pago: 0,
        endereco_entrega: ''
      }));

      const { error: errInsert } = await supabaseClient.from('logs').insert(logs);
      if (errInsert) throw errInsert;

      // 6. Atualizar status do orçamento para APROVADO
      const { error: errUpdate } = await supabaseClient
        .from('mdf_orcamentos')
        .update({ status: 'APROVADO' })
        .eq('id', id);
      if (errUpdate) throw errUpdate;

      window.showToast(`Orçamento #${id} faturado com sucesso! Venda registrada.`);
      this.renderizarOrcamentos();
      window.loadData();
    } catch (err) {
      console.error(err);
      window.showToast('Erro ao faturar: ' + err.message, true);
    } finally {
      if (typeof showLoading === 'function') showLoading(false);  
    }   
  }

  async estornarOrcamento(id) {
    if (!await confirmDialog(`Estornar venda do orçamento #${id}? Isso removerá a venda do financeiro.`, { danger: true, confirmText: 'Estornar' })) return;
    if (typeof showLoading === 'function') showLoading(true);

    try {
      // 1. Garantir que o orçamento está faturado antes de estornar
      const { data: orc, error: errOrc } = await supabaseClient
        .from('mdf_orcamentos')
        .select('status')
        .eq('id', id)
        .single();
      if (errOrc) throw errOrc;
      if (!orc || orc.status !== 'APROVADO') {
        window.showToast(`Orçamento #${id} não está faturado.`, true);
        return;
      }

      // 2. Buscar os logs de venda associados (observação contém "MDF Orçamento #id")
      const { data: logs, error: errLogs } = await supabaseClient
        .from('logs')
        .select('*')
        .like('observacao', `%MDF Orçamento #${id}%`)
        .eq('tipo', 'venda');
      if (errLogs) throw errLogs;
      if (!logs.length) {
        window.showToast('Nenhuma venda MDF encontrada para estornar.', true);
        return;
      }

      // 3. Remover os lançamentos de venda criados no faturamento
      const idsParaExcluir = logs.map(l => l.id);
      const { error: errDel } = await supabaseClient
        .from('logs')
        .delete()
        .in('id', idsParaExcluir);
      if (errDel) throw errDel;

      // 4. Devolver o orçamento para ABERTO
      const { error: errUpdate } = await supabaseClient
        .from('mdf_orcamentos')
        .update({ status: 'ABERTO' })
        .eq('id', id);
      if (errUpdate) throw errUpdate;

      window.showToast(`Estorno realizado. Orçamento #${id} voltou para ABERTO.`);
      this.renderizarOrcamentos();
      window.loadData();
    } catch (err) {
      console.error(err);
      window.showToast('Erro ao estornar: ' + err.message, true);
    } finally {
      if (typeof showLoading === 'function') showLoading(false);
    }
  }

  // ========== MÉTODOS DE AGENDA ==========
  async agendarInstalacao(orcamentoId) {
    // Buscar dados do orçamento e possível agendamento existente
    const { data: orc, error: errOrc } = await supabaseClient
      .from('mdf_orcamentos')
      .select('*')
      .eq('id', orcamentoId)
      .single();
    if (errOrc || !orc) {
      window.showToast('Orçamento não encontrado.', true);
      return;
    }

    const { data: agendaExistente, error: errAgenda } = await supabaseClient
      .from('mdf_agenda')
      .select('*')
      .eq('orcamento_id', orcamentoId)
      .maybeSingle();
    if (errAgenda) {
      window.showToast('Erro ao carregar o agendamento.', true);
      return;
    }

    // Exibir o NOME ATUAL do cliente (renomeio reflete em cadeia)
    if (orc.cliente_id != null) {
      const { data: clAgenda } = await supabaseClient
        .from('clientes')
        .select('nome')
        .eq('id', orc.cliente_id)
        .maybeSingle();
      if (clAgenda) orc.cliente_nome = clAgenda.nome;
    }

    this.abrirModalAgenda(orcamentoId, orc, agendaExistente);
  }

  abrirModalAgenda(orcamentoId, orc, agenda) {
    // Remove modal antigo se existir
    const modalAntigo = document.getElementById('modal-agenda-mdf');
    if (modalAntigo) modalAntigo.remove();

    // Cria estrutura do modal
    const modal = document.createElement('div');
    modal.id = 'modal-agenda-mdf';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4';

    // Formatar datas para o input date (YYYY-MM-DD) — sempre no fuso local
    const dataHoje = dataLocalISO();
    const dataAgendada = agenda && agenda.data_agendada ? agenda.data_agendada.split('T')[0] : dataHoje;
    const horarioAgendado = agenda && agenda.horario ? agenda.horario.slice(0, 5) : '14:00';
    const statusAtual = agenda ? agenda.status : 'AGENDADO';

    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-emerald-600 text-white p-4 rounded-t-2xl flex justify-between items-center">
          <h3 class="text-xl font-bold flex items-center gap-2">
            <i data-lucide="calendar" class="w-5 h-5"></i> 
            Agenda de Instalação
          </h3>
          <button onclick="document.getElementById('modal-agenda-mdf').remove()" class="text-white hover:text-emerald-200">
            <i data-lucide="x" class="w-6 h-6"></i>
          </button>
        </div>
        
        <div class="p-6 space-y-5">
          <div class="bg-slate-50 p-3 rounded-lg">
            <p class="text-xs text-slate-500 uppercase font-bold">Orçamento / Cliente</p>
            <p class="font-bold text-slate-800">#${orcamentoId} - ${escaparHTML(orc.cliente_nome)}</p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-1">Data da Instalação *</label>
              <input type="date" id="agenda-data" value="${dataAgendada}" min="${dataHoje}" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none">
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-1">Horário *</label>
              <input type="time" id="agenda-horario" value="${horarioAgendado}" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none">
            </div>
          </div>

          <div>
            <label class="block text-sm font-bold text-slate-700 mb-1">Status</label>
            <select id="agenda-status" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="AGENDADO" ${statusAtual === 'AGENDADO' ? 'selected' : ''}>Agendado</option>
              <option value="REAGENDADO" ${statusAtual === 'REAGENDADO' ? 'selected' : ''}>Reagendado</option>
              <option value="CONCLUIDO" ${statusAtual === 'CONCLUIDO' ? 'selected' : ''}>Concluído</option>
              <option value="CANCELADO" ${statusAtual === 'CANCELADO' ? 'selected' : ''}>Cancelado</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-1">Instalador (nome)</label>
            <input type="text" id="agenda-instalador-nome" value="${escaparHTML(agenda?.instalador_nome || '')}" placeholder="Ex: João Silva" class="w-full p-2 border rounded-lg">
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-1">Telefone do Instalador</label>
            <input type="tel" id="agenda-instalador-tel" value="${escaparHTML(agenda?.instalador_telefone || '')}" placeholder="(64) 99999-9999" class="w-full p-2 border rounded-lg">
          </div>
        </div>

        <div>
          <label class="block text-sm font-bold text-slate-700 mb-1">Observações</label>
          <textarea id="agenda-obs" rows="3" placeholder="Detalhes da instalação, endereço, etc." class="w-full p-2 border rounded-lg">${escaparHTML(agenda?.observacoes || '')}</textarea>
        </div>

        <div class="flex gap-3 pt-4">
            ${agenda && agenda.status !== 'CANCELADO' ? `
              <button id="btn-cancelar-agenda" class="flex-1 bg-red-100 text-red-700 hover:bg-red-200 font-bold py-2 rounded-lg transition flex items-center justify-center gap-2">
                <i data-lucide="ban" class="w-4 h-4"></i> Cancelar Instalação
              </button>
            ` : ''}
            <button id="btn-salvar-agenda" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg shadow flex items-center justify-center gap-2">
              <i data-lucide="save"></i> Salvar Agendamento
            </button>
            <button id="btn-whatsapp-instalador" class="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 rounded-lg shadow flex items-center justify-center gap-2 ${!agenda?.instalador_telefone ? 'opacity-50 cursor-not-allowed' : ''}" ${!agenda?.instalador_telefone ? 'disabled' : ''}>
              <i data-lucide="message-circle"></i> WhatsApp
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Fecha ao clicar fora ou com Esc (evita acumular listeners entre aberturas)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    if (this._fecharModalAgendaEsc) {
      document.removeEventListener('keydown', this._fecharModalAgendaEsc);
    }
    this._fecharModalAgendaEsc = (e) => {
      if (e.key === 'Escape') {
        const aberto = document.getElementById('modal-agenda-mdf');
        if (aberto) aberto.remove();
      }
    };
    document.addEventListener('keydown', this._fecharModalAgendaEsc);

    // Eventos
    document.getElementById('btn-salvar-agenda').addEventListener('click', () => this.salvarAgenda(orcamentoId, modal));
    if (agenda && agenda.status !== 'CANCELADO') {
      document.getElementById('btn-cancelar-agenda')?.addEventListener('click', () => this.cancelarAgenda(orcamentoId, modal));
    }
    document.getElementById('btn-whatsapp-instalador')?.addEventListener('click', () => this.enviarWhatsAppInstalador(orcamentoId, agenda));
  }

  async salvarAgenda(orcamentoId, modal) {
    const data = document.getElementById('agenda-data').value;
    const horario = document.getElementById('agenda-horario').value;
    const status = document.getElementById('agenda-status').value;
    const instalador_nome = document.getElementById('agenda-instalador-nome').value;
    const instalador_telefone = document.getElementById('agenda-instalador-tel').value;
    const observacoes = document.getElementById('agenda-obs').value;

    if (!data || !horario) {
      window.showToast('Preencha data e horário.', true);
      return;
    }

    // Verificar se já existe agendamento
    const { data: existente } = await supabaseClient
      .from('mdf_agenda')
      .select('id')
      .eq('orcamento_id', orcamentoId)
      .maybeSingle();

    let error;
    if (existente) {
      const { error: err } = await supabaseClient
        .from('mdf_agenda')
        .update({
          data_agendada: data,
          horario,
          status,
          instalador_nome,
          instalador_telefone,
          observacoes,
          updated_at: new Date().toISOString()
        })
        .eq('id', existente.id);
      error = err;
    } else {
      const { error: err } = await supabaseClient
        .from('mdf_agenda')
        .insert({
          orcamento_id: orcamentoId,
          data_agendada: data,
          horario,
          status,
          instalador_nome,
          instalador_telefone,
          observacoes
        });
      error = err;
    }

    if (error) {
      window.showToast('Erro ao salvar agenda: ' + error.message, true);
    } else {
      window.showToast('Agendamento salvo com sucesso!');
      modal.remove();
      this.renderizarOrcamentos();
    }
  }

  async cancelarAgenda(orcamentoId, modal) {
    if (!await confirmDialog('Cancelar esta instalação? O status será alterado para CANCELADO.', { danger: true, confirmText: 'Cancelar instalação', cancelText: 'Voltar' })) return;

    const { error } = await supabaseClient
      .from('mdf_agenda')
      .update({ status: 'CANCELADO', updated_at: new Date().toISOString() })
      .eq('orcamento_id', orcamentoId);

    if (error) {
      window.showToast('Erro ao cancelar: ' + error.message, true);
    } else {
      window.showToast('Instalação cancelada.');
      modal.remove();
      this.renderizarOrcamentos();
    }
  }

  enviarWhatsAppInstalador(orcamentoId, agenda) {
    if (!agenda || !agenda.instalador_telefone) {
      window.showToast('Telefone do instalador não cadastrado.', true);
      return;
    }

    // Formatar número (remover não dígitos)
    let numero = agenda.instalador_telefone.replace(/\D/g, '');
    if (numero.length === 11) numero = '55' + numero;
    else if (numero.length === 10) numero = '55' + numero;

    // Mensagem padrão
    const dataFormatada = new Date(agenda.data_agendada + 'T' + agenda.horario).toLocaleString('pt-BR');
    const msg = `Olá ${agenda.instalador_nome || 'instalador'}! Temos uma instalação agendada para o orçamento #${orcamentoId} no dia ${dataFormatada}. Detalhes: ${agenda.observacoes || 'sem observações adicionais'}. Obrigado!`;
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  // ========== MÉTODOS DE BUSCA DE CLIENTES (MODAL) ==========
  abrirModalClientes() {
    // Remove modal existente se houver
    const modalExistente = document.getElementById('modal-busca-clientes-mdf');
    if (modalExistente) modalExistente.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-busca-clientes-mdf';
    modal.className = 'fixed inset-0 bg-black/50 flex items-start justify-center z-[80] p-4';

    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div class="p-4 border-b flex justify-between items-center bg-emerald-50 rounded-t-2xl">
          <h3 class="font-bold text-slate-800 text-lg flex items-center gap-2">
            <i data-lucide="users" class="text-emerald-600"></i> Selecionar Cliente
          </h3>
          <button onclick="this.closest('#modal-busca-clientes-mdf').remove()" class="text-slate-400 hover:text-red-500">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        <div class="p-4">
          <div class="relative">
            <i data-lucide="search" class="absolute left-3 top-3 text-slate-400 w-4 h-4"></i>
            <input type="text" id="filtro-cliente-mdf" placeholder="Digite o nome ou parte..." 
                   class="w-full pl-10 p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
          </div>
        </div>
        <div class="flex-1 overflow-y-auto px-4 pb-4" id="lista-clientes-modal">
          <div class="text-center text-slate-400 py-8">Digite para buscar...</div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Foco no input de busca
    const inputFiltro = document.getElementById('filtro-cliente-mdf');
    inputFiltro.focus();

    // Evento de busca em tempo real (debounce de 300ms)
    let timeoutId = null;
    inputFiltro.addEventListener('input', () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        this.buscarClientesModal(inputFiltro.value);
      }, 300);
    });

    // Fechar modal ao clicar fora
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  async buscarClientesModal(filtro) {
    const lista = document.getElementById('lista-clientes-modal');
    if (!lista) return;

    if (!filtro || filtro.length < 2) {
      lista.innerHTML = '<div class="text-center text-slate-400 py-8">Digite pelo menos 2 caracteres para buscar...</div>';
      return;
    }

    lista.innerHTML = '<div class="text-center text-slate-400 py-8">Buscando...</div>';

    try {
      const { data: clientes, error } = await supabaseClient
        .from('clientes')
        .select('id, nome')
        .ilike('nome', `%${filtro}%`)
        .order('nome')
        .limit(20); // Limite para performance

      if (error) throw error;

      if (!clientes || clientes.length === 0) {
        lista.innerHTML = '<div class="text-center text-slate-400 py-8">Nenhum cliente encontrado.</div>';
        return;
      }

      lista.innerHTML = clientes.map(cliente => `
        <div class="cliente-item-modal p-3 border-b hover:bg-emerald-50 cursor-pointer transition flex items-center gap-3"
             data-id="${cliente.id}" data-nome="${escaparHTML(cliente.nome)}">
          <i data-lucide="user" class="w-4 h-4 text-slate-400"></i>
          <span class="font-medium text-slate-700">${escaparHTML(cliente.nome)}</span>
        </div>
      `).join('');

      if (typeof lucide !== 'undefined') lucide.createIcons();

      // Adicionar evento de clique em cada item
      lista.querySelectorAll('.cliente-item-modal').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const nome = item.dataset.nome;
          this.selecionarCliente(id, nome);
          document.getElementById('modal-busca-clientes-mdf').remove();
        });
      });

    } catch (err) {
      console.error(err);
      lista.innerHTML = `<div class="text-center text-red-400 py-8">Erro ao buscar: ${err.message}</div>`;
    }
  }

  selecionarCliente(id, nome) {
    document.getElementById('cliente-id-mdf').value = id;
    document.getElementById('cliente-nome-mdf').value = nome;
  }

} // FIM DA CLASSE ORCAMENTOSMDF

// ==================== INICIALIZAÇÃO GLOBAL ====================
window.iniciarMDF = function() {
  const container = document.getElementById('view-mdf');
  if (!container || container.dataset.mdfIniciado === 'true') return;
  container.dataset.mdfIniciado = 'true';
  container.classList.remove('hidden-section');
  container.classList.add('active-section');
  container.innerHTML = ''; // Limpa qualquer conteúdo anterior
  const manager = new MDFManager(container);
  // Expor referências globais para os eventos onclick
  window.mdfOrcamentosManager = manager.orcamentosManager;
  // Atualizar a referência quando o orcamentosManager for criado
  const originalMostrarSubAba = manager.mostrarSubAba.bind(manager);
  manager.mostrarSubAba = function(nome) {
    originalMostrarSubAba(nome);
    if (nome === 'orcamentos' && manager.orcamentosManager) {
      window.mdfOrcamentosManager = manager.orcamentosManager;
    }
  };
};

// Aguarda o carregamento do DOM e das dependências
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.navigate !== 'undefined') {
      const originalNavigate = window.navigate;
      window.navigate = function(viewId) {
        originalNavigate(viewId);
        if (viewId === 'mdf') {
          setTimeout(() => window.iniciarMDF(), 100);
        }
      };
    }
  });
} else {
  if (typeof window.navigate !== 'undefined') {
    const originalNavigate = window.navigate;
    window.navigate = function(viewId) {
      originalNavigate(viewId);
      if (viewId === 'mdf') {
        setTimeout(() => window.iniciarMDF(), 100);
      }
    };
  }
}
