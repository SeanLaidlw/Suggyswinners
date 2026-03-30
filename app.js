
console.log('SCRIPT STARTED OK');

// ===================== AUTOCOMPLETE ENGINE =====================
let acIndex = -1;

function acGetNames(field) {
  return [...new Set(allResults.map(r => r[field]).filter(Boolean))].sort();
}

function acGetAllNames() {
  const horses  = [...new Set(allResults.map(r=>r.horse).filter(Boolean))].map(n=>({name:n,type:'Horse'}));
  const jockeys = [...new Set(allResults.map(r=>r.jockey).filter(Boolean))].map(n=>({name:n,type:'Jockey'}));
  const trainers= [...new Set(allResults.map(r=>r.trainer).filter(Boolean))].map(n=>({name:n,type:'Trainer'}));
  return [...horses,...jockeys,...trainers];
}

function acStats(name, field) {
  const rows = allResults.filter(r => r[field] === name);
  const wins = rows.filter(r => r.finish_position === 1).length;
  return rows.length ? `${rows.length} starts / ${wins}W / ${rows.length?(wins/rows.length*100).toFixed(0):0}%` : '';
}

function acUpdate(input, field) {
  const q = input.value.toLowerCase().trim();
  const dropId = input.parentElement.querySelector('.ac-dropdown').id;
  if (!q || q.length < 1) { acClose(dropId); return; }
  const matches = acGetNames(field).filter(n => n.toLowerCase().includes(q)).slice(0, 10);
  acRender(dropId, matches.map(n => ({ label: n, meta: acStats(n, field) })), input);
}

function acUpdateMulti(input) {
  const q = input.value.toLowerCase().trim();
  const dropId = input.parentElement.querySelector('.ac-dropdown').id;
  if (!q || q.length < 1) { acClose(dropId); return; }
  const matches = acGetAllNames().filter(x => x.name.toLowerCase().includes(q)).slice(0, 12);
  acRender(dropId, matches.map(x => ({ label: x.name, meta: x.type + ' / ' + acStats(x.name, x.type.toLowerCase()) })), input);
}

function acRender(dropId, items, input) {
  const drop = document.getElementById(dropId);
  if (!items.length) { acClose(dropId); return; }
  acIndex = -1;
  drop.innerHTML = items.map((item, i) =>
    `<div class="ac-item" onmousedown="acSelect('${dropId}','${item.label.replace(/'/g,"\'")}',event)">`
    + `<span class="ac-item-name">${item.label}</span>`
    + `<span class="ac-item-meta">${item.meta}</span>`
    + `</div>`
  ).join('');
  drop.classList.add('open');
}

function acSelect(dropId, value, event) {
  event.preventDefault();
  const drop = document.getElementById(dropId);
  const input = drop.previousElementSibling;
  input.value = value;
  acClose(dropId);
  // Trigger the appropriate action
  input.dispatchEvent(new Event('input', {bubbles: true}));
}

function acClose(dropId) {
  const el = document.getElementById(dropId);
  if (el) { el.classList.remove('open'); el.innerHTML = ''; }
  acIndex = -1;
}

function acCloseAll() {
  document.querySelectorAll('.ac-dropdown').forEach(d => { d.classList.remove('open'); d.innerHTML = ''; });
  acIndex = -1;
}

function acKey(event, dropId) {
  const drop = document.getElementById(dropId);
  const items = drop.querySelectorAll('.ac-item');
  if (!drop.classList.contains('open') || !items.length) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    acIndex = Math.min(acIndex + 1, items.length - 1);
    items.forEach((el,i) => el.classList.toggle('selected', i === acIndex));
    items[acIndex]?.scrollIntoView({block:'nearest'});
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    acIndex = Math.max(acIndex - 1, -1);
    items.forEach((el,i) => el.classList.toggle('selected', i === acIndex));
    if (acIndex >= 0) items[acIndex]?.scrollIntoView({block:'nearest'});
  } else if (event.key === 'Enter' && acIndex >= 0) {
    event.preventDefault();
    items[acIndex]?.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
  } else if (event.key === 'Escape') {
    acClose(dropId);
  }
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.ac-wrap')) acCloseAll();
});



// ===================== RACE CLASSIFICATION ENGINE =====================
// Tier 1=G1, 2=G2, 3=G3, 4=Listed, 5=Open, 6=Benchmark, 7=Maiden, 8=Trial
const CLASS_TIERS = {
  G1: 1, G2: 2, G3: 3, LR: 4, LISTED: 4,
  OPEN: 5, OPEN_HCP: 5,
  BM100: 6, BM90: 6, BM85: 6, BM78: 6, BM72: 6, BM65: 6, BM58: 6,
  MDN: 7, MAIDEN: 7,
  TRIAL: 8,
};

const CLASS_LABELS = {
  1: 'G1', 2: 'G2', 3: 'G3', 4: 'LR', 5: 'Open', 6: 'BM', 7: 'Mdn', 8: 'Trial'
};

const CLASS_CSS = {
  1: 'cb-g1', 2: 'cb-g2', 3: 'cb-g3', 4: 'cb-lr',
  5: 'cb-open', 6: 'cb-bm', 7: 'cb-mdn', 8: 'cb-trial'
};

// AI scoring bonus by tier (added to base score)
const CLASS_WIN_BONUS = {
  1: 25, 2: 18, 3: 12, 4: 8, 5: 5, 6: 2, 7: 0, 8: 0
};

function classifyRace(raceName, raceClass, prizeMoney) {
  const name = (raceName || '').toUpperCase();
  const cls  = (raceClass || '').toUpperCase();
  const prize = prizeMoney || 0;

  // G1/G2/G3: require GROUP N to be followed by a letter/end -- prevents "GROUP 1300" matching
  const g1 = /\bGR\.?\s*1\s+[A-Z]/.test(name) || /\bGROUP\s+1\s+[A-Z]/.test(name) ||
              /\bGROUP\s+1$/.test(name) || /\bGR1\b/.test(name) || /\bG1\b/.test(cls);
  const g2 = /\bGR\.?\s*2\s+[A-Z]/.test(name) || /\bGROUP\s+2\s+[A-Z]/.test(name) ||
              /\bGROUP\s+2$/.test(name) || /\bGR2\b/.test(name) || /\bG2\b/.test(cls);
  const g3 = /\bGR\.?\s*3\s+[A-Z]/.test(name) || /\bGROUP\s+3\s+[A-Z]/.test(name) ||
              /\bGROUP\s+3$/.test(name) || /\bGR3\b/.test(name) || /\bG3\b/.test(cls);
  if (g1) return 1;
  if (g2) return 2;
  if (g3) return 3;
  if (/\bLISTED\b/.test(name) || /\bLR\b/.test(cls)) return 4;

  // Benchmark classes
  if (/BM\s*100|BM100/.test(cls+name)) return 6;
  if (/BM\s*90|BM90/.test(cls+name))  return 6;
  if (/BM\s*85|BM85/.test(cls+name))  return 6;
  if (/BM\s*78|BM78/.test(cls+name))  return 6;
  if (/BM\s*72|BM72/.test(cls+name))  return 6;
  if (/BM\s*65|BM65/.test(cls+name))  return 6;
  if (/BM\s*58|BM58/.test(cls+name))  return 6;
  if (/BM\s*\d+/.test(cls+name))      return 6;

  // Maiden
  if (/MDN|MAIDEN/.test(cls) || /MAIDEN/.test(name)) return 7;

  // Trial
  if (/TRIAL/.test(cls+name)) return 8;

  // Open races -- use prize money as tiebreaker
  if (/OPEN/.test(cls+name)) return 5;

  // Fallback: use prize money
  if (prize >= 300000) return 1;
  if (prize >= 120000) return 2;
  if (prize >= 80000)  return 3;
  if (prize >= 60000)  return 4;
  if (prize >= 35000)  return 5;
  if (prize >= 20000)  return 6;
  if (prize >= 10000)  return 7;
  return 6; // default benchmark
}

function getClassBadge(raceName, raceClass, prizeMoney) {
  const tier = classifyRace(raceName, raceClass, prizeMoney);
  return `<span class="class-badge ${CLASS_CSS[tier]}">${CLASS_LABELS[tier]}</span>`;
}

function getClassName(tier) {
  return CLASS_LABELS[tier] || '--';
}

// Enrich all results with tier on load
function enrichWithClass(results) {
  return results.map(r => ({
    ...r,
    class_tier: classifyRace(r.race_name, r.race_class, r.prize_money)
  }));
}




// ===================== DATA DECODER =====================
// Decodes the compact lookup-table format from export_data.py
function decodeRacingData(data) {
  const { columns, lookups, rows } = data;
  const colIdx = {};
  columns.forEach((c, i) => colIdx[c] = i);

  // Lookup index positions for encoded fields
  const horseI    = colIdx['horse'];
  const jockeyI   = colIdx['jockey'];
  const trainerI  = colIdx['trainer'];
  const trackI    = colIdx['track'];
  const goingI    = colIdx['going'];
  const raceNameI = colIdx['race_name'];

  return rows.map(r => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = r[i]; });
    // Decode lookup indices back to strings
    obj.horse     = lookups.horse[r[horseI]]     ?? null;
    obj.jockey    = lookups.jockey[r[jockeyI]]   ?? null;
    obj.trainer   = lookups.trainer[r[trainerI]] ?? null;
    obj.track     = lookups.track[r[trackI]]     ?? null;
    obj.going     = lookups.going[r[goingI]]     ?? null;
    obj.race_name = lookups.race_name[r[raceNameI]] ?? null;
    return obj;
  });
}

// ===================== STATE =====================
let allResults = [], filteredResults = [], currentPage = 1;
const PAGE_SIZE = 50;
let sortKey = 'date', sortDir = -1;
let charts = {};
let fieldRunners = [];
const MAX_RUNNERS = 16;
const RUNNER_COLORS = ['#7ec94a','#e8a830','#d95f4b','#4a9ed4','#c47fd4','#4bc4c4','#e87c4a','#a8d45b','#d45b8a','#5bc4a8','#d4b45b','#5b7cd4','#d45b5b','#5bd48a','#c4a84b','#8a5bd4'];

// ===================== INIT =====================
function init() {
  const loadingText = document.getElementById('loading-text');
  try {
    if (window.RACING_DATA?.rows?.length) {
      if (loadingText) loadingText.textContent = `Decoding ${window.RACING_DATA.rows.length.toLocaleString()} results...`;
      allResults = enrichWithClass(decodeRacingData(window.RACING_DATA));
      const s = window.RACING_DATA.summary;
      document.getElementById('db-status').textContent =
        `${s.total_results?.toLocaleString()} results / ${s.exported_at}`;
    } else if (window.RACING_DATA?.results?.length) {
      if (loadingText) loadingText.textContent = `Loaded ${window.RACING_DATA.results.length.toLocaleString()} results...`;
      allResults = enrichWithClass(window.RACING_DATA.results);
      const s = window.RACING_DATA.summary;
      document.getElementById('db-status').textContent =
        `${s.total_results?.toLocaleString()} results / ${s.exported_at}`;
    } else {
      allResults = enrichWithClass(generateMockData());
      document.getElementById('db-status').textContent = 'demo mode';
    }
  } catch(e) {
    console.error('Data load error:', e);
    allResults = enrichWithClass(generateMockData());
    document.getElementById('db-status').textContent = 'error loading data';
  }
  populateDropdowns();
  applyFilters();
  loadTrends();

  // Always hide loading overlay
  try {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => overlay.remove(), 450);
    }
  } catch(e) {}
}

// ===================== DROPDOWNS =====================
function populateDropdowns() {
  const tracks = [...new Set(allResults.map(r=>r.track).filter(Boolean))].sort();
  const goings = [...new Set(allResults.map(r=>normaliseGoing(r.going)).filter(Boolean))].sort();

  ['f-track','t-track','field-track'].forEach(id => {
    const sel = document.getElementById(id); if(!sel) return;
    tracks.forEach(t => { const o=document.createElement('option'); o.value=t; o.textContent=t; sel.appendChild(o); });
  });
  ['f-going','field-going'].forEach(id => {
    const sel = document.getElementById(id); if(!sel) return;
    goings.forEach(g => { const o=document.createElement('option'); o.value=g; o.textContent=g; sel.appendChild(o); });
  });
}

function normaliseGoing(going) {
  if (!going) return null;
  const g = going.toLowerCase();
  if (g.includes('heavy')) return 'Heavy';
  if (g.includes('slow')) return 'Slow';
  if (g.includes('soft')) return 'Soft';
  if (g.includes('good')) return 'Good';
  if (g.includes('firm')) return 'Firm';
  if (g.includes('hard')) return 'Hard';
  return going.split(/\s/)[0];
}

function goingClass(going) {
  if (!going) return '';
  const g = going.toLowerCase();
  if (g.includes('heavy') || g.includes('slow')) return 'going-heavy';
  if (g.includes('soft')) return 'going-soft';
  return 'going-good';
}

// ===================== GLOBAL SEARCH =====================
function globalSearch(q) {
  const container = document.getElementById('search-results');
  if (!q || q.length < 2) { container.style.display='none'; return; }
  const lq = q.toLowerCase();
  const horses = [...new Set(allResults.map(r=>r.horse).filter(Boolean))].filter(h=>h.toLowerCase().includes(lq)).slice(0,5);
  const jockeys = [...new Set(allResults.map(r=>r.jockey).filter(Boolean))].filter(j=>j.toLowerCase().includes(lq)).slice(0,3);
  const trainers = [...new Set(allResults.map(r=>r.trainer).filter(Boolean))].filter(t=>t.toLowerCase().includes(lq)).slice(0,3);
  const results = [
    ...horses.map(h=>({name:h,type:'horse',label:'Horse'})),
    ...jockeys.map(j=>({name:j,type:'jockey',label:'Jockey'})),
    ...trainers.map(t=>({name:t,type:'trainer',label:'Trainer'})),
  ];
  if (!results.length) { container.style.display='none'; return; }
  container.innerHTML = results.map(r => {
    const rows = allResults.filter(x=>(x[r.type]||'')===r.name);
    const wins = rows.filter(x=>x.finish_position===1).length;
    return `<div class="search-result-item" onclick="openProfile('${r.name.replace(/'/g,"\\'")}','${r.type}')">
      <div><div class="sri-name">${r.name}</div>
        <div class="sri-meta">${rows.length} starts / ${wins} wins</div></div>
      <span class="sri-type">${r.label}</span></div>`;
  }).join('');
  container.style.display = 'block';
}
function showSearchResults() {
  const q = document.getElementById('global-search').value;
  if (q.length >= 2) globalSearch(q);
}
function hideSearchResults() { document.getElementById('search-results').style.display='none'; }

// ===================== PROFILE =====================
function openProfile(name, type) {
  hideSearchResults();
  document.getElementById('global-search').value = '';
  showPage('profile');
  const rows = allResults.filter(r=>(r[type]||'')=== name);
  if (!rows.length) return;
  rows.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const wins = rows.filter(r=>r.finish_position===1).length;
  const places = rows.filter(r=>r.finish_position<=3).length;
  const avgPos = (rows.reduce((s,r)=>s+r.finish_position,0)/rows.length).toFixed(1);
  const winPct = (wins/rows.length*100).toFixed(1);
  const placePct = (places/rows.length*100).toFixed(1);
  const totalPrize = rows.reduce((s,r)=>s+(r.prize_money||0),0);

  // Best track
  const trackMap = {};
  rows.filter(r=>r.finish_position===1).forEach(r=>{ trackMap[r.track]=(trackMap[r.track]||0)+1; });
  const bestTrack = Object.entries(trackMap).sort((a,b)=>b[1]-a[1])[0]?.[0]||'--';

  // Best distance
  const distMap = {};
  rows.filter(r=>r.finish_position===1).forEach(r=>{ distMap[r.distance_m]=(distMap[r.distance_m]||0)+1; });
  const bestDist = Object.entries(distMap).sort((a,b)=>b[1]-a[1])[0]?.[0];

  // Best class won
  const winRows = rows.filter(r=>r.finish_position===1);
  const bestTier = winRows.length ? Math.min(...winRows.map(r=>r.class_tier||7)) : null;
  const bestClassWonBadge = bestTier
    ? `<span class="class-badge ${CLASS_CSS[bestTier]}">${CLASS_LABELS[bestTier]}</span>`
    : '--';

  // Going record
  const goingMap = {};
  rows.forEach(r=>{
    const g = normaliseGoing(r.going);
    if (!g) return;
    if (!goingMap[g]) goingMap[g]={starts:0,wins:0};
    goingMap[g].starts++;
    if (r.finish_position===1) goingMap[g].wins++;
  });

  // Form line (last 8)
  const formLine = rows.slice(0,8).map(r=>{
    const cls = r.finish_position===1?'fd-1':r.finish_position===2?'fd-2':r.finish_position===3?'fd-3':'fd-o';
    return `<div class="form-dot ${cls}">${r.finish_position}</div>`;
  }).join('');

  // Days since last run
  const lastDate = rows[0]?.date;
  const daysSince = lastDate ? Math.floor((Date.now()-new Date(lastDate))/(1000*60*60*24)) : null;

  document.getElementById('profile-content').innerHTML = `
    <div class="profile-wrap">
      <div class="profile-card">
        <div class="profile-badge">${type.toUpperCase()}</div>
        <div class="profile-name">${name}</div>
        <div class="form-line" style="margin-bottom:1rem">${formLine}</div>
        <div class="profile-stat-row"><span class="profile-stat-label">Starts</span><span class="profile-stat-val">${rows.length}</span></div>
        <div class="profile-stat-row"><span class="profile-stat-label">Wins</span><span class="profile-stat-val" style="color:var(--amber)">${wins} (${winPct}%)</span></div>
        <div class="profile-stat-row"><span class="profile-stat-label">Places (top 3)</span><span class="profile-stat-val">${places} (${placePct}%)</span></div>
        <div class="profile-stat-row"><span class="profile-stat-label">Avg finish pos</span><span class="profile-stat-val">${avgPos}</span></div>
        <div class="profile-stat-row"><span class="profile-stat-label">Best track</span><span class="profile-stat-val">${bestTrack}</span></div>
        <div class="profile-stat-row"><span class="profile-stat-label">Best distance</span><span class="profile-stat-val">${bestDist?bestDist+'m':'--'}</span></div>
        <div class="profile-stat-row"><span class="profile-stat-label">Best class won</span><span class="profile-stat-val">${bestClassWonBadge}</span></div>
        <div class="profile-stat-row"><span class="profile-stat-label">Career earnings</span><span class="profile-stat-val" style="color:var(--green)">$${totalPrize.toLocaleString()}</span></div>
        ${daysSince!==null?`<div class="profile-stat-row"><span class="profile-stat-label">Days since last run</span><span class="profile-stat-val">${daysSince}</span></div>`:''}
      </div>
      <div class="profile-right">
        <div class="table-wrap" style="margin-bottom:0">
          <div class="table-header"><span class="table-title">Going record</span></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;padding:1rem">
            ${Object.entries(goingMap).sort((a,b)=>b[1].starts-a[1].starts).map(([g,d])=>`
              <div class="going-card">
                <div class="going-label"><span class="going-badge ${goingClass(g)}">${g}</span></div>
                <div class="going-val" style="color:${d.wins>0?'var(--green)':'var(--text2)'}">${d.wins>0?(d.wins/d.starts*100).toFixed(0)+'%':'0%'}</div>
                <div class="going-sub">${d.wins}W from ${d.starts}</div>
              </div>`).join('')}
          </div>
        </div>
        <div class="table-wrap" style="margin-bottom:0">
          <div class="table-header"><span class="table-title">Recent runs</span><span class="table-count">${rows.length} total</span></div>
          ${rows.slice(0,20).map(r=>{
            const posClass = r.finish_position===1?'pos-1':r.finish_position===2?'pos-2':r.finish_position===3?'pos-3':'pos-other';
            const bg = r.finish_position===1?'rgba(232,168,48,.2)':r.finish_position<=3?'rgba(126,201,74,.12)':'var(--bg4)';
            return `<div class="recent-run" onclick="filterByHorse('${(r.horse||'').replace(/'/g,"\\'")}')">
              <div class="rr-pos" style="background:${bg}">
                <span class="pos-badge ${posClass}">${r.finish_position}</span>
              </div>
              <div class="rr-main">
                <div class="rr-race">${r.race_name||'--'} / ${r.track||'--'}</div>
                <div class="rr-meta">${r.date||'--'} / ${r.distance_m?r.distance_m+'m':'--'}
                  ${r.going?`/ <span class="going-badge ${goingClass(r.going)}">${normaliseGoing(r.going)}</span>`:''}
                </div>
              </div>
              <div class="rr-right">
                <div class="rr-odds">${r.odds_sp?'$'+r.odds_sp:'--'}</div>
                <div class="rr-margin">${r.finish_position===1?'Winner':(r.margin_trad||'--')}</div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="table-wrap news-section" style="margin-bottom:0">
        <div class="table-header">
          <span class="table-title">News & Articles</span>
        </div>
        <div style="padding:1rem 1.25rem;display:flex;flex-direction:column;gap:10px">
          <a href="https://news.google.com/search?q=${encodeURIComponent(name+' NZ racing horse')}"
            target="_blank" rel="noopener"
            style="display:flex;align-items:center;gap:10px;padding:12px 16px;
              background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);
              color:var(--text);text-decoration:none;transition:border-color .15s;font-size:13px"
            onmouseover="this.style.borderColor='var(--green2)'"
            onmouseout="this.style.borderColor='var(--border2)'">
            <span style="font-size:18px">&#x1F4F0;</span>
            <div>
              <div style="font-weight:500">Search Google News for "${name}"</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">Opens latest news articles in a new tab</div>
            </div>
            <span style="margin-left:auto;color:var(--green);font-size:16px">-></span>
          </a>
          <a href="https://www.loveracing.nz/RaceInfoSearch.aspx?q=${encodeURIComponent(name)}&s=Current&g=All&r=undefined&t=Name"
            target="_blank" rel="noopener"
            style="display:flex;align-items:center;gap:10px;padding:12px 16px;
              background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);
              color:var(--text);text-decoration:none;transition:border-color .15s;font-size:13px"
            onmouseover="this.style.borderColor='var(--green2)'"
            onmouseout="this.style.borderColor='var(--border2)'">
            <span style="font-size:18px">&#x1F3C7;</span>
            <div>
              <div style="font-weight:500">View "${name}" on LoveRacing.NZ</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">Full form, videos and race history</div>
            </div>
            <span style="margin-left:auto;color:var(--green);font-size:16px">-></span>
          </a>
        </div>
      </div>
    </div>
    </div>\`;
}

// ===================== RESULTS =====================
function applyFilters() {
  const horse   = document.getElementById('f-horse').value.toLowerCase();
  const jockey  = document.getElementById('f-jockey').value.toLowerCase();
  const trainer = document.getElementById('f-trainer').value.toLowerCase();
  const track   = document.getElementById('f-track').value;
  const going   = document.getElementById('f-going').value;
  const pos     = document.getElementById('f-position').value;
  const df      = document.getElementById('f-date-from').value;
  const dt      = document.getElementById('f-date-to').value;
  const cls     = document.getElementById('f-class')?.value;

  filteredResults = allResults.filter(r => {
    if (cls && String(r.class_tier) !== cls) return false;
    if (horse   && !(r.horse||'').toLowerCase().includes(horse))   return false;
    if (jockey  && !(r.jockey||'').toLowerCase().includes(jockey)) return false;
    if (trainer && !(r.trainer||'').toLowerCase().includes(trainer)) return false;
    if (track   && r.track !== track) return false;
    if (going   && normaliseGoing(r.going) !== going) return false;
    if (pos==='1'   && r.finish_position!==1)  return false;
    if (pos==='1-3' && r.finish_position>3)    return false;
    if (pos==='1-5' && r.finish_position>5)    return false;
    if (df && r.date < df) return false;
    if (dt && r.date > dt) return false;
    return true;
  });
  currentPage = 1;
  renderStats();
  renderResultsTable();
}

function clearFilters() {
  ['f-horse','f-jockey','f-trainer','f-date-from','f-date-to'].forEach(id=>document.getElementById(id).value='');
  ['f-track','f-going','f-position'].forEach(id=>document.getElementById(id).value='');
  acCloseAll();
  applyFilters();
}

function renderStats() {
  const data = filteredResults.length ? filteredResults : allResults;
  const wins   = data.filter(r=>r.finish_position===1).length;
  const places = data.filter(r=>r.finish_position<=3).length;
  const winPct = data.length ? (wins/data.length*100).toFixed(1) : 0;
  const tracks = new Set(data.map(r=>r.track)).size;
  const horses = new Set(data.map(r=>r.horse)).size;
  const prize  = data.reduce((s,r)=>s+(r.prize_money||0),0);

  document.getElementById('results-stats').innerHTML = [
    ['Results', data.length.toLocaleString(), ''],
    ['Wins', wins.toLocaleString(), 'amber'],
    ['Win rate', winPct+'%', 'green'],
    ['Top 3', places.toLocaleString(), ''],
    ['Horses', horses.toLocaleString(), ''],
    ['Tracks', tracks, ''],
    ['Total prize', '$'+(prize/1000).toFixed(0)+'k', ''],
  ].map(function(s){ return '<div class="stat-card"><div class="stat-label">'+s[0]+'</div><div class="stat-value '+(s[2]||'')+'" >'+s[1]+'</div></div>'; }).join('');
}

function sortTable(key) {
  if (sortKey===key) sortDir*=-1; else { sortKey=key; sortDir=1; }
  renderResultsTable();
}

function renderResultsTable() {
  const isFiltered = filteredResults.length || ['f-horse','f-jockey','f-trainer'].some(id=>document.getElementById(id)?.value);
  const data = isFiltered ? filteredResults : allResults;
  const sorted = [...data].sort((a,b)=>{
    let av=a[sortKey]??'', bv=b[sortKey]??'';
    if (typeof av==='number') return sortDir*(av-bv);
    return sortDir*String(av).localeCompare(String(bv));
  });
  const total = sorted.length;
  const slice = sorted.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);
  document.getElementById('results-count').textContent = `${total.toLocaleString()} results`;
  document.getElementById('results-body').innerHTML = slice.map(r=>{
    const p = r.finish_position;
    const pc = p===1?'pos-1':p===2?'pos-2':p===3?'pos-3':'pos-other';
    return `<tr>
      <td><span class="pos-badge ${pc}">${p}</span></td>
      <td><span class="horse-link" onclick="openProfile('${(r.horse||'').replace(/'/g,"\\'")}','horse')">${r.horse||'--'}</span></td>
      <td><span class="horse-link" onclick="openProfile('${(r.jockey||'').replace(/'/g,"\\'")}','jockey')">${r.jockey||'--'}</span></td>
      <td class="r-hide" style="color:var(--text2);font-size:12px">${r.trainer||'--'}</td>
      <td style="color:var(--text2)">${r.track||'--'}</td>
      <td class="time-val">${r.date||'--'}</td>
      <td class="r-hide" style="color:var(--text2);font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis">${r.race_name||'--'}</td>
      <td class="r-hide">${getClassBadge(r.race_name,r.race_class,r.prize_money)}</td>
      <td class="time-val r-hide">${r.distance_m?r.distance_m+'m':'--'}</td>
      <td class="time-val r-hide">${r.barrier||'--'}</td>
      <td class="odds">${r.odds_sp?'$'+r.odds_sp:'--'}</td>
      <td class="time-val r-hide">${r.finish_time||'--'}</td>
      <td class="r-hide" style="color:var(--text3);font-size:12px">${p===1?'Winner':(r.margin_trad||'--')}</td>
    </tr>`;
  }).join('');
  renderPagination(Math.ceil(total/PAGE_SIZE));
}

function renderPagination(pages) {
  const c = document.getElementById('results-pagination');
  if (pages<=1){c.innerHTML='';return;}
  let h = `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>&#8592;</button>`;
  const start=Math.max(1,currentPage-3), end=Math.min(pages,currentPage+3);
  if(start>1) h+=`<button class="page-btn" onclick="goPage(1)">1</button><span class="page-info">...</span>`;
  for(let i=start;i<=end;i++) h+=`<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
  if(end<pages) h+=`<span class="page-info">...</span><button class="page-btn" onclick="goPage(${pages})">${pages}</button>`;
  h+=`<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===pages?'disabled':''}>&#8594;</button>`;
  c.innerHTML=h;
}

function goPage(p){
  const data=filteredResults.length?filteredResults:allResults;
  const pages=Math.ceil(data.length/PAGE_SIZE);
  if(p<1||p>pages)return;
  currentPage=p; renderResultsTable();
  window.scrollTo({top:0,behavior:'smooth'});
}

function filterByHorse(name){showPage('results');document.getElementById('f-horse').value=name;applyFilters();}

// ===================== TRENDS =====================
function loadTrends() {
  const search    = document.getElementById('t-search').value.toLowerCase();
  const type      = document.getElementById('t-type').value;
  const metric    = document.getElementById('t-metric').value;
  const track     = document.getElementById('t-track').value;
  const minStarts = parseInt(document.getElementById('t-min-starts').value)||2;

  let data = allResults;
  if (track) data = data.filter(r=>r.track===track);

  const grouped = {};
  data.forEach(r=>{
    const key = r[type]||'Unknown';
    if (search && !key.toLowerCase().includes(search)) return;
    if (!grouped[key]) grouped[key]=[];
    grouped[key].push(r);
  });

  const lb = Object.entries(grouped).map(([name,rows])=>{
    const starts=rows.length, wins=rows.filter(r=>r.finish_position===1).length;
    const places=rows.filter(r=>r.finish_position<=3).length;
    const avgPos=(rows.reduce((s,r)=>s+r.finish_position,0)/starts).toFixed(1);
    const winPct=(wins/starts*100).toFixed(1), placePct=(places/starts*100).toFixed(1);
    const tw={};
    rows.filter(r=>r.finish_position===1).forEach(r=>{ tw[r.track]=(tw[r.track]||0)+1; });
    const bestTrack=Object.entries(tw).sort((a,b)=>b[1]-a[1])[0]?.[0]||'--';
    return {name,starts,wins,places,winPct,placePct,avgPos,bestTrack,rows};
  }).filter(x=>x.starts>=minStarts);

  const sorted = lb.sort((a,b)=>{
    if(metric==='wins')      return b.wins-a.wins;
    if(metric==='win_pct')   return parseFloat(b.winPct)-parseFloat(a.winPct);
    if(metric==='place_pct') return parseFloat(b.placePct)-parseFloat(a.placePct);
    return parseFloat(a.avgPos)-parseFloat(b.avgPos);
  }).slice(0,50);

  document.getElementById('trends-count').textContent=`${sorted.length} ${type}s`;
  document.getElementById('trends-stats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Total ${type}s</div><div class="stat-value">${Object.keys(grouped).length}</div></div>
    <div class="stat-card"><div class="stat-label">Best win rate</div><div class="stat-value green">${sorted[0]?.winPct||0}%</div><div class="stat-sub">${sorted[0]?.name||'--'}</div></div>
    <div class="stat-card"><div class="stat-label">Most wins</div><div class="stat-value amber">${[...sorted].sort((a,b)=>b.wins-a.wins)[0]?.wins||0}</div><div class="stat-sub">${[...sorted].sort((a,b)=>b.wins-a.wins)[0]?.name||'--'}</div></div>
    <div class="stat-card"><div class="stat-label">Total races</div><div class="stat-value">${data.length.toLocaleString()}</div></div>`;

  document.getElementById('trends-body').innerHTML=sorted.map((s,i)=>`
    <tr>
      <td class="time-val" style="color:var(--text3)">${i+1}</td>
      <td><span class="horse-link" onclick="openProfile('${s.name.replace(/'/g,"\\'")}','${type}')">${s.name}</span></td>
      <td class="time-val">${s.starts}</td>
      <td class="time-val" style="color:var(--amber)">${s.wins}</td>
      <td class="time-val r-hide">${s.places}</td>
      <td class="time-val" style="color:var(--green)">${s.winPct}%</td>
      <td class="time-val r-hide">${s.placePct}%</td>
      <td class="time-val r-hide">${s.avgPos}</td>
      <td class="time-val r-hide" style="color:var(--text2)">${s.bestTrack}</td>
      <td><button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;min-height:28px" onclick="openProfile('${s.name.replace(/'/g,"\\'")}','${type}')">Profile</button></td>
    </tr>`).join('');

  if (sorted[0]) renderCharts(sorted[0], type, data, sorted);
}

function renderCharts(target, type, allData, leaderboard) {
  const rows = target.rows;
  const monthWins={};
  rows.forEach(r=>{
    const m=r.date?.slice(0,7); if(!m)return;
    if(!monthWins[m]){monthWins[m]={wins:0,starts:0};}
    monthWins[m].starts++; if(r.finish_position===1)monthWins[m].wins++;
  });
  const months=Object.keys(monthWins).sort();
  makeChart('chart-timeline','bar',{
    labels:months,
    datasets:[
      {label:'Wins',data:months.map(m=>monthWins[m].wins),backgroundColor:'#7ec94a'},
      {label:'Starts',data:months.map(m=>monthWins[m].starts),backgroundColor:'rgba(255,255,255,0.08)'},
    ]
  });
  const tw={};
  rows.filter(r=>r.finish_position===1).forEach(r=>{ tw[r.track]=(tw[r.track]||0)+1; });
  const twArr=Object.entries(tw).sort((a,b)=>b[1]-a[1]).slice(0,8);
  makeChart('chart-track','bar',{
    labels:twArr.map(x=>x[0]),
    datasets:[{label:'Wins',data:twArr.map(x=>x[1]),backgroundColor:'#e8a830'}]
  },{indexAxis:'y'});
  const pos=Array(10).fill(0);
  rows.forEach(r=>{ pos[Math.min(r.finish_position,10)-1]++; });
  makeChart('chart-positions','bar',{
    labels:['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10+'],
    datasets:[{label:'Count',data:pos,backgroundColor:['#e8a830','#7ec94a','#4a9ed4','rgba(255,255,255,0.1)','rgba(255,255,255,0.08)','rgba(255,255,255,0.07)','rgba(255,255,255,0.06)','rgba(255,255,255,0.05)','rgba(255,255,255,0.04)','rgba(255,255,255,0.03)']}]
  });
  const dw={};
  rows.forEach(r=>{ if(!r.distance_m)return; if(!dw[r.distance_m]){dw[r.distance_m]={wins:0,starts:0};} dw[r.distance_m].starts++; if(r.finish_position===1)dw[r.distance_m].wins++; });
  const dists=Object.keys(dw).map(Number).sort((a,b)=>a-b);
  makeChart('chart-distance','line',{
    labels:dists.map(d=>d+'m'),
    datasets:[{label:'Win %',data:dists.map(d=>dw[d].starts>0?(dw[d].wins/dw[d].starts*100).toFixed(1):0),borderColor:'#7ec94a',backgroundColor:'rgba(126,201,74,0.08)',tension:0.3,fill:true,pointBackgroundColor:'#7ec94a'}]
  });
}

function makeChart(id, type, data, extraOpts={}) {
  if(charts[id]) charts[id].destroy();
  const ctx=document.getElementById(id)?.getContext('2d'); if(!ctx)return;
  charts[id]=new Chart(ctx,{type,data,options:{
    responsive:true,
    plugins:{legend:{display:data.datasets.length>1,labels:{color:'#948f83',font:{size:11}}}},
    scales:{
      x:{ticks:{color:'#524f48',font:{size:10}},grid:{color:'rgba(255,255,255,0.03)'}},
      y:{ticks:{color:'#524f48',font:{size:10}},grid:{color:'rgba(255,255,255,0.03)'}},
      ...(extraOpts.scales||{})
    },...extraOpts
  }});
}

// ===================== H2H =====================
function loadH2H() {
  const nameA=document.getElementById('h-a').value.trim();
  const nameB=document.getElementById('h-b').value.trim();
  const type=document.getElementById('h-type').value;
  if(!nameA||!nameB){
    document.getElementById('h2h-content').innerHTML=`<div class="empty-state"><div class="empty-icon">&#x26A1;</div><div class="empty-text">Enter two names above</div></div>`;
    return;
  }
  const rowsA=allResults.filter(r=>(r[type]||'').toLowerCase().includes(nameA.toLowerCase()));
  const rowsB=allResults.filter(r=>(r[type]||'').toLowerCase().includes(nameB.toLowerCase()));
  if(!rowsA.length||!rowsB.length){
    document.getElementById('h2h-content').innerHTML=`<div class="empty-state"><div class="empty-icon">&#x26A1;</div><div class="empty-text">Could not find one or both names</div></div>`;
    return;
  }
  const sharedA=rowsA.filter(r=>rowsB.some(rb=>rb.track===r.track&&rb.date===r.date&&rb.race_name===r.race_name));
  const sharedB=rowsB.filter(r=>sharedA.some(ra=>ra.track===r.track&&ra.date===r.date&&ra.race_name===r.race_name));
  const statsA=calcStats(rowsA), statsB=calcStats(rowsB);
  let aWins=0,bWins=0;
  sharedA.forEach(ra=>{
    const rb=sharedB.find(r=>r.track===ra.track&&r.date===ra.date&&r.race_name===ra.race_name);
    if(rb){ if(ra.finish_position<rb.finish_position)aWins++; else if(rb.finish_position<ra.finish_position)bWins++; }
  });
  const dispA=rowsA[0]?.[type]||nameA, dispB=rowsB[0]?.[type]||nameB;
  const scoreA=getH2HScore(rowsA,'',''), scoreB=getH2HScore(rowsB,'','');
  const ranked=[{horse:dispA,aiScore:scoreA,winPct:statsA.winPct},{horse:dispB,aiScore:scoreB,winPct:statsB.winPct}].sort((a,b)=>b.aiScore-a.aiScore);

  document.getElementById('h2h-content').innerHTML=`
    ${aiVerdictHTML(ranked,'head to head')}
    <div class="table-wrap" style="margin-bottom:1.25rem">
      <div class="vs-banner">
        <div class="vs-text">${dispA.split(' ')[0]} vs ${dispB.split(' ')[0]}</div>
        <div class="vs-record">Direct matchups: <span>${aWins}</span> -- ${sharedA.length-aWins-bWins} -- <span>${bWins}</span> (${sharedA.length} shared races)</div>
      </div>
      <div class="h2h-grid" style="padding:1.25rem">
        <div class="h2h-horse-card">
          <div class="h2h-name" style="color:var(--green)">${dispA}</div>${renderH2HStats(statsA)}
        </div>
        <div class="h2h-horse-card">
          <div class="h2h-name" style="color:var(--amber)">${dispB}</div>${renderH2HStats(statsB)}
        </div>
      </div>
    </div>
    ${sharedA.length?`
    <div class="h2h-shared">
      <div class="table-header"><span class="table-title">Shared races</span><span class="table-count">${sharedA.length} races</span></div>
      <div class="tbl-scroll"><table><thead><tr>
        <th>Date</th><th>Track</th><th class="r-hide">Race</th><th class="r-hide">Dist</th>
        <th style="color:var(--green)">${dispA.split(' ')[0]}</th>
        <th style="color:var(--amber)">${dispB.split(' ')[0]}</th><th>Winner</th>
      </tr></thead><tbody>${sharedA.map(ra=>{
        const rb=sharedB.find(r=>r.track===ra.track&&r.date===ra.date&&r.race_name===ra.race_name);
        const winner=ra.finish_position<(rb?.finish_position||99)?dispA:dispB;
        const wc=winner===dispA?'var(--green)':'var(--amber)';
        return `<tr>
          <td class="time-val">${ra.date}</td><td>${ra.track}</td>
          <td class="r-hide" style="font-size:12px;color:var(--text2)">${ra.race_name}</td>
          <td class="time-val r-hide">${ra.distance_m}m</td>
          <td class="time-val" style="color:var(--green)">${ra.finish_position}${ord(ra.finish_position)}</td>
          <td class="time-val" style="color:var(--amber)">${rb?.finish_position||'--'}${rb?ord(rb.finish_position):''}</td>
          <td style="color:${wc};font-weight:500">${winner.split(' ')[0]}</td>
        </tr>`;
      }).join('')}</tbody></table></div>
    </div>`:`<div class="empty-state" style="padding:2rem"><div class="empty-text">No shared races found</div></div>`}`;
}

function calcStats(rows) {
  const wins=rows.filter(r=>r.finish_position===1).length;
  const places=rows.filter(r=>r.finish_position<=3).length;
  const avgPos=(rows.reduce((s,r)=>s+r.finish_position,0)/rows.length).toFixed(1);
  const bestOdds=Math.min(...rows.filter(r=>r.finish_position===1&&r.odds_sp).map(r=>parseFloat(r.odds_sp)));
  const tw={};
  rows.filter(r=>r.finish_position===1).forEach(r=>{tw[r.track]=(tw[r.track]||0)+1;});
  return {starts:rows.length,wins,places,avgPos,
    winPct:(wins/rows.length*100).toFixed(1),
    placePct:(places/rows.length*100).toFixed(1),
    bestOdds:isFinite(bestOdds)?'$'+bestOdds:'--',
    bestTrack:Object.entries(tw).sort((a,b)=>b[1]-a[1])[0]?.[0]||'--'};
}

function renderH2HStats(s) {
  return `
    <div class="h2h-stat-row"><span class="h2h-stat-label">Starts</span><span class="h2h-stat-val">${s.starts}</span></div>
    <div class="h2h-stat-row"><span class="h2h-stat-label">Wins</span><span class="h2h-stat-val h2h-win">${s.wins} (${s.winPct}%)</span></div>
    <div class="h2h-stat-row"><span class="h2h-stat-label">Places (top 3)</span><span class="h2h-stat-val">${s.places} (${s.placePct}%)</span></div>
    <div class="h2h-stat-row"><span class="h2h-stat-label">Avg finish pos</span><span class="h2h-stat-val">${s.avgPos}</span></div>
    <div class="h2h-stat-row"><span class="h2h-stat-label">Best winning odds</span><span class="h2h-stat-val">${s.bestOdds}</span></div>
    <div class="h2h-stat-row"><span class="h2h-stat-label">Best track</span><span class="h2h-stat-val">${s.bestTrack}</span></div>`;
}

// ===================== AI SCORING =====================
function scoreRunner(runner, track, distance, going) {
  let score = 0;
  // Win rate (30pts)
  score += Math.min(runner.winPct/100*30, 30);
  // Recent form -- last 5 (20pts)
  const recent = allResults.filter(r=>r.horse===runner.horse)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);
  if (recent.length) {
    const avg = recent.reduce((s,r)=>s+r.finish_position,0)/recent.length;
    score += Math.max(0, 20-((avg-1)/9)*20);
  }
  // Race class quality bonus (up to 10pts) -- wins in better races score higher
  const classWins = allResults.filter(r=>r.horse===runner.horse && r.finish_position===1);
  if (classWins.length) {
    const bestTier = Math.min(...classWins.map(r=>r.class_tier||7));
    score += CLASS_WIN_BONUS[bestTier] || 0;
  }
  // Track suitability (15pts)
  if (track) {
    const ts=runner.trackStats?.[track]||{starts:0,wins:0};
    score += ts.starts>=2?(ts.wins/ts.starts)*15:ts.starts===1?ts.wins*7:0;
  }
  // Distance suitability (10pts)
  if (distance) {
    const ds=runner.distStats?.[distance]||{starts:0,wins:0};
    score += ds.starts>=2?(ds.wins/ds.starts)*10:ds.starts===1?ds.wins*5:0;
  }
  // Going suitability (10pts)
  if (going) {
    const gs=runner.goingStats?.[going]||{starts:0,wins:0};
    score += gs.starts>=2?(gs.wins/gs.starts)*10:gs.starts===1?gs.wins*5:0;
  }
  // Barrier (5pts)
  const b=runner.barrier||8;
  score += b<=3?5:b<=6?3.5:b<=10?2:0.5;
  // Days since last run -- penalise 60+ days (0 to -3pts)
  const lastRow = allResults.filter(r=>r.horse===runner.horse).sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
  if (lastRow?.date) {
    const days = Math.floor((Date.now()-new Date(lastRow.date))/(1000*60*60*24));
    if (days>60) score -= Math.min(3, (days-60)/30);
  }
  return Math.round(Math.max(0,score)*10)/10;
}

function getH2HScore(rows, track, distance) {
  const wins=rows.filter(r=>r.finish_position===1).length;
  const winPct=rows.length?wins/rows.length*100:0;
  const trackStats={}, distStats={}, goingStats={};
  rows.forEach(r=>{
    if(r.track){if(!trackStats[r.track])trackStats[r.track]={starts:0,wins:0};trackStats[r.track].starts++;if(r.finish_position===1)trackStats[r.track].wins++;}
    if(r.distance_m){const k=String(r.distance_m);if(!distStats[k])distStats[k]={starts:0,wins:0};distStats[k].starts++;if(r.finish_position===1)distStats[k].wins++;}
    const g=normaliseGoing(r.going);
    if(g){if(!goingStats[g])goingStats[g]={starts:0,wins:0};goingStats[g].starts++;if(r.finish_position===1)goingStats[g].wins++;}
  });
  return scoreRunner({horse:rows[0]?.horse||'',barrier:5,winPct,trackStats,distStats,goingStats},track,distance,'');
}

function getRankedField(track,distance,going) {
  return fieldRunners.map(r=>({...r,aiScore:scoreRunner(r,track,distance,going)})).sort((a,b)=>b.aiScore-a.aiScore);
}

function aiVerdictHTML(ranked, context) {
  if(!ranked.length)return'';
  const top=ranked[0];
  const maxScore=Math.max(...ranked.map(r=>r.aiScore),1);
  const ordinals=['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','13th','14th','15th','16th'];
  return `<div class="ai-verdict">
    <div class="ai-verdict-header">
      <div><div class="ai-verdict-label">AI likely winner</div>
        <div class="ai-verdict-pick">${top.horse||top.name}</div></div>
      <div class="ai-verdict-context">${context}</div>
    </div>
    ${ranked.map((r,i)=>`
      <div class="ai-row" style="${i===0?'background:rgba(126,201,74,0.04)':''}">
        <div class="ai-rank" style="color:${i===0?'var(--green)':i===1?'var(--amber)':i===2?'var(--text2)':'var(--text3)'}">${ordinals[i]}</div>
        <div class="ai-horse">
          <div class="ai-horse-name" style="color:${i===0?'var(--green)':i===1?'var(--amber)':'var(--text)'}">${r.horse||r.name}</div>
          <div class="ai-horse-meta">score: ${r.aiScore} / win rate: ${typeof r.winPct==='number'?r.winPct.toFixed(1):r.winPct}%</div>
        </div>
        <div class="ai-score-bar"><div class="ai-score-fill" style="width:${(r.aiScore/maxScore*100).toFixed(0)}%;background:${i===0?'var(--green)':i===1?'var(--amber)':'var(--text3)'}"></div></div>
        ${i===0?'<span class="ai-top-badge">TOP PICK</span>':''}
      </div>`).join('')}
    <div class="ai-footer">Scoring: win rate (30%) / recent form/last 5 (20%) / race class quality (10%) / track (15%) / distance (10%) / going (10%) / barrier (5%) / days since last run</div>
  </div>`;
}

// ===================== FIELD BUILDER =====================
function searchHorsesForField() {
  const q=document.getElementById('field-search').value.toLowerCase().trim();
  const c=document.getElementById('field-suggestions');
  if(!q){c.innerHTML=`<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:13px">Type to search horses</div>`;return;}
  const matches=[...new Set(allResults.map(r=>r.horse).filter(Boolean))].filter(h=>h.toLowerCase().includes(q)).slice(0,20);
  if(!matches.length){c.innerHTML='<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:13px">No horses found</div>';return;}
  c.innerHTML=matches.map(function(horse){
    const rows=allResults.filter(r=>r.horse===horse);
    const wins=rows.filter(r=>r.finish_position===1).length;
    const already=fieldRunners.some(r=>r.horse===horse);
    const full=fieldRunners.length>=MAX_RUNNERS;
    const safeName=horse.replace(/'/g,"\\'");
    const clickFn=(!already&&!full)?"addToField('"+safeName+"')":'';
    const winPct=rows.length?(wins/rows.length*100).toFixed(0):0;
    return '<div class="horse-suggestion-item">'
      +'<div><div class="suggestion-name">'+horse+'</div>'
      +'<div class="suggestion-meta">'+rows.length+' starts &middot; '+wins+'W &middot; '+winPct+'%</div></div>'
      +'<button class="add-btn '+(already?'added':'')+' " onclick="'+clickFn+'" title="'+(already?'Already added':full?'Field full':'Add')+'">'
      +(already?'&#10003;':'+')
      +'</button></div>';
  }).join('');
}

function addToField(horseName) {
  if(fieldRunners.length>=MAX_RUNNERS||fieldRunners.some(r=>r.horse===horseName))return;
  const rows=allResults.filter(r=>r.horse===horseName);
  rows.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const wins=rows.filter(r=>r.finish_position===1).length;
  const places=rows.filter(r=>r.finish_position<=3).length;
  const avgPos=rows.length?(rows.reduce((s,r)=>s+r.finish_position,0)/rows.length).toFixed(1):'--';
  const winPct=rows.length?(wins/rows.length*100):0;
  const placePct=rows.length?(places/rows.length*100):0;
  const trackStats={}, distStats={}, goingStats={};
  rows.forEach(r=>{
    if(r.track){if(!trackStats[r.track])trackStats[r.track]={starts:0,wins:0};trackStats[r.track].starts++;if(r.finish_position===1)trackStats[r.track].wins++;}
    if(r.distance_m){const k=String(r.distance_m);if(!distStats[k])distStats[k]={starts:0,wins:0};distStats[k].starts++;if(r.finish_position===1)distStats[k].wins++;}
    const g=normaliseGoing(r.going);
    if(g){if(!goingStats[g])goingStats[g]={starts:0,wins:0};goingStats[g].starts++;if(r.finish_position===1)goingStats[g].wins++;}
  });
  // Form line last 5
  const form=rows.slice(0,5).map(r=>r.finish_position).join('-');
  fieldRunners.push({horse:horseName,barrier:fieldRunners.length+1,trainer:rows[0]?.trainer||'--',
    starts:rows.length,wins,places,winPct,placePct,avgPos:parseFloat(avgPos)||0,
    trackStats,distStats,goingStats,form,color:RUNNER_COLORS[fieldRunners.length%RUNNER_COLORS.length]});
  renderFieldRunners();renderFieldComparison();searchHorsesForField();
}

function removeFromField(horse) {
  fieldRunners=fieldRunners.filter(r=>r.horse!==horse);
  fieldRunners.forEach((r,i)=>r.barrier=i+1);
  renderFieldRunners();renderFieldComparison();searchHorsesForField();
}

function clearField(){fieldRunners=[];renderFieldRunners();renderFieldComparison();searchHorsesForField();}
function updateFieldMeta(){const n=document.getElementById('field-race-name').value||'RACE FIELD';document.getElementById('field-race-name-display').textContent=n.toUpperCase();}

function renderFieldRunners() {
  document.getElementById('field-sidebar-count').textContent=`${fieldRunners.length} / ${MAX_RUNNERS}`;
  const body=document.getElementById('field-runners-body');
  if(!fieldRunners.length){body.innerHTML=`<div class="field-empty">No runners added -- search horses on the left</div>`;return;}
  body.innerHTML=fieldRunners.map((r,i)=>`
    <div class="runner-row">
      <div class="runner-num" style="color:${r.color}">${String(i+1).padStart(2,'0')}</div>
      <div class="barrier-pill">${r.barrier}</div>
      <div><div class="runner-name">${r.horse}</div>
        <div class="runner-sub">${r.form?'Form: '+r.form:r.trainer}</div></div>
      <div class="runner-stat r-hide">${r.starts}</div>
      <div class="runner-stat r-hide" style="color:var(--amber)">${r.wins}</div>
      <div class="runner-stat r-hide" style="color:${r.winPct>=20?'var(--green)':r.winPct>=10?'var(--amber)':'var(--text2)'}">${r.winPct.toFixed(1)}%</div>
      <div class="runner-stat r-hide">${r.avgPos||'--'}</div>
      <div class="runner-stat r-hide">
        <div class="form-line" style="justify-content:flex-end">
          ${(r.form||'').split('-').map(p=>{const n=parseInt(p);const cls=n===1?'fd-1':n===2?'fd-2':n===3?'fd-3':'fd-o';return `<div class="form-dot ${cls}" style="width:18px;height:18px;font-size:10px">${p}</div>`;}).join('')}
        </div>
      </div>
      <button class="remove-btn" onclick="removeFromField('${r.horse.replace(/'/g,"\\'")}')">&times;</button>
    </div>`).join('');
}

function renderFieldComparison() {
  const wrap=document.getElementById('field-comparison-wrap');
  if(fieldRunners.length<2){wrap.style.display='none';return;}
  wrap.style.display='block';
  const distance=document.getElementById('field-distance').value;
  const track=document.getElementById('field-track').value;
  const going=document.getElementById('field-going').value;
  const ranked=getRankedField(track,distance,going);
  const ctx=[];
  if(track)ctx.push(track); if(distance)ctx.push(distance+'m'); if(going)ctx.push(going);
  document.getElementById('field-ai-verdict').innerHTML=aiVerdictHTML(ranked,ctx.join(' / ')||'all conditions');

  const maxWin=Math.max(...fieldRunners.map(r=>r.winPct),1);
  document.getElementById('field-winrate-bars').innerHTML=fieldRunners.slice().sort((a,b)=>b.winPct-a.winPct).map(r=>ratingBar(r.horse,r.winPct,maxWin,r.color,`${r.winPct.toFixed(1)}%`)).join('');
  const maxPlace=Math.max(...fieldRunners.map(r=>r.placePct),1);
  document.getElementById('field-placerate-bars').innerHTML=fieldRunners.slice().sort((a,b)=>b.placePct-a.placePct).map(r=>ratingBar(r.horse,r.placePct,maxPlace,r.color,`${r.placePct.toFixed(1)}%`)).join('');
  const maxAvg=Math.max(...fieldRunners.map(r=>r.avgPos),1);
  document.getElementById('field-avgpos-bars').innerHTML=fieldRunners.slice().sort((a,b)=>a.avgPos-b.avgPos).map(r=>ratingBar(r.horse,maxAvg-r.avgPos+1,maxAvg,r.color,`${r.avgPos}`)).join('');

  document.getElementById('field-dist-label').textContent=distance?`${distance}m`:'select a distance';
  if(distance){
    const dd=fieldRunners.map(r=>{const ds=r.distStats?.[distance]||{starts:0,wins:0};return{...r,dw:ds.starts?(ds.wins/ds.starts*100).toFixed(1):0,ds:ds.starts};});
    const mx=Math.max(...dd.map(r=>parseFloat(r.dw)),1);
    document.getElementById('field-distance-bars').innerHTML=dd.slice().sort((a,b)=>b.dw-a.dw).map(r=>ratingBar(r.horse,parseFloat(r.dw),mx,r.color,r.ds?`${r.dw}% (${r.ds})`:'no data')).join('');
  } else document.getElementById('field-distance-bars').innerHTML=`<div style="padding:1rem 1.25rem;color:var(--text3);font-size:13px">Select a distance above</div>`;

  document.getElementById('field-track-label').textContent=track||'select a track';
  if(track){
    const td=fieldRunners.map(r=>{const ts=r.trackStats?.[track]||{starts:0,wins:0};return{...r,tw:ts.starts?(ts.wins/ts.starts*100).toFixed(1):0,ts:ts.starts};});
    const mx=Math.max(...td.map(r=>parseFloat(r.tw)),1);
    document.getElementById('field-track-bars').innerHTML=td.slice().sort((a,b)=>b.tw-a.tw).map(r=>ratingBar(r.horse,parseFloat(r.tw),mx,r.color,r.ts?`${r.tw}% (${r.ts})`:'no data')).join('');
  } else document.getElementById('field-track-bars').innerHTML=`<div style="padding:1rem 1.25rem;color:var(--text3);font-size:13px">Select a track above</div>`;

  document.getElementById('field-going-label').textContent=going||'select going';
  if(going){
    const gd=fieldRunners.map(r=>{const gs=r.goingStats?.[going]||{starts:0,wins:0};return{...r,gw:gs.starts?(gs.wins/gs.starts*100).toFixed(1):0,gs:gs.starts};});
    const mx=Math.max(...gd.map(r=>parseFloat(r.gw)),1);
    document.getElementById('field-going-bars').innerHTML=gd.slice().sort((a,b)=>b.gw-a.gw).map(r=>ratingBar(r.horse,parseFloat(r.gw),mx,r.color,r.gs?`${r.gw}% (${r.gs})`:'no data')).join('');
  } else document.getElementById('field-going-bars').innerHTML=`<div style="padding:1rem 1.25rem;color:var(--text3);font-size:13px">Select going above</div>`;
}

function ratingBar(name,val,max,color,label){
  const pct=max>0?Math.min(val/max*100,100):0;
  return `<div class="rating-bar">
    <div class="rating-name" title="${name}">${name}</div>
    <div class="rating-track"><div class="rating-fill" style="width:${pct.toFixed(0)}%;background:${color};color:#0b0c0b">${pct>18?label:''}</div></div>
    <div class="rating-val">${pct<=18?label:''}</div>
  </div>`;
}

// ===================== UTILS =====================
function ord(n){const s=['th','st','nd','rd'],v=n%100;return s[(v-20)%10]||s[v]||s[0];}

function renderClassLB(tier) {
  // Highlight active button
  document.querySelectorAll('#class-lb-body').forEach(()=>{});
  const label = CLASS_LABELS[tier] || tier;
  document.getElementById('class-lb-meta').textContent = `${label} races -- top horses by wins`;

  // Get all results at this tier
  const tierResults = allResults.filter(r => r.class_tier === tier);

  // Group by horse
  const horses = {};
  tierResults.forEach(r => {
    if (!r.horse) return;
    if (!horses[r.horse]) horses[r.horse] = { starts:0, wins:0, races:[] };
    horses[r.horse].starts++;
    if (r.finish_position === 1) {
      horses[r.horse].wins++;
      horses[r.horse].races.push(r.race_name);
    }
  });

  const sorted = Object.entries(horses)
    .filter(([,d]) => d.starts > 0)
    .sort((a,b) => b[1].wins - a[1].wins || b[1].starts - a[1].starts)
    .slice(0, 20);

  if (!sorted.length) {
    document.getElementById('class-lb-body').innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:2rem">No ' + label + ' race results in database yet</td></tr>';
    return;
  }

  document.getElementById('class-lb-body').innerHTML = sorted.map(([name, d], i) => {
    const winPct = (d.wins / d.starts * 100).toFixed(1);
    const bestRace = d.races[0] || '--';
    return `<tr>
      <td class="time-val" style="color:var(--text3)">${i+1}</td>
      <td><span class="horse-link" onclick="openProfile('${name.replace(/'/g,"\'")}','horse')">${name}</span></td>
      <td class="time-val" style="color:var(--amber)">${d.wins}</td>
      <td class="time-val">${d.starts}</td>
      <td class="time-val" style="color:var(--green)">${winPct}%</td>
      <td style="font-size:11px;color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${bestRace}</td>
      <td><button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;min-height:28px" onclick="openProfile('${name.replace(/'/g,"\'")}','horse')">Profile</button></td>
    </tr>`;
  }).join('');
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab,.bnav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  const pages=['results','trends','h2h','profile','field'];
  const idx=pages.indexOf(name);
  document.querySelectorAll('.nav-tab')[Math.min(idx,3)]?.classList.add('active');
  document.querySelectorAll('.bnav-tab')[idx]?.classList.add('active');
  if(name==='trends') { loadTrends(); renderClassLB(6); }
  window.scrollTo({top:0,behavior:'smooth'});
}

function generateMockData(){
  const horses=['Wine Rocs','Hell Island (AUS)','Dink','Armagh','Purosangue','Happy Traveller','Brutal Reality','Geneva Queen','Omega Boy','Silver Flash','Dark Matter','Coastal Dream','Thunder Ridge','Morning Star','Pacific Gem','Iron Will'];
  const jockeys=['Jack Taplin','Corentin Berge','Sam McNab','Elen Nicholas','Hayley Hassman','Rihaan Goyaram','Joe Nishizuka','Courtney Barnes'];
  const trainers=['Debbie Sweeney','Chris Wood','Ben & Ryan Foote','Danny Walker','Lance O\'Sullivan','Ralph Manning'];
  const tracks=['Te Aroha','Ellerslie','Trentham','Riccarton','Hastings','Awapuni'];
  const races=['Maiden 1150','BM65 1400','BM72 1600','Open 2000','Gr3 1400','Stakes 1200'];
  const goings=['Good','Soft','Heavy','Slow'];
  const data=[];const now=new Date();
  for(let i=0;i<800;i++){
    const daysAgo=Math.floor(Math.random()*90);
    const d=new Date(now);d.setDate(d.getDate()-daysAgo);
    const pos=Math.floor(Math.random()*12)+1;
    data.push({id:i,finish_position:pos,
      horse:horses[Math.floor(Math.random()*horses.length)],
      jockey:jockeys[Math.floor(Math.random()*jockeys.length)],
      trainer:trainers[Math.floor(Math.random()*trainers.length)],
      track:tracks[Math.floor(Math.random()*tracks.length)],
      date:d.toISOString().slice(0,10),
      race_name:races[Math.floor(Math.random()*races.length)],
      distance_m:[1150,1200,1400,1600,1800,2000][Math.floor(Math.random()*6)],
      barrier:Math.floor(Math.random()*14)+1,
      going:goings[Math.floor(Math.random()*goings.length)],
      odds_sp:pos===1?(Math.random()*8+1.5).toFixed(2):(Math.random()*20+2).toFixed(2),
      finish_time:pos<=10?`1.${String(Math.floor(Math.random()*20)+35).padStart(2,'0')}.${String(Math.floor(Math.random()*99)).padStart(2,'0')}`:'',
      margin_trad:pos===1?'':['1/2 LEN','1 LEN','2 LEN','NOSE','NECK','HEAD'][Math.floor(Math.random()*6)],
      prize_money:pos===1?14375:pos===2?4625:pos===3?2250:375});
  }
  return data;
}

// Hard fallback -- always remove loading screen after 5 seconds
setTimeout(() => {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('fade-out');
    setTimeout(() => { if(overlay.parentNode) overlay.remove(); }, 450);
  }
}, 5000);

init().catch(e => {
  console.error('Init failed:', e);
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.remove();
  document.getElementById('db-status').textContent = 'error - check console';
});
