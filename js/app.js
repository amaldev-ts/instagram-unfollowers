// ========== INSTAGRAM UNFOLLOWERS FINDER - v4 ==========
console.log('✅ app.js v4 LOADED');

// ========== GLOBAL STATE ==========
let appData = {
    followers: [], following: [], unfollowers: [], fans: [], mutuals: [],
    pending: [], blocked: [], recentlyUnfollowed: [],
    recentRequests: [], restricted: [],
};
let currentTab = 'unfollowers';
let selectedUsers = new Set();
let uploadedFile = null;

// ========== THEME TOGGLE ==========
function loadTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    setTheme(saved);
}

function setTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.getElementById('themeIcon').className = 'fas fa-moon';
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.getElementById('themeIcon').className = 'fas fa-sun';
    }
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    const current = localStorage.getItem('theme') || 'dark';
    setTheme(current === 'dark' ? 'light' : 'dark');
}

// Load theme immediately
document.addEventListener('DOMContentLoaded', loadTheme);

// ========== LOCALSTORAGE ==========
function loadSelectedUsers() {
    try {
        const saved = localStorage.getItem('selectedUsers');
        if (saved) selectedUsers = new Set(JSON.parse(saved));
    } catch (e) { selectedUsers = new Set(); }
}
function saveSelectedUsers() {
    localStorage.setItem('selectedUsers', JSON.stringify([...selectedUsers]));
}
loadSelectedUsers();

// ========== INSTRUCTIONS TOGGLE ==========
function toggleInstructions() {
    document.getElementById('instructionsBody').classList.toggle('open');
    document.getElementById('toggleIcon').classList.toggle('rotated');
}

// ========== FILE UPLOAD ==========
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.toLowerCase().endsWith('.zip')) handleFile(files[0]);
    else showToast('Please upload a valid .zip file', 'error');
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

function handleFile(file) {
    uploadedFile = file;
    document.getElementById('fileName').textContent = file.name + ' (' + formatSize(file.size) + ')';
    document.getElementById('fileInfo').classList.remove('hidden');
    document.getElementById('analyzeBtn').classList.remove('hidden');
    dropZone.style.display = 'none';
}

function removeFile() {
    uploadedFile = null;
    fileInput.value = '';
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('analyzeBtn').classList.add('hidden');
    dropZone.style.display = 'block';
    document.getElementById('statsSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ========== FIND FILE IN ZIP ==========
function findFileInZip(zip, possibleNames) {
    const allPaths = Object.keys(zip.files);
    for (const name of possibleNames) {
        for (const path of allPaths) {
            const fileName = path.split('/').pop();
            if (fileName === name) {
                const file = zip.file(path);
                if (file && !file.dir) return file;
            }
        }
    }
    return null;
}

async function parseJSONFile(zip, possibleNames) {
    const file = findFileInZip(zip, possibleNames);
    if (!file) {
        console.warn('⚠️ Not found:', possibleNames.join(' OR '));
        return null;
    }
    try {
        const text = await file.async('text');
        const data = JSON.parse(text);
        console.log('✅ Loaded:', file.name);
        return data;
    } catch (e) {
        console.error('❌ Parse error:', e);
        return null;
    }
}

// ========== EXTRACT USERNAME FROM HREF ==========
function extractUsernameFromHref(href) {
    if (!href || typeof href !== 'string') return null;
    let match = href.match(/instagram\.com\/_u\/([^/?#\s]+)/);
    if (match && match[1]) return match[1].trim();
    match = href.match(/instagram\.com\/([^/?#\s]+)/);
    if (match && match[1]) {
        const username = match[1].trim();
        const nonUsernames = ['_u', 'p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts'];
        if (!nonUsernames.includes(username.toLowerCase())) {
            return username;
        }
    }
    return null;
}

// ========== EXTRACT USERS ==========
function extractUsers(data) {
    if (!data) return [];
    const users = [];
    const seen = new Set();

    function addUser(username, timestamp) {
        if (!username || typeof username !== 'string') return;
        username = username.trim();
        if (username.length === 0 || username.length > 50) return;
        const key = username.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        users.push({
            username: username,
            timestamp: timestamp ? new Date(timestamp * 1000).toLocaleDateString() : ''
        });
    }

    function processEntry(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
        let username = null;
        let timestamp = null;

        if (Array.isArray(entry.string_list_data) && entry.string_list_data.length > 0) {
            const sld = entry.string_list_data[0];
            if (typeof sld.timestamp === 'number') timestamp = sld.timestamp;
            if (sld.value && typeof sld.value === 'string' && sld.value.trim()) {
                username = sld.value.trim();
            } else if (sld.href) {
                username = extractUsernameFromHref(sld.href);
            }
        }
        if (!username && entry.title && typeof entry.title === 'string' && entry.title.trim()) {
            username = entry.title.trim();
        }
        if (!username && entry.username && typeof entry.username === 'string') {
            username = entry.username.trim();
        }

        if (username) {
            addUser(username, timestamp);
            return true;
        }
        return false;
    }

    function findAndProcess(node) {
        if (!node) return;
        if (Array.isArray(node)) {
            for (const item of node) {
                const processed = processEntry(item);
                if (!processed && item && typeof item === 'object') findAndProcess(item);
            }
            return;
        }
        if (typeof node === 'object') {
            const processed = processEntry(node);
            if (processed) return;
            for (const key of Object.keys(node)) findAndProcess(node[key]);
        }
    }

    findAndProcess(data);
    console.log('   👥 Extracted', users.length, 'users');
    return users;
}

// ========== ANALYZE ==========
async function analyzeData() {
    if (!uploadedFile) return;
    const loader = document.getElementById('loader');
    loader.classList.remove('hidden');

    try {
        const zip = await JSZip.loadAsync(uploadedFile);

        console.log('═══════════════════════════════════');
        console.log('📂 FILES IN ZIP:');


// Check if ZIP contains HTML files instead of JSON
const allFiles = Object.keys(zip.files);
const hasJsonFiles = allFiles.some(f => f.toLowerCase().endsWith('.json'));
const hasHtmlFiles = allFiles.some(f => f.toLowerCase().endsWith('.html') && f.includes('connections'));

if (!hasJsonFiles && hasHtmlFiles) {
    loader.classList.add('hidden');
    showToast('❌ This ZIP contains HTML files. Please download again with JSON format selected!', 'error');
    throw new Error('Wrong format: HTML files detected. Please download Instagram data in JSON format.');
}


        Object.keys(zip.files).forEach(p => { if (!zip.files[p].dir) console.log('   📄', p); });
        console.log('═══════════════════════════════════');

        const followersRaw = await parseJSONFile(zip, ['followers_1.json', 'followers.json']);
        const followingRaw = await parseJSONFile(zip, ['following.json', 'following_1.json']);
        const pendingRaw = await parseJSONFile(zip, ['pending_follow_requests.json']);
        const blockedRaw = await parseJSONFile(zip, ['blocked_profiles.json']);
        const recentlyUnfollowedRaw = await parseJSONFile(zip, ['recently_unfollowed_profiles.json', 'recently_unfollowed_accounts.json']);
        const recentRequestsRaw = await parseJSONFile(zip, ['recent_follow_requests.json']);
        const restrictedRaw = await parseJSONFile(zip, ['restricted_profiles.json']);

        appData.followers = extractUsers(followersRaw);
        appData.following = extractUsers(followingRaw);
        appData.pending = extractUsers(pendingRaw);
        appData.blocked = extractUsers(blockedRaw);
        appData.recentlyUnfollowed = extractUsers(recentlyUnfollowedRaw);
        appData.recentRequests = extractUsers(recentRequestsRaw);
        appData.restricted = extractUsers(restrictedRaw);

        const followerSet = new Set(appData.followers.map(u => u.username.toLowerCase()));
        const followingSet = new Set(appData.following.map(u => u.username.toLowerCase()));

        // Unfollowers: You follow them, they don't follow you back
        appData.unfollowers = appData.following.filter(u => !followerSet.has(u.username.toLowerCase()));

        // Fans: They follow you, you don't follow back
        appData.fans = appData.followers.filter(u => !followingSet.has(u.username.toLowerCase()));

        // Mutuals: You follow each other
        appData.mutuals = appData.following.filter(u => followerSet.has(u.username.toLowerCase()));

        console.log('═══════════════════════════════════');
        console.log('📈 RESULTS:');
        console.log('   Followers:    ' + appData.followers.length);
        console.log('   Following:    ' + appData.following.length);
        console.log('   Mutuals:      ' + appData.mutuals.length);
        console.log('   Unfollowers:  ' + appData.unfollowers.length);
        console.log('   Fans:         ' + appData.fans.length);
        console.log('═══════════════════════════════════');

        if (appData.followers.length === 0 && appData.following.length === 0) {
            throw new Error('No data found. Check console (F12).');
        }

        updateStats();
        switchTab('unfollowers', document.querySelector('.tab[data-tab="unfollowers"]'));
        document.getElementById('statsSection').classList.remove('hidden');
        document.getElementById('resultsSection').classList.remove('hidden');

        setTimeout(() => {
            document.getElementById('statsSection').scrollIntoView({ behavior: 'smooth' });
        }, 100);

        showToast('✅ Analysis complete!', 'success');

    } catch (error) {
        console.error('❌ ERROR:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        loader.classList.add('hidden');
    }
}

// ========== UPDATE STATS ==========
function updateStats() {
    document.getElementById('totalFollowers').textContent = appData.followers.length.toLocaleString();
    document.getElementById('totalFollowing').textContent = appData.following.length.toLocaleString();
    document.getElementById('totalUnfollowers').textContent = appData.unfollowers.length.toLocaleString();
    document.getElementById('totalFans').textContent = appData.fans.length.toLocaleString();
    document.getElementById('totalMutuals').textContent = appData.mutuals.length.toLocaleString();

    document.getElementById('tabUnfollowers').textContent = appData.unfollowers.length;
    document.getElementById('tabFans').textContent = appData.fans.length;
    document.getElementById('tabMutuals').textContent = appData.mutuals.length;
    document.getElementById('tabFollowers').textContent = appData.followers.length;
    document.getElementById('tabFollowing').textContent = appData.following.length;
    document.getElementById('tabPending').textContent = appData.pending.length;
    document.getElementById('tabBlocked').textContent = appData.blocked.length;
    document.getElementById('tabRecentlyUnfollowed').textContent = appData.recentlyUnfollowed.length;
    document.getElementById('tabRecentRequests').textContent = appData.recentRequests.length;
    document.getElementById('tabRestricted').textContent = appData.restricted.length;
}

function switchTab(tab, element) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (element) element.classList.add('active');
    document.getElementById('searchInput').value = '';
    renderList();
}

// ========== RENDER LIST ==========
function renderList() {
    const list = document.getElementById('userList');
    const emptyState = document.getElementById('emptyState');
    const searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();

    let data = appData[currentTab] || [];
    if (searchQuery) data = data.filter(u => u.username.toLowerCase().includes(searchQuery));

    list.innerHTML = '';
    if (data.length === 0) { emptyState.classList.remove('hidden'); return; }
    emptyState.classList.add('hidden');

    const fragment = document.createDocumentFragment();
    data.forEach((user, index) => {
        const isSelected = selectedUsers.has(currentTab + ':' + user.username.toLowerCase());
        const profileUrl = 'https://instagram.com/' + encodeURIComponent(user.username);

        const item = document.createElement('div');
        item.className = 'user-item' + (isSelected ? ' selected' : '');

        const numDiv = document.createElement('div');
        numDiv.className = 'user-number';
        numDiv.textContent = index + 1;

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'user-avatar';
        avatarDiv.textContent = user.username.charAt(0).toUpperCase();

        const infoDiv = document.createElement('div');
        infoDiv.className = 'user-info';

        const nameLink = document.createElement('a');
        nameLink.className = 'user-name';
        nameLink.href = profileUrl;
        nameLink.target = '_blank';
        nameLink.rel = 'noopener noreferrer';

        if (isSelected) {
            const del = document.createElement('del');
            del.textContent = user.username;
            nameLink.appendChild(del);
        } else {
            nameLink.textContent = user.username;
        }
        infoDiv.appendChild(nameLink);

        if (user.timestamp) {
            const ts = document.createElement('div');
            ts.className = 'user-timestamp';
            ts.innerHTML = '<i class="far fa-calendar-alt"></i> ' + escapeHtml(user.timestamp);
            infoDiv.appendChild(ts);
        }

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'user-actions';

        const visitLink = document.createElement('a');
        visitLink.className = 'btn-visit';
        visitLink.href = profileUrl;
        visitLink.target = '_blank';
        visitLink.rel = 'noopener noreferrer';
        visitLink.innerHTML = '<i class="fab fa-instagram"></i> <span>Visit</span>';

        // CHECK/TICK button — behavior depends on selection state
        const selectBtn = document.createElement(isSelected ? 'button' : 'a');
        selectBtn.className = 'btn-select' + (isSelected ? ' selected' : '');
        selectBtn.innerHTML = '<i class="fas ' + (isSelected ? 'fa-undo' : 'fa-check') + '"></i>';

        if (isSelected) {
            // Already marked: just unmark, NO Instagram visit
            selectBtn.title = 'Unmark this user';
            selectBtn.type = 'button';
            selectBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleSelect(user.username);
            });
        } else {
            // Not marked: open Instagram AND mark as selected
            selectBtn.title = 'Mark as checked & visit profile';
            selectBtn.href = profileUrl;
            selectBtn.target = '_blank';
            selectBtn.rel = 'noopener noreferrer';
            selectBtn.addEventListener('click', (e) => {
                toggleSelect(user.username);
            });
        }

        actionsDiv.appendChild(visitLink);
        actionsDiv.appendChild(selectBtn);
        item.appendChild(numDiv);
        item.appendChild(avatarDiv);
        item.appendChild(infoDiv);
        item.appendChild(actionsDiv);
        fragment.appendChild(item);
    });
    list.appendChild(fragment);
}

function toggleSelect(username) {
    const key = currentTab + ':' + username.toLowerCase();
    if (selectedUsers.has(key)) selectedUsers.delete(key);
    else selectedUsers.add(key);
    saveSelectedUsers();
    // Use setTimeout so the link click registers before re-render
    setTimeout(() => renderList(), 50);
}

function filterList() { renderList(); }

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const colors = { error: '#ff1744', success: '#00c853', info: '#2979ff' };
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `position:fixed;top:80px;right:20px;padding:14px 24px;background:${colors[type]||colors.info};color:white;border-radius:12px;font-size:14px;font-weight:600;z-index:20000;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:400px;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// ========== DOWNLOADS ==========
function getCreditsText() {
    return `Generated by Instagram Unfollowers Finder
Developer: Amal Dev TS
Gmail: amalts5885@gmail.com
GitHub: https://github.com/amaldev-ts
Instagram: https://instagram.com/amaldev_ts`;
}

function getTabTitle() {
    const t = {
        unfollowers: "Unfollowers (You follow them, they don't follow back)",
        fans: "Fans (They follow you, you don't follow back)",
        mutuals: "Mutuals (You follow each other)",
        followers: 'Followers', following: 'Following',
        pending: 'Pending Follow Requests', blocked: 'Blocked Profiles',
        recentlyUnfollowed: 'Recently Unfollowed', recentRequests: 'Recent Follow Requests',
        restricted: 'Restricted Profiles'
    };
    return t[currentTab] || currentTab;
}

function getTabShortTitle() {
    const t = {
        unfollowers: 'Unfollowers', fans: 'Fans', mutuals: 'Mutuals',
        followers: 'Followers', following: 'Following',
        pending: 'Pending', blocked: 'Blocked',
        recentlyUnfollowed: 'Recently Unfollowed',
        recentRequests: 'Recent Requests', restricted: 'Restricted'
    };
    return t[currentTab] || currentTab;
}

function getCurrentData() { return appData[currentTab] || []; }

function downloadPDF() {
    const data = getCurrentData();
    if (data.length === 0) { showToast('No data', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    let y = 20;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(225, 48, 108);
    doc.text('Instagram Unfollowers Finder', pw / 2, y, { align: 'center' }); y += 10;
    doc.setFontSize(13); doc.setTextColor(100, 100, 100);
    doc.text(getTabTitle(), pw / 2, y, { align: 'center' }); y += 7;
    doc.setFontSize(11); doc.text('Total: ' + data.length, pw / 2, y, { align: 'center' }); y += 8;
    doc.setDrawColor(225, 48, 108); doc.line(20, y, pw - 20, y); y += 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    data.forEach((user, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        const sel = selectedUsers.has(currentTab + ':' + user.username.toLowerCase());
        if (sel) { doc.setTextColor(180, 180, 180); doc.text((i+1)+'. ~'+user.username+'~', 20, y); }
        else { doc.setTextColor(30, 30, 30); doc.text((i+1)+'. @'+user.username, 20, y); }
        doc.setTextColor(100, 100, 180); doc.setFontSize(8);
        doc.textWithLink('instagram.com/'+user.username, 140, y, { url: 'https://instagram.com/'+user.username });
        doc.setFontSize(11); y += 7;
    });
    doc.addPage(); y = 30;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(225, 48, 108);
    doc.text('Credits', pw / 2, y, { align: 'center' }); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(80, 80, 80);
    getCreditsText().split('\n').forEach(line => { doc.text(line, pw / 2, y, { align: 'center' }); y += 7; });
    y += 10; doc.setFontSize(9); doc.setTextColor(150, 150, 150);
    doc.text('Generated: ' + new Date().toLocaleString(), pw / 2, y, { align: 'center' });
    doc.save('instagram_' + currentTab + '_' + new Date().toISOString().slice(0, 10) + '.pdf');
    showToast('PDF downloaded!', 'success');
}

function downloadJSON() {
    const data = getCurrentData();
    if (data.length === 0) { showToast('No data', 'error'); return; }
    const output = {
        title: getTabTitle(), category: currentTab, total: data.length,
        generated_at: new Date().toISOString(),
        credits: { tool: 'Instagram Unfollowers Finder', developer: 'Amal Dev TS', gmail: 'amalts5885@gmail.com', github: 'https://github.com/amaldev-ts', instagram: 'https://instagram.com/amaldev_ts' },
        users: data.map((u, i) => ({ number: i+1, username: u.username, profile_url: 'https://instagram.com/'+u.username, timestamp: u.timestamp || null, marked: selectedUsers.has(currentTab+':'+u.username.toLowerCase()) }))
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'instagram_'+currentTab+'_'+new Date().toISOString().slice(0,10)+'.json'; a.click();
    URL.revokeObjectURL(url); showToast('JSON downloaded!', 'success');
}

function downloadHTML() {
    const data = getCurrentData();
    if (data.length === 0) { showToast('No data', 'error'); return; }
    let rows = '';
    data.forEach((u, i) => {
        const sel = selectedUsers.has(currentTab+':'+u.username.toLowerCase());
        rows += `<tr style="${sel?'opacity:0.35;':''}"><td style="padding:12px 16px;border-bottom:1px solid #2a2a40;color:#6c6c80;font-weight:700;">${i+1}</td><td style="padding:12px 16px;border-bottom:1px solid #2a2a40;"><a href="https://instagram.com/${escapeHtml(u.username)}" target="_blank" style="color:${sel?'#6c6c80':'#E1306C'};text-decoration:${sel?'line-through':'none'};font-weight:600;">@${escapeHtml(u.username)}</a></td><td style="padding:12px 16px;border-bottom:1px solid #2a2a40;color:#6c6c80;font-size:12px;">${u.timestamp||'-'}</td><td style="padding:12px 16px;border-bottom:1px solid #2a2a40;"><a href="https://instagram.com/${escapeHtml(u.username)}" target="_blank" style="color:#833AB4;text-decoration:none;font-size:13px;">Visit →</a></td></tr>`;
    });
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Instagram ${escapeHtml(getTabShortTitle())}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#0a0a0f;color:#fff;padding:40px 20px}.container{max-width:900px;margin:0 auto}h1{text-align:center;font-size:28px;background:linear-gradient(135deg,#E1306C,#833AB4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px}.subtitle{text-align:center;color:#a0a0b8;margin-bottom:6px}.count{text-align:center;color:#E1306C;margin-bottom:30px;font-weight:700}table{width:100%;border-collapse:collapse;background:#1a1a2e;border-radius:12px;overflow:hidden}th{padding:14px 16px;text-align:left;background:#222240;color:#a0a0b8;font-size:12px;text-transform:uppercase}.credits{text-align:center;margin-top:40px;padding:24px;background:#1a1a2e;border-radius:12px}.credits p{color:#a0a0b8;font-size:13px;margin:5px 0}.credits a{color:#E1306C;text-decoration:none}.disclaimer{text-align:center;margin-top:16px;color:#6c6c80;font-size:11px}</style></head><body><div class="container"><h1>Instagram ${escapeHtml(getTabShortTitle())}</h1><p class="subtitle">${escapeHtml(getTabTitle())}</p><p class="count">${data.length} accounts</p><table><thead><tr><th>#</th><th>Username</th><th>Date</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table><div class="credits"><p><strong>Instagram Unfollowers Finder</strong></p><p>Built by <strong><a href="https://instagram.com/amaldev_ts" target="_blank" style="color:#E1306C">Amal Dev TS</a></strong></p><p>📧 <a href="mailto:amalts5885@gmail.com">amalts5885@gmail.com</a></p><p>🐙 <a href="https://github.com/amaldev-ts" target="_blank">github.com/amaldev-ts</a></p><p>📸 <a href="https://instagram.com/amaldev_ts" target="_blank">instagram.com/amaldev_ts</a></p></div><p class="disclaimer">Disclaimer: Due to Instagram's new policy, deactivated accounts may also appear.</p></div></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'instagram_'+currentTab+'_'+new Date().toISOString().slice(0,10)+'.html'; a.click();
    URL.revokeObjectURL(url); showToast('HTML downloaded!', 'success');
}


// ========== CSV DOWNLOAD ==========
function downloadCSV() {
    console.log('🔽 CSV download clicked');
    const data = getCurrentData();
    if (data.length === 0) {
        showToast('No data to download', 'error');
        return;
    }

    function csvEscape(value) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (/[",\n\r]/.test(str)) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    let csv = '';
    csv += '# Instagram Unfollowers Finder\r\n';
    csv += '# Category: ' + getTabTitle() + '\r\n';
    csv += '# Total: ' + data.length + ' accounts\r\n';
    csv += '# Generated: ' + new Date().toLocaleString() + '\r\n';
    csv += '# Developer: Amal Dev TS (https://instagram.com/amaldev_ts)\r\n';
    csv += '# GitHub: https://github.com/amaldev-ts\r\n';
    csv += '# Gmail: amalts5885@gmail.com\r\n';
    csv += '\r\n';
    csv += 'Number,Username,Profile URL,Date,Marked\r\n';

    data.forEach((user, i) => {
        const marked = selectedUsers.has(currentTab + ':' + user.username.toLowerCase());
        const row = [
            csvEscape(i + 1),
            csvEscape(user.username),
            csvEscape('https://instagram.com/' + user.username),
            csvEscape(user.timestamp || ''),
            csvEscape(marked ? 'Yes' : 'No')
        ].join(',');
        csv += row + '\r\n';
    });

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'instagram_' + currentTab + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('CSV downloaded!', 'success');
    console.log('✅ CSV downloaded:', data.length, 'rows');
}