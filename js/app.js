// ========== INSTAGRAM UNFOLLOWERS FINDER - v9 ==========
console.log('✅ app.js v9 LOADED');

// ========== GLOBAL STATE ==========
let appData = {
    followers:[], following:[], unfollowers:[], fans:[], mutuals:[],
    pending:[], blocked:[], recentlyUnfollowed:[],
    recentRequests:[], restricted:[],
    closeFriends:[], hideStoryFrom:[],
};
let currentTab       = 'unfollowers';
let selectedUsers    = new Set();
let bulkChecked      = new Set();
let uploadedFile     = null;
let donutChartInst   = null;
let barChartInst     = null;
let currentLetterFilter = 'all';

// UNDO / REDO
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50;

// ========== INDEXEDDB CACHE ==========
const DB_NAME = 'IGUnfollowersDB';
const DB_VERSION = 1;
const STORE_NAME = 'analysisCache';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}
async function saveCachedData() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({
            id: 'main',
            data: appData,
            savedAt: new Date().toISOString(),
            fileName: uploadedFile ? uploadedFile.name : 'previous-upload.zip'
        });
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
        db.close();
        console.log('💾 Cached to IndexedDB');
    } catch (e) { console.warn('Cache save failed:', e); }
}
async function loadCachedData() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get('main');
        const result = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        db.close();
        return result;
    } catch (e) { console.warn('Cache load failed:', e); return null; }
}
async function deleteCachedData() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete('main');
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
        db.close();
    } catch (e) { console.warn('Cache delete failed:', e); }
}
async function checkCachedData() {
    const cached = await loadCachedData();
    if (cached && cached.data) {
        const banner = document.getElementById('cachedBanner');
        const info = document.getElementById('cachedInfo');
        const date = new Date(cached.savedAt);
        info.textContent = `${cached.fileName || 'previous-upload.zip'} • Analyzed on ${date.toLocaleString()}`;
        banner.classList.remove('hidden');
    }
}
function restoreCachedData() {
    loadCachedData().then(cached => {
        if (!cached || !cached.data) {
            showToast('No cached data found', 'error');
            return;
        }
        appData = cached.data;
        document.getElementById('cachedBanner').classList.add('hidden');
        dropZone.style.display = 'none';

        chartsBuilt = false;
        undoStack = []; redoStack = [];
        updateUndoRedoUI();

        updateStats();
        updateAlphabetFilter();
        switchTab('unfollowers', document.querySelector('.tab[data-tab="unfollowers"]'));

        document.getElementById('statsSection').classList.remove('hidden');
        document.getElementById('dashboardSection').classList.remove('hidden');
        document.getElementById('resultsSection').classList.remove('hidden');

        setTimeout(() => document.getElementById('statsSection').scrollIntoView({behavior:'smooth'}), 100);
        showToast('✅ Previous data restored!', 'success');
    });
}
function clearCachedData() {
    if (!confirm('Are you sure you want to clear the cached data?')) return;
    deleteCachedData().then(() => {
        document.getElementById('cachedBanner').classList.add('hidden');
        showToast('🗑️ Cached data cleared', 'success');
    });
}

// ========== THEME ==========
function loadTheme(){
    const saved = localStorage.getItem('theme') || 'dark';
    setTheme(saved);
}
function setTheme(theme){
    if(theme==='light'){
        document.documentElement.setAttribute('data-theme','light');
        document.getElementById('themeIcon').className='fas fa-moon';
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.getElementById('themeIcon').className='fas fa-sun';
    }
    localStorage.setItem('theme', theme);
}
function toggleTheme(){
    const cur = localStorage.getItem('theme')||'dark';
    setTheme(cur==='dark'?'light':'dark');
}

// ========== LOCALSTORAGE (marked users) ==========
function loadSelectedUsers(){
    try {
        const saved = localStorage.getItem('selectedUsers');
        if(saved) selectedUsers = new Set(JSON.parse(saved));
    } catch(e){ selectedUsers = new Set(); }
}
function saveSelectedUsers(){
    localStorage.setItem('selectedUsers', JSON.stringify([...selectedUsers]));
}
loadSelectedUsers();

// ========== ON LOAD ==========
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();

    // Alphabetic buttons removed — searches use the search input
    setTimeout(checkCachedData, 300);
});

// ========== INSTRUCTIONS ==========
function toggleInstructions(){
    document.getElementById('instructionsBody').classList.toggle('open');
    document.getElementById('toggleIcon').classList.toggle('rotated');
}

// ========== DASHBOARD ==========
let chartsBuilt = false;
function toggleDashboard(){
    const body = document.getElementById('dashboardBody');
    const icon = document.getElementById('dashboardToggleIcon');
    body.classList.toggle('open');
    icon.classList.toggle('rotated');
    if(body.classList.contains('open') && !chartsBuilt){
        buildCharts();
        chartsBuilt = true;
    }
}

// ========== FILE UPLOAD ==========
const dropZone  = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click', ()=> fileInput.click());
dropZone.addEventListener('dragover', e=>{ e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()=> dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e=>{
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if(files.length>0 && files[0].name.toLowerCase().endsWith('.zip')) handleFile(files[0]);
    else showToast('Please upload a valid .zip file','error');
});
fileInput.addEventListener('change', e=>{ if(e.target.files.length>0) handleFile(e.target.files[0]); });

function handleFile(file){
    uploadedFile = file;
    document.getElementById('fileName').textContent = file.name+' ('+formatSize(file.size)+')';
    document.getElementById('fileInfo').classList.remove('hidden');
    document.getElementById('analyzeBtn').classList.remove('hidden');
    dropZone.style.display='none';
}
function removeFile(){
    uploadedFile=null; fileInput.value='';
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('analyzeBtn').classList.add('hidden');
    dropZone.style.display='block';
    document.getElementById('statsSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
    chartsBuilt=false;
    checkCachedData();
}
function formatSize(bytes){
    if(bytes<1024) return bytes+' B';
    if(bytes<1048576) return (bytes/1024).toFixed(1)+' KB';
    return (bytes/1048576).toFixed(1)+' MB';
}

// ========== ZIP HELPERS ==========
function findFileInZip(zip, names){
    const allPaths = Object.keys(zip.files);
    for(const name of names){
        for(const path of allPaths){
            const fn = path.split('/').pop();
            if(fn===name){ const f=zip.file(path); if(f&&!f.dir) return f; }
        }
    }
    return null;
}
async function parseDataFile(zip, baseNames){
    const all=[];
    baseNames.forEach(n=>{ all.push(n+'.json'); all.push(n+'.html'); });
    const file = findFileInZip(zip, all);
    if(!file){ console.warn('⚠️ Not found:',baseNames.join(' OR ')); return null; }
    try{
        const text = await file.async('text');
        const isHtml = file.name.toLowerCase().endsWith('.html');
        if(isHtml){ console.log('✅ HTML:',file.name); return {__isHtml:true, html:text}; }
        console.log('✅ JSON:',file.name); return JSON.parse(text);
    } catch(e){ console.error('❌ Parse:',e); return null; }
}

// ========== EXTRACT USERNAME FROM HREF ==========
function extractUsernameFromHref(href){
    if(!href||typeof href!=='string') return null;
    let m=href.match(/instagram\.com\/_u\/([^/?#\s]+)/);
    if(m&&m[1]) return m[1].trim();
    m=href.match(/instagram\.com\/([^/?#\s]+)/);
    if(m&&m[1]){
        const u=m[1].trim();
        const bad=['_u','p','reel','reels','explore','stories','tv','accounts'];
        if(!bad.includes(u.toLowerCase())) return u;
    }
    return null;
}

// ========== EXTRACT FROM HTML ==========
function extractUsersFromHTML(html){
    const users=[]; const seen=new Set();
    function add(u,ts){
        if(!u||typeof u!=='string') return;
        u=u.trim();
        if(!u||u.length>50) return;
        const bad=['_u','p','reel','reels','explore','stories','tv','accounts'];
        if(bad.includes(u.toLowerCase())) return;
        if(u.includes(' ')||u.includes('\n')) return;
        const k=u.toLowerCase(); if(seen.has(k)) return;
        seen.add(k); users.push({username:u,timestamp:ts||''});
    }
    try{
        const doc=new DOMParser().parseFromString(html,'text/html');
        doc.querySelectorAll('a[href*="instagram.com"]').forEach(a=>{
            const href=a.getAttribute('href')||'';
            let u=null;
            let m=href.match(/instagram\.com\/_u\/([^/?#\s]+)/);
            if(m&&m[1]) u=m[1].trim();
            else{ m=href.match(/instagram\.com\/([^/?#\s]+)/); if(m&&m[1]) u=m[1].trim(); }
            if(!u){ const t=a.textContent.trim(); if(t&&/^[a-zA-Z0-9._]+$/.test(t)) u=t; }
            if(u) add(u,'');
        });
    } catch(e){ console.error('HTML parse:',e); }
    return users;
}

// ========== EXTRACT USERS ==========
function extractUsers(data){
    if(!data) return [];
    if(data.__isHtml) return extractUsersFromHTML(data.html);
    const users=[]; const seen=new Set();
    function add(u,ts){
        if(!u||typeof u!=='string') return;
        u=u.trim();
        if(!u||u.length>50) return;
        if(u.includes(' ')||u.includes('\n')||u.includes('"')) return;
        const k=u.toLowerCase(); if(seen.has(k)) return;
        seen.add(k);
        users.push({username:u, timestamp:ts?new Date(ts*1000).toLocaleDateString():''});
    }
    function proc(e){
        if(!e||typeof e!=='object'||Array.isArray(e)) return false;
        let u=null,ts=null;
        if(typeof e.timestamp==='number') ts=e.timestamp;
        if(Array.isArray(e.label_values)){
            for(const lv of e.label_values){
                if(lv&&lv.label==='Username'&&lv.value&&typeof lv.value==='string'&&lv.value.trim()){
                    u=lv.value.trim(); break;
                }
            }
        }
        if(!u&&Array.isArray(e.string_list_data)&&e.string_list_data.length>0){
            const s=e.string_list_data[0];
            if(typeof s.timestamp==='number') ts=s.timestamp;
            if(s.value&&typeof s.value==='string'&&s.value.trim()) u=s.value.trim();
            else if(s.href) u=extractUsernameFromHref(s.href);
        }
        if(!u&&e.title&&typeof e.title==='string'&&e.title.trim()) u=e.title.trim();
        if(!u&&e.username&&typeof e.username==='string') u=e.username.trim();
        if(u){ add(u,ts); return true; }
        return false;
    }
    function walk(n){
        if(!n) return;
        if(Array.isArray(n)){ for(const i of n){ const p=proc(i); if(!p&&i&&typeof i==='object') walk(i); } return; }
        if(typeof n==='object'){ const p=proc(n); if(p) return; for(const k of Object.keys(n)) walk(n[k]); }
    }
    if(!Array.isArray(data)&&typeof data==='object'){
        if(Array.isArray(data.label_values)) proc(data); else walk(data);
    } else walk(data);
    console.log('   👥',users.length,'users');
    return users;
}

// ========== ANALYZE ==========
async function analyzeData(){
    if(!uploadedFile) return;
    const loader=document.getElementById('loader');
    loader.classList.remove('hidden');
    try{
        const zip = await JSZip.loadAsync(uploadedFile);
        console.log('📂 ZIP files:');
        Object.keys(zip.files).forEach(p=>{ if(!zip.files[p].dir) console.log('  ',p); });

        const [fRaw,foRaw,pRaw,bRaw,ruRaw,rrRaw,reRaw,cfRaw,hsRaw] = await Promise.all([
            parseDataFile(zip,['followers_1','followers']),
            parseDataFile(zip,['following','following_1']),
            parseDataFile(zip,['pending_follow_requests']),
            parseDataFile(zip,['blocked_profiles']),
            parseDataFile(zip,['recently_unfollowed_profiles','recently_unfollowed_accounts']),
            parseDataFile(zip,['recent_follow_requests']),
            parseDataFile(zip,['restricted_profiles']),
            parseDataFile(zip,['close_friends']),
            parseDataFile(zip,['hide_story_from']),
        ]);

        appData.followers        = extractUsers(fRaw);
        appData.following        = extractUsers(foRaw);
        appData.pending          = extractUsers(pRaw);
        appData.blocked          = extractUsers(bRaw);
        appData.recentlyUnfollowed = extractUsers(ruRaw);
        appData.recentRequests   = extractUsers(rrRaw);
        appData.restricted       = extractUsers(reRaw);
        appData.closeFriends     = extractUsers(cfRaw);
        appData.hideStoryFrom    = extractUsers(hsRaw);

        const fSet  = new Set(appData.followers.map(u=>u.username.toLowerCase()));
        const foSet = new Set(appData.following.map(u=>u.username.toLowerCase()));
        appData.unfollowers = appData.following.filter(u=>!fSet.has(u.username.toLowerCase()));
        appData.fans        = appData.followers.filter(u=>!foSet.has(u.username.toLowerCase()));
        appData.mutuals     = appData.following.filter(u=>fSet.has(u.username.toLowerCase()));

        if(appData.followers.length===0 && appData.following.length===0)
            throw new Error('No data found. Check console (F12).');

        undoStack=[]; redoStack=[];
        updateUndoRedoUI();
        chartsBuilt=false;

        updateStats();
        updateAlphabetFilter();
        switchTab('unfollowers', document.querySelector('.tab[data-tab="unfollowers"]'));

        document.getElementById('statsSection').classList.remove('hidden');
        document.getElementById('dashboardSection').classList.remove('hidden');
        document.getElementById('resultsSection').classList.remove('hidden');

        setTimeout(()=> document.getElementById('statsSection').scrollIntoView({behavior:'smooth'}), 100);
        showToast('✅ Analysis complete!','success');

        // 💾 Save to IndexedDB
        saveCachedData();
        document.getElementById('cachedBanner').classList.add('hidden');

    } catch(err){
        console.error('❌',err);
        showToast('Error: '+err.message,'error');
    } finally {
        loader.classList.add('hidden');
    }
}

// ========== UPDATE STATS ==========
function updateStats(){
    document.getElementById('totalFollowers').textContent  = appData.followers.length.toLocaleString();
    document.getElementById('totalFollowing').textContent  = appData.following.length.toLocaleString();
    document.getElementById('totalUnfollowers').textContent= appData.unfollowers.length.toLocaleString();
    document.getElementById('totalFans').textContent       = appData.fans.length.toLocaleString();
    document.getElementById('totalMutuals').textContent    = appData.mutuals.length.toLocaleString();

    const ids={
        tabUnfollowers:'unfollowers', tabFans:'fans', tabMutuals:'mutuals',
        tabFollowers:'followers', tabFollowing:'following', tabPending:'pending',
        tabBlocked:'blocked', tabRecentlyUnfollowed:'recentlyUnfollowed',
        tabRecentRequests:'recentRequests', tabRestricted:'restricted',
        tabCloseFriends:'closeFriends', tabHideStoryFrom:'hideStoryFrom'
    };
    Object.entries(ids).forEach(([id,key])=>{
        document.getElementById(id).textContent = appData[key].length;
    });
}

// ========== CHARTS ==========
function buildCharts(){
    const isDark = !document.documentElement.hasAttribute('data-theme');
    const tc = isDark?'#a0a0b8':'#5a5a70';
    const gc = isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)';

    if(donutChartInst){ donutChartInst.destroy(); donutChartInst=null; }
    if(barChartInst){ barChartInst.destroy(); barChartInst=null; }

    donutChartInst = new Chart(document.getElementById('donutChart').getContext('2d'),{
        type:'doughnut',
        data:{
            labels:['Unfollowers','Fans','Mutuals','Blocked','Pending'],
            datasets:[{
                data:[appData.unfollowers.length,appData.fans.length,appData.mutuals.length,appData.blocked.length,appData.pending.length],
                backgroundColor:['rgba(255,23,68,0.85)','rgba(0,200,83,0.85)','rgba(0,188,212,0.85)','rgba(255,171,0,0.85)','rgba(131,58,180,0.85)'],
                borderColor:isDark?'#1a1a2e':'#ffffff',
                borderWidth:3,hoverOffset:8
            }]
        },
        options:{responsive:true,maintainAspectRatio:false,cutout:'65%',
            plugins:{
                legend:{position:'bottom',labels:{color:tc,padding:12,font:{size:11,weight:'600'},boxWidth:12,boxHeight:12}},
                tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed.toLocaleString()}`}}
            }
        }
    });

    barChartInst = new Chart(document.getElementById('barChart').getContext('2d'),{
        type:'bar',
        data:{
            labels:['Followers','Following','Unfollow','Fans','Mutuals','Pending','Blocked','Restricted'],
            datasets:[{
                label:'Count',
                data:[appData.followers.length,appData.following.length,appData.unfollowers.length,appData.fans.length,appData.mutuals.length,appData.pending.length,appData.blocked.length,appData.restricted.length],
                backgroundColor:['rgba(41,121,255,0.75)','rgba(131,58,180,0.75)','rgba(255,23,68,0.75)','rgba(0,200,83,0.75)','rgba(0,188,212,0.75)','rgba(247,119,55,0.75)','rgba(255,171,0,0.75)','rgba(233,30,99,0.75)'],
                borderColor:['rgba(41,121,255,1)','rgba(131,58,180,1)','rgba(255,23,68,1)','rgba(0,200,83,1)','rgba(0,188,212,1)','rgba(247,119,55,1)','rgba(255,171,0,1)','rgba(233,30,99,1)'],
                borderWidth:2,borderRadius:8,borderSkipped:false
            }]
        },
        options:{responsive:true,maintainAspectRatio:false,
            plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.y.toLocaleString()} accounts`}}},
            scales:{
                x:{ticks:{color:tc,font:{size:10,weight:'600'}},grid:{color:gc}},
                y:{ticks:{color:tc},grid:{color:gc},beginAtZero:true}
            }
        }
    });

    updateRatioBars();
}

function updateRatioBars(){
    const fo = Math.max(appData.following.length,1);
    const fr = Math.max(appData.followers.length,1);
    setRatio('ratioUnfollowers','ratioBarUnfollowers', Math.round((appData.unfollowers.length/fo)*100));
    setRatio('ratioFans','ratioBarFans', Math.round((appData.fans.length/fr)*100));
    setRatio('ratioMutuals','ratioBarMutuals', Math.round((appData.mutuals.length/fo)*100));
    setRatio('ratioBlocked','ratioBarBlocked', Math.round((appData.blocked.length/fr)*100));
}
function setRatio(lid,bid,pct){
    document.getElementById(lid).textContent=pct+'%';
    setTimeout(()=>{ document.getElementById(bid).style.width=Math.min(pct,100)+'%'; },400);
}

// ========== SWITCH TAB ==========
function switchTab(tab, el){
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    if(el) el.classList.add('active');
    document.getElementById('searchInput').value='';
    document.getElementById('filterSelect').value='all';
    document.getElementById('patternFilter').value='contains';
    document.getElementById('sortSelect').value='default';
    document.getElementById('btnClearSearch').classList.add('hidden');
    bulkChecked.clear();
    currentLetterFilter='all';
    setActiveLetterBtn('all');
    updateBulkBar();
    document.getElementById('selectAllCheckbox').checked=false;
    updateAlphabetFilter();
    renderList();
}

// ========== ALPHABET FILTER ==========
function updateAlphabetFilter(){
    const data = appData[currentTab]||[];
    const letters = new Set(data.map(u=>u.username.charAt(0).toUpperCase()));
    const hasUnderscore = data.some(u=>u.username.startsWith('_'));
    const hasNumber     = data.some(u=>/^[0-9]/.test(u.username));

    document.querySelectorAll('.letter-btn').forEach(btn=>{
        const l = btn.dataset.letter;
        btn.classList.remove('has-data','active');
        if(l===currentLetterFilter) btn.classList.add('active');
        if(l==='all') return;
        if(l==='_' && hasUnderscore) btn.classList.add('has-data');
        else if(l==='#' && hasNumber) btn.classList.add('has-data');
        else if(letters.has(l)) btn.classList.add('has-data');
    });
}
function setLetterFilter(letter, btn){
    currentLetterFilter = letter;
    document.querySelectorAll('.letter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderList();
}
function setActiveLetterBtn(letter){
    document.querySelectorAll('.letter-btn').forEach(b=>{
        b.classList.toggle('active', b.dataset.letter===letter);
    });
}

// ========== EMPTY STATE ==========
function getEmptyStateHTML(){
    const m={
        unfollowers:{icon:'fa-smile-beam',title:'Great news!',desc:'Everyone you follow also follows you back.'},
        fans:{icon:'fa-handshake',title:'No one-sided fans',desc:'You follow back everyone who follows you.'},
        mutuals:{icon:'fa-user-friends',title:'No mutual followers',desc:'Nobody is mutual yet.'},
        followers:{icon:'fa-users',title:'No followers found',desc:'Your followers data is empty.'},
        following:{icon:'fa-user-plus',title:'Not following anyone',desc:'Your following list is empty.'},
        pending:{icon:'fa-clock',title:'No pending requests',desc:'No follow requests waiting.'},
        blocked:{icon:'fa-ban',title:'No blocked accounts',desc:"You haven't blocked anyone."},
        recentlyUnfollowed:{icon:'fa-user-slash',title:'No recent unfollows',desc:"You haven't unfollowed anyone recently."},
        recentRequests:{icon:'fa-paper-plane',title:'No recent requests',desc:'No recent follow requests.'},
        restricted:{icon:'fa-eye-slash',title:'No restricted accounts',desc:"You haven't restricted anyone."},
        closeFriends:{icon:'fa-star',title:'No close friends',desc:"Close friends list is empty."},
        hideStoryFrom:{icon:'fa-user-secret',title:'Story visible to all',desc:"You haven't hidden your story from anyone."}
    };
    const s=m[currentTab]||{icon:'fa-inbox',title:'No data',desc:'No users found.'};
    return `<i class="fas ${s.icon}"></i><h3>${s.title}</h3><p>${s.desc}</p>`;
}

// ========== RENDER LIST ==========
function renderList(){
    const list        = document.getElementById('userList');
    const emptyState  = document.getElementById('emptyState');
    const search      = document.getElementById('searchInput').value.toLowerCase().trim();
    const filterVal   = document.getElementById('filterSelect').value;
    const patternVal  = document.getElementById('patternFilter').value;
    const sortVal     = document.getElementById('sortSelect').value;

    let data = [...(appData[currentTab]||[])];

    if(search){
        data = data.filter(u=>{
            const un = u.username.toLowerCase();
            if(patternVal==='startswith') return un.startsWith(search);
            if(patternVal==='endswith') return un.endsWith(search);
            return un.includes(search);
        });
    }

    if(filterVal==='marked')   data=data.filter(u=>selectedUsers.has(currentTab+':'+u.username.toLowerCase()));
    if(filterVal==='unmarked') data=data.filter(u=>!selectedUsers.has(currentTab+':'+u.username.toLowerCase()));

    if(currentLetterFilter!=='all'){
        if(currentLetterFilter==='_') data=data.filter(u=>u.username.startsWith('_'));
        else if(currentLetterFilter==='#') data=data.filter(u=>/^[0-9]/.test(u.username));
        else data=data.filter(u=>u.username.charAt(0).toUpperCase()===currentLetterFilter);
    }

    if(sortVal==='az') data.sort((a,b)=>a.username.localeCompare(b.username));
    else if(sortVal==='za') data.sort((a,b)=>b.username.localeCompare(a.username));
    else if(sortVal==='date_new') data.sort((a,b)=>{ const da=new Date(a.timestamp||0),db=new Date(b.timestamp||0); return db-da; });
    else if(sortVal==='date_old') data.sort((a,b)=>{ const da=new Date(a.timestamp||0),db=new Date(b.timestamp||0); return da-db; });
    else if(sortVal==='marked_first') data.sort((a,b)=>{
        const am=selectedUsers.has(currentTab+':'+a.username.toLowerCase());
        const bm=selectedUsers.has(currentTab+':'+b.username.toLowerCase());
        return (bm?1:0)-(am?1:0);
    });
    else if(sortVal==='unmarked_first') data.sort((a,b)=>{
        const am=selectedUsers.has(currentTab+':'+a.username.toLowerCase());
        const bm=selectedUsers.has(currentTab+':'+b.username.toLowerCase());
        return (am?1:0)-(bm?1:0);
    });

    list.innerHTML='';

    if(data.length===0){
        emptyState.classList.remove('hidden');
        emptyState.innerHTML=getEmptyStateHTML();
        updateBulkBar(); return;
    }
    emptyState.classList.add('hidden');

    const frag = document.createDocumentFragment();
    data.forEach((user,index)=>{
        const isSelected    = selectedUsers.has(currentTab+':'+user.username.toLowerCase());
        const isBulkChecked = bulkChecked.has(user.username.toLowerCase());
        const profileUrl    = 'https://instagram.com/'+encodeURIComponent(user.username);

        const item = document.createElement('div');
        item.className = 'user-item'+(isSelected?' selected':'');

        const cb = document.createElement('input');
        cb.type='checkbox'; cb.className='user-checkbox'; cb.checked=isBulkChecked;
        cb.addEventListener('change',()=>{
            if(cb.checked) bulkChecked.add(user.username.toLowerCase());
            else bulkChecked.delete(user.username.toLowerCase());
            updateBulkBar();
            syncSelectAll(data);
        });

        const num = document.createElement('div');
        num.className='user-number'; num.textContent=index+1;

        const av = document.createElement('div');
        av.className='user-avatar';
        const firstChar = user.username.replace(/^_+/, '').charAt(0) || user.username.charAt(0);
        av.textContent = firstChar.toUpperCase();

        const info = document.createElement('div');
        info.className='user-info';

        const nameLink = document.createElement('a');
        nameLink.className='user-name';
        nameLink.href=profileUrl; nameLink.target='_blank'; nameLink.rel='noopener noreferrer';
        nameLink.textContent=user.username;

        info.appendChild(nameLink);
        if(user.timestamp){
            const ts=document.createElement('div');
            ts.className='user-timestamp';
            ts.innerHTML='<i class="far fa-calendar-alt"></i> '+escapeHtml(user.timestamp);
            info.appendChild(ts);
        }

        const acts = document.createElement('div');
        acts.className='user-actions';

        const visit = document.createElement('a');
        visit.className='btn-visit'; visit.href=profileUrl; visit.target='_blank'; visit.rel='noopener noreferrer';
        visit.innerHTML='<i class="fab fa-instagram"></i><span>Visit</span>';

        const selBtn = document.createElement(isSelected?'button':'a');
        selBtn.className='btn-select'+(isSelected?' selected':'');
        selBtn.innerHTML='<i class="fas '+(isSelected?'fa-undo':'fa-check')+'"></i>';
        if(isSelected){
            selBtn.title='Unmark'; selBtn.type='button';
            selBtn.addEventListener('click',e=>{ e.preventDefault(); e.stopPropagation(); toggleSelect(user.username); });
        } else {
            selBtn.title='Mark & visit'; selBtn.href=profileUrl; selBtn.target='_blank'; selBtn.rel='noopener noreferrer';
            selBtn.addEventListener('click',()=> toggleSelect(user.username));
        }

        acts.appendChild(visit); acts.appendChild(selBtn);
        item.appendChild(cb); item.appendChild(num); item.appendChild(av); item.appendChild(info); item.appendChild(acts);

        frag.appendChild(item);
    });
    list.appendChild(frag);
    updateBulkBar();
    syncSelectAll(data);
}

function syncSelectAll(data){
    const cb=document.getElementById('selectAllCheckbox');
    if(!data||!data.length){ cb.checked=false; cb.indeterminate=false; return; }
    const n=data.filter(u=>bulkChecked.has(u.username.toLowerCase())).length;
    if(n===0){ cb.checked=false; cb.indeterminate=false; }
    else if(n===data.length){ cb.checked=true; cb.indeterminate=false; }
    else{ cb.checked=false; cb.indeterminate=true; }
}

// ========== TOGGLE SELECT (Undo/Redo) ==========
function toggleSelect(username, skipHistory=false){
    const key = currentTab+':'+username.toLowerCase();
    const prev = selectedUsers.has(key);

    if(prev) selectedUsers.delete(key);
    else selectedUsers.add(key);

    saveSelectedUsers();

    if(!skipHistory){
        undoStack.push({ type:'toggle', tab:currentTab, key, prev });
        if(undoStack.length>MAX_HISTORY) undoStack.shift();
        redoStack=[];
        updateUndoRedoUI();
    }

    setTimeout(()=>renderList(), 50);
}

// ========== UNDO / REDO ==========
function undoAction(){
    if(!undoStack.length) return;
    const action = undoStack.pop();
    if(action.type==='toggle'){
        if(action.prev) selectedUsers.add(action.key);
        else selectedUsers.delete(action.key);
        saveSelectedUsers();
        redoStack.push(action);
    } else if(action.type==='bulk'){
        action.changes.forEach(({key,prev})=>{
            if(prev) selectedUsers.add(key);
            else selectedUsers.delete(key);
        });
        saveSelectedUsers();
        redoStack.push(action);
    }
    updateUndoRedoUI();
    renderList();
    showToast('↩️ Undone','info');
}

function redoAction(){
    if(!redoStack.length) return;
    const action = redoStack.pop();
    if(action.type==='toggle'){
        if(action.prev) selectedUsers.delete(action.key);
        else selectedUsers.add(action.key);
        saveSelectedUsers();
        undoStack.push(action);
    } else if(action.type==='bulk'){
        action.changes.forEach(({key,prev})=>{
            if(prev) selectedUsers.delete(key);
            else selectedUsers.add(key);
        });
        saveSelectedUsers();
        undoStack.push(action);
    }
    updateUndoRedoUI();
    renderList();
    showToast('↪️ Redone','info');
}

function updateUndoRedoUI(){
    const btnU = document.getElementById('btnUndo');
    const btnR = document.getElementById('btnRedo');
    const lbl  = document.getElementById('undoHistoryLabel');
    btnU.disabled = undoStack.length===0;
    btnR.disabled = redoStack.length===0;
    if(undoStack.length>0){
        lbl.textContent = `History: ${undoStack.length} action${undoStack.length!==1?'s':''}`;
    } else lbl.textContent='';
}

// ========== FILTER ==========
function filterList(){
    const val = document.getElementById('searchInput').value;
    const btn = document.getElementById('btnClearSearch');
    btn.classList.toggle('hidden', val.length===0);
    bulkChecked.clear();
    renderList();
}
function clearSearch(){
    document.getElementById('searchInput').value='';
    document.getElementById('btnClearSearch').classList.add('hidden');
    renderList();
}

// ========== BULK ACTIONS ==========
function updateBulkBar(){
    document.getElementById('bulkCount').textContent = bulkChecked.size+' selected';
}
function toggleSelectAll(checkbox){
    let data = [...(appData[currentTab]||[])];
    const search = document.getElementById('searchInput').value.toLowerCase().trim();
    const fv = document.getElementById('filterSelect').value;
    const pv = document.getElementById('patternFilter').value;
    if(search){
        data = data.filter(u=>{
            const un = u.username.toLowerCase();
            if(pv==='startswith') return un.startsWith(search);
            if(pv==='endswith') return un.endsWith(search);
            return un.includes(search);
        });
    }
    if(fv==='marked') data=data.filter(u=>selectedUsers.has(currentTab+':'+u.username.toLowerCase()));
    if(fv==='unmarked') data=data.filter(u=>!selectedUsers.has(currentTab+':'+u.username.toLowerCase()));
    if(currentLetterFilter!=='all'){
        if(currentLetterFilter==='_') data=data.filter(u=>u.username.startsWith('_'));
        else if(currentLetterFilter==='#') data=data.filter(u=>/^[0-9]/.test(u.username));
        else data=data.filter(u=>u.username.charAt(0).toUpperCase()===currentLetterFilter);
    }
    if(checkbox.checked) data.forEach(u=>bulkChecked.add(u.username.toLowerCase()));
    else data.forEach(u=>bulkChecked.delete(u.username.toLowerCase()));
    renderList();
}
function bulkMarkSelected(){
    if(!bulkChecked.size){ showToast('No users selected','error'); return; }
    const changes=[];
    bulkChecked.forEach(username=>{
        const key=currentTab+':'+username;
        const prev=selectedUsers.has(key);
        selectedUsers.add(key);
        changes.push({key,prev});
    });
    saveSelectedUsers();
    undoStack.push({type:'bulk',changes});
    if(undoStack.length>MAX_HISTORY) undoStack.shift();
    redoStack=[];
    updateUndoRedoUI();
    const cnt=bulkChecked.size;
    bulkChecked.clear();
    document.getElementById('selectAllCheckbox').checked=false;
    renderList();
    showToast(`✅ Marked ${cnt} users`,'success');
}
function bulkUnmarkSelected(){
    if(!bulkChecked.size){ showToast('No users selected','error'); return; }
    const changes=[];
    bulkChecked.forEach(username=>{
        const key=currentTab+':'+username;
        const prev=selectedUsers.has(key);
        selectedUsers.delete(key);
        changes.push({key,prev});
    });
    saveSelectedUsers();
    undoStack.push({type:'bulk',changes});
    if(undoStack.length>MAX_HISTORY) undoStack.shift();
    redoStack=[];
    updateUndoRedoUI();
    const cnt=bulkChecked.size;
    bulkChecked.clear();
    document.getElementById('selectAllCheckbox').checked=false;
    renderList();
    showToast(`↩️ Unmarked ${cnt} users`,'success');
}
function clearAllMarked(){
    const keys=[...selectedUsers].filter(k=>k.startsWith(currentTab+':'));
    if(!keys.length){ showToast('No marked users in this tab','error'); return; }
    const changes=keys.map(key=>({key,prev:true}));
    keys.forEach(k=>selectedUsers.delete(k));
    saveSelectedUsers();
    undoStack.push({type:'bulk',changes});
    if(undoStack.length>MAX_HISTORY) undoStack.shift();
    redoStack=[];
    updateUndoRedoUI();
    bulkChecked.clear();
    document.getElementById('selectAllCheckbox').checked=false;
    renderList();
    showToast(`🗑️ Cleared ${keys.length} marked users`,'success');
}

// Close modal on overlay click
document.addEventListener('click', e=>{
    if(e.target.classList.contains('modal-overlay')) {
        e.target.classList.add('hidden');
        e.target.style.display = 'none';
    }
});

// ========== TOAST ==========
function showToast(msg, type='info'){
    const colors={error:'#ff1744',success:'#00c853',info:'#2979ff',warning:'#ffab00'};
    const icons={error:'fa-times-circle',success:'fa-check-circle',info:'fa-info-circle',warning:'fa-exclamation-circle'};
    const toast=document.createElement('div');
    toast.className='toast';
    toast.style.background=colors[type]||colors.info;
    toast.innerHTML=`<i class="fas ${icons[type]||icons.info}"></i> ${escapeHtml(msg)}`;
    const container=document.getElementById('toastContainer');
    container.appendChild(toast);
    setTimeout(()=>{
        toast.classList.add('fade-out');
        setTimeout(()=>toast.remove(),300);
    },3500);
}

// ========== HELPERS ==========
function escapeHtml(t){
    const d=document.createElement('div');
    d.textContent=String(t);
    return d.innerHTML;
}
function getCreditsText(){
    return `Generated by Instagram Unfollowers Finder\nDeveloper: Amal Dev TS\nGmail: amalts5885@gmail.com\nGitHub: https://github.com/amaldev-ts\nInstagram: https://instagram.com/amaldev_ts`;
}
function getTabTitle(){
    const t={
        unfollowers:"Unfollowers (You follow them, they don't follow back)",
        fans:"Fans (They follow you, you don't follow back)",
        mutuals:"Mutuals (You follow each other)",
        followers:'Followers',following:'Following',
        pending:'Pending Follow Requests',blocked:'Blocked Profiles',
        recentlyUnfollowed:'Recently Unfollowed',recentRequests:'Recent Follow Requests',
        restricted:'Restricted Profiles',closeFriends:'Close Friends',
        hideStoryFrom:"Hidden Story From"
    };
    return t[currentTab]||currentTab;
}
function getTabShortTitle(){
    const t={unfollowers:'Unfollowers',fans:'Fans',mutuals:'Mutuals',followers:'Followers',following:'Following',pending:'Pending',blocked:'Blocked',recentlyUnfollowed:'Recently Unfollowed',recentRequests:'Recent Requests',restricted:'Restricted',closeFriends:'Close Friends',hideStoryFrom:'Hide Story From'};
    return t[currentTab]||currentTab;
}
function getCurrentData(){ return appData[currentTab]||[]; }

// ========== PDF ==========
function downloadPDF(){
    const data=getCurrentData();
    if(!data.length){ showToast('No data','error'); return; }
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF();
    const pw=doc.internal.pageSize.getWidth();
    let y=20;
    doc.setFont('helvetica','bold');doc.setFontSize(20);doc.setTextColor(225,48,108);
    doc.text('Instagram Unfollowers Finder',pw/2,y,{align:'center'});y+=10;
    doc.setFontSize(13);doc.setTextColor(100,100,100);
    doc.text(getTabTitle(),pw/2,y,{align:'center'});y+=7;
    doc.setFontSize(11);doc.text('Total: '+data.length,pw/2,y,{align:'center'});y+=8;
    doc.setDrawColor(225,48,108);doc.line(20,y,pw-20,y);y+=10;
    doc.setFont('helvetica','normal');doc.setFontSize(11);
    data.forEach((user,i)=>{
        if(y>270){doc.addPage();y=20;}
        const sel=selectedUsers.has(currentTab+':'+user.username.toLowerCase());
        if(sel){doc.setTextColor(180,180,180);doc.text((i+1)+'. [marked] @'+user.username,20,y);}
        else{doc.setTextColor(30,30,30);doc.text((i+1)+'. @'+user.username,20,y);}
        doc.setTextColor(100,100,180);doc.setFontSize(8);
        doc.textWithLink('instagram.com/'+user.username,140,y,{url:'https://instagram.com/'+user.username});
        doc.setFontSize(11);y+=7;
    });
    doc.addPage();y=30;
    doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(225,48,108);
    doc.text('Credits',pw/2,y,{align:'center'});y+=14;
    doc.setFont('helvetica','normal');doc.setFontSize(11);doc.setTextColor(80,80,80);
    getCreditsText().split('\n').forEach(l=>{doc.text(l,pw/2,y,{align:'center'});y+=7;});
    y+=10;doc.setFontSize(9);doc.setTextColor(150,150,150);
    doc.text('Generated: '+new Date().toLocaleString(),pw/2,y,{align:'center'});
    doc.save('instagram_'+currentTab+'_'+new Date().toISOString().slice(0,10)+'.pdf');
    showToast('PDF downloaded!','success');
}

// ========== JSON ==========
function downloadJSON(){
    const data=getCurrentData();
    if(!data.length){showToast('No data','error');return;}
    const out={
        title:getTabTitle(),category:currentTab,total:data.length,
        generated_at:new Date().toISOString(),
        credits:{tool:'Instagram Unfollowers Finder',developer:'Amal Dev TS',gmail:'amalts5885@gmail.com',github:'https://github.com/amaldev-ts',instagram:'https://instagram.com/amaldev_ts'},
        users:data.map((u,i)=>({number:i+1,username:u.username,profile_url:'https://instagram.com/'+u.username,timestamp:u.timestamp||null,marked:selectedUsers.has(currentTab+':'+u.username.toLowerCase())}))
    };
    const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='instagram_'+currentTab+'_'+new Date().toISOString().slice(0,10)+'.json';a.click();
    URL.revokeObjectURL(url);showToast('JSON downloaded!','success');
}

// ========== HTML ==========
function downloadHTML(){
    const data=getCurrentData();
    if(!data.length){showToast('No data','error');return;}
    let rows='';
    data.forEach((u,i)=>{
        const sel=selectedUsers.has(currentTab+':'+u.username.toLowerCase());
        rows+=`<tr style="${sel?'opacity:0.4;':''}"><td>${i+1}</td><td><a href="https://instagram.com/${escapeHtml(u.username)}" target="_blank" style="color:${sel?'#888':'#E1306C'};text-decoration:none;font-weight:600;">@${escapeHtml(u.username)}</a></td><td>${u.timestamp||'-'}</td><td><a href="https://instagram.com/${escapeHtml(u.username)}" target="_blank" style="color:#833AB4">Visit →</a></td></tr>`;
    });
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Instagram ${escapeHtml(getTabShortTitle())}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#0a0a0f;color:#fff;padding:40px 20px}.w{max-width:900px;margin:0 auto}h1{text-align:center;background:linear-gradient(135deg,#E1306C,#833AB4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:28px;margin-bottom:8px}p.sub{text-align:center;color:#a0a0b8;margin-bottom:4px}p.cnt{text-align:center;color:#E1306C;font-weight:700;margin-bottom:24px}table{width:100%;border-collapse:collapse;background:#1a1a2e;border-radius:12px;overflow:hidden}th,td{padding:12px 16px;text-align:left;border-bottom:1px solid #2a2a40}th{background:#222240;color:#a0a0b8;font-size:12px;text-transform:uppercase}.credits{text-align:center;margin-top:32px;padding:20px;background:#1a1a2e;border-radius:12px;color:#a0a0b8;font-size:13px}.credits a{color:#E1306C;text-decoration:none}</style></head><body><div class="w"><h1>${escapeHtml(getTabShortTitle())}</h1><p class="sub">${escapeHtml(getTabTitle())}</p><p class="cnt">${data.length} accounts</p><table><thead><tr><th>#</th><th>Username</th><th>Date</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table><div class="credits"><p><strong>Instagram Unfollowers Finder</strong></p><p>Built by <a href="https://instagram.com/amaldev_ts" target="_blank">Amal Dev TS</a></p><p>📧 <a href="mailto:amalts5885@gmail.com">amalts5885@gmail.com</a> &nbsp;|&nbsp; 🐙 <a href="https://github.com/amaldev-ts" target="_blank">GitHub</a></p></div></div></body></html>`;
    const blob=new Blob([html],{type:'text/html'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='instagram_'+currentTab+'_'+new Date().toISOString().slice(0,10)+'.html';a.click();
    URL.revokeObjectURL(url);showToast('HTML downloaded!','success');
}

// ========== CSV ==========
function downloadCSV(){
    const data=getCurrentData();
    if(!data.length){showToast('No data','error');return;}
    function esc(v){
        if(v==null) return '';
        const s=String(v);
        if(/[",\n\r]/.test(s)) return '"'+s.replace(/"/g,'""')+'"';
        return s;
    }
    let csv='# Instagram Unfollowers Finder\r\n# Category: '+getTabTitle()+'\r\n# Total: '+data.length+'\r\n# Generated: '+new Date().toLocaleString()+'\r\n# Developer: Amal Dev TS\r\n\r\n';
    csv+='Number,Username,Profile URL,Date,Marked\r\n';
    data.forEach((u,i)=>{
        const m=selectedUsers.has(currentTab+':'+u.username.toLowerCase());
        csv+=[esc(i+1),esc(u.username),esc('https://instagram.com/'+u.username),esc(u.timestamp||''),esc(m?'Yes':'No')].join(',')+'\r\n';
    });
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='instagram_'+currentTab+'_'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);showToast('CSV downloaded!','success');
}

// ========== EXCEL ==========
function downloadExcel(){
    const data=getCurrentData();
    if(!data.length){showToast('No data','error');return;}
    if(typeof XLSX==='undefined'){showToast('Excel library not loaded','error');return;}
    const wb=XLSX.utils.book_new();
    const wsData=[['#','Username','Profile URL','Date','Marked']];
    data.forEach((u,i)=>{
        const m=selectedUsers.has(currentTab+':'+u.username.toLowerCase());
        wsData.push([i+1,u.username,'https://instagram.com/'+u.username,u.timestamp||'',m?'Yes':'No']);
    });
    const ws=XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols']=[{wch:6},{wch:28},{wch:42},{wch:16},{wch:10}];
    XLSX.utils.book_append_sheet(wb,ws,getTabShortTitle());
    const statsData=[
        ['Instagram Unfollowers Finder — Statistics'],[''],
        ['Category','Count'],
        ['Followers',appData.followers.length],['Following',appData.following.length],
        ['Unfollowers',appData.unfollowers.length],['Fans',appData.fans.length],
        ['Mutuals',appData.mutuals.length],['Pending',appData.pending.length],
        ['Blocked',appData.blocked.length],['Recently Unfollowed',appData.recentlyUnfollowed.length],
        ['Recent Requests',appData.recentRequests.length],['Restricted',appData.restricted.length],
        ['Close Friends',appData.closeFriends.length],['Hide Story From',appData.hideStoryFrom.length],
        [''],['Generated',new Date().toLocaleString()],
        ['Developer','Amal Dev TS'],['GitHub','https://github.com/amaldev-ts'],
        ['Instagram','https://instagram.com/amaldev_ts']
    ];
    const wsStats=XLSX.utils.aoa_to_sheet(statsData);
    wsStats['!cols']=[{wch:24},{wch:16}];
    XLSX.utils.book_append_sheet(wb,wsStats,'Statistics');
    XLSX.writeFile(wb,'instagram_'+currentTab+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
    showToast('Excel downloaded!','success');
}
