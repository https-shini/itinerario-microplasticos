/**
 * ═══════════════════════════════════════════════════════
 * MICROPLÁSTICOS — PROJETO EXTENSIONISTA UCS 2026
 * script.js · Navigation + Animations + Dashboard
 * ═══════════════════════════════════════════════════════
 */

/* ───────────────────────────────────────────
   1. NAVIGATION
─────────────────────────────────────────── */
(function initNavigation() {
  const navbar   = document.getElementById('navbar');
  const toggle   = document.getElementById('navToggle');
  const menu     = document.getElementById('navMenu');
  const navLinks = document.querySelectorAll('.nav-link');

  /* Scroll: add/remove .scrolled class */
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  /* Mobile menu toggle */
  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen);
  });

  /* Close menu on link click */
  navLinks.forEach(link => {
    link.addEventListener('click', () => menu.classList.remove('open'));
  });

  /* Active link tracking via IntersectionObserver */
  const sections = document.querySelectorAll('section[id]');
  const navObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-50% 0px -50% 0px' });

  sections.forEach(s => navObserver.observe(s));
})();

/* ───────────────────────────────────────────
   2. SCROLL REVEAL ANIMATIONS
─────────────────────────────────────────── */
(function initReveal() {
  const elements = document.querySelectorAll('.reveal-up');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        /* Stagger based on sibling index inside same parent */
        const siblings = Array.from(entry.target.parentElement.querySelectorAll('.reveal-up'));
        const idx = siblings.indexOf(entry.target);
        const extraDelay = idx * 60;
        const existing = parseFloat(getComputedStyle(entry.target).transitionDelay) * 1000 || 0;
        entry.target.style.transitionDelay = (existing + extraDelay) + 'ms';
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  elements.forEach(el => revealObserver.observe(el));
})();

/* ───────────────────────────────────────────
   3. DASHBOARD
─────────────────────────────────────────── */
const Dashboard = (() => {
  /* Active Chart.js instances — stored for destroy-before-recreate */
  const chartInstances = {};

  /* Chart.js global defaults for dark theme */
  function applyChartDefaults() {
    Chart.defaults.color          = 'rgba(255,255,255,0.45)';
    Chart.defaults.borderColor    = 'rgba(255,255,255,0.07)';
    Chart.defaults.font.family    = 'Inter, system-ui, sans-serif';
    Chart.defaults.font.size      = 12;
    Chart.defaults.plugins.legend.labels.boxWidth  = 13;
    Chart.defaults.plugins.legend.labels.padding   = 14;
    Chart.defaults.plugins.tooltip.backgroundColor = '#1a3a46';
    Chart.defaults.plugins.tooltip.titleColor      = '#ffffff';
    Chart.defaults.plugins.tooltip.bodyColor       = 'rgba(255,255,255,0.65)';
    Chart.defaults.plugins.tooltip.borderColor     = 'rgba(255,255,255,0.1)';
    Chart.defaults.plugins.tooltip.borderWidth     = 1;
    Chart.defaults.plugins.tooltip.padding         = 10;
  }

  /* Palette */
  const P = {
    teal:   '#0e9f70',
    tealL:  '#4ecfa0',
    tealP:  'rgba(78,207,160,0.15)',
    amber:  '#f59e0b',
    red:    '#f87171',
    green:  '#34d399',
    purple: '#a78bfa',
    blue:   '#60a5fa',
    grid:   'rgba(255,255,255,0.06)',
  };

  /* ── 3a. Destroy existing charts ── */
  function destroyAll() {
    Object.values(chartInstances).forEach(c => c && c.destroy());
    Object.keys(chartInstances).forEach(k => delete chartInstances[k]);
  }

  /* ── 3b. Build helpers ── */
  function buildDoughnut(id, labels, data, colors) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    chartInstances[id] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'right' },
          tooltip: {}
        }
      }
    });
  }

  function buildBar(id, labels, data, color, horizontal = false) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    chartInstances[id] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: color + 'bb',
          borderColor: color,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        scales: {
          x: { grid: { color: P.grid } },
          y: { grid: { color: P.grid } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  function buildLine(id, labels, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    chartInstances[id] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: P.tealL,
          backgroundColor: P.tealP,
          tension: 0.45,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: P.tealL,
          pointBorderColor: '#0d3244',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { color: P.grid } },
          y: { grid: { color: P.grid }, beginAtZero: true, ticks: { stepSize: 1 } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  /* ── 3c. Count helpers ── */
  function count(arr, key, partial) {
    const p = partial.toLowerCase();
    return arr.filter(r => r[key] && r[key].toLowerCase().includes(p)).length;
  }

  function pct(num, total) {
    if (!total) return '—';
    return Math.round(num / total * 100) + '%';
  }

  /* ── 3d. Main render function ── */
  function render(data) {
    applyChartDefaults();
    destroyAll();

    const total = data.length;

    /* ── KPI cards ── */
    document.getElementById('kpiTotal').textContent = total;

    const nDesconhece = count(data, 'conhece', 'não conhecia');
    document.getElementById('kpiDesconhece').textContent = pct(nDesconhece, total);

    const nRecicla = count(data, 'reciclagem', 'sempre');
    document.getElementById('kpiRecicla').textContent = pct(nRecicla, total);

    const nPoluido = count(data, 'limpeza', 'poluído') + count(data, 'limpeza', 'poluido');
    document.getElementById('kpiPoluido').textContent = pct(nPoluido, total);

    /* ── Status bar ── */
    document.getElementById('dashStatusDot').classList.add('active');
    document.getElementById('dashStatusText').textContent = `${total} respostas carregadas`;
    document.getElementById('dashUpdated').textContent = 'Atualizado: ' + new Date().toLocaleString('pt-BR');

    /* ── Insights ── */
    document.getElementById('insightBar').style.display = 'grid';
    document.getElementById('ins1').textContent = `⚠ ${pct(nDesconhece, total)} dos participantes não conheciam o conceito de microplástico antes de responder à pesquisa.`;
    document.getElementById('ins2').textContent = `✓ ${pct(nRecicla, total)} já praticam reciclagem ativamente, indicando receptividade à educação ambiental.`;
    document.getElementById('ins3').textContent = `→ ${pct(nPoluido, total)} relataram bairro poluído, evidenciando necessidade urgente de intervenção e coleta seletiva.`;

    /* ── Show sections ── */
    document.getElementById('chartsSection').style.display = 'grid';
    document.getElementById('bairrosCard').style.display = 'block';
    document.getElementById('tableCard').style.display = 'block';

    /* ── Chart: Conhecimento ── */
    buildDoughnut('chartConhecimento',
      ['Conhece bem', 'Já ouviu falar', 'Não conhecia'],
      [count(data,'conhece','conheço bem'), count(data,'conhece','já ouvi'), nDesconhece],
      [P.teal, P.amber, P.red]
    );

    /* ── Chart: Reciclagem ── */
    buildDoughnut('chartReciclagem',
      ['Sempre', 'Às vezes', 'Raramente', 'Nunca'],
      [nRecicla, count(data,'reciclagem','às vezes'), count(data,'reciclagem','raramente'), count(data,'reciclagem','nunca')],
      [P.teal, P.tealL, P.amber, P.red]
    );

    /* ── Chart: Limpeza ── */
    buildBar('chartLimpeza',
      ['Muito limpo','Razoável','Poluído','Muito poluído'],
      [
        count(data,'limpeza','muito limpo'),
        count(data,'limpeza','razoável') + count(data,'limpeza','razoavel'),
        count(data,'limpeza','poluído') + count(data,'limpeza','poluido') - (count(data,'limpeza','muito poluído') + count(data,'limpeza','muito poluido')),
        count(data,'limpeza','muito poluído') + count(data,'limpeza','muito poluido')
      ],
      P.teal
    );

    /* ── Chart: Descarte irregular ── */
    buildDoughnut('chartDescarte',
      ['Sim','Não','Não sei'],
      [
        count(data,'descarte','sim'),
        count(data,'descarte','não') - count(data,'descarte','não sei'),
        count(data,'descarte','não sei')
      ],
      [P.red, P.teal, P.amber]
    );

    /* ── Chart: Faixa etária ── */
    const idadeMap = [
      ['< 18 anos','menos de 18'],
      ['18–25','18 a 25'],
      ['26–35','26 a 35'],
      ['36–50','36 a 50'],
      ['> 50 anos','mais de 50']
    ];
    buildBar('chartIdade',
      idadeMap.map(x => x[0]),
      idadeMap.map(x => count(data,'idade',x[1])),
      P.purple
    );

    /* ── Chart: Respostas ao longo do tempo (simulado por índice) ── */
    const buckets = 7;
    const perBucket = Math.ceil(total / buckets);
    const timeLabels = Array.from({length: buckets}, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (buckets - 1 - i));
      return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
    });
    const timeCounts = timeLabels.map((_, i) => Math.min((i + 1) * perBucket, total));
    buildLine('chartTempo', timeLabels, timeCounts);

    /* ── Bairros ranking ── */
    const bairros = {};
    data.forEach(r => {
      const b = (r.bairro || '').trim();
      if (b) bairros[b] = (bairros[b] || 0) + 1;
    });
    const sorted = Object.entries(bairros).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxB = sorted[0]?.[1] || 1;
    document.getElementById('bairrosList').innerHTML = sorted.map(([name, cnt]) => `
      <div class="bairro-row">
        <span class="bairro-name">${name}</span>
        <div class="bairro-track">
          <div class="bairro-fill" style="width:${Math.round(cnt / maxB * 100)}%"></div>
        </div>
        <span class="bairro-count">${cnt}</span>
      </div>
    `).join('');

    /* ── Tabela de respostas recentes ── */
    const recent = data.slice(-12).reverse();

    function tagConhece(v) {
      const lv = (v || '').toLowerCase();
      if (lv.includes('bem'))          return '<span class="tag tag-pos">Sim</span>';
      if (lv.includes('não conhecia')) return '<span class="tag tag-neg">Não</span>';
      return '<span class="tag tag-mid">Parcial</span>';
    }
    function tagReciclagem(v) {
      const lv = (v || '').toLowerCase();
      if (lv.includes('sempre'))     return '<span class="tag tag-pos">Sempre</span>';
      if (lv.includes('nunca'))      return '<span class="tag tag-neg">Nunca</span>';
      if (lv.includes('raramente'))  return '<span class="tag tag-neg">Raramente</span>';
      return '<span class="tag tag-mid">Às vezes</span>';
    }
    function tagLimpeza(v) {
      const lv = (v || '').toLowerCase();
      if (lv.includes('muito poluído') || lv.includes('muito poluido')) return '<span class="tag tag-neg">Muito poluído</span>';
      if (lv.includes('poluído') || lv.includes('poluido'))             return '<span class="tag tag-mid">Poluído</span>';
      if (lv.includes('razoável') || lv.includes('razoavel'))           return '<span class="tag tag-mid">Razoável</span>';
      return '<span class="tag tag-pos">Muito limpo</span>';
    }
    function tagDescarte(v) {
      const lv = (v || '').toLowerCase();
      if (lv.includes('não sei')) return '<span class="tag tag-mid">Não sei</span>';
      if (lv.includes('não') || lv.includes('nao')) return '<span class="tag tag-pos">Não</span>';
      return '<span class="tag tag-neg">Sim</span>';
    }

    document.getElementById('tableBody').innerHTML = recent.map((r, i) => `
      <tr>
        <td style="color:rgba(255,255,255,.2)">${data.length - i}</td>
        <td>${r.bairro || '—'}</td>
        <td>${r.idade  || '—'}</td>
        <td>${tagConhece(r.conhece)}</td>
        <td>${tagReciclagem(r.reciclagem)}</td>
        <td>${tagLimpeza(r.limpeza)}</td>
        <td>${tagDescarte(r.descarte)}</td>
      </tr>
    `).join('');
  }

  /* ── 3e. Load from Google Sheets CSV ── */
  async function loadCSV(url) {
    setStatus('Carregando dados...', false);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();

      /* Parse CSV (handles quoted fields) */
      const lines  = text.trim().split('\n');
      const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase().trim());

      /* Auto-detect columns by keywords */
      const COL = {
        bairro:     findCol(headers, ['bairro']),
        idade:      findCol(headers, ['faixa','idade']),
        conhece:    findCol(headers, ['conhecia','micropl','microplástico']),
        reciclagem: findCol(headers, ['recicl','frequência']),
        limpeza:    findCol(headers, ['limpeza','avalia']),
        descarte:   findCol(headers, ['descarte','irregular']),
      };

      const data = lines.slice(1)
        .filter(l => l.trim())
        .map(line => {
          const cols = parseCSVRow(line);
          return {
            bairro:     safe(cols, COL.bairro),
            idade:      safe(cols, COL.idade),
            conhece:    safe(cols, COL.conhece),
            reciclagem: safe(cols, COL.reciclagem),
            limpeza:    safe(cols, COL.limpeza),
            descarte:   safe(cols, COL.descarte),
          };
        })
        .filter(r => r.bairro || r.conhece || r.reciclagem);

      if (!data.length) throw new Error('Nenhuma resposta encontrada no CSV.');
      render(data);
    } catch (err) {
      setStatus('Erro: ' + err.message, false);
      alert('Não foi possível carregar o CSV.\n\nVerifique se:\n• O link está correto\n• O Sheets está publicado como CSV público\n\nErro: ' + err.message);
    }
  }

  /* ── 3f. Demo data ── */
  function loadDemo() {
    const bairros = ['Vila Reg. Feijó','Jd. Vila Formosa','Aricanduva','Tatuapé','Penha','Mooca','Belém','Itaquera','Carrão','São Mateus','Sapopemba','Cidade Tiradentes'];
    const idades   = ['Menos de 18 anos','18 a 25 anos','18 a 25 anos','26 a 35 anos','26 a 35 anos','36 a 50 anos','Mais de 50 anos'];
    const conheces = ['Não conhecia até hoje','Não conhecia até hoje','Já ouvi falar, mas não sei muito','Já ouvi falar, mas não sei muito','Sim, conheço bem'];
    const recicla  = ['Sempre — separo tudo que consigo','Sempre — separo tudo que consigo','Às vezes — quando lembro','Às vezes — quando lembro','Raramente — não faz parte da minha rotina','Nunca separo'];
    const limpezas = ['Razoável — há lixo, mas não é grave','Razoável — há lixo, mas não é grave','Poluído — vejo lixo plástico com frequência','Muito limpo — raramente vejo lixo','Muito poluído — é um problema constante'];
    const descartes= ['Sim','Sim','Não','Não sei'];

    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    const data = Array.from({ length: 54 }, () => ({
      bairro:     pick(bairros),
      idade:      pick(idades),
      conhece:    pick(conheces),
      reciclagem: pick(recicla),
      limpeza:    pick(limpezas),
      descarte:   pick(descartes),
    }));

    render(data);
  }

  /* ── 3g. Utilities ── */
  function setStatus(msg, active) {
    document.getElementById('dashStatusText').textContent = msg;
    document.getElementById('dashStatusDot').classList.toggle('active', active);
  }

  function findCol(headers, keywords) {
    const idx = headers.findIndex(h => keywords.some(k => h.includes(k)));
    return idx >= 0 ? idx : -1;
  }

  function safe(arr, idx) {
    return idx >= 0 && idx < arr.length ? (arr[idx] || '').trim() : '';
  }

  /* RFC 4180 CSV row parser (handles quoted fields with commas/newlines) */
  function parseCSVRow(row) {
    const result = []; let cur = ''; let inQ = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') {
        if (inQ && row[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        result.push(cur); cur = '';
      } else cur += c;
    }
    result.push(cur);
    return result.map(v => v.trim().replace(/^"|"$/g, ''));
  }

  /* ── 3h. Event bindings ── */
  function init() {
    /* Wait for Chart.js to load (it's deferred) */
    document.addEventListener('DOMContentLoaded', () => {
      const loadBtn = document.getElementById('loadCsvBtn');
      const demoBtn = document.getElementById('loadDemoBtn');

      if (loadBtn) {
        loadBtn.addEventListener('click', () => {
          const url = document.getElementById('csvUrl').value.trim();
          if (!url) { alert('Cole a URL do Google Sheets como CSV primeiro.'); return; }
          loadCSV(url);
        });
      }

      if (demoBtn) {
        demoBtn.addEventListener('click', loadDemo);
      }

      /* Allow Enter key in CSV input */
      const csvInput = document.getElementById('csvUrl');
      if (csvInput) {
        csvInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') loadBtn.click();
        });
      }
    });
  }

  return { init, loadDemo, loadCSV };
})();

/* Bootstrap */
Dashboard.init();

/* ───────────────────────────────────────────
   4. SMOOTH SCROLL for anchor links
─────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 70; /* navbar height */
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});
