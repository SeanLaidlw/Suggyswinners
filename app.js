// SuggysWinners app.js - clean version, no template literals with class=

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
    return r;
  });
}

// ---- DATA DECODER ----
function decodeRacingData(data) {
  var L=data.lookups, rows=data.rows;
  return rows.map(function(r) {
    return {
      finish_position:r[0], barrier:r[1], margin_trad:r[2],
      finish_time:r[3], odds_sp:r[4], prize_money:r[5],
      horse:L.horse[r[6]], jockey:L.jockey[r[7]], trainer:L.trainer[r[8]],
      track:L.track[r[9]], date:r[10], going:L.going[r[11]],
      race_name:L.race_name[r[12]], race_class:r[13], distance_m:r[14]
    };
  });
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
      document.getElementById('db-status').textContent=s.total_results.toLocaleString()+' results - '+s.exported_at;
    } else if(window.RACING_DATA&&window.RACING_DATA.results&&window.RACING_DATA.results.length) {
      allResults = enrichWithClass(window.RACING_DATA.results);
      var s=window.RACING_DATA.summary;
      document.getElementById('db-status').textContent=s.total_results.toLocaleString()+' results - '+s.exported_at;
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
  var wins=data.filter(function(r){return r.finish_position===1;}).length;
  var places=data.filter(function(r){return r.finish_position<=3;}).length;
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
    var hn=(r.horse||'').replace(/'/g,"\\'");
    var jn=(r.jockey||'').replace(/'/g,"\\'");
    return '<tr>'
      +'<td><span class="pos-badge '+pc+'">'+p+'</span></td>'
      +'<td><span class="horse-link" onclick="openProfile(\''+hn+'\',\'horse\')">'+( r.horse||'--')+'</span></td>'
      +'<td><span class="horse-link" onclick="openProfile(\''+jn+'\',\'jockey\')">'+( r.jockey||'--')+'</span></td>'
      +'<td class="r-hide" style="color:var(--text2);font-size:12px">'+(r.trainer||'--')+'</td>'
      +'<td style="color:var(--text2)">'+(r.track||'--')+'</td>'
      +'<td class="tv">'+(r.date||'--')+'</td>'
      +'<td class="r-hide" style="color:var(--text2);font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis">'+(r.race_name||'--')+'</td>'
      +'<td class="r-hide">'+getClassBadge(r.race_name,r.race_class,r.prize_money)+'</td>'
      +'<td class="tv r-hide">'+(r.distance_m?r.distance_m+'m':'--')+'</td>'
      +'<td class="tv r-hide">'+(r.barrier||'--')+'</td>'
      +'<td class="odds">'+(r.odds_sp?'$'+r.odds_sp:'--')+'</td>'
      +'<td class="tv r-hide">'+(r.finish_time||'--')+'</td>'
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
      +'<div class="rr-race">'+(r.race_name||'--')+' / '+(r.track||'--')+'</div>'
      +'<div class="rr-meta">'+(r.date||'--')+' / '+(r.distance_m?r.distance_m+'m':'--')+' '+gBadge+'</div>'
      +'</div>'
      +'<div class="rr-right">'
      +'<div class="rr-odds">'+(r.odds_sp?'$'+r.odds_sp:'--')+'</div>'
      +'<div class="rr-margin">'+(pos===1?'Winner':(r.margin_trad||'--'))+'</div>'
      +'</div></div>';
  }).join('');

  var eName=encodeURIComponent(name);
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
    +'<div class="table-wrap" style="margin-bottom:0"><div class="table-header"><span class="table-title">Going record</span></div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;padding:1rem">'+goingCards+'</div></div>'
    +'<div class="table-wrap" style="margin-bottom:0"><div class="table-header"><span class="table-title">Recent runs</span><span class="table-count">'+rows.length+' total</span></div>'+recentRuns+'</div>'
    +'<div class="table-wrap" style="margin-bottom:0"><div class="table-header"><span class="table-title">News &amp; Articles</span></div>'
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
  return {starts:rows.length,wins:wins,places:places,avgPos:avgPos,
    winPct:(wins/rows.length*100).toFixed(1),placePct:(places/rows.length*100).toFixed(1),
    bestOdds:bestOdds?'$'+bestOdds:'--',bestTrack:bt?bt[0]:'--'};
}

function renderH2HStats(s) {
  return ['Starts,'+s.starts,'Wins,'+s.wins+' ('+s.winPct+'%),win','Places (top 3),'+s.places+' ('+s.placePct+'%)','Avg finish pos,'+s.avgPos,'Best winning odds,'+s.bestOdds,'Best track,'+s.bestTrack].map(function(x){
    var p=x.split(','); var cls=p[2]?'hsv '+p[2]:'hsv';
    return '<div class="hsr"><span class="hsl">'+p[0]+'</span><span class="'+cls+'">'+p[1]+'</span></div>';
  }).join('');
}

// ---- AI SCORING ----
function scoreRunner(runner, track, distance, going) {
  var score=0;
  score+=Math.min(runner.winPct/100*30,30);
  var recent=allResults.filter(function(r){return r.horse===runner.horse;}).sort(function(a,b){return (b.date||'').localeCompare(a.date||'');}).slice(0,5);
  if(recent.length){var avg=recent.reduce(function(s,r){return s+r.finish_position;},0)/recent.length;score+=Math.max(0,20-((avg-1)/9)*20);}
  var cWins=allResults.filter(function(r){return r.horse===runner.horse&&r.finish_position===1;});
  if(cWins.length){var bt=Math.min.apply(null,cWins.map(function(r){return r.class_tier||7;}));score+=(CLASS_WIN_BONUS[bt]||0);}
  if(track){var ts=runner.trackStats&&runner.trackStats[track]||{starts:0,wins:0};score+=ts.starts>=2?(ts.wins/ts.starts)*15:ts.starts===1?ts.wins*7:0;}
  if(distance){var ds=runner.distStats&&runner.distStats[distance]||{starts:0,wins:0};score+=ds.starts>=2?(ds.wins/ds.starts)*10:ds.starts===1?ds.wins*5:0;}
  if(going){var gs=runner.goingStats&&runner.goingStats[going]||{starts:0,wins:0};score+=gs.starts>=2?(gs.wins/gs.starts)*10:gs.starts===1?gs.wins*5:0;}
  var b=runner.barrier||8;score+=b<=3?5:b<=6?3.5:b<=10?2:0.5;
  var lastRow=allResults.filter(function(r){return r.horse===runner.horse;}).sort(function(a,b){return (b.date||'').localeCompare(a.date||'');})[0];
  if(lastRow&&lastRow.date){var days=Math.floor((Date.now()-new Date(lastRow.date))/(1000*60*60*24));if(days>60)score-=Math.min(3,(days-60)/30);}
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
    +'<div class="ai-footer">Scoring: win rate (30%) / recent form (20%) / race class (10%) / track (15%) / distance (10%) / going (10%) / barrier (5%) / days since last run</div>'
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
  fieldRunners.push({horse:horseName,barrier:fieldRunners.length+1,trainer:rows[0]&&rows[0].trainer||'--',
    starts:rows.length,wins:wins,places:places,winPct:winPct,placePct:placePct,avgPos:parseFloat(avgPos)||0,
    trackStats:ts,distStats:ds,goingStats:gs,form:form,color:RUNNER_COLORS[fieldRunners.length%RUNNER_COLORS.length]});
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
  body.innerHTML=fieldRunners.map(function(r,i){
    var formDots=r.form?r.form.split('-').map(function(p){var n=parseInt(p);var cls=n===1?'fd-1':n===2?'fd-2':n===3?'fd-3':'fd-o';return '<div class="form-dot '+cls+'" style="width:18px;height:18px;font-size:10px">'+p+'</div>';}).join(''):'';
    var hn=r.horse.replace(/'/g,"\\'");
    return '<div class="runner-row">'
      +'<div class="runner-num" style="color:'+r.color+'">'+String(i+1).padStart(2,'0')+'</div>'
      +'<div class="barrier-pill">'+r.barrier+'</div>'
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
  var ranked=fieldRunners.map(function(r){return Object.assign({},r,{aiScore:scoreRunner(r,track,distance,going)});}).sort(function(a,b){return b.aiScore-a.aiScore;});
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
}

function ratingBar(name,val,max,color,label){
  var pct=max>0?Math.min(val/max*100,100):0;
  return '<div class="rating-bar">'
    +'<div class="rating-name" title="'+name+'">'+name+'</div>'
    +'<div class="rating-track"><div class="rating-fill" style="width:'+pct.toFixed(0)+'%;background:'+color+';color:#0b0c0b">'+(pct>18?label:'')+'</div></div>'
    +'<div class="rating-val">'+(pct<=18?label:'')+'</div>'
    +'</div>';
}

// ---- PAGES ----
function showPage(name) {
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.nav-tab,.bnav-tab').forEach(function(t){t.classList.remove('active');});
  document.getElementById('page-'+name).classList.add('active');
  var pages=['results','trends','h2h','profile','field'];
  var idx=pages.indexOf(name);
  var navTabs=document.querySelectorAll('.nav-tab');
  if(navTabs[Math.min(idx,navTabs.length-1)]) navTabs[Math.min(idx,navTabs.length-1)].classList.add('active');
  var bnavTabs=document.querySelectorAll('.bnav-tab');
  if(bnavTabs[idx]) bnavTabs[idx].classList.add('active');
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
