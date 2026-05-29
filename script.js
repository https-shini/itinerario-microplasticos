/**
 * ═══════════════════════════════════════════════════════════════
 * MICROPLÁSTICOS — PROJETO EXTENSIONISTA UCS 2026
 * script.js · Navigation · Animations · Dashboard Automático
 * ═══════════════════════════════════════════════════════════════
 *
 * Arquitetura:
 *  1. Nav          — navbar responsiva + active tracking
 *  2. Reveal       — scroll animations via IntersectionObserver
 *  3. DataLayer    — fetch + parse + cache do Google Sheets
 *  4. Charts       — renderização de todos os gráficos (Chart.js)
 *  5. Dashboard    — orquestração, KPIs, insights, tabela, ranking
 *  6. AutoRefresh  — ciclo automático de 5 minutos com countdown
 *
 * CORREÇÕES APLICADAS:
 *  - [CORS] Múltiplas estratégias de fetch em cascata:
 *      1. Fetch direto via /pub?output=csv (planilha publicada, sem CORS)
 *      2. allorigins.win como proxy de fallback caso a rede bloqueie
 *  - [BUG] escolaridade: && booleano → countBoth() para dois termos
 *  - [BUG] reacao: && booleano → countBoth() com dois critérios
 *  - [DEAD CODE] setInterval vazio removido do AutoRefresh
 *  - [UX] Mensagem de status detalhada por estratégia de fetch
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   CONSTANTES GLOBAIS
───────────────────────────────────────────────────────────── */

/**
 * Planilha publicada na web via Arquivo → Publicar na web → CSV.
 * Este endpoint é público por design, sem autenticação, sem CORS.
 * Sem necessidade de proxy — o browser acessa diretamente.
 *
 * Como foi gerado:
 *   URL pubhtml: .../pub?output=html  →  trocado por ?output=csv
 *   GID da aba de respostas: omitido (primeira aba) ou explícito.
 *
 * Se o Forms vincula as respostas em outra aba, acrescente:
 *   &gid=NUMERO_DA_ABA
 */
const PUBLISHED_ID =
  '2PACX-1vSNocodAsPzOTQ7Q1sHhgmLw6hVPvACDoNn9DrPpokqhQxddbiyPnuZoFNX1WoCV7YiYya3gXuZP_iA';

const SHEET_URL_DIRECT =
  `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}/pub?output=csv`;

/**
 * Fallback: tenta a mesma URL com o proxy allorigins caso o fetch
 * direto falhe por qualquer razão de rede/ambiente.
 */
const SHEET_URL_PROXY =
  `https://api.allorigins.win/raw?url=${encodeURIComponent(SHEET_URL_DIRECT)}`;

/** Link do Google Forms */
const FORMS_URL = 'https://forms.gle/251VTCdDGMiwgZ2K9';

/** Intervalo de auto-refresh em ms (5 minutos) */
const REFRESH_INTERVAL = 5 * 60 * 1000;

/* ─────────────────────────────────────────────────────────────
   1. NAVIGATION
───────────────────────────────────────────────────────────── */
(function initNavigation() {
  const navbar   = document.getElementById('navbar');
  const toggle   = document.getElementById('navToggle');
  const menu     = document.getElementById('navMenu');
  const navLinks = document.querySelectorAll('.nav-link');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  navLinks.forEach(l => l.addEventListener('click', () =>
    menu.classList.remove('open')));

  const sections = document.querySelectorAll('section[id]');
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      navLinks.forEach(l => l.classList.remove('active'));
      const a = document.querySelector(`.nav-link[href="#${e.target.id}"]`);
      if (a) a.classList.add('active');
    });
  }, { rootMargin: '-50% 0px -50% 0px' });
  sections.forEach(s => io.observe(s));
})();

/* ─────────────────────────────────────────────────────────────
   2. SCROLL REVEAL
───────────────────────────────────────────────────────────── */
(function initReveal() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const siblings = Array.from(
        e.target.parentElement.querySelectorAll('.reveal-up')
      );
      const base = parseFloat(
        getComputedStyle(e.target).transitionDelay
      ) * 1000 || 0;
      e.target.style.transitionDelay =
        (base + siblings.indexOf(e.target) * 60) + 'ms';
      e.target.classList.add('visible');
      io.unobserve(e.target);
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal-up').forEach(el => io.observe(el));
})();

/* ─────────────────────────────────────────────────────────────
   3. DATA LAYER  —  Fetch · Parse · Mapeamento de colunas
───────────────────────────────────────────────────────────── */
const DataLayer = (() => {

  let _cache   = [];
  let _headers = [];
  let _colMap  = {};

  /* ── Parser RFC 4180 completo ── */
  function parseCSV(text) {
    const rows = [];
    let cur = '', inQ = false, row = [];

    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (c === '"') {
        if (inQ && n === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        row.push(cur.trim()); cur = '';
      } else if ((c === '\n' || c === '\r') && !inQ) {
        if (c === '\r' && n === '\n') i++;
        row.push(cur.trim()); cur = '';
        if (row.some(Boolean)) rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }

  /* ── Normalização de string para comparação ── */
  function normalizeStr(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* ── Detecção de colunas por palavras-chave ── */
  function findCol(headers, keywords) {
    const h = headers.map(x => normalizeStr(x));
    return h.findIndex(col =>
      keywords.some(kw => col.includes(normalizeStr(kw)))
    );
  }

  function buildColMap(headers) {
    return {
      timestamp:    findCol(headers, ['carimbo','timestamp','hora']),
      idade:        findCol(headers, ['faixa etaria','faixa etária','etaria','etária']),
      bairro:       findCol(headers, ['bairro','regiao','região','reside']),
      escolaridade: findCol(headers, ['escolaridade']),
      conhecimento: findCol(headers, ['nivel de conhecimento','nível de conhecimento','conhecia','microplastico','microplástico']),
      fontes:       findCol(headers, ['fontes conhecidas','fontes de microplastico','quais das opcoes','quais das opções']),
      reacao:       findCol(headers, ['reacao','reação','detectaram','sangue humano','tomar conhecimento']),
      reciclagem:   findCol(headers, ['frequencia','frequência','separa o lixo']),
      ecoponto:     findCol(headers, ['ecoponto','ponto de coleta','coleta seletiva','utiliza algum']),
      substituicao: findCol(headers, ['substituiu','alternativa mais sustentavel','alternativa mais sustentável']),
      limpeza:      findCol(headers, ['condicoes de limpeza','condições de limpeza','avalia as condicoes','limpeza e o descarte']),
      descarteIrr:  findCol(headers, ['descarte irregular','observou pontos']),
      preocAgua:    findCol(headers, ['agua potavel','água potável']),
      preocAlim:    findCol(headers, ['alimentos','frutos do mar','consumo humano']),
      preocSaude:   findCol(headers, ['saude humana','saúde humana','hormonios','hormônios']),
      preocAnimais: findCol(headers, ['animais marinhos','intoxicacao','intoxicação']),
      preocEcossist:findCol(headers, ['ecossistemas','praias, rios','ecossistemas costeiros']),
      preocEconom:  findCol(headers, ['economicos','econômicos','turismo','pesca']),
      acoesEdu:     findCol(headers, ['acoes de educacao','ações de educação','espacos publicos','espaços públicos']),
      mudanca:      findCol(headers, ['mudancas no seu','mudanças no seu','postura','adocao de mudancas']),
      comentarios:  findCol(headers, ['comentario','comentário','observacao','observação','espaco abaixo','espaço abaixo']),
    };
  }

  function rowToObj(row, colMap) {
    const g = (k) => {
      const i = colMap[k];
      return (i >= 0 && i < row.length) ? row[i] : '';
    };
    return {
      timestamp:    g('timestamp'),
      idade:        g('idade'),
      bairro:       g('bairro'),
      escolaridade: g('escolaridade'),
      conhecimento: g('conhecimento'),
      fontes:       g('fontes'),
      reacao:       g('reacao'),
      reciclagem:   g('reciclagem'),
      ecoponto:     g('ecoponto'),
      substituicao: g('substituicao'),
      limpeza_raw:  g('limpeza'),
      descarteIrr:  g('descarteIrr'),
      preocAgua:    g('preocAgua'),
      preocAlim:    g('preocAlim'),
      preocSaude:   g('preocSaude'),
      preocAnimais: g('preocAnimais'),
      preocEcossist:g('preocEcossist'),
      preocEconom:  g('preocEconom'),
      acoesEdu_raw: g('acoesEdu'),
      mudanca:      g('mudanca'),
      comentarios:  g('comentarios'),
    };
  }

  /* ── Estratégias de fetch em cascata ── */
  async function tryFetch(url, label) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`[${label}] HTTP ${resp.status}`);
    const text = await resp.text();
    /* Detecta redirecionamento para página de login do Google */
    if (text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
      throw new Error(`[${label}] Redirecionado para login — planilha privada`);
    }
    /* Detecta resposta HTML em vez de CSV */
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new Error(`[${label}] Resposta HTML recebida em vez de CSV`);
    }
    return text;
  }

  async function fetch_() {
    let text = null;
    const errors = [];

    /* Estratégia 1: fetch direto — planilha publicada, sem CORS */
    try {
      Dashboard.setStatus('Conectando ao Google Sheets…', false);
      text = await tryFetch(SHEET_URL_DIRECT, 'direto');
      console.info('[DataLayer] Fetch direto bem-sucedido.');
    } catch (e1) {
      errors.push(e1.message);
      console.warn('[DataLayer] Fetch direto falhou:', e1.message);

      /* Estratégia 2: proxy allorigins.win como fallback de rede */
      try {
        Dashboard.setStatus('Usando proxy de fallback…', false);
        text = await tryFetch(SHEET_URL_PROXY, 'allorigins');
        console.info('[DataLayer] Fetch via proxy bem-sucedido.');
      } catch (e2) {
        errors.push(e2.message);
        console.warn('[DataLayer] Fetch via proxy falhou:', e2.message);
      }
    }

    if (!text) {
      throw new Error(
        'Não foi possível carregar os dados. Verifique sua conexão e recarregue a página. ' +
        `Detalhes: ${errors.join(' | ')}`
      );
    }

    const rows = parseCSV(text);
    if (!rows.length) return [];

    _headers = rows[0];
    _colMap  = buildColMap(_headers);

    _cache = rows.slice(1)
      .filter(r => r.some(Boolean))
      .map(r => rowToObj(r, _colMap));

    return _cache;
  }

  return { fetch: fetch_, getCache: () => _cache };
})();

/* ─────────────────────────────────────────────────────────────
   4. CHARTS
───────────────────────────────────────────────────────────── */
const Charts = (() => {
  const instances = {};

  const C = {
    teal:   '#0e9f70', tealL:  '#4ecfa0', tealP: 'rgba(78,207,160,.12)',
    amber:  '#f59e0b', amberL: '#fcd34d',
    red:    '#f87171', redL:   '#fca5a5',
    green:  '#34d399', greenL: '#6ee7b7',
    purple: '#a78bfa', blue:   '#60a5fa',
    orange: '#fb923c', pink:   '#f472b6',
    grid:   'rgba(255,255,255,.06)',
    axisC:  'rgba(255,255,255,.4)',
  };

  function applyDefaults() {
    if (!window.Chart) return;
    Chart.defaults.color       = C.axisC;
    Chart.defaults.borderColor = C.grid;
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
    Chart.defaults.font.size   = 11;
    Object.assign(Chart.defaults.plugins.tooltip, {
      backgroundColor: '#0d3244',
      titleColor: '#fff',
      bodyColor: 'rgba(255,255,255,.65)',
      borderColor: 'rgba(255,255,255,.1)',
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
    });
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.padding  = 14;
    Chart.defaults.plugins.legend.labels.color    = C.axisC;
  }

  function destroy(id) {
    if (instances[id]) { instances[id].destroy(); delete instances[id]; }
  }

  function destroyAll() { Object.keys(instances).forEach(destroy); }

  const scaleXY = {
    x: { grid: { color: C.grid }, ticks: { color: C.axisC } },
    y: { grid: { color: C.grid }, ticks: { color: C.axisC }, beginAtZero: true },
  };

  function doughnut(id, labels, data, colors) {
    destroy(id);
    const ctx = document.getElementById(id);
    if (!ctx || !window.Chart) return;
    instances[id] = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'right' } },
      },
    });
  }

  function bar(id, labels, data, color, opts = {}) {
    destroy(id);
    const ctx = document.getElementById(id);
    if (!ctx || !window.Chart) return;
    instances[id] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: color + 'bb', borderColor: color, borderWidth: 1.5, borderRadius: 6, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: scaleXY,
        plugins: { legend: { display: false }, ...opts.plugins },
        ...opts,
      },
    });
  }

  function barH(id, labels, data, color, opts = {}) {
    destroy(id);
    const ctx = document.getElementById(id);
    if (!ctx || !window.Chart) return;
    instances[id] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: color + 'aa', borderColor: color, borderWidth: 1.5, borderRadius: 4, borderSkipped: false }] },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { color: C.grid }, ticks: { color: C.axisC }, beginAtZero: true },
          y: { grid: { color: C.grid }, ticks: { color: C.axisC } },
        },
        plugins: { legend: { display: false } },
        ...opts,
      },
    });
  }

  function line(id, labels, data) {
    destroy(id);
    const ctx = document.getElementById(id);
    if (!ctx || !window.Chart) return;
    instances[id] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data, borderColor: C.tealL, backgroundColor: C.tealP,
          tension: 0.4, fill: true,
          pointRadius: 4, pointBackgroundColor: C.tealL,
          pointBorderColor: '#0d3244', pointBorderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { ...scaleXY, y: { ...scaleXY.y, ticks: { ...scaleXY.y.ticks, stepSize: 1 } } },
        plugins: { legend: { display: false } },
      },
    });
  }

  function barGrouped(id, labels, datasets) {
    destroy(id);
    const ctx = document.getElementById(id);
    if (!ctx || !window.Chart) return;
    instances[id] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: false, grid: { color: C.grid }, ticks: { color: C.axisC }, beginAtZero: true },
          y: { stacked: false, grid: { color: C.grid }, ticks: { color: C.axisC, font: { size: 10 } } },
        },
        plugins: {
          legend: { position: 'top', labels: { color: C.axisC, boxWidth: 12 } },
        },
      },
    });
  }

  return { applyDefaults, doughnut, bar, barH, line, barGrouped, destroyAll };
})();

/* ─────────────────────────────────────────────────────────────
   5. DASHBOARD
───────────────────────────────────────────────────────────── */
const Dashboard = (() => {

  /* ── Normalização ── */
  function norm(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Conta registros onde o campo `key` contém `partial`.
   */
  function count(arr, key, partial) {
    const p = norm(partial);
    return arr.filter(r => norm(r[key]).includes(p)).length;
  }

  /**
   * CORREÇÃO: conta registros onde o campo `key` contém
   * AMBOS os termos `termA` E `termB` simultaneamente.
   * Substitui o padrão bugado `count(arr,k,'a') && count(arr,k,'b')`
   * que retornava booleano coercido (0 ou 1) em vez de contagem real.
   */
  function countBoth(arr, key, termA, termB) {
    const a = norm(termA), b = norm(termB);
    return arr.filter(r => {
      const v = norm(r[key]);
      return v.includes(a) && v.includes(b);
    }).length;
  }

  function pct(n, t) { return t ? Math.round(n / t * 100) + '%' : '—'; }

  function avg(arr, key) {
    const vals = arr.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
    if (!vals.length) return null;
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  }

  /* ── Fontes (múltipla escolha) ── */
  function countFontes(arr) {
    const map = {};
    arr.forEach(r => {
      const s = r.fontes || '';
      s.split(/[;,\n]/).forEach(f => {
        const t = f.trim();
        if (t && !norm(t).includes('nao consigo') && !norm(t).includes('não consigo')) {
          const key = t.length > 50 ? t.substring(0, 48) + '…' : t;
          map[key] = (map[key] || 0) + 1;
        }
      });
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  /* ── Evolução temporal ── */
  function buildTimeline(arr) {
    const map = {};
    arr.forEach(r => {
      if (!r.timestamp) return;
      const parts = r.timestamp.split(/[\s/:]/).filter(Boolean);
      let dateKey;
      if (parts.length >= 3) {
        const [d, m] = parts;
        dateKey = `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`;
      } else {
        dateKey = r.timestamp.substring(0, 10);
      }
      map[dateKey] = (map[dateKey] || 0) + 1;
    });
    const sorted = Object.entries(map).sort((a, b) => {
      const parse = s => { const [d, m] = s.split('/'); return parseInt(m) * 100 + parseInt(d); };
      return parse(a[0]) - parse(b[0]);
    });
    let cum = 0;
    return {
      labels: sorted.map(x => x[0]),
      data:   sorted.map(x => { cum += x[1]; return cum; }),
    };
  }

  /* ── KPIs ── */
  function renderKPIs(data) {
    const total = data.length;
    const nDesc = count(data, 'conhecimento', 'nunca tinha') +
                  count(data, 'conhecimento', 'nunca ouvi');
    const nRecicla     = count(data, 'reciclagem', 'sempre');
    const mediaLimpeza = avg(data, 'limpeza_raw');

    setText('kpiTotal',      total || '—');
    setText('kpiDesconhece', pct(nDesc, total));
    setText('kpiRecicla',    pct(nRecicla, total));
    setText('kpiLimpeza',    mediaLimpeza ? mediaLimpeza + '/5' : '—');
  }

  /* ── Insights ── */
  function renderInsights(data) {
    const total = data.length;
    if (!total) return;

    const nDesc  = count(data, 'conhecimento', 'nunca');
    const nRec   = count(data, 'reciclagem',   'sempre');
    const nPol   = count(data, 'descarteIrr', 'sim, ha pontos') +
                   count(data, 'descarteIrr', 'sim, há pontos');
    const mediaAco = avg(data, 'acoesEdu_raw');

    const bar = document.getElementById('insightBar');
    if (!bar) return;

    bar.style.display = 'grid';
    setText('ins1',
      `⚠ ${pct(nDesc, total)} dos participantes declararam nunca ter ouvido falar em microplásticos — reforçando a urgência da intervenção educativa no Ecoponto Pantojo.`
    );
    setText('ins2',
      `✓ ${pct(nRec, total)} já praticam separação regular do lixo, indicando receptividade a práticas sustentáveis e potencial para ampliação do comportamento.`
    );
    setText('ins3',
      `→ ${pct(nPol, total)} observam pontos de descarte irregular frequentes no entorno. Média de percepção da eficácia de ações educativas: ${mediaAco || '—'}/5.`
    );
  }

  /* ── Gráficos ── */
  function renderCharts(data) {
    Charts.applyDefaults();
    Charts.destroyAll();

    const P = Charts;
    const C_TEAL   = '#0e9f70', C_TEALLL = '#4ecfa0',
          C_AMBER  = '#f59e0b', C_RED    = '#f87171',
          C_GREEN  = '#34d399', C_PURPLE = '#a78bfa',
          C_BLUE   = '#60a5fa', C_ORANGE = '#fb923c',
          C_PINK   = '#f472b6';

    /* Linha: evolução temporal */
    const tl = buildTimeline(data);
    if (tl.labels.length) {
      P.line('chartTempo', tl.labels, tl.data);
    }

    /* Rosca: conhecimento prévio */
    P.doughnut('chartConhecimento',
      ['Conhece bem','Já ouviu, mas superficialmente','Nunca tinha ouvido falar'],
      [
        count(data, 'conhecimento', 'conheco bem') + count(data, 'conhecimento', 'conheço bem'),
        count(data, 'conhecimento', 'ja ouvi')     + count(data, 'conhecimento', 'já ouvi'),
        count(data, 'conhecimento', 'nunca tinha') + count(data, 'conhecimento', 'nunca ouvi'),
      ],
      [C_TEAL, C_AMBER, C_RED]
    );

    /* Rosca: reciclagem */
    P.doughnut('chartReciclagem',
      ['Sempre','Frequentemente','Às vezes','Raramente','Nunca'],
      [
        count(data, 'reciclagem', 'sempre'),
        count(data, 'reciclagem', 'frequentemente'),
        count(data, 'reciclagem', 'as vezes') + count(data, 'reciclagem', 'às vezes'),
        count(data, 'reciclagem', 'raramente'),
        count(data, 'reciclagem', 'nunca'),
      ],
      [C_TEAL, C_TEALLL, C_AMBER, C_ORANGE, C_RED]
    );

    /* Barras: faixa etária */
    P.bar('chartIdade',
      ['< 18','18–25','26–35','36–50','> 50'],
      [
        count(data, 'idade', 'menos de 18'),
        count(data, 'idade', '18 a 25'),
        count(data, 'idade', '26 a 35'),
        count(data, 'idade', '36 a 50'),
        count(data, 'idade', 'mais de 50'),
      ],
      C_PURPLE
    );

    /*
     * CORREÇÃO — Escolaridade:
     * Antes: `count(arr,'escolaridade','superior') && count(arr,'escolaridade','incompleto')`
     * retornava 0 ou 1 (booleano) porque && em JS retorna o operando, não soma.
     * Agora: `countBoth()` filtra por dois termos simultaneamente, retornando
     * a contagem real de registros que contêm ambas as palavras.
     */
    P.bar('chartEscolaridade',
      ['Fund.','Médio','Sup. Inc.','Sup. Comp.','Pós'],
      [
        count(data,     'escolaridade', 'fundamental'),
        count(data,     'escolaridade', 'medio') + count(data, 'escolaridade', 'médio'),
        countBoth(data, 'escolaridade', 'superior', 'incompleto'),
        countBoth(data, 'escolaridade', 'superior', 'completo'),
        count(data,     'escolaridade', 'pos') + count(data, 'escolaridade', 'pós'),
      ],
      C_BLUE
    );

    /* Barras horiz: fontes conhecidas */
    const fontesData = countFontes(data);
    if (fontesData.length) {
      P.barH('chartFontes',
        fontesData.map(f => f[0]),
        fontesData.map(f => f[1]),
        C_TEAL
      );
    }

    /*
     * CORREÇÃO — Reação:
     * Antes: `count(arr,'reacao','ja sabia') && count(arr,'reacao','preocup')` → booleano.
     * Agora: `countBoth()` retorna contagem real de respostas com ambos os termos.
     */
    P.doughnut('chartReacao',
      [
        'Já sabia, muito preocupado(a)',
        'Já sabia, pouco preocupado(a)',
        'Não sabia, ficou preocupado(a)',
        'Não sabia, não surpreendeu',
        'Não acredita',
      ],
      [
        countBoth(data, 'reacao', 'ja sabia',  'preocupado'),
        countBoth(data, 'reacao', 'ja sabia',  'certo'),
        countBoth(data, 'reacao', 'nao sabia', 'preocupado'),
        count(data,     'reacao', 'nao surpreendeu') + count(data, 'reacao', 'não surpreendeu'),
        count(data,     'reacao', 'nao acredito')    + count(data, 'reacao', 'não acredito'),
      ],
      [C_RED, C_ORANGE, C_AMBER, C_TEALLL, C_PURPLE]
    );

    /* Barras: uso de ecoponto */
    P.bar('chartEcoponto',
      ['Usa regularmente','Usa raramente','Conhece, nunca usou','Não sabia','Não há próximo'],
      [
        count(data, 'ecoponto', 'regularmente'),
        count(data, 'ecoponto', 'raramente'),
        count(data, 'ecoponto', 'nunca utilizei') + count(data, 'ecoponto', 'nunca usei'),
        count(data, 'ecoponto', 'nao sabia')      + count(data, 'ecoponto', 'não sabia'),
        count(data, 'ecoponto', 'nao ha')         + count(data, 'ecoponto', 'não há'),
      ],
      C_ORANGE
    );

    /* Rosca: descarte irregular */
    P.doughnut('chartDescarteIrr',
      ['Sim, pontos frequentes','Sim, casos isolados','Não observei','Não presto atenção'],
      [
        count(data, 'descarteIrr', 'frequentes') +
          count(data, 'descarteIrr', 'ha pontos') +
          count(data, 'descarteIrr', 'há pontos'),
        count(data, 'descarteIrr', 'isolados'),
        count(data, 'descarteIrr', 'nao observei') + count(data, 'descarteIrr', 'não observei'),
        count(data, 'descarteIrr', 'atencao')      + count(data, 'descarteIrr', 'atenção'),
      ],
      [C_RED, C_ORANGE, C_TEAL, C_TEALLL]
    );

    /* Barras: postura ante mudança */
    P.bar('chartMudanca',
      ['Adotaria imediatamente','Provavelmente sim','Talvez','Provavelmente não','Não tem interesse'],
      [
        count(data,     'mudanca', 'imediatamente'),
        countBoth(data, 'mudanca', 'provavelmente', 'sim'),
        count(data,     'mudanca', 'talvez'),
        countBoth(data, 'mudanca', 'provavelmente', 'nao') +
          countBoth(data, 'mudanca', 'provavelmente', 'não'),
        count(data,     'mudanca', 'nao tenho interesse') +
          count(data,   'mudanca', 'não tenho interesse'),
      ],
      C_GREEN
    );

    /* Barras agrupadas: preocupações Q12 */
    const impLabels = ['Água potável','Alimentos','Saúde humana','Animais marinhos','Ecossistemas','Economia/Pesca'];
    const impKeys   = ['preocAgua','preocAlim','preocSaude','preocAnimais','preocEcossist','preocEconom'];
    const muito = impKeys.map(k => count(data, k, 'muito preocupante'));
    const medio = impKeys.map(k => count(data, k, 'moderadamente'));
    const pouco = impKeys.map(k => count(data, k, 'pouco'));
    P.barGrouped('chartPreocupacao', impLabels, [
      { label: 'Muito preocupante',         data: muito, backgroundColor: C_RED    + 'bb', borderColor: C_RED,    borderWidth: 1, borderRadius: 4 },
      { label: 'Moderadamente preocupante', data: medio, backgroundColor: C_AMBER  + 'bb', borderColor: C_AMBER,  borderWidth: 1, borderRadius: 4 },
      { label: 'Pouco preocupante',         data: pouco, backgroundColor: C_TEALLL + 'bb', borderColor: C_TEALLL, borderWidth: 1, borderRadius: 4 },
    ]);

    /* Barras: escala de eficácia de ações educativas */
    P.bar('chartAcoesEdu',
      ['1 — Discordo totalmente','2','3 — Neutro','4','5 — Concordo totalmente'],
      [1,2,3,4,5].map(v => data.filter(r => String(r.acoesEdu_raw).trim() === String(v)).length),
      C_PINK
    );
  }

  /* ── Gauges ── */
  function renderScaleMetrics(data) {
    const mediaLimpeza = avg(data, 'limpeza_raw');
    const mediaEdu     = avg(data, 'acoesEdu_raw');
    renderGauge('gaugeLimpeza', mediaLimpeza, 5,
      'Média — Qualidade ambiental do entorno', '1=Muito ruim · 5=Excelente');
    renderGauge('gaugeEdu', mediaEdu, 5,
      'Média — Eficácia de ações educativas', '1=Discordo totalmente · 5=Concordo totalmente');
  }

  function renderGauge(id, value, max, title, sub) {
    const el = document.getElementById(id);
    if (!el) return;
    const val   = parseFloat(value) || 0;
    const pct2  = Math.round((val / max) * 100);
    const color = val >= 4 ? '#34d399' : val >= 3 ? '#f59e0b' : '#f87171';
    el.innerHTML = `
      <div class="gauge-wrap">
        <div class="gauge-title">${title}</div>
        <div class="gauge-ring">
          <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
            <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="7"/>
            <circle cx="40" cy="40" r="30" fill="none" stroke="${color}" stroke-width="7"
              stroke-dasharray="${2 * Math.PI * 30}"
              stroke-dashoffset="${2 * Math.PI * 30 * (1 - pct2 / 100)}"
              stroke-linecap="round" transform="rotate(-90 40 40)"
              style="transition:stroke-dashoffset 1.2s ease"/>
          </svg>
          <div class="gauge-center">
            <span class="gauge-value" style="color:${color}">${value || '—'}</span>
            <span class="gauge-max">/${max}</span>
          </div>
        </div>
        <div class="gauge-sub">${sub}</div>
      </div>`;
  }

  /* ── Ranking de bairros ── */
  function renderBairros(data) {
    const map = {};
    data.forEach(r => {
      const b = (r.bairro || '').trim();
      if (b) map[b] = (map[b] || 0) + 1;
    });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const max = sorted[0]?.[1] || 1;
    const el  = document.getElementById('bairrosList');
    if (!el) return;
    el.innerHTML = sorted.map(([name, cnt]) => `
      <div class="bairro-row">
        <span class="bairro-name">${name}</span>
        <div class="bairro-track">
          <div class="bairro-fill" style="width:${Math.round(cnt / max * 100)}%"></div>
        </div>
        <span class="bairro-count">${cnt}</span>
      </div>`).join('');
  }

  /* ── Tabela recente ── */
  function renderTable(data) {
    const el = document.getElementById('tableBody');
    if (!el) return;
    const recent = [...data].reverse().slice(0, 15);

    function tag(text, cls) { return `<span class="tag tag-${cls}">${text}</span>`; }
    function tagKnow(v) {
      if (norm(v).includes('conheco bem') || norm(v).includes('conheço bem')) return tag('Sim','pos');
      if (norm(v).includes('nunca')) return tag('Nunca ouviu','neg');
      return tag('Superficial','mid');
    }
    function tagRec(v) {
      const n = norm(v);
      if (n.includes('sempre'))        return tag('Sempre','pos');
      if (n.includes('nunca'))         return tag('Nunca','neg');
      if (n.includes('raramente'))     return tag('Raramente','neg');
      if (n.includes('frequentemente')) return tag('Frequente','pos');
      return tag('Às vezes','mid');
    }
    function tagLimp(v) {
      const n = parseFloat(v);
      if (n >= 4) return tag(v + '/5','pos');
      if (n >= 3) return tag(v + '/5','mid');
      return tag(v + '/5','neg');
    }
    function tagDesc(v) {
      const n = norm(v);
      if (n.includes('frequentes') || n.includes('ha pontos') || n.includes('há pontos')) return tag('Sim, frequente','neg');
      if (n.includes('isolados'))  return tag('Isolado','mid');
      if (n.includes('nao observei') || n.includes('não observei')) return tag('Não','pos');
      return tag('N/A','mid');
    }

    el.innerHTML = recent.map((r, i) => `
      <tr>
        <td style="color:rgba(255,255,255,.2)">${data.length - i}</td>
        <td>${r.bairro  || '—'}</td>
        <td>${r.idade   || '—'}</td>
        <td>${tagKnow(r.conhecimento)}</td>
        <td>${tagRec(r.reciclagem)}</td>
        <td>${r.limpeza_raw ? tagLimp(r.limpeza_raw) : '—'}</td>
        <td>${tagDesc(r.descarteIrr)}</td>
      </tr>`).join('');
  }

  /* ── Visibilidade de seções ── */
  function showSections(show) {
    ['chartsSection','chartsSection2','chartsSection3',
     'scaleSection','bairrosCard','tableCard','insightBar'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = show ? '' : 'none';
    });
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ── Render completo ── */
  function render(data) {
    if (!data.length) {
      setStatus('Nenhuma resposta encontrada ainda.', false);
      showSections(false);
      return;
    }
    renderKPIs(data);
    renderInsights(data);
    renderCharts(data);
    renderScaleMetrics(data);
    renderBairros(data);
    renderTable(data);
    showSections(true);

    document.getElementById('dashStatusDot').classList.add('active');
    setText('dashStatusText',
      `${data.length} resposta${data.length !== 1 ? 's' : ''} carregada${data.length !== 1 ? 's' : ''}`);
    setText('dashUpdated', 'Atualizado: ' + new Date().toLocaleString('pt-BR'));
  }

  function setStatus(msg, active) {
    const dot  = document.getElementById('dashStatusDot');
    const text = document.getElementById('dashStatusText');
    if (dot)  dot.classList.toggle('active', active);
    if (text) text.textContent = msg;
  }

  return { render, setStatus, setText };
})();

/* ─────────────────────────────────────────────────────────────
   6. AUTO-REFRESH
   CORREÇÃO: removido o `setInterval(() => {}, REFRESH_INTERVAL)`
   que era dead code — o ciclo real já é gerenciado pelo countdown.
───────────────────────────────────────────────────────────── */
const AutoRefresh = (() => {
  let countdown = null;
  let remaining = REFRESH_INTERVAL;

  async function load(silent = false) {
    if (!silent) {
      Dashboard.setStatus('Carregando dados…', false);
    }
    try {
      const data = await DataLayer.fetch();
      Dashboard.render(data);
      resetCountdown();
    } catch (err) {
      Dashboard.setStatus('⚠ ' + err.message, false);
      console.error('[Dashboard] Erro:', err);
      resetCountdown();
    }
  }

  function resetCountdown() {
    clearInterval(countdown);
    remaining = REFRESH_INTERVAL;
    updateCountdown();
    countdown = setInterval(() => {
      remaining -= 1000;
      updateCountdown();
      if (remaining <= 0) {
        clearInterval(countdown);
        load(true);
      }
    }, 1000);
  }

  function updateCountdown() {
    const el = document.getElementById('refreshCountdown');
    if (!el) return;
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = `Próxima atualização em ${m}:${String(s).padStart(2,'0')}`;
  }

  function init() {
    const btn = document.getElementById('refreshBtn');
    if (btn) btn.addEventListener('click', () => load(false));

    document.querySelectorAll('[data-forms-url]').forEach(el => {
      el.href = FORMS_URL;
    });

    load(false);
  }

  return { init, load };
})();

/* ─────────────────────────────────────────────────────────────
   INICIALIZAÇÃO
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - 70,
        behavior: 'smooth',
      });
    });
  });

  function waitForChart(retries = 20) {
    if (window.Chart) {
      AutoRefresh.init();
    } else if (retries > 0) {
      setTimeout(() => waitForChart(retries - 1), 200);
    } else {
      console.warn('[Dashboard] Chart.js não carregou a tempo.');
      Dashboard.setStatus('Erro: biblioteca de gráficos não carregou.', false);
    }
  }
  waitForChart();
});
