// StableForm app.js - clean version, no template literals with class=

var allResults = [], filteredResults = [], currentPage = 1;
var PAGE_SIZE = 50, sortKey = 'date', sortDir = -1;
var charts = {}, fieldRunners = [];
var MAX_RUNNERS = 16;
var RUNNER_COLORS = ['#7ec94a','#e8a830','#d95f4b','#4a9ed4','#c47fd4','#4bc4c4','#e87c4a','#a8d45b','#d45b8a','#5bc4a8','#d4b45b','#5b7cd4','#d45b5b','#5bd48a','#c4a84b','#8a5bd4'];

// ---- CLASS SYSTEM ----
var CLASS_LABELS = {1:'G1',2:'G2',3:'G3',4:'LR',5:'Open',6:'BM',7:'Mdn',8:'Trial'};
var CLASS_CSS    = {1:'cb-g1',2:'cb-g2',3:'cb-g3',4:'cb-lr',5:'cb-open',6:'cb-bm',7:'cb-mdn',8:'cb-mdn'};
var CLASS_WIN_BONUS = {1:25,2:18,3:12,4:8,5:5,6:2,7:0,8:0};
var ORD = ['th','st','nd','rd'];

function ord(n) { var v=n%100; return ORD[(v-20)%10]||ORD[v]||ORD[0]; }

// Convert "1.09.10" -> total seconds (69.10)
function timeToSecs(t) {
  if(!t) return null;
  var parts=t.split('.');
  if(parts.length===3) return parseInt(parts[0])*60+parseInt(parts[1])+parseInt(parts[2])/100;
  if(parts.length===2) return parseInt(parts[0])*60+parseFloat(parts[1]);
  return parseFloat(t)||null;
}

// Format seconds back to "1:09.10"
function secsToDisplay(s) {
  if(!s) return '--';
  var m=Math.floor(s/60), sec=(s%60).toFixed(2);
  return m+':'+(parseFloat(sec)<10?'0':'')+sec;
}

function classifyRace(name, cls, prize) {
  var n=(name||'').toUpperCase(), c=(cls||'').toUpperCase(), p=prize||0;
  var g1=/\bGR\.?\s*1\s+[A-Z]/.test(n)||/\bGROUP\s+1\s+[A-Z]/.test(n)||/\bGROUP\s+1$/.test(n)||/\bGR1\b/.test(n)||/\bG1\b/.test(c);
  var g2=/\bGR\.?\s*2\s+[A-Z]/.test(n)||/\bGROUP\s+2\s+[A-Z]/.test(n)||/\bGROUP\s+2$/.test(n)||/\bGR2\b/.test(n)||/\bG2\b/.test(c);
  var g3=/\bGR\.?\s*3\s+[A-Z]/.test(n)||/\bGROUP\s+3\s+[A-Z]/.test(n)||/\bGROUP\s+3$/.test(n)||/\bGR3\b/.test(n)||/\bG3\b/.test(c);
  if(g1) return 1; if(g2) return 2; if(g3) return 3;
  if(/\bLISTED\b/.test(n)||/\bLR\b/.test(c)) return 4;
  if(/\bBM\s*\d+\b/.test(c+n)) return 6;
  if(/\bMDN\b|\bMAIDEN\b/.test(c+n)) return 7;
  if(/\bTRIAL\b/.test(c+n)) return 8;
  if(/\bOPEN\b/.test(c+n)) return 5;
  if(p>=300000) return 1; if(p>=120000) return 2; if(p>=80000) return 3;
  if(p>=60000) return 4; if(p>=35000) return 5; if(p>=20000) return 6;
  if(p>=10000) return 7; return 6;
}

function getClassBadge(name, cls, prize) {
  var t=classifyRace(name,cls,prize);
  return '<span class="class-badge '+CLASS_CSS[t]+'">'+CLASS_LABELS[t]+'</span>';
}

function enrichWithClass(results) {
  return results.map(function(r) {
    r.class_tier = classifyRace(r.race_name, r.race_class, r.prize_money);
    // Flag unplaced runners (ran but no timing data recorded)
    r.unplaced = (!r.finish_time && !r.odds_sp);
    return r;
  });
}

function isPlaced(r) { return !r.unplaced; }

// ---- DATA DECODER ----
function decodeRacingData(data) {
  var L=data.lookups, rows=data.rows;
  return rows.map(function(r) {
    return {
      finish_position:r[0], barrier:r[1], margin_trad:r[2],
      finish_time:r[3], last_600:r[4], odds_sp:r[5], prize_money:r[6],
      horse:L.horse[r[7]], jockey:L.jockey[r[8]], trainer:L.trainer[r[9]],
      track:L.track[r[10]], date:r[11], going:L.going[r[12]],
      race_name:L.race_name[r[13]], race_class:r[14], distance_m:r[15],
      race_number:r[16]
    };
  });
}

// ---- SPEED FIGURES ----
function getSpeedFig(horse, date, distance_m) {
  if(!window.RACING_DATA||!window.RACING_DATA.speed_figures) return null;
  var key = horse+'|'+(date||'')+'|'+String(distance_m);
  var fig = window.RACING_DATA.speed_figures[key];
  return fig !== undefined ? fig : null;
}

function speedFigBadge(fig) {
  if(fig===null||fig===undefined) return '';
  var col = fig>=110?'var(--green)':fig>=100?'var(--amber)':fig>=85?'var(--text2)':'var(--text3)';
  return '<span style="font-family:var(--fm);font-size:10px;padding:2px 6px;border-radius:4px;background:var(--bg4);color:'+col+';margin-left:4px" title="Speed figure">SF '+fig+'</span>';
}

// ---- PACE MAP ----
function timeToSecs600(t) {
  if(!t) return null;
  try {
    var p=t.split('.');
    if(p.length===3) return parseInt(p[0])*60+parseInt(p[1])+parseInt(p[2])/100;
  } catch(e){}
  return null;
}

function calcPaceScore(rows, barrier) {
  // Score 0-100: higher = more likely to lead
  // Uses avg last600 relative to finish time (early pace burn ratio)
  // and barrier draw (inside draws favour front runners)
  var validRuns = rows.filter(function(r){
    return r.finish_time && r.last_600 && r.finish_position <= 15;
  }).slice(-8); // last 8 runs

  if(!validRuns.length) return null;

  // Calculate early pace ratio: (total_time - last600) / total_time
  // Higher ratio = more time spent in early sections = front runner
  var ratios = validRuns.map(function(r){
    var total = timeToSecs600(r.finish_time);
    var last = timeToSecs600(r.last_600);
    if(!total || !last) return null;
    var early = total - last;
    return early / total; // fraction spent in early sectional
  }).filter(function(x){ return x !== null; });

  if(!ratios.length) return null;

  var avgRatio = ratios.reduce(function(a,b){return a+b;},0) / ratios.length;
  // avgRatio typically 0.68-0.80 for NZ racing
  // Higher = front runner, lower = closer
  // Normalise to 0-100 where 0.68=0 and 0.78=100
  var normalised = (avgRatio - 0.68) / 0.10 * 100;
  normalised = Math.max(0, Math.min(100, normalised));

  // Barrier adjustment: inside draws (+10), wide draws (-10)
  var barrierNum = parseInt(barrier) || 8;
  var barrierAdj = barrierNum <= 4 ? 8 : barrierNum <= 7 ? 0 : barrierNum <= 10 ? -8 : -14;

  return Math.max(0, Math.min(100, normalised + barrierAdj));
}

function getPaceLabel(score) {
  if(score === null) return {label:'Unknown', cls:'pace-u', pos:'?'};
  if(score >= 75)    return {label:'Leader',  cls:'pace-l', pos:'L'};
  if(score >= 55)    return {label:'Presser', cls:'pace-p', pos:'P'};
  if(score >= 35)    return {label:'Midfield',cls:'pace-m', pos:'M'};
  if(score >= 15)    return {label:'Back',    cls:'pace-b', pos:'B'};
  return               {label:'Chaser',  cls:'pace-c', pos:'C'};
}

function renderPaceMap(runners) {
  if(!runners || runners.length < 2) return '';

  // Calculate pace scores for all runners
  var scored = runners.map(function(runner) {
    var rows = allResults.filter(function(r){return r.horse===runner.horse;});
    var score = calcPaceScore(rows, runner.barrier);
    var pace = getPaceLabel(score);
    return Object.assign({}, runner, {paceScore:score, pace:pace});
  });

  // Count leaders/pressers for scenario analysis
  var leaders  = scored.filter(function(r){return r.paceScore!==null && r.paceScore>=75;});
  var pressers = scored.filter(function(r){return r.paceScore!==null && r.paceScore>=55 && r.paceScore<75;});
  var unknowns = scored.filter(function(r){return r.paceScore===null;});

  // Pace scenario
  var scenario, scenarioClass;
  if(leaders.length >= 3) {
    scenario = 'Hot pace \u2014 '+leaders.length+' likely leaders. Expect a contested speed which should suit back markers and closers.';
    scenarioClass = 'pace-scenario-hot';
  } else if(leaders.length === 0 && pressers.length <= 1) {
    scenario = 'Slow pace \u2014 no confirmed leaders. Front-runners and pressers are likely to benefit from an easy lead.';
    scenarioClass = 'pace-scenario-slow';
  } else if(leaders.length >= 2) {
    scenario = 'Genuine pace \u2014 '+leaders.length+' leaders likely to contest the front. Midfielders well placed.';
    scenarioClass = 'pace-scenario-genuine';
  } else {
    scenario = 'Moderate pace expected. Tactical race \u2014 barrier draw will be key.';
    scenarioClass = 'pace-scenario-mod';
  }

  // Sort by pace score descending for display
  scored.sort(function(a,b){ return (b.paceScore||0)-(a.paceScore||0); });

  // Track width for visual position bar
  var maxScore = 100;

  var rows_html = scored.map(function(s) {
    var barrierBg = s.paceScore===null?'var(--bg3)':
      s.paceScore>=75?'rgba(83,74,183,.2)':
      s.paceScore>=55?'rgba(29,158,117,.2)':
      s.paceScore>=35?'rgba(186,117,23,.15)':
      'rgba(55,138,221,.15)';
    var barrierCol = s.paceScore===null?'var(--text3)':
      s.paceScore>=75?'#3C3489':
      s.paceScore>=55?'#085041':
      s.paceScore>=35?'#633806':
      '#0C447C';
    var barCol = s.paceScore===null?'var(--border)':
      s.paceScore>=75?'#534AB7':
      s.paceScore>=55?'#1D9E75':
      s.paceScore>=35?'#BA7517':
      '#378ADD';
    var barW = s.paceScore!==null ? Math.round(s.paceScore) : 0;
    var sf = s.careerBestFig ? ' \u2022 SF '+s.careerBestFig : '';
    return '<div class="pm-row">'
      +'<div class="pm-barrier" style="background:'+barrierBg+';color:'+barrierCol+'">'+(s.barrier||'?')+'</div>'
      +'<div class="pm-name">'+s.horse+'<span class="pm-sf">'+sf+'</span></div>'
      +'<div class="pm-bar-wrap"><div class="pm-bar" style="width:'+barW+'%;background:'+barCol+'"></div></div>'
      +'<span class="pm-label '+s.pace.cls+'">'+s.pace.label+'</span>'
      +'</div>';
  }).join('');

  var unknownNote = unknowns.length ? '<div style="font-size:11px;color:var(--text3);padding:0 1.25rem 0.75rem">'+unknowns.length+' runner(s) have insufficient last 600 data for pace classification.</div>' : '';

  return '<div class="table-wrap" style="margin-bottom:0;border-top:1px solid var(--border)">'
    +'<div class="table-header">'
    +'<span class="table-title">Pace map</span>'
    +'<span class="table-count">based on last 600m splits \u2022 barrier adjusted</span>'
    +'</div>'
    +'<div style="display:flex;justify-content:space-between;padding:0.5rem 1.25rem 0.25rem;font-size:10px;color:var(--text3);font-weight:500;letter-spacing:.4px">'
    +'<span>GATE</span><span>LEAD \u2192 PRESS \u2192 MID \u2192 BACK \u2192 CHASE</span>'
    +'</div>'
    +'<div class="pm-runners">'+rows_html+'</div>'
    +unknownNote
    +'<div class="pm-scenario '+scenarioClass+'">'
    +'<span style="font-weight:500">Pace scenario:</span> '+scenario
    +'</div>'
    +'</div>';
}

// ---- GOING ----
function normaliseGoing(going) {
  if(!going) return null;
  var g=going.toLowerCase();
  if(g.includes('heavy')) return 'Heavy';
  if(g.includes('slow')) return 'Slow';
  if(g.includes('soft')) return 'Soft';
  if(g.includes('good')) return 'Good';
  if(g.includes('firm')) return 'Firm';
  if(g.includes('hard')) return 'Hard';
  return going.split(/\s/)[0];
}
function goingClass(going) {
  if(!going) return '';
  var g=going.toLowerCase();
  if(g.includes('heavy')||g.includes('slow')) return 'going-heavy';
  if(g.includes('soft')) return 'going-soft';
  return 'going-good';
}

// ---- INIT ----
function init() {
  var lt=document.getElementById('loading-text');
  try {
    if(window.RACING_DATA&&window.RACING_DATA.rows&&window.RACING_DATA.rows.length) {
      if(lt) lt.textContent='Decoding '+window.RACING_DATA.rows.length.toLocaleString()+' results...';
      allResults = enrichWithClass(decodeRacingData(window.RACING_DATA));
      var s=window.RACING_DATA.summary;
      document.getElementById('db-status').textContent=s.total_races.toLocaleString()+' races - '+s.exported_at;
    } else if(window.RACING_DATA&&window.RACING_DATA.results&&window.RACING_DATA.results.length) {
      allResults = enrichWithClass(window.RACING_DATA.results);
      var s=window.RACING_DATA.summary;
      document.getElementById('db-status').textContent=s.total_races.toLocaleString()+' races - '+s.exported_at;
    } else {
      allResults = enrichWithClass(generateMockData());
      document.getElementById('db-status').textContent='demo mode';
    }
  } catch(e) {
    console.error('Data load error:',e);
    allResults = enrichWithClass(generateMockData());
    document.getElementById('db-status').textContent='error loading data';
  }
  populateDropdowns();
  applyFilters();
  loadTrends();
  renderClassLB(6);
  wireEvents();
  showPage('home');
  var overlay=document.getElementById('loading-overlay');
  if(overlay){overlay.classList.add('fade-out');setTimeout(function(){if(overlay.parentNode)overlay.remove();},450);}
}

setTimeout(function(){
  var o=document.getElementById('loading-overlay');
  if(o){o.classList.add('fade-out');setTimeout(function(){if(o.parentNode)o.remove();},450);}
},8000);

// ---- WIRE EVENTS ----
function wireEvents() {
  // Results filters
  var fids=['f-horse','f-jockey','f-trainer','f-track','f-going','f-class','f-position','f-date-from','f-date-to'];
  fids.forEach(function(id){
    var el=document.getElementById(id); if(!el) return;
    el.addEventListener('change',applyFilters);
    el.addEventListener('input',applyFilters);
  });
  document.getElementById('btn-clear').addEventListener('click',clearFilters);
  var hu=document.getElementById('f-hide-unplaced');
  if(hu) hu.addEventListener('change',applyFilters);

  // Autocomplete
  document.getElementById('f-horse').addEventListener('input',function(){ acUpdate(this,'horse','ac-horse'); });
  document.getElementById('f-jockey').addEventListener('input',function(){ acUpdate(this,'jockey','ac-jockey'); });
  document.getElementById('f-trainer').addEventListener('input',function(){ acUpdate(this,'trainer','ac-trainer'); });
  document.getElementById('t-search').addEventListener('input',function(){ acUpdateMulti(this,'ac-trends'); loadTrends(); });
  document.getElementById('h-a').addEventListener('input',function(){ acUpdateMulti(this,'ac-ha'); });
  document.getElementById('h-b').addEventListener('input',function(){ acUpdateMulti(this,'ac-hb'); });

  // Trends
  ['t-type','t-metric','t-track','t-min-starts'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.addEventListener('change',loadTrends);
  });

  // H2H
  document.getElementById('btn-compare').addEventListener('click',loadH2H);

  // Field builder
  document.getElementById('field-search').addEventListener('input',searchHorsesForField);
  document.getElementById('field-race-name').addEventListener('input',function(){
    document.getElementById('field-race-name-display').textContent=(this.value||'RACE FIELD').toUpperCase();
  });
  document.getElementById('btn-clear-field').addEventListener('click',clearField);
  ['field-distance','field-track','field-going'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.addEventListener('change',renderFieldComparison);
  });

  // Global search
  var gs=document.getElementById('global-search');
  gs.addEventListener('input',function(){ globalSearch(this.value); });
  gs.addEventListener('focus',function(){ if(this.value.length>=2) globalSearch(this.value); });
  // Delegated clicks for horse-link, race-link and modal-horse
  document.addEventListener('click',function(e){
    // Modal horse/jockey profile links
    var mh=e.target.closest('.modal-horse');
    if(mh){closeModal();openProfile(mh.dataset.name,mh.dataset.type);return;}
    // Race field modal links
    var rl=e.target.closest('.race-link');
    if(rl&&rl.dataset.track){openRace(rl.dataset.track,rl.dataset.date,parseInt(rl.dataset.racenum));return;}
    // Horse/jockey/trainer profile links (results table, trends)
    var hl=e.target.closest('.horse-link[data-name]');
    if(hl&&hl.dataset.name&&!hl.classList.contains('race-link')){openProfile(hl.dataset.name,hl.dataset.type||'horse');return;}
  });
  document.addEventListener('click',function(e){
    if(!e.target.closest('.gsearch-wrap')&&!e.target.closest('.ac-wrap')) closeAllDropdowns();
  });
}

// ---- DROPDOWNS ----
function populateDropdowns() {
  var tracks=[...new Set(allResults.map(function(r){return r.track;}).filter(Boolean))].sort();
  var goings=[...new Set(allResults.map(function(r){return normaliseGoing(r.going);}).filter(Boolean))].sort();
  ['f-track','t-track','field-track'].forEach(function(id){
    var sel=document.getElementById(id); if(!sel) return;
    tracks.forEach(function(t){var o=document.createElement('option');o.value=t;o.textContent=t;sel.appendChild(o);});
  });
  ['f-going','field-going'].forEach(function(id){
    var sel=document.getElementById(id); if(!sel) return;
    goings.forEach(function(g){var o=document.createElement('option');o.value=g;o.textContent=g;sel.appendChild(o);});
  });
}

// ---- AUTOCOMPLETE ----
function acUpdate(input, field, dropId) {
  var q=input.value.toLowerCase().trim();
  if(!q||q.length<1){closeAc(dropId);return;}
  var names=[...new Set(allResults.map(function(r){return r[field];}).filter(Boolean))].filter(function(n){return n.toLowerCase().includes(q);}).slice(0,10);
  acRender(dropId, names.map(function(n){
    var rows=allResults.filter(function(r){return r[field]===n;});
    var wins=rows.filter(function(r){return r.finish_position===1;}).length;
    return {label:n,meta:rows.length+' starts - '+wins+'W - '+(rows.length?(wins/rows.length*100).toFixed(0):0)+'%'};
  }), input);
}

function acUpdateMulti(input, dropId) {
  var q=input.value.toLowerCase().trim();
  if(!q||q.length<1){closeAc(dropId);return;}
  var horses=[...new Set(allResults.map(function(r){return r.horse;}).filter(Boolean))].filter(function(n){return n.toLowerCase().includes(q);}).slice(0,5).map(function(n){return {label:n,meta:'Horse'};});
  var jockeys=[...new Set(allResults.map(function(r){return r.jockey;}).filter(Boolean))].filter(function(n){return n.toLowerCase().includes(q);}).slice(0,3).map(function(n){return {label:n,meta:'Jockey'};});
  var trainers=[...new Set(allResults.map(function(r){return r.trainer;}).filter(Boolean))].filter(function(n){return n.toLowerCase().includes(q);}).slice(0,3).map(function(n){return {label:n,meta:'Trainer'};});
  acRender(dropId, horses.concat(jockeys).concat(trainers), input);
}

function acRender(dropId, items, input) {
  var drop=document.getElementById(dropId); if(!drop) return;
  if(!items.length){closeAc(dropId);return;}
  drop.innerHTML='';
  items.forEach(function(item){
    var div=document.createElement('div');
    div.className='ac-item';
    div.innerHTML='<span style="font-weight:500">'+item.label+'</span><span style="font-size:11px;color:var(--text3);font-family:var(--fm)">'+item.meta+'</span>';
    div.addEventListener('mousedown',function(e){
      e.preventDefault();
      input.value=item.label;
      closeAc(dropId);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    drop.appendChild(div);
  });
  drop.classList.add('open');
}

function closeAc(dropId) {
  var el=document.getElementById(dropId); if(el){el.classList.remove('open');el.innerHTML='';}
}

function closeAllDropdowns() {
  document.querySelectorAll('.ac-drop,.gsearch-results').forEach(function(d){d.classList.remove('open');d.innerHTML='';});
}

// ---- GLOBAL SEARCH ----
function globalSearch(q) {
  var container=document.getElementById('gsearch-results');
  if(!q||q.length<2){container.classList.remove('open');container.innerHTML='';return;}
  var ql=q.toLowerCase();
  var horses=[...new Set(allResults.map(function(r){return r.horse;}).filter(Boolean))].filter(function(h){return h.toLowerCase().includes(ql);}).slice(0,5).map(function(n){return {name:n,type:'horse',label:'Horse'};});
  var jockeys=[...new Set(allResults.map(function(r){return r.jockey;}).filter(Boolean))].filter(function(j){return j.toLowerCase().includes(ql);}).slice(0,3).map(function(n){return {name:n,type:'jockey',label:'Jockey'};});
  var trainers=[...new Set(allResults.map(function(r){return r.trainer;}).filter(Boolean))].filter(function(t){return t.toLowerCase().includes(ql);}).slice(0,3).map(function(n){return {name:n,type:'trainer',label:'Trainer'};});
  var results=horses.concat(jockeys).concat(trainers);
  if(!results.length){container.classList.remove('open');return;}
  container.innerHTML='';
  results.forEach(function(r){
    var rows=allResults.filter(function(x){return x[r.type]===r.name;});
    var wins=rows.filter(function(x){return x.finish_position===1;}).length;
    var div=document.createElement('div');
    div.className='sri';
    div.innerHTML='<div><div class="sri-name">'+r.name+'</div><div class="sri-meta">'+rows.length+' starts - '+wins+' wins</div></div><span class="sri-type">'+r.label+'</span>';
    div.addEventListener('click',function(){
      container.classList.remove('open');
      document.getElementById('global-search').value='';
      openProfile(r.name,r.type);
    });
    container.appendChild(div);
  });
  container.classList.add('open');
}

// ---- RESULTS ----
function applyFilters() {
  var horse=document.getElementById('f-horse').value.toLowerCase();
  var jockey=document.getElementById('f-jockey').value.toLowerCase();
  var trainer=document.getElementById('f-trainer').value.toLowerCase();
  var track=document.getElementById('f-track').value;
  var going=document.getElementById('f-going').value;
  var pos=document.getElementById('f-position').value;
  var cls=document.getElementById('f-class').value;
  var df=document.getElementById('f-date-from').value;
  var dt=document.getElementById('f-date-to').value;

  filteredResults=allResults.filter(function(r){
    if(cls && String(r.class_tier)!==cls) return false;
    if(horse && !(r.horse||'').toLowerCase().includes(horse)) return false;
    if(jockey && !(r.jockey||'').toLowerCase().includes(jockey)) return false;
    if(trainer && !(r.trainer||'').toLowerCase().includes(trainer)) return false;
    if(track && r.track!==track) return false;
    if(going && normaliseGoing(r.going)!==going) return false;
    if(pos==='1' && r.finish_position!==1) return false;
    if(pos==='1-3' && r.finish_position>3) return false;
    if(pos==='1-5' && r.finish_position>5) return false;
    if(df && r.date<df) return false;
    if(dt && r.date>dt) return false;
    var hideUnplaced=document.getElementById('f-hide-unplaced')&&document.getElementById('f-hide-unplaced').checked;
    if(hideUnplaced && r.unplaced) return false;
    return true;
  });
  currentPage=1;
  renderStats();
  renderResultsTable();
}

function clearFilters() {
  ['f-horse','f-jockey','f-trainer','f-date-from','f-date-to'].forEach(function(id){document.getElementById(id).value='';});
  ['f-track','f-going','f-class','f-position'].forEach(function(id){document.getElementById(id).value='';});
  closeAllDropdowns();
  applyFilters();
}

function renderStats() {
  var data=filteredResults.length?filteredResults:allResults;
  var placed=data.filter(isPlaced);
  var wins=placed.filter(function(r){return r.finish_position===1;}).length;
  var places=placed.filter(function(r){return r.finish_position<=3;}).length;
  var winPct=data.length?(wins/data.length*100).toFixed(1):0;
  var tracks=new Set(data.map(function(r){return r.track;})).size;
  var horses=new Set(data.map(function(r){return r.horse;})).size;
  var prize=data.reduce(function(s,r){return s+(r.prize_money||0);},0);
  var stats=[
    ['Results',data.length.toLocaleString(),''],
    ['Wins',wins.toLocaleString(),'amber'],
    ['Win rate',winPct+'%','green'],
    ['Top 3',places.toLocaleString(),''],
    ['Horses',horses.toLocaleString(),''],
    ['Tracks',String(tracks),''],
    ['Prize','$'+(prize/1000).toFixed(0)+'k',''],
  ];
  document.getElementById('results-stats').innerHTML=stats.map(function(s){
    return '<div class="stat-card"><div class="stat-label">'+s[0]+'</div><div class="stat-value '+s[2]+'">'+s[1]+'</div></div>';
  }).join('');
}

function sortTable(key) {
  if(sortKey===key) sortDir*=-1; else{sortKey=key;sortDir=1;}
  renderResultsTable();
}

function renderResultsTable() {
  var isFiltered=filteredResults.length||['f-horse','f-jockey','f-trainer'].some(function(id){return document.getElementById(id)&&document.getElementById(id).value;});
  var data=isFiltered?filteredResults:allResults;
  var sorted=data.slice().sort(function(a,b){
    var av=a[sortKey]||'', bv=b[sortKey]||'';
    if(typeof av==='number') return sortDir*(av-bv);
    return sortDir*String(av).localeCompare(String(bv));
  });
  var total=sorted.length;
  var slice=sorted.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  document.getElementById('results-count').textContent=total.toLocaleString()+' results';
  document.getElementById('results-body').innerHTML=slice.map(function(r){
    var p=r.finish_position;
    var pc=p===1?'pos-1':p===2?'pos-2':p===3?'pos-3':'pos-other';
    var rowClass=r.unplaced?' style="opacity:0.45"':'';
    return '<tr'+rowClass+'>'
      +'<td><span class="pos-badge '+pc+'">'+p+'</span></td>'
      +'<td><span class="horse-link" data-name="'+(r.horse||'')+'" data-type="horse">'+( r.horse||'--')+'</span></td>'
      +'<td><span class="horse-link" data-name="'+(r.jockey||'')+'" data-type="jockey">'+( r.jockey||'--')+'</span></td>'
      +'<td class="r-hide" style="color:var(--text2);font-size:12px">'+(r.trainer||'--')+'</td>'
      +'<td style="color:var(--text2)">'+(r.track||'--')+'</td>'
      +'<td class="tv">'+(r.date||'--')+'</td>'
      +'<td class="r-hide" style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis"><span class="horse-link race-link" data-track="'+(r.track||'')+'" data-date="'+(r.date||'')+'" data-racenum="'+(r.race_number||'')+'">'+( r.race_name||'Race '+r.race_number)+'</span></td>'
      +'<td class="r-hide">'+getClassBadge(r.race_name,r.race_class,r.prize_money)+'</td>'
      +'<td class="tv r-hide">'+(r.distance_m?r.distance_m+'m':'--')+'</td>'
      +'<td class="tv r-hide">'+(r.barrier||'--')+'</td>'
      +'<td class="tv">'+(r.finish_time||'--')+speedFigBadge(getSpeedFig(r.horse,r.date,r.distance_m))+'</td>'
      +'<td class="r-hide" style="color:var(--text3);font-size:12px">'+(p===1?'Winner':(r.margin_trad||'--'))+'</td>'
      +'</tr>';
  }).join('');
  renderPagination(Math.ceil(total/PAGE_SIZE));
}

function renderPagination(pages) {
  var c=document.getElementById('results-pagination');
  if(pages<=1){c.innerHTML='';return;}
  var h='<button class="page-btn" onclick="goPage('+(currentPage-1)+')" '+(currentPage===1?'disabled':'')+'>&#8592;</button>';
  var start=Math.max(1,currentPage-3),end=Math.min(pages,currentPage+3);
  if(start>1) h+='<button class="page-btn" onclick="goPage(1)">1</button><span style="color:var(--text3);font-size:12px">...</span>';
  for(var i=start;i<=end;i++) h+='<button class="page-btn '+(i===currentPage?'active':'')+'" onclick="goPage('+i+')">'+i+'</button>';
  if(end<pages) h+='<span style="color:var(--text3);font-size:12px">...</span><button class="page-btn" onclick="goPage('+pages+')">'+pages+'</button>';
  h+='<button class="page-btn" onclick="goPage('+(currentPage+1)+')" '+(currentPage===pages?'disabled':'')+'>&#8594;</button>';
  c.innerHTML=h;
}

function goPage(p) {
  var data=filteredResults.length?filteredResults:allResults;
  var pages=Math.ceil(data.length/PAGE_SIZE);
  if(p<1||p>pages) return;
  currentPage=p; renderResultsTable();
  window.scrollTo({top:0,behavior:'smooth'});
}

function filterByHorse(name){showPage('results');document.getElementById('f-horse').value=name;applyFilters();}

// ---- TRENDS ----
function loadTrends() {
  var search=document.getElementById('t-search').value.toLowerCase();
  var type=document.getElementById('t-type').value;
  var metric=document.getElementById('t-metric').value;
  var track=document.getElementById('t-track').value;
  var minStarts=parseInt(document.getElementById('t-min-starts').value)||2;
  var data=track?allResults.filter(function(r){return r.track===track;}):allResults;
  var grouped={};
  data.forEach(function(r){
    var key=r[type]||'Unknown';
    if(search&&!key.toLowerCase().includes(search)) return;
    if(!grouped[key]) grouped[key]=[];
    grouped[key].push(r);
  });
  var lb=Object.entries(grouped).map(function(e){
    var name=e[0], rows=e[1];
    var starts=rows.length;
    var wins=rows.filter(function(r){return r.finish_position===1;}).length;
    var places=rows.filter(function(r){return r.finish_position<=3;}).length;
    var avgPos=(rows.reduce(function(s,r){return s+r.finish_position;},0)/starts).toFixed(1);
    var winPct=(wins/starts*100).toFixed(1);
    var placePct=(places/starts*100).toFixed(1);
    var tw={};
    rows.filter(function(r){return r.finish_position===1;}).forEach(function(r){tw[r.track]=(tw[r.track]||0)+1;});
    var bestTrack=Object.entries(tw).sort(function(a,b){return b[1]-a[1];})[0];
    return {name:name,starts:starts,wins:wins,places:places,winPct:winPct,placePct:placePct,avgPos:avgPos,bestTrack:bestTrack?bestTrack[0]:'--',rows:rows};
  }).filter(function(x){return x.starts>=minStarts;});

  var sorted=lb.sort(function(a,b){
    if(metric==='wins') return b.wins-a.wins;
    if(metric==='win_pct') return parseFloat(b.winPct)-parseFloat(a.winPct);
    if(metric==='place_pct') return parseFloat(b.placePct)-parseFloat(a.placePct);
    return parseFloat(a.avgPos)-parseFloat(b.avgPos);
  }).slice(0,50);

  document.getElementById('trends-count').textContent=sorted.length+' '+type+'s';
  var topByWins=sorted.slice().sort(function(a,b){return b.wins-a.wins;})[0];
  document.getElementById('trends-stats').innerHTML=[
    ['Total '+type+'s',Object.keys(grouped).length,''],
    ['Best win rate',(sorted[0]?sorted[0].winPct:0)+'%','green'],
    ['Most wins',topByWins?topByWins.wins:0,'amber'],
    ['Total races',data.length.toLocaleString(),''],
  ].map(function(s){
    return '<div class="stat-card"><div class="stat-label">'+s[0]+'</div><div class="stat-value '+s[2]+'">'+s[1]+'</div>'+(sorted[0]&&s[0]==='Best win rate'?'<div class="stat-sub">'+(sorted[0].name||'')+'</div>':'')+'</div>';
  }).join('');

  document.getElementById('trends-body').innerHTML=sorted.map(function(s,i){
    var hn=s.name.replace(/'/g,"\\'");
    return '<tr>'
      +'<td class="tv" style="color:var(--text3)">'+(i+1)+'</td>'
      +'<td><span class="horse-link" onclick="openProfile(\''+hn+'\',\''+type+'\')">'+s.name+'</span></td>'
      +'<td class="tv">'+s.starts+'</td>'
      +'<td class="tv" style="color:var(--amber)">'+s.wins+'</td>'
      +'<td class="tv r-hide">'+s.places+'</td>'
      +'<td class="tv" style="color:var(--green)">'+s.winPct+'%</td>'
      +'<td class="tv r-hide">'+s.placePct+'%</td>'
      +'<td class="tv r-hide">'+s.avgPos+'</td>'
      +'<td class="tv r-hide" style="color:var(--text2)">'+s.bestTrack+'</td>'
      +'<td><button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;min-height:28px" onclick="openProfile(\''+hn+'\',\''+type+'\')">Profile</button></td>'
      +'</tr>';
  }).join('');

  if(sorted[0]) renderCharts(sorted[0],type,data);
}

function renderCharts(target, type, allData) {
  var rows=target.rows;
  var mw={};
  rows.forEach(function(r){
    var m=r.date&&r.date.slice(0,7); if(!m) return;
    if(!mw[m]){mw[m]={wins:0,starts:0};}
    mw[m].starts++;
    if(r.finish_position===1) mw[m].wins++;
  });
  var months=Object.keys(mw).sort();
  makeChart('chart-timeline','bar',{
    labels:months,
    datasets:[{label:'Wins',data:months.map(function(m){return mw[m].wins;}),backgroundColor:'#7ec94a'},
              {label:'Starts',data:months.map(function(m){return mw[m].starts;}),backgroundColor:'rgba(255,255,255,0.08)'}]
  });
  var tw={};
  rows.filter(function(r){return r.finish_position===1;}).forEach(function(r){tw[r.track]=(tw[r.track]||0)+1;});
  var twa=Object.entries(tw).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  makeChart('chart-track','bar',{labels:twa.map(function(x){return x[0];}),datasets:[{label:'Wins',data:twa.map(function(x){return x[1];}),backgroundColor:'#e8a830'}]},{indexAxis:'y'});
  var pos=Array(10).fill(0);
  rows.forEach(function(r){pos[Math.min(r.finish_position,10)-1]++;});
  makeChart('chart-positions','bar',{
    labels:['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10+'],
    datasets:[{label:'Count',data:pos,backgroundColor:['#e8a830','#7ec94a','#4a9ed4','rgba(255,255,255,.1)','rgba(255,255,255,.08)','rgba(255,255,255,.07)','rgba(255,255,255,.06)','rgba(255,255,255,.05)','rgba(255,255,255,.04)','rgba(255,255,255,.03)']}]
  });
  var dw={};
  rows.forEach(function(r){
    if(!r.distance_m) return;
    if(!dw[r.distance_m]){dw[r.distance_m]={wins:0,starts:0};}
    dw[r.distance_m].starts++;
    if(r.finish_position===1) dw[r.distance_m].wins++;
  });
  var dists=Object.keys(dw).map(Number).sort(function(a,b){return a-b;});
  makeChart('chart-distance','line',{
    labels:dists.map(function(d){return d+'m';}),
    datasets:[{label:'Win%',data:dists.map(function(d){return dw[d].starts>0?(dw[d].wins/dw[d].starts*100).toFixed(1):0;}),borderColor:'#7ec94a',backgroundColor:'rgba(126,201,74,0.08)',tension:0.3,fill:true,pointBackgroundColor:'#7ec94a'}]
  });
}

function makeChart(id, type, data, extra) {
  if(charts[id]) charts[id].destroy();
  var ctx=document.getElementById(id); if(!ctx) return;
  charts[id]=new Chart(ctx.getContext('2d'),{type:type,data:data,options:{
    responsive:true,
    plugins:{legend:{display:data.datasets.length>1,labels:{color:'#948f83',font:{size:11}}}},
    scales:{
      x:{ticks:{color:'#524f48',font:{size:10}},grid:{color:'rgba(255,255,255,0.03)'}},
      y:{ticks:{color:'#524f48',font:{size:10}},grid:{color:'rgba(255,255,255,0.03)'}},
      ...(extra&&extra.scales||{})
    },
    ...(extra||{})
  }});
}

// ---- CLASS LEADERBOARD ----
function renderClassLB(tier) {
  var label=CLASS_LABELS[tier]||tier;
  document.getElementById('class-lb-meta').textContent=label+' races - top horses by wins';
  var tierResults=allResults.filter(function(r){return r.class_tier===tier;});
  var horses={};
  tierResults.forEach(function(r){
    if(!r.horse) return;
    if(!horses[r.horse]){horses[r.horse]={starts:0,wins:0,races:[]};}
    horses[r.horse].starts++;
    if(r.finish_position===1){horses[r.horse].wins++;horses[r.horse].races.push(r.race_name||'');}
  });
  var sorted=Object.entries(horses).filter(function(e){return e[1].starts>0;}).sort(function(a,b){return b[1].wins-a[1].wins||b[1].starts-a[1].starts;}).slice(0,20);
  if(!sorted.length){
    document.getElementById('class-lb-body').innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:2rem">No '+label+' race results in database yet</td></tr>';
    return;
  }
  document.getElementById('class-lb-body').innerHTML=sorted.map(function(e,i){
    var name=e[0], d=e[1];
    var hn=name.replace(/'/g,"\\'");
    return '<tr>'
      +'<td class="tv" style="color:var(--text3)">'+(i+1)+'</td>'
      +'<td><span class="horse-link" onclick="openProfile(\''+hn+'\',\'horse\')">'+name+'</span></td>'
      +'<td class="tv" style="color:var(--amber)">'+d.wins+'</td>'
      +'<td class="tv">'+d.starts+'</td>'
      +'<td class="tv" style="color:var(--green)">'+(d.wins/d.starts*100).toFixed(1)+'%</td>'
      +'<td class="r-hide" style="font-size:11px;color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(d.races[0]||'--')+'</td>'
      +'<td><button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;min-height:28px" onclick="openProfile(\''+hn+'\',\'horse\')">Profile</button></td>'
      +'</tr>';
  }).join('');
}

// ---- PROFILE ----
function openProfile(name, type) {
  showPage('profile');
  var rows=allResults.filter(function(r){return r[type]===name;});
  if(!rows.length){document.getElementById('profile-content').innerHTML='<div class="empty-state"><div>No data found for '+name+'</div></div>';return;}
  rows.sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
  var wins=rows.filter(function(r){return r.finish_position===1;}).length;
  var places=rows.filter(function(r){return r.finish_position<=3;}).length;
  var avgPos=(rows.reduce(function(s,r){return s+r.finish_position;},0)/rows.length).toFixed(1);
  var winPct=(wins/rows.length*100).toFixed(1);
  var placePct=(places/rows.length*100).toFixed(1);
  var totalPrize=rows.reduce(function(s,r){return s+(r.prize_money||0);},0);
  var trackMap={};
  rows.filter(function(r){return r.finish_position===1;}).forEach(function(r){trackMap[r.track]=(trackMap[r.track]||0)+1;});
  var bestTrack=Object.entries(trackMap).sort(function(a,b){return b[1]-a[1];})[0];
  var distMap={};
  rows.filter(function(r){return r.finish_position===1;}).forEach(function(r){distMap[r.distance_m]=(distMap[r.distance_m]||0)+1;});
  var bestDist=Object.entries(distMap).sort(function(a,b){return b[1]-a[1];})[0];

  // Best and average times by distance
  var timeByDist={};
  rows.forEach(function(r){
    if(!r.finish_time||!r.distance_m) return;
    var secs=timeToSecs(r.finish_time); if(!secs) return;
    var k=String(r.distance_m);
    if(!timeByDist[k]) timeByDist[k]={best:secs,bestRaw:r.finish_time,bestDate:r.date,bestTrack:r.track,total:0,count:0};
    if(secs<timeByDist[k].best){timeByDist[k].best=secs;timeByDist[k].bestRaw=r.finish_time;timeByDist[k].bestDate=r.date;timeByDist[k].bestTrack=r.track;}
    timeByDist[k].total+=secs;
    timeByDist[k].count++;
  });
  var winRows=rows.filter(function(r){return r.finish_position===1;});
  var bestTier=winRows.length?Math.min.apply(null,winRows.map(function(r){return r.class_tier||7;})):null;
  var bestClassBadge=bestTier?'<span class="class-badge '+CLASS_CSS[bestTier]+'">'+CLASS_LABELS[bestTier]+'</span>':'--';
  var goingMap={};
  rows.forEach(function(r){
    var g=normaliseGoing(r.going); if(!g) return;
    if(!goingMap[g]){goingMap[g]={starts:0,wins:0};}
    goingMap[g].starts++;
    if(r.finish_position===1) goingMap[g].wins++;
  });
  var lastDate=rows[0]&&rows[0].date;
  var daysSince=lastDate?Math.floor((Date.now()-new Date(lastDate))/(1000*60*60*24)):null;
  var formLine=rows.slice(0,8).map(function(r){
    var n=r.finish_position;
    var cls=n===1?'fd-1':n===2?'fd-2':n===3?'fd-3':'fd-o';
    return '<div class="form-dot '+cls+'">'+n+'</div>';
  }).join('');

  var goingCards=Object.entries(goingMap).sort(function(a,b){return b[1].starts-a[1].starts;}).map(function(e){
    var g=e[0],d=e[1];
    var pct=d.wins>0?(d.wins/d.starts*100).toFixed(0)+'%':'0%';
    var col=d.wins>0?'var(--green)':'var(--text2)';
    return '<div class="going-card">'
      +'<div style="font-size:10px;font-family:var(--fm);color:var(--text3);text-transform:uppercase;margin-bottom:4px"><span class="going-badge '+goingClass(g)+'">'+g+'</span></div>'
      +'<div style="font-family:var(--fm);font-size:18px;font-weight:500;color:'+col+'">'+pct+'</div>'
      +'<div style="font-size:10px;color:var(--text3);margin-top:2px">'+d.wins+'W from '+d.starts+'</div>'
      +'</div>';
  }).join('');

  var recentRuns=rows.slice(0,20).map(function(r){
    var pos=r.finish_position;
    var posClass=pos===1?'pos-1':pos===2?'pos-2':pos===3?'pos-3':'pos-other';
    var bg=pos===1?'rgba(232,168,48,.2)':pos<=3?'rgba(126,201,74,.12)':'var(--bg4)';
    var gBadge=r.going?'<span class="going-badge '+goingClass(r.going)+'">'+normaliseGoing(r.going)+'</span>':'';
    return '<div class="rr">'
      +'<div class="rr-pos" style="background:'+bg+'"><span class="pos-badge '+posClass+'">'+pos+'</span></div>'
      +'<div class="rr-main">'
      +'<div class="rr-race"><span class="horse-link race-link" data-track="'+(r.track||'')+'" data-date="'+(r.date||'')+'" data-racenum="'+(r.race_number||'')+'">'+( r.race_name||'Race '+r.race_number)+'</span> / '+(r.track||'--')+'</div>'
      +'<div class="rr-meta">'+(r.date||'--')+' / '+(r.distance_m?r.distance_m+'m':'--')+' '+gBadge+'</div>'
      +'</div>'
      +'<div class="rr-right">'
      +'<div class="rr-odds" style="font-family:var(--fm);color:var(--green)">'+(r.finish_time||'--')+speedFigBadge(getSpeedFig(r.horse,r.date,r.distance_m))+'</div>'
      +'<div class="rr-margin">'+(pos===1?'Winner':(r.margin_trad||'--'))+'</div>'
      +'</div></div>';
  }).join('');

  var eName=encodeURIComponent(name);

  // Class progression chart - show class tier over time (chronological)
  var chronoRows = rows.slice().sort(function(a,b){return (a.date||'').localeCompare(b.date||'');});
  var classChartHtml = '';
  if(chronoRows.length >= 2) {
    var chartW = 520, chartH = 160, padL = 40, padR = 12, padT = 12, padB = 24;
    var innerW = chartW - padL - padR;
    var innerH = chartH - padT - padB;
    var tierLabels = {1:'G1',2:'G2',3:'G3',4:'Listed',5:'Open',6:'BM',7:'Maiden'};
    var tierColors = {1:'#534AB7',2:'#7F77DD',3:'#AFA9EC',4:'#1D9E75',5:'#3B6D11',6:'#BA7517',7:'#888780'};
    // Non-linear Y positions: bigger visual gap between Group/Listed/Open/BM/Mdn
    // Each tier gets a fixed Y slot - spread evenly but labeled clearly
    var tierY = {1:0, 2:0.12, 3:0.24, 4:0.40, 5:0.57, 6:0.76, 7:1.0};
    var n = chronoRows.length;
    var pts = chronoRows.map(function(r, i) {
      var t = r.class_tier || 7;
      t = Math.min(Math.max(t, 1), 7);
      var x = padL + (n === 1 ? innerW/2 : i * innerW / (n-1));
      var y = padT + (tierY[t] || 1) * innerH;
      return {x:x, y:y, t:t, r:r};
    });
    // Build SVG path
    var pathD = pts.map(function(p,i){return (i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' ');
    // Y axis labels and grid lines for all 7 tiers
    var allTiers = [1,2,3,4,5,6,7];
    var yLabels = allTiers.map(function(t) {
      var y = padT + (tierY[t]||1) * innerH;
      return '<text x="'+(padL-4)+'" y="'+(y+4)+'" text-anchor="end" font-size="9" fill="'+(tierColors[t]||'var(--text3)')+'">'+tierLabels[t]+'</text>';
    }).join('');
    var gridLines = allTiers.map(function(t) {
      var y = padT + (tierY[t]||1) * innerH;
      var dashed = t<=4 ? '' : ' stroke-dasharray="3,3"';
      return '<line x1="'+padL+'" y1="'+y+'" x2="'+(chartW-padR)+'" y2="'+y+'" stroke="var(--border)" stroke-width="0.5"'+dashed+'/>';
    }).join('');
    // Dots with win highlighting
    var dots = pts.map(function(p) {
      var isWin = p.r.finish_position === 1;
      var col = tierColors[p.t] || '#888780';
      var r = isWin ? 5 : 3.5;
      var ring = isWin ? '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="8" fill="none" stroke="'+col+'" stroke-width="1" opacity="0.4"/>' : '';
      return ring+'<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="'+r+'" fill="'+col+'" />';
    }).join('');
    // X axis date labels (first + last + any wins)
    var xLabels = '';
    pts.forEach(function(p, i) {
      var showLabel = i===0 || i===pts.length-1 || p.r.finish_position===1;
      if(showLabel && p.r.date) {
        var d = p.r.date.slice(2).replace(/-/g,'/');
        var anchor = i===0?'start':i===pts.length-1?'end':'middle';
        xLabels += '<text x="'+p.x.toFixed(1)+'" y="'+(chartH-4)+'" text-anchor="'+anchor+'" font-size="9" fill="var(--text3)">'+d+'</text>';
      }
    });
    classChartHtml = '<div class="table-wrap" style="margin-bottom:0">'
      +'<div class="table-header"><span class="table-title">Class progression</span>'
      +'<span class="table-count">'+chronoRows.length+' runs &bull; wins highlighted</span></div>'
      +'<div style="padding:0.75rem 1rem 0.5rem;overflow-x:auto">'
      +'<svg viewBox="0 0 '+chartW+' '+chartH+'" style="width:100%;max-width:'+chartW+'px;display:block" preserveAspectRatio="none">'
      +gridLines+yLabels
      +'<polyline points="'+pts.map(function(p){return p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' ')+'" fill="none" stroke="var(--text3)" stroke-width="1" opacity="0.4"/>'
      +dots+xLabels
      +'</svg>'
      +'<div style="display:flex;flex-wrap:wrap;gap:8px;padding:0 0 0.5rem;font-size:10px">'
      +Object.entries(tierLabels).map(function(e){
        var t=parseInt(e[0]),lbl=e[1];
        var hasRun=chronoRows.some(function(r){return (r.class_tier||7)===t;});
        if(!hasRun) return '';
        return '<span style="display:flex;align-items:center;gap:4px;color:var(--text2)">'
          +'<span style="width:8px;height:8px;border-radius:50%;background:'+(tierColors[t]||'#888')+'"></span>'
          +lbl+'</span>';
      }).join('')
      +'</div>'
      +'</div></div>';
  }

  document.getElementById('profile-content').innerHTML=
    '<div class="profile-wrap">'
    +'<div class="profile-card">'
    +'<div class="profile-badge">'+type.toUpperCase()+'</div>'
    +'<div class="profile-name">'+name+'</div>'
    +'<div style="display:flex;gap:3px;margin-bottom:1rem">'+formLine+'</div>'
    +'<div class="psr"><span class="psl">Starts</span><span class="psv">'+rows.length+'</span></div>'
    +'<div class="psr"><span class="psl">Wins</span><span class="psv" style="color:var(--amber)">'+wins+' ('+winPct+'%)</span></div>'
    +'<div class="psr"><span class="psl">Places (top 3)</span><span class="psv">'+places+' ('+placePct+'%)</span></div>'
    +'<div class="psr"><span class="psl">Avg finish pos</span><span class="psv">'+avgPos+'</span></div>'
    +'<div class="psr"><span class="psl">Best track</span><span class="psv">'+(bestTrack?bestTrack[0]:'--')+'</span></div>'
    +'<div class="psr"><span class="psl">Best distance</span><span class="psv">'+(bestDist?bestDist[0]+'m':'--')+'</span></div>'
    +'<div class="psr"><span class="psl">Best class won</span><span class="psv">'+bestClassBadge+'</span></div>'
    +'<div class="psr"><span class="psl">Career earnings</span><span class="psv" style="color:var(--green)">$'+totalPrize.toLocaleString()+'</span></div>'
    +(daysSince!==null?'<div class="psr"><span class="psl">Days since last run</span><span class="psv">'+daysSince+'</span></div>':'')
    +'</div>'
    +'<div class="profile-right">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:0">'
    +'<div class="table-wrap" style="margin-bottom:0"><div class="table-header"><span class="table-title">Going record</span></div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;padding:1rem">'+goingCards+'</div></div>'
    +classChartHtml
    +'</div>'
    +'<div class="table-wrap" style="margin-bottom:0"><div class="table-header"><span class="table-title">Recent runs</span><span class="table-count">'+rows.length+' total</span></div>'+recentRuns+'</div>'
    +'<div class="table-wrap" style="margin-bottom:0"><div class="table-header"><span class="table-title">Speed record by distance</span></div>'+( Object.keys(timeByDist).length  ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;padding:1rem">'    +Object.entries(timeByDist).sort(function(a,b){return parseInt(a[0])-parseInt(b[0]);}).map(function(e){      var dist=e[0],d=e[1];      var avg=d.count>0?(d.total/d.count):null;      return '<div class="going-card">'        +'<div style="font-size:10px;font-family:var(--fm);color:var(--text3);text-transform:uppercase;margin-bottom:4px">'+dist+'m</div>'        +'<div style="font-family:var(--fm);font-size:16px;font-weight:500;color:var(--green)">'+d.bestRaw+'</div>'        +'<div style="font-size:10px;color:var(--text3);margin-top:2px">best</div>'        +(avg?'<div style="font-family:var(--fm);font-size:13px;color:var(--text2);margin-top:4px">avg: '+secsToDisplay(avg)+'</div>':'')        +'<div style="font-size:10px;color:var(--text3)">'+d.bestDate+' @ '+d.bestTrack+'</div>'        +'</div>';    }).join('')    +'</div>'  : '<div style="padding:1rem;color:var(--text3);font-size:13px">No timed runs recorded</div>')+'</div>'+' '+'<div class="table-wrap" style="margin-bottom:0"><div class="table-header"><span class="table-title">News &amp; Articles</span></div>'
    +'<div style="padding:1rem">'
    +'<a class="news-link" href="https://news.google.com/search?q='+eName+'+NZ+racing+horse" target="_blank" rel="noopener">'
    +'<span class="news-link-icon">&#x1F4F0;</span>'
    +'<div><div style="font-weight:500">Search Google News for &quot;'+name+'&quot;</div><div style="font-size:11px;color:var(--text3);margin-top:2px">Opens latest news in a new tab</div></div>'
    +'<span class="news-link-arrow">&#x2192;</span></a>'
    +'<a class="news-link" href="https://www.loveracing.nz/RaceInfoSearch.aspx?q='+eName+'&amp;s=Current&amp;g=All&amp;r=undefined&amp;t=Name" target="_blank" rel="noopener">'
    +'<span class="news-link-icon">&#x1F3C7;</span>'
    +'<div><div style="font-weight:500">View &quot;'+name+'&quot; on LoveRacing.NZ</div><div style="font-size:11px;color:var(--text3);margin-top:2px">Full form, videos and race history</div></div>'
    +'<span class="news-link-arrow">&#x2192;</span></a>'
    +'</div></div>'
    +'</div></div>';
}

// ---- H2H ----
function loadH2H() {
  var nameA=document.getElementById('h-a').value.trim();
  var nameB=document.getElementById('h-b').value.trim();
  var type=document.getElementById('h-type').value;
  if(!nameA||!nameB){
    document.getElementById('h2h-content').innerHTML='<div class="empty-state"><div class="empty-icon">&#x26A1;</div><div>Enter two names above</div></div>';
    return;
  }
  var rowsA=allResults.filter(function(r){return (r[type]||'').toLowerCase().includes(nameA.toLowerCase());});
  var rowsB=allResults.filter(function(r){return (r[type]||'').toLowerCase().includes(nameB.toLowerCase());});
  if(!rowsA.length||!rowsB.length){
    document.getElementById('h2h-content').innerHTML='<div class="empty-state"><div class="empty-icon">&#x26A1;</div><div>Could not find one or both names</div></div>';
    return;
  }
  var sharedA=rowsA.filter(function(r){return rowsB.some(function(rb){return rb.track===r.track&&rb.date===r.date&&rb.race_name===r.race_name;});});
  var sharedB=rowsB.filter(function(r){return sharedA.some(function(ra){return ra.track===r.track&&ra.date===r.date&&ra.race_name===r.race_name;});});
  var statsA=calcStats(rowsA), statsB=calcStats(rowsB);
  var aWins=0, bWins=0;
  sharedA.forEach(function(ra){
    var rb=sharedB.find(function(r){return r.track===ra.track&&r.date===ra.date&&r.race_name===ra.race_name;});
    if(rb){if(ra.finish_position<rb.finish_position)aWins++;else if(rb.finish_position<ra.finish_position)bWins++;}
  });
  var dispA=rowsA[0]&&rowsA[0][type]||nameA;
  var dispB=rowsB[0]&&rowsB[0][type]||nameB;
  var scoreA=getH2HScore(rowsA), scoreB=getH2HScore(rowsB);
  var ranked=[{horse:dispA,aiScore:scoreA,winPct:statsA.winPct},{horse:dispB,aiScore:scoreB,winPct:statsB.winPct}].sort(function(a,b){return b.aiScore-a.aiScore;});

  var sharedRows='';
  if(sharedA.length){
    sharedRows=sharedA.map(function(ra){
      var rb=sharedB.find(function(r){return r.track===ra.track&&r.date===ra.date&&r.race_name===ra.race_name;});
      var winner=ra.finish_position<(rb?rb.finish_position:99)?dispA:dispB;
      var wc=winner===dispA?'var(--green)':'var(--amber)';
      return '<tr>'
        +'<td class="tv">'+ra.date+'</td>'
        +'<td>'+ra.track+'</td>'
        +'<td class="r-hide" style="font-size:12px;color:var(--text2)">'+ra.race_name+'</td>'
        +'<td class="tv r-hide">'+ra.distance_m+'m</td>'
        +'<td class="tv" style="color:var(--green)">'+ra.finish_position+ord(ra.finish_position)+'</td>'
        +'<td class="tv" style="color:var(--amber)">'+(rb?rb.finish_position+ord(rb.finish_position):'--')+'</td>'
        +'<td style="color:'+wc+';font-weight:500">'+winner.split(' ')[0]+'</td>'
        +'</tr>';
    }).join('');
  }

  document.getElementById('h2h-content').innerHTML=
    aiVerdictHTML(ranked,'head to head')
    +'<div class="table-wrap" style="margin-bottom:1.25rem">'
    +'<div class="vs-banner">'
    +'<div class="vs-text">'+dispA.split(' ')[0]+' vs '+dispB.split(' ')[0]+'</div>'
    +'<div class="vs-record">Direct matchups: <span>'+aWins+'</span> -- '+(sharedA.length-aWins-bWins)+' -- <span>'+bWins+'</span> ('+sharedA.length+' shared races)</div>'
    +'</div>'
    +'<div class="h2h-grid" style="padding:1.25rem">'
    +'<div class="h2h-card"><div class="h2h-name" style="color:var(--green)">'+dispA+'</div>'+renderH2HStats(statsA)+'</div>'
    +'<div class="h2h-card"><div class="h2h-name" style="color:var(--amber)">'+dispB+'</div>'+renderH2HStats(statsB)+'</div>'
    +'</div></div>'
    +(sharedA.length
      ?'<div class="table-wrap" style="margin-bottom:0"><div class="table-header"><span class="table-title">Shared races</span><span class="table-count">'+sharedA.length+' races</span></div>'
        +'<div class="tbl-scroll"><table><thead><tr>'
        +'<th>Date</th><th>Track</th><th class="r-hide">Race</th><th class="r-hide">Dist</th>'
        +'<th style="color:var(--green)">'+dispA.split(' ')[0]+'</th>'
        +'<th style="color:var(--amber)">'+dispB.split(' ')[0]+'</th><th>Winner</th>'
        +'</tr></thead><tbody>'+sharedRows+'</tbody></table></div></div>'
      :'<div class="empty-state" style="padding:2rem"><div>No shared races found</div></div>');
}

function calcStats(rows) {
  var wins=rows.filter(function(r){return r.finish_position===1;}).length;
  var places=rows.filter(function(r){return r.finish_position<=3;}).length;
  var avgPos=(rows.reduce(function(s,r){return s+r.finish_position;},0)/rows.length).toFixed(1);
  var winOdds=rows.filter(function(r){return r.finish_position===1&&r.odds_sp;}).map(function(r){return parseFloat(r.odds_sp);});
  var bestOdds=winOdds.length?Math.min.apply(null,winOdds):null;
  var tw={};
  rows.filter(function(r){return r.finish_position===1;}).forEach(function(r){tw[r.track]=(tw[r.track]||0)+1;});
  var bt=Object.entries(tw).sort(function(a,b){return b[1]-a[1];})[0];
  // Best and avg time
  var timedRows=rows.filter(function(r){return r.finish_time;});
  var timeSecs=timedRows.map(function(r){return {secs:timeToSecs(r.finish_time),raw:r.finish_time,dist:r.distance_m};}).filter(function(x){return x.secs;});
  var bestTime=timeSecs.length?timeSecs.reduce(function(b,x){return x.secs<b.secs?x:b;}):null;
  var avgTimeSecs=timeSecs.length?timeSecs.reduce(function(s,x){return s+x.secs;},0)/timeSecs.length:null;
  return {starts:rows.length,wins:wins,places:places,avgPos:avgPos,
    winPct:(wins/rows.length*100).toFixed(1),placePct:(places/rows.length*100).toFixed(1),
    bestOdds:bestOdds?'$'+bestOdds:'--',bestTrack:bt?bt[0]:'--',
    bestTime:bestTime?bestTime.raw+'  ('+bestTime.dist+'m)':'--',
    avgTime:avgTimeSecs?secsToDisplay(avgTimeSecs):'--'};
}

function renderH2HStats(s) {
  return ['Starts,'+s.starts,'Wins,'+s.wins+' ('+s.winPct+'%),win','Places (top 3),'+s.places+' ('+s.placePct+'%)','Avg finish pos,'+s.avgPos,'Best time,'+s.bestTime,'Avg time,'+s.avgTime,'Best track,'+s.bestTrack].map(function(x){
    var p=x.split(','); var cls=p[2]?'hsv '+p[2]:'hsv';
    return '<div class="hsr"><span class="hsl">'+p[0]+'</span><span class="'+cls+'">'+p[1]+'</span></div>';
  }).join('');
}

// ---- AI SCORING ----
function scoreRunner(runner, track, distance, going) {
  var score=0;

  // 1. Recent form last 5 starts (25pts) - trajectory matters
  var recent=allResults.filter(function(r){return r.horse===runner.horse&&isPlaced(r);})
    .sort(function(a,b){return (b.date||'').localeCompare(a.date||'');}).slice(0,5);
  if(recent.length) {
    var avg=recent.reduce(function(s,r){return s+r.finish_position;},0)/recent.length;
    // Bonus for improving trend
    var trend=0;
    if(recent.length>=3){
      var early=recent.slice(recent.length-2).reduce(function(s,r){return s+r.finish_position;},0)/2;
      var late=recent.slice(0,2).reduce(function(s,r){return s+r.finish_position;},0)/recent.slice(0,2).length;
      trend=early>late?3:0; // improving = bonus
    }
    score+=Math.max(0,25-((avg-1)/9)*25)+trend;
  }

  // 2. Win rate (20pts)
  score+=Math.min((runner.winPct||0)/100*20,20);

  // 3. Speed at distance (18pts) - best time relative to field
  if(distance&&runner.timeStats&&runner.timeStats[distance]) {
    var ts=runner.timeStats[distance];
    // Store on runner for cross-runner comparison later
    runner._bestTimeSecs=ts.best;
    runner._avgTimeSecs=ts.count>0?ts.total/ts.count:null;
    // Raw score placeholder - will be normalised across field in renderFieldComparison
    score+=9; // half marks for having data - normalised bonus added separately
  }

  // 4. Race class quality (12pts)
  var cWins=allResults.filter(function(r){return r.horse===runner.horse&&r.finish_position===1;});
  if(cWins.length){var bt=Math.min.apply(null,cWins.map(function(r){return r.class_tier||7;}));score+=Math.min((CLASS_WIN_BONUS[bt]||0)/25*12,12);}

  // 5. Barrier draw (10pts) - manual entry, so use actual barrier
  var b=runner.barrier||8;
  score+=b===1?10:b<=3?8:b<=6?6:b<=10?4:b<=13?2:1;

  // 6. Going suitability (8pts)
  if(going){var gs=runner.goingStats&&runner.goingStats[going]||{starts:0,wins:0};
    score+=gs.starts>=3?(gs.wins/gs.starts)*8:gs.starts>=1?(gs.wins/gs.starts)*4:0;}

  // 7. Track suitability (5pts)
  if(track){var trs=runner.trackStats&&runner.trackStats[track]||{starts:0,wins:0};
    score+=trs.starts>=2?(trs.wins/trs.starts)*5:trs.starts===1?trs.wins*2.5:0;}

  // 8. Distance suitability (1pt)
  if(distance){var ds=runner.distStats&&runner.distStats[distance]||{starts:0,wins:0};
    score+=ds.starts>=2?(ds.wins/ds.starts)*1:0;}

  // 9. Days since last run (1pt penalty only if very long absence)
  var lastRow=allResults.filter(function(r){return r.horse===runner.horse;})
    .sort(function(a,b){return (b.date||'').localeCompare(a.date||'');})[0];
  if(lastRow&&lastRow.date){var days=Math.floor((Date.now()-new Date(lastRow.date))/(1000*60*60*24));
    if(days>90)score-=Math.min(2,(days-90)/30);}

  return Math.round(Math.max(0,score)*10)/10;
}

function getH2HScore(rows) {
  var wins=rows.filter(function(r){return r.finish_position===1;}).length;
  var winPct=rows.length?wins/rows.length*100:0;
  var ts={},ds={},gs={};
  rows.forEach(function(r){
    if(r.track){if(!ts[r.track]){ts[r.track]={starts:0,wins:0};}ts[r.track].starts++;if(r.finish_position===1)ts[r.track].wins++;}
    if(r.distance_m){var k=String(r.distance_m);if(!ds[k]){ds[k]={starts:0,wins:0};}ds[k].starts++;if(r.finish_position===1)ds[k].wins++;}
    var g=normaliseGoing(r.going);if(g){if(!gs[g]){gs[g]={starts:0,wins:0};}gs[g].starts++;if(r.finish_position===1)gs[g].wins++;}
  });
  return scoreRunner({horse:rows[0]&&rows[0].horse||'',barrier:5,winPct:winPct,trackStats:ts,distStats:ds,goingStats:gs},'','','');
}

function aiVerdictHTML(ranked, context) {
  if(!ranked.length) return '';
  var top=ranked[0];
  var maxScore=Math.max.apply(null,ranked.map(function(r){return r.aiScore;}))||1;
  var ordinals=['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','13th','14th','15th','16th'];
  var rows=ranked.map(function(r,i){
    var col=i===0?'var(--green)':i===1?'var(--amber)':i===2?'var(--text2)':'var(--text3)';
    var ncol=i===0?'var(--green)':i===1?'var(--amber)':'var(--text)';
    var pct=((r.aiScore/maxScore)*100).toFixed(0);
    var fc=i===0?'var(--green)':i===1?'var(--amber)':'var(--text3)';
    return '<div class="ai-row" style="'+(i===0?'background:rgba(126,201,74,0.04)':'')+'">'
      +'<div class="ai-rank" style="color:'+col+'">'+ordinals[i]+'</div>'
      +'<div class="ai-horse"><div class="ai-horse-name" style="color:'+ncol+'">'+(r.horse||r.name)+'</div>'
      +'<div class="ai-horse-meta">score: '+r.aiScore+' / win rate: '+(typeof r.winPct==='number'?r.winPct.toFixed(1):r.winPct)+'%</div></div>'
      +'<div class="ai-bar"><div class="ai-bar-fill" style="width:'+pct+'%;background:'+fc+'"></div></div>'
      +(i===0?'<span class="ai-top">TOP PICK</span>':'')
      +'</div>';
  }).join('');
  return '<div class="ai-verdict">'
    +'<div class="ai-header"><div><div class="ai-label">AI likely winner</div><div class="ai-pick">'+(top.horse||top.name)+'</div></div><div class="ai-ctx">'+context+'</div></div>'
    +rows
    +'<div class="ai-footer">Scoring: recent form (25%) / win rate (20%) / speed at distance (18%) / race class (12%) / barrier (10%) / going (8%) / track (5%) / distance (1%) / days since last run (1%)</div>'
    +'</div>';
}

// ---- FIELD BUILDER ----
function searchHorsesForField() {
  var q=document.getElementById('field-search').value.toLowerCase().trim();
  var c=document.getElementById('field-suggestions');
  if(!q){c.innerHTML='<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:13px">Type to search horses</div>';return;}
  var matches=[...new Set(allResults.map(function(r){return r.horse;}).filter(Boolean))].filter(function(h){return h.toLowerCase().includes(q);}).slice(0,20);
  if(!matches.length){c.innerHTML='<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:13px">No horses found</div>';return;}
  c.innerHTML=matches.map(function(horse){
    var rows=allResults.filter(function(r){return r.horse===horse;});
    var wins=rows.filter(function(r){return r.finish_position===1;}).length;
    var already=fieldRunners.some(function(r){return r.horse===horse;});
    var full=fieldRunners.length>=MAX_RUNNERS;
    var pct=rows.length?(wins/rows.length*100).toFixed(0):0;
    return '<div class="hsi">'
      +'<div><div class="hsi-name">'+horse+'</div><div class="hsi-meta">'+rows.length+' starts / '+wins+'W / '+pct+'%</div></div>'
      +'<button class="add-btn '+(already?'added':'')+'" data-horse="'+horse.replace(/"/g,'&quot;')+'" title="'+(already?'Already added':full?'Field full':'Add')+'">'+(already?'&#x2713;':'+')+'</button>'
      +'</div>';
  }).join('');
  c.querySelectorAll('.add-btn:not(.added)').forEach(function(btn){
    btn.addEventListener('click',function(){addToField(this.dataset.horse);});
  });
}

function addToField(horseName) {
  if(fieldRunners.length>=MAX_RUNNERS||fieldRunners.some(function(r){return r.horse===horseName;})) return;
  var rows=allResults.filter(function(r){return r.horse===horseName;});
  rows.sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
  var wins=rows.filter(function(r){return r.finish_position===1;}).length;
  var places=rows.filter(function(r){return r.finish_position<=3;}).length;
  var avgPos=rows.length?(rows.reduce(function(s,r){return s+r.finish_position;},0)/rows.length).toFixed(1):0;
  var winPct=rows.length?wins/rows.length*100:0;
  var placePct=rows.length?places/rows.length*100:0;
  var ts={},ds={},gs={};
  rows.forEach(function(r){
    if(r.track){if(!ts[r.track]){ts[r.track]={starts:0,wins:0};}ts[r.track].starts++;if(r.finish_position===1)ts[r.track].wins++;}
    if(r.distance_m){var k=String(r.distance_m);if(!ds[k]){ds[k]={starts:0,wins:0};}ds[k].starts++;if(r.finish_position===1)ds[k].wins++;}
    var g=normaliseGoing(r.going);if(g){if(!gs[g]){gs[g]={starts:0,wins:0};}gs[g].starts++;if(r.finish_position===1)gs[g].wins++;}
  });
  var form=rows.slice(0,5).map(function(r){return r.finish_position;}).join('-');
  // Time stats and speed figures by distance
  var timeStats={};
  var speedFigStats={};  // best speed figure per distance
  rows.forEach(function(r){
    if(!r.distance_m) return;
    // Speed figures
    var fig=getSpeedFig(r.horse,r.date,r.distance_m);
    if(fig!==null){
      var k=String(r.distance_m);
      if(!speedFigStats[k]||fig>speedFigStats[k].best) speedFigStats[k]={best:fig,count:0,total:0};
      speedFigStats[k].count++;
      speedFigStats[k].total+=fig;
    }
    // Raw times
    if(!r.finish_time) return;
    var secs=timeToSecs(r.finish_time); if(!secs) return;
    var dk=String(r.distance_m);
    if(!timeStats[dk]) timeStats[dk]={best:secs,total:0,count:0};
    if(secs<timeStats[dk].best) timeStats[dk].best=secs;
    timeStats[dk].total+=secs; timeStats[dk].count++;
  });
  // Career best speed figure overall
  var careerBestFig=null;
  Object.values(speedFigStats).forEach(function(s){if(careerBestFig===null||s.best>careerBestFig)careerBestFig=s.best;});
  fieldRunners.push({horse:horseName,barrier:fieldRunners.length+1,trainer:rows[0]&&rows[0].trainer||'--',
    starts:rows.length,wins:wins,places:places,winPct:winPct,placePct:placePct,avgPos:parseFloat(avgPos)||0,
    trackStats:ts,distStats:ds,goingStats:gs,timeStats:timeStats,speedFigStats:speedFigStats,careerBestFig:careerBestFig,form:form,color:RUNNER_COLORS[fieldRunners.length%RUNNER_COLORS.length]});
  renderFieldRunners();renderFieldComparison();searchHorsesForField();
}

function removeFromField(horse) {
  fieldRunners=fieldRunners.filter(function(r){return r.horse!==horse;});
  fieldRunners.forEach(function(r,i){r.barrier=i+1;});
  renderFieldRunners();renderFieldComparison();searchHorsesForField();
}

function clearField(){fieldRunners=[];renderFieldRunners();renderFieldComparison();searchHorsesForField();}

function renderFieldRunners() {
  document.getElementById('field-count').textContent=fieldRunners.length+' / '+MAX_RUNNERS;
  var body=document.getElementById('field-runners-body');
  if(!fieldRunners.length){body.innerHTML='<div class="field-empty">No runners added -- search horses on the left</div>';return;}
  // Wire barrier inputs after DOM update
  function wireBarrierInputs(){
    document.querySelectorAll('.barrier-input').forEach(function(inp){
      inp.addEventListener('change',function(){
        var horse=this.dataset.horse;
        var val=Math.max(1,Math.min(24,parseInt(this.value)||1));
        this.value=val;
        var runner=fieldRunners.find(function(r){return r.horse===horse;});
        if(runner){runner.barrier=val;renderFieldComparison();}
      });
    });
  }
  setTimeout(wireBarrierInputs,50);
  body.innerHTML=fieldRunners.map(function(r,i){
    var formDots=r.form?r.form.split('-').map(function(p){var n=parseInt(p);var cls=n===1?'fd-1':n===2?'fd-2':n===3?'fd-3':'fd-o';return '<div class="form-dot '+cls+'" style="width:18px;height:18px;font-size:10px">'+p+'</div>';}).join(''):'';
    var hn=r.horse.replace(/'/g,"\\'");
    return '<div class="runner-row">'
      +'<div class="runner-num" style="color:'+r.color+'">'+String(i+1).padStart(2,'0')+'</div>'
      +'<input type="number" min="1" max="24" value="'+r.barrier+'" class="barrier-input" data-horse="'+r.horse+'" style="width:38px;padding:4px;text-align:center;font-family:var(--fm);font-size:12px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text)">'
      +'<div><div class="runner-name">'+r.horse+'</div><div class="runner-sub">'+r.trainer+'</div></div>'
      +'<div class="runner-stat rh">'+r.starts+'</div>'
      +'<div class="runner-stat rh" style="color:var(--amber)">'+r.wins+'</div>'
      +'<div class="runner-stat rh" style="color:'+(r.winPct>=20?'var(--green)':r.winPct>=10?'var(--amber)':'var(--text2)')+'">'+r.winPct.toFixed(1)+'%</div>'
      +'<div class="runner-stat rh" style="display:flex;justify-content:flex-end;gap:2px">'+formDots+'</div>'
      +'<button class="remove-btn" onclick="removeFromField(\''+hn+'\')">&#x00D7;</button>'
      +'</div>';
  }).join('');
}

function renderFieldComparison() {
  var wrap=document.getElementById('field-comparison-wrap');
  if(fieldRunners.length<2){wrap.style.display='none';return;}
  wrap.style.display='block';
  var distance=document.getElementById('field-distance').value;
  var track=document.getElementById('field-track').value;
  var going=document.getElementById('field-going').value;
  var scored=fieldRunners.map(function(r){return Object.assign({},r,{aiScore:scoreRunner(r,track,distance,going)});});

  // Normalise speed score across the field (18pts for fastest, 0 for no data)
  if(distance) {
    var timers=scored.filter(function(r){return r._bestTimeSecs;});
    if(timers.length>=2) {
      var fastest=Math.min.apply(null,timers.map(function(r){return r._bestTimeSecs;}));
      var slowest=Math.max.apply(null,timers.map(function(r){return r._bestTimeSecs;}));
      var range=slowest-fastest||1;
      scored.forEach(function(r){
        if(r._bestTimeSecs) {
          // Replace placeholder 9pts with normalised 0-18pts (faster = more)
          r.aiScore = r.aiScore - 9 + ((slowest-r._bestTimeSecs)/range)*18;
          r.aiScore = Math.round(Math.max(0,r.aiScore)*10)/10;
        }
      });
    }
  }

  var ranked=scored.sort(function(a,b){return b.aiScore-a.aiScore;});
  var ctx=[];if(track)ctx.push(track);if(distance)ctx.push(distance+'m');if(going)ctx.push(going);
  document.getElementById('field-ai-verdict').innerHTML=aiVerdictHTML(ranked,ctx.join(' / ')||'all conditions');
  var maxWin=Math.max.apply(null,fieldRunners.map(function(r){return r.winPct;}).concat([1]));
  document.getElementById('field-winrate-bars').innerHTML=fieldRunners.slice().sort(function(a,b){return b.winPct-a.winPct;}).map(function(r){return ratingBar(r.horse,r.winPct,maxWin,r.color,r.winPct.toFixed(1)+'%');}).join('');
  var maxPlace=Math.max.apply(null,fieldRunners.map(function(r){return r.placePct;}).concat([1]));
  document.getElementById('field-placerate-bars').innerHTML=fieldRunners.slice().sort(function(a,b){return b.placePct-a.placePct;}).map(function(r){return ratingBar(r.horse,r.placePct,maxPlace,r.color,r.placePct.toFixed(1)+'%');}).join('');
  var maxAvg=Math.max.apply(null,fieldRunners.map(function(r){return r.avgPos;}).concat([1]));
  document.getElementById('field-avgpos-bars').innerHTML=fieldRunners.slice().sort(function(a,b){return a.avgPos-b.avgPos;}).map(function(r){return ratingBar(r.horse,maxAvg-r.avgPos+1,maxAvg,r.color,String(r.avgPos));}).join('');
  document.getElementById('field-dist-label').textContent=distance?distance+'m':'select a distance';
  if(distance){
    var dd=fieldRunners.map(function(r){var ds=r.distStats&&r.distStats[distance]||{starts:0,wins:0};return Object.assign({},r,{dw:ds.starts?(ds.wins/ds.starts*100).toFixed(1):0,ds:ds.starts});});
    var mx=Math.max.apply(null,dd.map(function(r){return parseFloat(r.dw);}).concat([1]));
    document.getElementById('field-distance-bars').innerHTML=dd.slice().sort(function(a,b){return b.dw-a.dw;}).map(function(r){return ratingBar(r.horse,parseFloat(r.dw),mx,r.color,r.ds?r.dw+'% ('+r.ds+')':'no data');}).join('');
  } else document.getElementById('field-distance-bars').innerHTML='<div class="no-pad">Select a distance above</div>';
  document.getElementById('field-track-label').textContent=track||'select a track';
  if(track){
    var td=fieldRunners.map(function(r){var ts=r.trackStats&&r.trackStats[track]||{starts:0,wins:0};return Object.assign({},r,{tw:ts.starts?(ts.wins/ts.starts*100).toFixed(1):0,ts:ts.starts});});
    var mx2=Math.max.apply(null,td.map(function(r){return parseFloat(r.tw);}).concat([1]));
    document.getElementById('field-track-bars').innerHTML=td.slice().sort(function(a,b){return b.tw-a.tw;}).map(function(r){return ratingBar(r.horse,parseFloat(r.tw),mx2,r.color,r.ts?r.tw+'% ('+r.ts+')':'no data');}).join('');
  } else document.getElementById('field-track-bars').innerHTML='<div class="no-pad">Select a track above</div>';
  document.getElementById('field-going-label').textContent=going||'select going';
  if(going){
    var gd=fieldRunners.map(function(r){var gs=r.goingStats&&r.goingStats[going]||{starts:0,wins:0};return Object.assign({},r,{gw:gs.starts?(gs.wins/gs.starts*100).toFixed(1):0,gs:gs.starts});});
    var mx3=Math.max.apply(null,gd.map(function(r){return parseFloat(r.gw);}).concat([1]));
    document.getElementById('field-going-bars').innerHTML=gd.slice().sort(function(a,b){return b.gw-a.gw;}).map(function(r){return ratingBar(r.horse,parseFloat(r.gw),mx3,r.color,r.gs?r.gw+'% ('+r.gs+')':'no data');}).join('');
  } else document.getElementById('field-going-bars').innerHTML='<div class="no-pad">Select going above</div>';

  // Speed figure bars - career best and at selected distance
  var sfSection=document.getElementById('field-sf-section');
  if(!sfSection){
    sfSection=document.createElement('div');
    sfSection.id='field-sf-section';
    document.getElementById('field-comparison-wrap').appendChild(sfSection);
  }
  var sfRunners=fieldRunners.filter(function(r){return r.careerBestFig!==null;});
  if(sfRunners.length>=2){
    var maxSF=Math.max.apply(null,sfRunners.map(function(r){return r.careerBestFig;}));
    var minSF=Math.min.apply(null,sfRunners.map(function(r){return r.careerBestFig;}));
    var sfHtml='<div class="table-header" style="border-top:1px solid var(--border)"><span class="table-title">Speed figures (career best)</span><span class="table-count">100 = track par</span></div>'
      +sfRunners.slice().sort(function(a,b){return b.careerBestFig-a.careerBestFig;}).map(function(r){
        return ratingBar(r.horse,r.careerBestFig,maxSF,r.color,'SF '+r.careerBestFig);
      }).join('');

    if(distance){
      var sfDist=fieldRunners.map(function(r){
        var sf=r.speedFigStats&&r.speedFigStats[distance];
        return Object.assign({},r,{distSF:sf?sf.best:null,distSFAvg:sf&&sf.count>0?sf.total/sf.count:null});
      }).filter(function(r){return r.distSF!==null;});
      if(sfDist.length>=2){
        var maxDSF=Math.max.apply(null,sfDist.map(function(r){return r.distSF;}));
        sfHtml+='<div class="table-header" style="border-top:1px solid var(--border)"><span class="table-title">Speed figures at '+distance+'m</span></div>'
          +sfDist.slice().sort(function(a,b){return b.distSF-a.distSF;}).map(function(r){
            return ratingBar(r.horse,r.distSF,maxDSF,r.color,'SF '+r.distSF+(r.distSFAvg?' (avg '+r.distSFAvg.toFixed(0)+')':''));
          }).join('');
      }
    }
    sfSection.innerHTML=sfHtml;
  } else {
    sfSection.innerHTML='';
  }

  // Speed bars - best and avg time at selected distance
  if(distance){
    var speedData=fieldRunners.map(function(r){
      var ts=r.timeStats&&r.timeStats[distance];
      return {horse:r.horse,color:r.color,
        best:ts?ts.best:null,
        avg:ts&&ts.count>0?ts.total/ts.count:null,
        count:ts?ts.count:0};
    });
    var hasAny=speedData.some(function(x){return x.best;});
    if(hasAny){
      // Best time - lower is better, invert for bar
      var maxBest=Math.max.apply(null,speedData.filter(function(x){return x.best;}).map(function(x){return x.best;}));
      var minBest=Math.min.apply(null,speedData.filter(function(x){return x.best;}).map(function(x){return x.best;}));
      if(!document.getElementById('field-speed-section')){
        var speedDiv=document.createElement('div');
        speedDiv.id='field-speed-section';
        document.getElementById('field-comparison-wrap').appendChild(speedDiv);
      }
      var speedHtml=
        '<div class="table-header" style="border-top:1px solid var(--border)"><span class="table-title">Best time at '+distance+'m</span><span class="table-count">lower is faster</span></div>'
        +'<div id="field-best-time-bars">'
        +speedData.slice().sort(function(a,b){return (a.best||999)-(b.best||999);}).map(function(r){
          var pct=r.best?(maxBest-r.best+0.5)/(maxBest-minBest+0.5)*100:0;
          return ratingBar(r.horse,pct,100,r.color,r.best?secsToDisplay(r.best):'no data');
        }).join('')
        +'</div>'
        +'<div class="table-header" style="border-top:1px solid var(--border)"><span class="table-title">Avg time at '+distance+'m</span></div>'
        +'<div id="field-avg-time-bars">'
        +speedData.slice().sort(function(a,b){return (a.avg||999)-(b.avg||999);}).map(function(r){
          var pct=r.avg?(maxBest-r.avg+0.5)/(maxBest-minBest+0.5)*100:0;
          return ratingBar(r.horse,pct,100,r.color,r.avg?secsToDisplay(r.avg)+' ('+r.count+'r)':'no data');
        }).join('')
        +'</div>';
      document.getElementById('field-speed-section').innerHTML=speedHtml;
    }
  } else {
    var ss=document.getElementById('field-speed-section');
    if(ss) ss.innerHTML='';
  }

  // Pace map - append after speed section
  var pmSection = document.getElementById('field-pace-section');
  if(!pmSection) {
    pmSection = document.createElement('div');
    pmSection.id = 'field-pace-section';
    document.getElementById('field-comparison-wrap').appendChild(pmSection);
  }
  pmSection.innerHTML = renderPaceMap(fieldRunners);
}

function ratingBar(name,val,max,color,label){
  var pct=max>0?Math.min(val/max*100,100):0;
  return '<div class="rating-bar">'
    +'<div class="rating-name" title="'+name+'">'+name+'</div>'
    +'<div class="rating-track"><div class="rating-fill" style="width:'+pct.toFixed(0)+'%;background:'+color+';color:#0b0c0b">'+(pct>18?label:'')+'</div></div>'
    +'<div class="rating-val">'+(pct<=18?label:'')+'</div>'
    +'</div>';
}


// ---- RACE FIELD MODAL ----
function getRaceKey(r) {
  return (r.track||'') + '|' + (r.date||'') + '|' + (r.race_number||'');
}

function openRace(track, date, raceNum) {
  var key = track+'|'+date+'|'+raceNum;
  var runners = allResults.filter(function(r){ return getRaceKey(r)===key; });
  if(!runners.length) return;
  runners.sort(function(a,b){ return (a.finish_position||99)-(b.finish_position||99); });
  var r0=runners[0];
  var raceName=(r0.race_name&&r0.race_name.trim())||('Race '+raceNum);
  var going=r0.going?'<span class="going-badge '+goingClass(r0.going)+'">'+normaliseGoing(r0.going)+'</span>':'';
  var classBadge=getClassBadge(r0.race_name,r0.race_class,r0.prize_money);
  var winnerTime=runners[0].finish_time||'--';

  var rows=runners.map(function(r){
    var p=r.finish_position;
    var pc=p===1?'pos-1':p===2?'pos-2':p===3?'pos-3':'pos-other';
    var unplaced = !r.finish_time && !r.odds_sp;
    var rowStyle = unplaced ? ' style="opacity:0.5"' : '';
    var posDisplay = unplaced
      ? '<span style="font-size:10px;font-family:var(--fm);color:var(--text3);padding:2px 6px;background:var(--bg3);border-radius:4px">UNPLACED</span>'
      : '<span class="pos-badge '+pc+'">'+p+'</span>';
    return '<tr'+rowStyle+'>'
      +'<td>'+posDisplay+'</td>'
      +'<td class="tv" style="color:var(--text3)">'+(r.barrier||'--')+'</td>'
      +'<td><span class="horse-link modal-horse" data-name="'+(r.horse||'')+'" data-type="horse">'+( r.horse||'--')+'</span></td>'
      +'<td><span class="horse-link modal-horse" data-name="'+(r.jockey||'')+'" data-type="jockey">'+( r.jockey||'--')+'</span></td>'
      +'<td class="tv" style="color:var(--green)">'+(r.finish_time||'--')+'</td>'
      +'<td class="tv" style="color:var(--text3)">'+(unplaced?'--':p===1?'Winner':(r.margin_trad||'--'))+'</td>'
      +'<td class="tv odds">'+(r.odds_sp?'$'+r.odds_sp:'--')+'</td>'
      +'<td>'+(r.prize_money?'$'+r.prize_money.toLocaleString():'--')+'</td>'
      +'</tr>';
  }).join('');

  var html=
    '<div class="modal-header">'
    +'<div>'
    +'<div class="modal-title">'+raceName+'</div>'
    +'<div class="modal-meta">'+track+' &bull; '+date+' &bull; '+(r0.distance_m?r0.distance_m+'m':'')+'  '+going+' '+classBadge+'</div>'
    +'</div>'
    +'<button class="modal-close" onclick="closeModal()">&#x00D7;</button>'
    +'</div>'
    +'<div class="modal-stats">'
    +'<div class="modal-stat"><div class="modal-stat-label">Runners</div><div class="modal-stat-val">'+runners.length+'</div></div>'
    +'<div class="modal-stat"><div class="modal-stat-label">Distance</div><div class="modal-stat-val">'+(r0.distance_m?r0.distance_m+'m':'--')+'</div></div>'
    +'<div class="modal-stat"><div class="modal-stat-label">Winner time</div><div class="modal-stat-val" style="color:var(--green)">'+winnerTime+'</div></div>'
    +'<div class="modal-stat"><div class="modal-stat-label">Total prize</div><div class="modal-stat-val">$'+runners.reduce(function(s,r){return s+(r.prize_money||0);},0).toLocaleString()+'</div></div>'
    +'</div>'
    +'<div class="tbl-scroll">'
    +'<table><thead><tr>'
    +'<th>Pos</th><th>Bar</th><th>Horse</th><th>Jockey</th>'
    +'<th>Time</th><th>Margin</th><th>SP</th><th>Prize</th>'
    +'</tr></thead><tbody>'+rows+'</tbody></table>'
    +'</div>';

  var modal=document.getElementById('race-modal');
  document.getElementById('race-modal-body').innerHTML=html;
  modal.classList.add('open');
  document.body.style.overflow='hidden';
}

function closeModal() {
  document.getElementById('race-modal').classList.remove('open');
  document.body.style.overflow='';
}


// ---- HOME PAGE ----
function renderHome() {
  // Stat pills
  var s = window.RACING_DATA && window.RACING_DATA.summary || {};
  document.getElementById('home-races').textContent = (s.total_races||allResults.length).toLocaleString();
  document.getElementById('home-horses').textContent = (s.total_horses||0).toLocaleString();
  document.getElementById('home-updated').textContent = s.exported_at||'--';

  // Latest 3 races - find 3 most recent unique race groups
  var seen = {};
  var latestRaces = [];
  var sorted = allResults.filter(isPlaced).slice(); // already sorted by date desc
  for(var i=0; i<sorted.length && latestRaces.length<3; i++) {
    var r = sorted[i];
    var key = getRaceKey(r);
    if(!seen[key] && r.finish_position===1) {
      seen[key] = true;
      var allRunners = allResults.filter(function(x){ return getRaceKey(x)===key; });
      latestRaces.push({winner:r, runners:allRunners});
    }
  }

  document.getElementById('home-latest-races').innerHTML = latestRaces.map(function(race) {
    var w = race.winner;
    var classBadge = getClassBadge(w.race_name, w.race_class, w.prize_money);
    var going = w.going ? '<span class="going-badge '+goingClass(w.going)+'">'+normaliseGoing(w.going)+'</span>' : '';
    var raceLabel = (w.race_name&&w.race_name.trim()) || ('Race '+w.race_number);
    return '<div class="home-race-card" data-track="'+( w.track||'')+'" data-date="'+(w.date||'')+'" data-racenum="'+(w.race_number||'')+'">'
      +'<div class="home-race-header">'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'<span class="home-race-title">'+( w.track||'--')+' &bull; R'+w.race_number+'</span>'
      +classBadge
      +'</div>'
      +'<span class="home-race-meta">'+( w.date||'--')+' &bull; '+(w.distance_m?w.distance_m+'m':'')+' '+going+'</span>'
      +'</div>'
      +'<div class="home-winner">'
      +'<div class="home-winner-pos">1</div>'
      +'<div class="home-winner-info">'
      +'<div class="home-winner-name">'+( w.horse||'--')+'</div>'
      +'<div class="home-winner-detail">'+( w.jockey||'--')+'</div>'
      +'</div>'
      +'<div class="home-winner-time">'+( w.finish_time||'--')+'</div>'
      +'</div>'
      +'</div>';
  }).join('');

  // Wire race card clicks
  document.querySelectorAll('.home-race-card').forEach(function(card){
    card.addEventListener('click', function(){
      openRace(this.dataset.track, this.dataset.date, parseInt(this.dataset.racenum));
    });
  });

  // Top 5 leaderboards
  function buildLeaderboard(field, limit) {
    var grouped = {};
    allResults.filter(isPlaced).forEach(function(r){
      var key = r[field]; if(!key) return;
      if(!grouped[key]) grouped[key]={name:key,wins:0,starts:0};
      grouped[key].starts++;
      if(r.finish_position===1) grouped[key].wins++;
    });
    return Object.values(grouped).sort(function(a,b){return b.wins-a.wins;}).slice(0,limit||5);
  }

  var horses  = buildLeaderboard('horse',5);
  var jockeys = buildLeaderboard('jockey',5);
  var trainers= buildLeaderboard('trainer',5);

  function leaderboardRows(data, type) {
    return data.map(function(d,i){
      var n=d.name.replace(/'/g,"\'");
      return '<div class="home-lb-row">'
        +'<span class="home-lb-rank">'+(i+1)+'</span>'
        +'<span class="home-lb-name" data-name="'+d.name+'" data-type="'+type+'">'+d.name+'</span>'
        +'<span class="home-lb-wins">'+d.wins+'W</span>'
        +'<span class="home-lb-starts">'+d.starts+' starts</span>'
        +'</div>';
    }).join('');
  }

  document.getElementById('home-top-horses').innerHTML  = leaderboardRows(horses,'horse');
  document.getElementById('home-top-jockeys').innerHTML = leaderboardRows(jockeys,'jockey');
  document.getElementById('home-top-trainers').innerHTML= leaderboardRows(trainers,'trainer');

  // Wire leaderboard name clicks
  document.querySelectorAll('.home-lb-name').forEach(function(el){
    el.addEventListener('click', function(){
      openProfile(this.dataset.name, this.dataset.type);
    });
  });
}

// ---- PAGES ----
function showPage(name) {
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.nav-tab,.bnav-tab').forEach(function(t){t.classList.remove('active');});
  var el = document.getElementById('page-'+name);
  if(el) el.classList.add('active');
  var pages=['home','results','trends','h2h','profile','field'];
  var idx=pages.indexOf(name);
  document.querySelectorAll('.nav-tab').forEach(function(t,i){if(i===idx) t.classList.add('active');});
  document.querySelectorAll('.bnav-tab').forEach(function(t,i){if(i===idx-1) t.classList.add('active');});
  if(name==='home') renderHome();
  if(name==='trends') loadTrends();
  window.scrollTo({top:0,behavior:'smooth'});
}

// ---- MOCK DATA ----
function generateMockData() {
  var horses=['Wine Rocs','Hell Island (AUS)','Dink','Armagh','Purosangue','Happy Traveller','Brutal Reality','Geneva Queen','Omega Boy','Silver Flash','Dark Matter','Coastal Dream','Thunder Ridge','Morning Star','Pacific Gem','Iron Will'];
  var jockeys=['Jack Taplin','Corentin Berge','Sam McNab','Elen Nicholas','Hayley Hassman','Rihaan Goyaram','Joe Nishizuka','Courtney Barnes'];
  var trainers=['Debbie Sweeney','Chris Wood','Ben & Ryan Foote','Danny Walker','Lance O\'Sullivan','Ralph Manning'];
  var tracks=['Te Aroha','Ellerslie','Trentham','Riccarton','Hastings','Awapuni'];
  var races=['Maiden 1150','BM65 1400','BM72 1600','Open 2000','Gr.3 1400','Stakes 1200'];
  var goings=['Good','Soft','Heavy','Slow'];
  var data=[]; var now=new Date();
  for(var i=0;i<800;i++){
    var daysAgo=Math.floor(Math.random()*90);
    var d=new Date(now); d.setDate(d.getDate()-daysAgo);
    var pos=Math.floor(Math.random()*12)+1;
    data.push({finish_position:pos,
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
      finish_time:pos<=10?'1.'+String(Math.floor(Math.random()*20)+35).padStart(2,'0')+'.'+String(Math.floor(Math.random()*99)).padStart(2,'0'):'',
      margin_trad:pos===1?'':['1/2 LEN','1 LEN','2 LEN','NOSE','NECK','HEAD'][Math.floor(Math.random()*6)],
      prize_money:pos===1?14375:pos===2?4625:pos===3?2250:375,
      race_class:pos<=3?'MDN':'BM65'});
  }
  return data;
}

init();


// ---- STABLEFORM AUTH (trainer-owner portal) ----
var SF_API = '/stableform-api';
var sfToken = null;
var sfUser = null;

function openSFLogin() {
  document.getElementById('sf-login-modal').style.display = 'flex';
  document.getElementById('sf-login-error').style.display = 'none';
  setTimeout(function(){ document.getElementById('sf-email').focus(); }, 100);
}

function closeSFLogin() {
  document.getElementById('sf-login-modal').style.display = 'none';
}

function openSFDashboard() {
  document.getElementById('sf-dashboard-modal').style.display = 'flex';
  renderSFDashboard();
}

function closeSFDashboard() {
  document.getElementById('sf-dashboard-modal').style.display = 'none';
}

async function sfLogin() {
  var email = document.getElementById('sf-email').value.trim();
  var password = document.getElementById('sf-password').value;
  var errEl = document.getElementById('sf-login-error');
  errEl.style.display = 'none';
  if(!email || !password) {
    errEl.textContent = 'Please enter your email and password.';
    errEl.style.display = 'block';
    return;
  }
  try {
    var res = await fetch(SF_API + '/auth/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email:email, password:password})
    });
    var data = await res.json();
    if(!res.ok) throw new Error(data.detail || 'Login failed');
    sfToken = data.token;
    sfUser = data;
    localStorage.setItem('sf_token', data.token);
    localStorage.setItem('sf_user', JSON.stringify(data));
    closeSFLogin();
    updateSFNav();
    openSFDashboard();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

function sfLogout() {
  sfToken = null;
  sfUser = null;
  localStorage.removeItem('sf_token');
  localStorage.removeItem('sf_user');
  updateSFNav();
  closeSFDashboard();
}

function updateSFNav() {
  var signInBtn = document.getElementById('sf-signin-btn');
  var userPill = document.getElementById('sf-user-pill');
  if(sfUser) {
    signInBtn.style.display = 'none';
    userPill.style.display = 'flex';
    document.getElementById('sf-user-name').textContent = sfUser.name;
    document.getElementById('sf-user-role').textContent = sfUser.role;
    var hdr = document.getElementById('sf-dropdown-user');
    if(hdr) hdr.textContent = sfUser.name + ' (' + sfUser.role + ')';
  } else {
    signInBtn.style.display = 'block';
    userPill.style.display = 'none';
    closeSFMenu();
  }
}

function toggleSFMenu(e) {
  e.stopPropagation();
  var dd = document.getElementById('sf-dropdown');
  dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function closeSFMenu() {
  var dd = document.getElementById('sf-dropdown');
  if(dd) dd.style.display = 'none';
}

function sfNavigate(view) {
  closeSFMenu();
  document.getElementById('sf-dashboard-modal').style.display = 'flex';
  if(sfUser && sfUser.role === 'admin') {
    sfShowAdminDashboard();
  } else if(view === 'horses') {
    sfShowMyHorses();
  } else if(view === 'feed') {
    sfShowUpdatesFeed();
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', function() { closeSFMenu(); });

async function sfApiGet(path) {
  var res = await fetch(SF_API + path, {
    headers: {'Authorization': 'Bearer ' + sfToken}
  });
  var data = await res.json();
  if(!res.ok) throw new Error(data.detail || 'Error');
  return data;
}

async function renderSFDashboard() {
  sfShowMyHorses();
}

async function renderSFDashboardFull() {
  var el = document.getElementById('sf-dashboard-content');
  if(!sfUser) { el.innerHTML = '<div style="text-align:center;padding:2rem;color:#8a857a">Not logged in</div>'; return; }
  el.innerHTML = '<div style="text-align:center;padding:2rem;color:#8a857a">Loading...</div>';
  try {
    var role = sfUser.role;
    if(role === 'admin') {
      sfShowAdminDashboard();
      return;
    } else if(role === 'trainer') {
      var horses = await sfApiGet('/trainer/horses');
      el.innerHTML = '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1rem">My stable</div>'
        + '<div style="text-align:right;margin-bottom:1rem"><button id="sf-add-horse-btn" style="background:#1a1a18;color:#c9a84c;border:none;border-radius:8px;padding:.5rem 1rem;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">+ Add horse</button></div>'
        + (horses.length === 0
          ? '<div style="text-align:center;padding:2rem;color:#8a857a">No horses yet. Click above to add your first horse.</div>'
          : '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem">'
          + horses.map(function(h){
            return '<div style="background:white;border:1px solid rgba(26,26,24,.12);border-radius:10px;padding:1rem;cursor:pointer" data-hid="'+h.id+'" data-hname="'+h.name+'" onclick="sfViewHorse(this.dataset.hid,this.dataset.hname)">'
              + '<div style="font-family:Georgia,serif;font-size:16px;font-weight:700;margin-bottom:.25rem">' + h.name + '</div>'
              + '<div style="font-size:12px;color:#8a857a;margin-bottom:.75rem">' + (h.colour||'') + (h.colour&&h.sex?' &bull; ':'') + (h.sex||'') + '</div>'
              + '<div style="font-size:12px;color:#6b7c5c;font-weight:500">' + h.owner_count + ' owner' + (h.owner_count!==1?'s':'') + '</div>'
              + '</div>';
          }).join('') + '</div>');
    // Add horse button listener for trainer
    var addHorseBtn = document.getElementById('sf-add-horse-btn');
    if(addHorseBtn) addHorseBtn.addEventListener('click', function(){ sfShowAddHorseForm(); });
    } else {
      var horses = await sfApiGet('/owner/horses');
      el.innerHTML = '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1rem">My horses</div>'
        + (horses.length === 0
          ? '<div style="text-align:center;padding:2rem;color:#8a857a">No horses yet. Check your email for an invite.</div>'
          : '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem">'
          + horses.map(function(h){
            return '<div style="background:white;border:1px solid rgba(26,26,24,.12);border-radius:10px;padding:1rem;cursor:pointer" data-hid="'+h.id+'" data-hname="'+h.name+'" onclick="sfViewHorse(this.dataset.hid,this.dataset.hname)">'
              + '<div style="font-family:Georgia,serif;font-size:16px;font-weight:700;margin-bottom:.25rem">' + h.name + '</div>'
              + '<div style="font-size:12px;color:#8a857a">Trainer: ' + h.trainer_name + '</div>'
              + '</div>';
          }).join('') + '</div>');
    }
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:2rem;color:#a85c3a">Error: ' + e.message + '</div>';
  }
}



async function sfShowMyHorses() {
  var el = document.getElementById('sf-dashboard-content');
  el.innerHTML = '<div style="text-align:center;padding:2rem;color:#8a857a">Loading...</div>';
  try {
    var role = sfUser.role;
    var horses = role === 'owner'
      ? await sfApiGet('/owner/horses')
      : await sfApiGet('/trainer/horses');
    var isTrainer = role === 'trainer' || role === 'admin';

    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem">'
      + '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">My horses</div>'
      + (isTrainer ? '<button id="sf-add-horse-btn2" style="background:#1a1a18;color:#c9a84c;border:none;border-radius:8px;padding:.5rem 1rem;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">+ Add horse</button>' : '')
      + '</div>';

    if(horses.length === 0) {
      html += '<div style="text-align:center;padding:3rem;color:#8a857a">'
        + '<div style="font-size:40px;margin-bottom:1rem;opacity:.3">&#x1F40E;</div>'
        + '<div style="font-size:15px;font-weight:500;color:#1a1a18;margin-bottom:.5rem">No horses yet</div>'
        + '<div style="font-size:13px">' + (isTrainer ? 'Add your first horse above' : 'Your trainer will invite you to your horses') + '</div>'
        + '</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem">';
      horses.forEach(function(h) {
        html += '<div class="sf-horse-tile" data-hid="' + h.id + '" data-hname="' + h.name + '">'
          + '<div style="font-family:Georgia,serif;font-size:17px;font-weight:700;margin-bottom:.25rem">' + h.name + '</div>'
          + '<div style="font-size:12px;color:#8a857a;margin-bottom:.75rem">'
          + (isTrainer
            ? (h.owner_count + ' owner' + (h.owner_count !== 1 ? 's' : ''))
            : ('Trainer: ' + h.trainer_name))
          + '</div>'
          + (h.colour || h.sex ? '<div style="font-size:11px;color:#6b7c5c">' + [h.colour, h.sex].filter(Boolean).join(' &bull; ') + '</div>' : '')
          + '<div style="margin-top:.875rem;padding-top:.875rem;border-top:1px solid rgba(26,26,24,.08);display:flex;gap:6px">'
          + '<button class="sf-tile-btn sf-tile-view" data-hid="' + h.id + '" data-hname="' + h.name + '">Updates</button>'
          + (isTrainer ? '<button class="sf-tile-btn sf-tile-invite" data-hid="' + h.id + '" data-hname="' + h.name + '">Invite</button>' : '')
          + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;

    // Add horse button
    var addBtn = document.getElementById('sf-add-horse-btn2');
    if(addBtn) addBtn.addEventListener('click', sfShowAddHorseForm);

    // View updates buttons
    el.querySelectorAll('.sf-tile-view').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        sfViewHorse(this.dataset.hid, this.dataset.hname);
      });
    });

    // Invite buttons
    el.querySelectorAll('.sf-tile-invite').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        sfShowInviteForm(this.dataset.hid, this.dataset.hname);
      });
    });

    // Card click
    el.querySelectorAll('.sf-horse-tile').forEach(function(card) {
      card.addEventListener('click', function() {
        sfViewHorse(this.dataset.hid, this.dataset.hname);
      });
    });

  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:2rem;color:#a85c3a">Error: ' + e.message + '</div>';
  }
}

async function sfShowUpdatesFeed() {
  var el = document.getElementById('sf-dashboard-content');
  el.innerHTML = '<div style="text-align:center;padding:2rem;color:#8a857a">Loading...</div>';
  try {
    var role = sfUser.role;
    var horses = role === 'owner'
      ? await sfApiGet('/owner/horses')
      : await sfApiGet('/trainer/horses');

    if(horses.length === 0) {
      el.innerHTML = '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1.5rem">Updates feed</div>'
        + '<div style="text-align:center;padding:3rem;color:#8a857a">No horses to show updates for</div>';
      return;
    }

    // Fetch updates for all horses in parallel
    var allUpdates = [];
    await Promise.all(horses.map(async function(h) {
      try {
        var updates = await sfApiGet('/updates/' + h.id);
        updates.forEach(function(u) {
          u._horse_name = h.name;
          u._horse_id = h.id;
          allUpdates.push(u);
        });
      } catch(e) {}
    }));

    // Sort newest first
    allUpdates.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });

    var html = '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1.5rem">Updates feed</div>';

    if(allUpdates.length === 0) {
      html += '<div style="text-align:center;padding:3rem;color:#8a857a">'
        + '<div style="font-size:40px;margin-bottom:1rem;opacity:.3">&#x1F4DD;</div>'
        + '<div style="font-size:15px;font-weight:500;color:#1a1a18;margin-bottom:.5rem">No updates yet</div>'
        + '<div style="font-size:13px">Updates from your trainer will appear here</div>'
        + '</div>';
    } else {
      allUpdates.forEach(function(u) {
        var typeColors = {note:'#e8ede0|#6b7c5c', trial:'#f5ead0|#7a5c1a', race:'#f5e0d8|#a85c3a', general:'#f0eeea|#8a857a'};
        var tc = (typeColors[u.type] || typeColors.general).split('|');
        html += '<div style="background:white;border:1px solid rgba(26,26,24,.1);border-radius:12px;padding:1.25rem;margin-bottom:.875rem;cursor:pointer" data-hid="' + u._horse_id + '" data-hname="' + u._horse_name + '">'
          + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:.875rem">'
          + '<div style="width:30px;height:30px;border-radius:50%;background:#e8ede0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#6b7c5c;flex-shrink:0">'
          + u.trainer_name.split(' ').map(function(n){return n[0];}).join('').slice(0,2)
          + '</div>'
          + '<div style="flex:1">'
          + '<div style="font-size:13px;font-weight:600;font-family:Georgia,serif">' + u._horse_name + '</div>'
          + '<div style="font-size:11px;color:#8a857a">' + u.trainer_name + ' &bull; ' + sfFormatDate(u.created_at) + '</div>'
          + '</div>'
          + '<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:' + tc[0] + ';color:' + tc[1] + ';font-weight:500">' + u.type + '</span>'
          + '</div>'
          + '<div style="font-size:14px;line-height:1.7;color:#1a1a18">' + u.content + '</div>'
          + '</div>';
      });
    }

    el.innerHTML = html;

    // Make update cards clickable — go to horse detail
    el.querySelectorAll('[data-hid]').forEach(function(card) {
      card.addEventListener('click', function() {
        sfViewHorse(this.dataset.hid, this.dataset.hname);
      });
    });

  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:2rem;color:#a85c3a">Error: ' + e.message + '</div>';
  }
}

function sfShowAddHorseForm() {
  var el = document.getElementById('sf-dashboard-content');
  el.innerHTML = '<button onclick="renderSFDashboard()" style="background:none;border:none;color:#8a857a;cursor:pointer;font-size:13px;font-family:inherit;margin-bottom:1rem;display:flex;align-items:center;gap:4px">&#8592; Back</button>'
    + '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1.5rem">Add horse</div>'
    + '<div style="background:white;border:1px solid rgba(26,26,24,.12);border-radius:10px;padding:1.25rem">'
    + '<div style="margin-bottom:1rem"><div style="font-size:11px;font-weight:500;color:#8a857a;letter-spacing:.5px;text-transform:uppercase;margin-bottom:.5rem">Horse name</div>'
    + '<input id="sf-horse-name" style="width:100%;padding:.75rem 1rem;border:1px solid rgba(26,26,24,.2);border-radius:8px;font-size:15px;font-family:inherit;outline:none;background:#f5f0e8" placeholder="e.g. Wine Rocs"></div>'
    + '<div style="margin-bottom:1rem"><div style="font-size:11px;font-weight:500;color:#8a857a;letter-spacing:.5px;text-transform:uppercase;margin-bottom:.5rem">Racing DB name (optional)</div>'
    + '<input id="sf-horse-db" style="width:100%;padding:.75rem 1rem;border:1px solid rgba(26,26,24,.2);border-radius:8px;font-size:15px;font-family:inherit;outline:none;background:#f5f0e8" placeholder="Exact name as per race results"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.25rem">'
    + '<div><div style="font-size:11px;font-weight:500;color:#8a857a;letter-spacing:.5px;text-transform:uppercase;margin-bottom:.5rem">Colour</div>'
    + '<input id="sf-horse-colour" style="width:100%;padding:.75rem 1rem;border:1px solid rgba(26,26,24,.2);border-radius:8px;font-size:15px;font-family:inherit;outline:none;background:#f5f0e8" placeholder="Bay"></div>'
    + '<div><div style="font-size:11px;font-weight:500;color:#8a857a;letter-spacing:.5px;text-transform:uppercase;margin-bottom:.5rem">Sex</div>'
    + '<input id="sf-horse-sex" style="width:100%;padding:.75rem 1rem;border:1px solid rgba(26,26,24,.2);border-radius:8px;font-size:15px;font-family:inherit;outline:none;background:#f5f0e8" placeholder="Mare"></div>'
    + '</div>'
    + '<div style="display:flex;gap:.75rem;justify-content:flex-end">'
    + '<button onclick="renderSFDashboard()" style="background:none;border:1px solid rgba(26,26,24,.2);border-radius:8px;padding:.625rem 1rem;font-size:13px;font-family:inherit;cursor:pointer">Cancel</button>'
    + '<button id="sf-save-horse-btn" style="background:#1a1a18;color:#c9a84c;border:none;border-radius:8px;padding:.625rem 1.25rem;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Save horse</button>'
    + '</div></div>';
  var saveBtn = document.getElementById('sf-save-horse-btn');
  if(saveBtn) saveBtn.addEventListener('click', sfSaveHorse);
}

async function sfSaveHorse() {
  var name = document.getElementById('sf-horse-name').value.trim();
  if(!name) { alert('Please enter a horse name'); return; }
  try {
    await fetch(SF_API + '/trainer/horses', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+sfToken},
      body: JSON.stringify({
        name: name,
        racing_db_name: document.getElementById('sf-horse-db').value.trim() || null,
        colour: document.getElementById('sf-horse-colour').value.trim() || null,
        sex: document.getElementById('sf-horse-sex').value.trim() || null
      })
    });
    renderSFDashboard();
  } catch(e) { alert('Error: ' + e.message); }
}


async function sfShowInviteForm(horseId, horseName) {
  var el = document.getElementById('sf-dashboard-content');
  el.innerHTML = '<button id="sf-invite-back" style="background:none;border:none;color:#8a857a;cursor:pointer;font-size:13px;font-family:inherit;margin-bottom:1rem;display:flex;align-items:center;gap:4px">&#8592; Back to ' + horseName + '</button>'
    + '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1.5rem">Invite owner — ' + horseName + '</div>'
    + '<div style="background:white;border:1px solid rgba(26,26,24,.12);border-radius:10px;padding:1.25rem">'
    + '<div style="margin-bottom:1.25rem"><div style="font-size:11px;font-weight:500;color:#8a857a;letter-spacing:.5px;text-transform:uppercase;margin-bottom:.5rem">Owner email</div>'
    + '<input id="sf-invite-email" style="width:100%;padding:.75rem 1rem;border:1px solid rgba(26,26,24,.2);border-radius:8px;font-size:15px;font-family:inherit;outline:none;background:#f5f0e8" placeholder="owner@example.com" type="email"></div>'
    + '<div id="sf-invite-result" style="display:none;background:#e8ede0;border-radius:8px;padding:1rem;margin-bottom:1rem;font-size:13px;word-break:break-all"></div>'
    + '<div style="display:flex;gap:.75rem;justify-content:flex-end">'
    + '<button id="sf-invite-cancel" style="background:none;border:1px solid rgba(26,26,24,.2);border-radius:8px;padding:.625rem 1rem;font-size:13px;font-family:inherit;cursor:pointer">Cancel</button>'
    + '<button id="sf-invite-send" style="background:#1a1a18;color:#c9a84c;border:none;border-radius:8px;padding:.625rem 1.25rem;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Send invite</button>'
    + '</div></div>';
  document.getElementById('sf-invite-back').addEventListener('click', function(){ sfViewHorse(horseId, horseName); });
  document.getElementById('sf-invite-cancel').addEventListener('click', function(){ sfViewHorse(horseId, horseName); });
  document.getElementById('sf-invite-send').addEventListener('click', async function(){
    var email = document.getElementById('sf-invite-email').value.trim();
    if(!email) { alert('Please enter an email address'); return; }
    try {
      var res = await fetch(SF_API + '/trainer/invite', {
        method: 'POST',
        headers: {'Content-Type':'application/json','Authorization':'Bearer '+sfToken},
        body: JSON.stringify({horse_id: horseId, email: email})
      });
      var data = await res.json();
      if(!res.ok) throw new Error(data.detail || 'Error');
      var resultEl = document.getElementById('sf-invite-result');
      resultEl.style.display = 'block';
      resultEl.innerHTML = '<div style="font-weight:500;margin-bottom:.5rem">Invite created successfully!</div>'
        + '<div style="color:#6b7c5c;margin-bottom:.5rem">Send this link to ' + email + ':</div>'
        + '<div id="sf-invite-link" style="background:white;border-radius:6px;padding:.75rem;font-family:monospace;font-size:12px;color:#1a1a18;cursor:pointer">'
        + data.invite_url + '</div>'
        + '<div style="font-size:11px;color:#8a857a;margin-top:.5rem">Click the link above to copy it</div>';
      var linkEl = document.getElementById('sf-invite-link');
      if(linkEl) linkEl.addEventListener('click', function(){ navigator.clipboard.writeText(this.textContent).then(function(){ alert('Copied!'); }); });
      document.getElementById('sf-invite-send').textContent = 'Send another';
      document.getElementById('sf-invite-email').value = '';
    } catch(e) { alert('Error: ' + e.message); }
  });
}


async function sfShowMyHorses() {
  var el = document.getElementById('sf-dashboard-content');
  el.innerHTML = '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1.5rem">My horses</div><div style="text-align:center;padding:2rem;color:#8a857a">Loading...</div>';
  document.getElementById('sf-dashboard-modal').style.display = 'flex';
  try {
    var role = sfUser.role;
    var horses = role === 'owner' ? await sfApiGet('/owner/horses') : await sfApiGet('/trainer/horses');
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem">'
      + '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">My horses</div>'
      + (role === 'trainer' ? '<button id="sf-add-horse-btn2" style="background:#1a1a18;color:#c9a84c;border:none;border-radius:8px;padding:.5rem 1rem;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">+ Add horse</button>' : '')
      + '</div>';
    if(horses.length === 0) {
      html += '<div style="text-align:center;padding:3rem;color:#8a857a">'
        + '<div style="font-size:36px;margin-bottom:1rem;opacity:.3">&#x1F40E;</div>'
        + '<div style="font-size:15px;font-weight:500;margin-bottom:.5rem;color:#1a1a18">No horses yet</div>'
        + '<div style="font-size:13px">' + (role === 'trainer' ? 'Click above to add your first horse' : 'Your trainer will invite you to your horses') + '</div>'
        + '</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.875rem">';
      horses.forEach(function(h) {
        html += '<div style="background:white;border:1px solid rgba(26,26,24,.1);border-radius:12px;overflow:hidden;cursor:pointer" data-hid="' + h.id + '" data-hname="' + h.name + '">'
          + '<div style="background:linear-gradient(135deg,#1a1a18,#2a2a26);padding:1.25rem 1rem .875rem">'
          + '<div style="font-family:Georgia,serif;font-size:17px;font-weight:700;color:#f5f0e8;margin-bottom:.125rem">' + h.name + '</div>'
          + '<div style="font-size:11px;color:rgba(245,240,232,.45)">' + (h.colour||'') + (h.colour&&h.sex?' &bull; ':'') + (h.sex||'&nbsp;') + '</div>'
          + '</div>'
          + '<div style="padding:.875rem 1rem">'
          + (role === 'trainer'
            ? '<div style="font-size:12px;color:#6b7c5c;font-weight:500">' + h.owner_count + ' owner' + (h.owner_count!==1?'s':'') + '</div>'
            : '<div style="font-size:12px;color:#8a857a">Trainer: ' + h.trainer_name + '</div>')
          + '<div style="display:flex;gap:6px;margin-top:.75rem">'
          + '<button class="sf-horse-updates-btn" data-hid="' + h.id + '" data-hname="' + h.name + '" style="flex:1;background:#1a1a18;color:#c9a84c;border:none;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">Updates</button>'
          + '<button class="sf-horse-profile-btn" data-hname="' + (h.racing_db_name||h.name) + '" style="flex:1;background:none;border:1px solid rgba(26,26,24,.15);border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer;font-family:inherit;color:#8a857a">Form &#8599;</button>'
          + '</div></div></div>';
      });
      html += '</div>';
    }
    el.innerHTML = html;
    // Add horse button
    var addBtn = document.getElementById('sf-add-horse-btn2');
    if(addBtn) addBtn.addEventListener('click', sfShowAddHorseForm);
    // Updates buttons
    el.querySelectorAll('.sf-horse-updates-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        sfViewHorse(this.dataset.hid, this.dataset.hname);
      });
    });
    // Form/profile buttons - link to analytics profile page
    el.querySelectorAll('.sf-horse-profile-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var name = this.dataset.hname;
        closeSFDashboard();
        if(typeof openProfile === 'function') {
          openProfile(name, 'horse');
        } else {
          showPage('profile');
          document.getElementById('global-search').value = name;
          document.getElementById('global-search').dispatchEvent(new Event('input'));
        }
      });
    });
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:2rem;color:#a85c3a">Error: ' + e.message + '</div>';
  }
}

async function sfShowUpdatesFeed() {
  var el = document.getElementById('sf-dashboard-content');
  el.innerHTML = '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1.5rem">Updates</div><div style="text-align:center;padding:2rem;color:#8a857a">Loading...</div>';
  document.getElementById('sf-dashboard-modal').style.display = 'flex';
  try {
    var role = sfUser.role;
    var horses = role === 'owner' ? await sfApiGet('/owner/horses') : await sfApiGet('/trainer/horses');
    if(horses.length === 0) {
      el.innerHTML = '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1.5rem">Updates</div>'
        + '<div style="text-align:center;padding:3rem;color:#8a857a">'
        + '<div style="font-size:36px;margin-bottom:1rem;opacity:.3">&#x1F4DD;</div>'
        + '<div style="font-size:15px;font-weight:500;margin-bottom:.5rem;color:#1a1a18">No updates yet</div>'
        + '<div style="font-size:13px">Updates will appear here once horses are added</div>'
        + '</div>';
      return;
    }
    // Fetch updates for all horses in parallel
    var allUpdates = [];
    await Promise.all(horses.map(async function(h) {
      try {
        var updates = await sfApiGet('/updates/' + h.id);
        updates.forEach(function(u) {
          u.horse_name = h.name;
          u.horse_id = h.id;
          allUpdates.push(u);
        });
      } catch(e) {}
    }));
    // Sort by date descending
    allUpdates.sort(function(a,b){ return new Date(b.created_at) - new Date(a.created_at); });
    var html = '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1.5rem">Updates <span style="font-size:14px;font-weight:400;color:#8a857a;font-family:inherit">(' + allUpdates.length + ')</span></div>';
    if(allUpdates.length === 0) {
      html += '<div style="text-align:center;padding:3rem;color:#8a857a">'
        + '<div style="font-size:36px;margin-bottom:1rem;opacity:.3">&#x1F4DD;</div>'
        + '<div style="font-size:15px;font-weight:500;margin-bottom:.5rem;color:#1a1a18">No updates yet</div>'
        + (role === 'trainer' ? '<div style="font-size:13px">Click a horse to post the first update</div>' : '<div style="font-size:13px">Your trainer has not posted any updates yet</div>')
        + '</div>';
    } else {
      var typeBg = {note:'#e8ede0', trial:'#f5ecd5', race:'#f5e8e0', general:'#efefef'};
      var typeCol = {note:'#6b7c5c', trial:'#7a5c1a', race:'#a85c3a', general:'#8a857a'};
      allUpdates.forEach(function(u) {
        html += '<div style="background:white;border:1px solid rgba(26,26,24,.1);border-radius:12px;padding:1.125rem;margin-bottom:.75rem">'
          + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:.875rem">'
          + '<div style="font-family:Georgia,serif;font-size:14px;font-weight:700;flex:1;cursor:pointer;color:#1a1a18" data-hid="' + u.horse_id + '" data-hname="' + u.horse_name + '" class="sf-feed-horse">' + u.horse_name + '</div>'
          + '<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:' + (typeBg[u.type]||'#efefef') + ';color:' + (typeCol[u.type]||'#8a857a') + ';font-weight:500">' + u.type + '</span>'
          + '<span style="font-size:11px;color:#8a857a">' + sfFormatDate(u.created_at) + '</span>'
          + '</div>'
          + '<div style="font-size:14px;line-height:1.7;color:#1a1a18">' + u.content + '</div>'
          + '<div style="font-size:12px;color:#8a857a;margin-top:.625rem">— ' + u.trainer_name + '</div>'
          + '</div>';
      });
    }
    el.innerHTML = html;
    // Horse name links → open horse detail
    el.querySelectorAll('.sf-feed-horse').forEach(function(el2) {
      el2.addEventListener('click', function() {
        sfViewHorse(this.dataset.hid, this.dataset.hname);
      });
    });
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:2rem;color:#a85c3a">Error: ' + e.message + '</div>';
  }
}


async function sfShowAdminDashboard() {
  var el = document.getElementById('sf-dashboard-content');
  el.innerHTML = '<div style="text-align:center;padding:2rem;color:#8a857a">Loading...</div>';
  document.getElementById('sf-dashboard-modal').style.display = 'flex';
  try {
    var stats = await sfApiGet('/admin/stats');
    var trainers = await sfApiGet('/admin/trainers');
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem">'
      + '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">Admin dashboard</div>'
      + '<button id="sf-add-trainer-btn" style="background:#1a1a18;color:#c9a84c;border:none;border-radius:8px;padding:.5rem 1rem;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">+ Add trainer</button>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem;margin-bottom:1.5rem">'
      + sfStatCard(stats.trainers, 'Trainers')
      + sfStatCard(stats.horses, 'Horses')
      + sfStatCard(stats.owners, 'Owners')
      + sfStatCard(stats.pending_invites, 'Pending invites')
      + '</div>'
      + '<div style="font-size:11px;font-weight:500;color:#8a857a;letter-spacing:.5px;text-transform:uppercase;margin-bottom:.75rem">Trainers</div>';
    if(trainers.length === 0) {
      html += '<div style="text-align:center;padding:2rem;color:#8a857a;background:white;border-radius:10px;border:1px solid rgba(26,26,24,.1)">'
        + '<div style="font-size:32px;margin-bottom:.75rem;opacity:.3">&#x1F3C7;</div>'
        + '<div style="font-size:14px;font-weight:500;color:#1a1a18;margin-bottom:.25rem">No trainers yet</div>'
        + '<div style="font-size:12px">Click above to add the first trainer</div></div>';
    } else {
      html += '<div style="background:white;border:1px solid rgba(26,26,24,.1);border-radius:12px;overflow:hidden">';
      trainers.forEach(function(t, i) {
        html += '<div style="display:flex;align-items:center;gap:12px;padding:12px 1rem;'
          + (i < trainers.length-1 ? 'border-bottom:1px solid rgba(26,26,24,.08)' : '') + '">'
          + '<div style="width:38px;height:38px;border-radius:50%;background:#e8d5a3;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;color:#6a4a0a">'
          + t.name.split(' ').map(function(n){return n[0];}).join('').slice(0,2)
          + '</div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:14px;font-weight:500;margin-bottom:1px">' + t.name + '</div>'
          + '<div style="font-size:12px;color:#8a857a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
          + t.email + (t.stable_name ? ' &bull; ' + t.stable_name : '') + (t.location ? ' &bull; ' + t.location : '')
          + '</div></div>'
          + '<div style="display:flex;gap:6px;flex-shrink:0">'
          + '<button class="sf-view-trainer-btn" data-tid="' + t.id + '" data-tname="' + t.name + '" style="background:none;border:1px solid rgba(26,26,24,.15);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit;color:#6b6760">Manage</button>'
          + '</div></div>';
      });
      html += '</div>';
    }
    el.innerHTML = html;
    var addBtn = document.getElementById('sf-add-trainer-btn');
    if(addBtn) addBtn.addEventListener('click', sfShowAddTrainerForm);
    el.querySelectorAll('.sf-view-trainer-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        sfShowTrainerDetail(this.dataset.tid, this.dataset.tname);
      });
    });
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:2rem;color:#a85c3a">Error: ' + e.message + '</div>';
  }
}

function sfShowAddTrainerForm() {
  var el = document.getElementById('sf-dashboard-content');
  el.innerHTML = '<button id="sf-admin-back" style="background:none;border:none;color:#8a857a;cursor:pointer;font-size:13px;font-family:inherit;margin-bottom:1.25rem;display:flex;align-items:center;gap:4px">&#8592; Back to dashboard</button>'
    + '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1.5rem">Add trainer</div>'
    + '<div style="background:white;border:1px solid rgba(26,26,24,.12);border-radius:12px;padding:1.25rem">'
    + '<div id="sf-trainer-error" style="display:none;background:rgba(168,92,58,.12);color:#a85c3a;border-radius:8px;padding:.75rem 1rem;font-size:13px;margin-bottom:1rem"></div>'
    + sfAdminField('Full name', 'sf-tn-name', 'text', 'e.g. Debbie Sweeney')
    + sfAdminField('Email address', 'sf-tn-email', 'email', 'trainer@example.com')
    + sfAdminField('Temporary password', 'sf-tn-pw', 'text', 'They can change this on first login')
    + sfAdminField('Stable name (optional)', 'sf-tn-stable', 'text', 'e.g. Sweeney Racing')
    + sfAdminField('Phone (optional)', 'sf-tn-phone', 'text', 'e.g. 021 123 4567')
    + sfAdminField('Location (optional)', 'sf-tn-location', 'text', 'e.g. Cambridge')
    + '<div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:1.25rem">'
    + '<button id="sf-cancel-trainer" style="background:none;border:1px solid rgba(26,26,24,.2);border-radius:8px;padding:.625rem 1rem;font-size:13px;font-family:inherit;cursor:pointer">Cancel</button>'
    + '<button id="sf-save-trainer" style="background:#1a1a18;color:#c9a84c;border:none;border-radius:8px;padding:.625rem 1.25rem;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Create trainer account</button>'
    + '</div></div>';
  document.getElementById('sf-admin-back').addEventListener('click', sfShowAdminDashboard);
  document.getElementById('sf-cancel-trainer').addEventListener('click', sfShowAdminDashboard);
  document.getElementById('sf-save-trainer').addEventListener('click', sfSaveTrainer);
}

function sfAdminField(label, id, type, placeholder) {
  return '<div style="margin-bottom:1rem">'
    + '<div style="font-size:11px;font-weight:500;color:#8a857a;letter-spacing:.5px;text-transform:uppercase;margin-bottom:.5rem">' + label + '</div>'
    + '<input id="' + id + '" type="' + type + '" placeholder="' + placeholder + '" '
    + 'style="width:100%;padding:.75rem 1rem;border:1px solid rgba(26,26,24,.2);border-radius:8px;font-size:14px;font-family:inherit;outline:none;background:#f5f0e8;color:#1a1a18">'
    + '</div>';
}

async function sfSaveTrainer() {
  var name = document.getElementById('sf-tn-name').value.trim();
  var email = document.getElementById('sf-tn-email').value.trim();
  var pw = document.getElementById('sf-tn-pw').value.trim();
  var errEl = document.getElementById('sf-trainer-error');
  errEl.style.display = 'none';
  if(!name || !email || !pw) {
    errEl.textContent = 'Name, email and password are required.';
    errEl.style.display = 'block';
    return;
  }
  var btn = document.getElementById('sf-save-trainer');
  btn.textContent = 'Creating...';
  btn.disabled = true;
  try {
    await fetch(SF_API + '/admin/trainers', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+sfToken},
      body: JSON.stringify({
        name: name, email: email, password: pw,
        stable_name: document.getElementById('sf-tn-stable').value.trim() || null,
        phone: document.getElementById('sf-tn-phone').value.trim() || null,
        location: document.getElementById('sf-tn-location').value.trim() || null
      })
    });
    sfShowAdminDashboard();
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message;
    errEl.style.display = 'block';
    btn.textContent = 'Create trainer account';
    btn.disabled = false;
  }
}

async function sfShowTrainerDetail(trainerId, trainerName) {
  var el = document.getElementById('sf-dashboard-content');
  el.innerHTML = '<button id="sf-trainer-back" style="background:none;border:none;color:#8a857a;cursor:pointer;font-size:13px;font-family:inherit;margin-bottom:1.25rem;display:flex;align-items:center;gap:4px">&#8592; Back to dashboard</button>'
    + '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:1.5rem">' + trainerName + '</div>'
    + '<div style="text-align:center;padding:1.5rem;color:#8a857a">Loading horses...</div>';
  document.getElementById('sf-trainer-back').addEventListener('click', sfShowAdminDashboard);
  try {
    var horses = await sfApiGet('/admin/trainer-horses?trainer_id=' + trainerId);
    var horseHtml = '<div style="font-size:11px;font-weight:500;color:#8a857a;letter-spacing:.5px;text-transform:uppercase;margin-bottom:.75rem">Horses</div>';
    if(!horses || horses.length === 0) {
      horseHtml += '<div style="background:white;border:1px solid rgba(26,26,24,.1);border-radius:10px;padding:1.5rem;text-align:center;color:#8a857a">No horses yet</div>';
    } else {
      horseHtml += '<div style="background:white;border:1px solid rgba(26,26,24,.1);border-radius:12px;overflow:hidden">';
      horses.forEach(function(h, i) {
        horseHtml += '<div style="display:flex;align-items:center;gap:12px;padding:12px 1rem;'
          + (i < horses.length-1 ? 'border-bottom:1px solid rgba(26,26,24,.08)' : '') + '">'
          + '<div style="flex:1"><div style="font-size:14px;font-weight:500">' + h.name + '</div>'
          + '<div style="font-size:12px;color:#8a857a">' + (h.colour||'') + (h.colour&&h.sex?' &bull; ':'') + (h.sex||'') + ' &bull; ' + h.owner_count + ' owner' + (h.owner_count!==1?'s':'') + '</div>'
          + '</div></div>';
      });
      horseHtml += '</div>';
    }
    el.querySelector('div:last-child').outerHTML = horseHtml;
    document.getElementById('sf-trainer-back').addEventListener('click', sfShowAdminDashboard);
  } catch(e) {
    // Endpoint may not exist yet - show basic view
    el.innerHTML = '<button id="sf-trainer-back2" style="background:none;border:none;color:#8a857a;cursor:pointer;font-size:13px;font-family:inherit;margin-bottom:1.25rem">&#8592; Back</button>'
      + '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;margin-bottom:.5rem">' + trainerName + '</div>'
      + '<div style="font-size:13px;color:#8a857a">Trainer account active</div>';
    document.getElementById('sf-trainer-back2').addEventListener('click', sfShowAdminDashboard);
  }
}

function sfStatCard(val, lbl) {
  return '<div style="background:#f5f0e8;border:1px solid rgba(26,26,24,.1);border-radius:8px;padding:1rem;text-align:center">'
    + '<div style="font-family:Georgia,serif;font-size:28px;font-weight:700">' + val + '</div>'
    + '<div style="font-size:12px;color:#8a857a">' + lbl + '</div>'
    + '</div>';
}

async function sfViewHorse(horseId, horseName) {
  var el = document.getElementById('sf-dashboard-content');
  el.innerHTML = '<div style="text-align:center;padding:2rem;color:#8a857a">Loading updates...</div>';
  try {
    var updates = await sfApiGet('/updates/' + horseId);
    var isTrainer = sfUser.role === 'trainer' || sfUser.role === 'admin';
    var html = '<button onclick="renderSFDashboard()" style="background:none;border:none;color:#8a857a;cursor:pointer;font-size:13px;font-family:inherit;margin-bottom:1rem;display:flex;align-items:center;gap:4px">&#8592; Back</button>'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem">'
      + '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">' + horseName + '</div>'
      + (isTrainer ? '<button id="sf-invite-btn" style="background:#c9a84c;color:#1a1a18;border:none;border-radius:8px;padding:.5rem 1rem;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">+ Invite owner</button>' : '')
      + '</div>';
    if(isTrainer) {
      html += '<div style="background:white;border:1px solid rgba(26,26,24,.12);border-radius:10px;padding:1rem;margin-bottom:1rem">'
        + '<textarea id="sf-update-text" style="width:100%;padding:.75rem;border:1px solid rgba(26,26,24,.15);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;min-height:80px;background:#f5f0e8;outline:none" placeholder="Post an update for owners..."></textarea>'
        + '<div style="display:flex;justify-content:flex-end;margin-top:.75rem">'
        + '<button id="sf-post-btn" style="background:#1a1a18;color:#c9a84c;border:none;border-radius:8px;padding:.625rem 1.25rem;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Post update</button>'
        + '</div></div>';
    }
    if(updates.length === 0) {
      html += '<div style="text-align:center;padding:2rem;color:#8a857a">No updates yet</div>';
    } else {
      html += updates.map(function(u){
        return '<div style="background:white;border:1px solid rgba(26,26,24,.12);border-radius:10px;padding:1rem;margin-bottom:.75rem">'
          + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:.75rem">'
          + '<div style="width:30px;height:30px;border-radius:50%;background:#e8ede0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#6b7c5c;flex-shrink:0">'
          + u.trainer_name.split(' ').map(function(n){return n[0];}).join('').slice(0,2)
          + '</div><div><div style="font-size:13px;font-weight:500">' + u.trainer_name + '</div>'
          + '<div style="font-size:11px;color:#8a857a">' + sfFormatDate(u.created_at) + '</div></div>'
          + '<span style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:20px;background:#e8ede0;color:#6b7c5c;font-weight:500">' + u.type + '</span>'
          + '</div>'
          + '<div style="font-size:14px;line-height:1.7">' + u.content + '</div>'
          + '</div>';
      }).join('');
    }
    el.innerHTML = html;
    var postBtn = document.getElementById('sf-post-btn');
    if(postBtn) postBtn.addEventListener('click', function(){ sfPostUpdate(horseId, horseName); });
    var inviteBtn = document.getElementById('sf-invite-btn');
    if(inviteBtn) inviteBtn.addEventListener('click', function(){ sfShowInviteForm(horseId, horseName); });
  } catch(e) {
    el.innerHTML = '<button onclick="renderSFDashboard()" style="background:none;border:none;color:#8a857a;cursor:pointer;font-size:13px;font-family:inherit;margin-bottom:1rem">&#8592; Back</button>'
      + '<div style="text-align:center;padding:2rem;color:#a85c3a">Error: ' + e.message + '</div>';
  }
}

async function sfPostUpdate(horseId, horseName) {
  var content = document.getElementById('sf-update-text').value.trim();
  if(!content) return;
  try {
    await fetch(SF_API + '/updates', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+sfToken},
      body: JSON.stringify({horse_id:horseId, type:'note', content:content})
    });
    sfViewHorse(horseId, horseName);
  } catch(e) { alert('Error: ' + e.message); }
}

function sfFormatDate(iso) {
  if(!iso) return '';
  var d = new Date(iso);
  var diff = Math.floor((new Date() - d) / 1000);
  if(diff < 60) return 'just now';
  if(diff < 3600) return Math.floor(diff/60) + 'm ago';
  if(diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return d.toLocaleDateString('en-NZ', {day:'numeric',month:'short'});
}

// Restore SF session on load
(function() {
  var t = localStorage.getItem('sf_token');
  var u = localStorage.getItem('sf_user');
  if(t && u) { sfToken = t; sfUser = JSON.parse(u); updateSFNav(); }
})();

// Close modals on overlay click
document.getElementById('sf-login-modal').addEventListener('click', function(e) {
  if(e.target === this) closeSFLogin();
});
document.getElementById('sf-dashboard-modal').addEventListener('click', function(e) {
  if(e.target === this) closeSFDashboard();
});
