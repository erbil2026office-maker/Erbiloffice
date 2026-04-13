const URL_SB = 'https://mygqlubvxdbbsygitjuj.supabase.co';
const KEY_SB = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Z3FsdWJ2eGRiYnN5Z2l0anVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjA3NzIsImV4cCI6MjA5MTI5Njc3Mn0.bAecJcTMfZEiT1doet_PgH3EEjjAB6juNRoCJlK9qeA';
const adminClient = supabase.createClient(URL_SB, KEY_SB);

let attendanceCache = []; // پاشەکەوتکردنی داتا بۆ فلتەرکردنی خێرا
let staffCache = [];      // پاشەکەوتکردنی فەرمانبەران
let justificationsCache = []; // پاشەکەوتکردنی ڕوونکردنەوەکان
let allAdminsCached = []; // بۆ هەڵگرتنی لیستی ئادمینەکان و نوێکردنەوەی دۆخی ئۆنلاین
let onlineAdmins = {};    // بۆ هەڵگرتنی ئەو ئادمینانەی ئێستا لەسەر هێڵن
let selectedUserIdForReset = null; // بۆ هەڵگرتنی ئایدی ئەو بەکارهێنەرەی ئێستا مۆداڵەکەی بۆ کراوەتەوە
let branchesCache = []; // پاشەکەوتکردنی لیستی هەموو بنکەکان
let selectedBranchInModal = null; // بۆ هەڵگرتنی بنکەی دیاریکراو لە ناو مۆداڵ

let currentFilters = {
    branch: 'all',
    status: 'all'
};

document.addEventListener('DOMContentLoaded', async () => {
    // ١. پشکنینی خێرای سیژن (Session) بۆ پاراستنی لاپەڕەکە پێش هەر کارێک
    const { data: { session }, error: sessionError } = await adminClient.auth.getSession();
    
    if (sessionError || !session) {
        window.location.replace('index.html');
        return;
    }

    // ٢. پشکنینی ووردی پڕۆفایل بۆ دڵنیابوونەوە لەوەی ئادمینە نەک فەرمانبەری ئاسایی
    const { data: profile, error: profError } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

    if (profError || !profile || profile.role !== 'admin') {
        window.location.replace(profile?.role === 'employee' ? 'dashboard.html' : 'index.html');
        return;
    }

    const user = session.user;

    // ٣. چاودێریکردنی دۆخی چوونەژوورەوە (بۆ دەرکردنی یەکسەری ئادمین ئەگەر سیژنەکەی بەسەرچوو)
    adminClient.auth.onAuthStateChange((event, currentSession) => {
        if (event === 'SIGNED_OUT' || !currentSession) {
            window.location.replace('index.html');
        }
    });

    // --- ڕێکخستنی Real-time Presence ---
    const presenceChannel = adminClient.channel('admin_online_status');

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            onlineAdmins = presenceChannel.presenceState();
            renderAdmins(allAdminsCached); // دووبارە ڕێندەرکردنەوە بۆ نیشاندانی دۆخی ئۆنلاین
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await presenceChannel.track({
                    user_id: user.id,
                    online_at: new Date().toISOString()
                });
            }
        });

    // گوێگرتن لە گۆڕانکارییەکانی خشتەی ئامادەبوون بە شێوەی ڕاستەوخۆ
    adminClient
        .channel('attendance_realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance' }, payload => {
            // ئەگەر ڕێکەوتەکە هی ئەمڕۆ بوو، داتاکە نوێ بکەرەوە
            const today = new Date().toISOString().split('T')[0];
            if (payload.new.check_in_time.startsWith(today)) {
                loadAttendanceData();
            }
        })
        .subscribe();

    // دانانی ڕێکەوتی ئەمڕۆ وەک دیفۆڵت
    document.getElementById('datePicker').valueAsDate = new Date();
    applyLanguage(); // دڵنیابوونەوە لە جێبەجێبوونی وەرگێڕان لە سەرەتاوە
    
    await loadBranches();
    await loadAttendanceData();
});

async function loadBranches() {
    try {
        const { data, error } = await adminClient.from('branches').select('*').order('branch_id');
        if (error) throw error;
        
        // ڕیزکردنی بنکەکان بە شێوەیەکی ژمارەیی لە بچووکەوە بۆ گەورە
        branchesCache = data ? [...data].sort((a, b) => parseInt(a.branch_id) - parseInt(b.branch_id)) : [];
        
        const branchOptions = document.getElementById('branchOptions');
        branchesCache.forEach(b => {
            const div = document.createElement('div');
            div.className = 'option';
            div.innerText = `${b.branch_id} | ${b.branch_name}`;
            div.onclick = () => selectOption('branchSelect', b.branch_id, div.innerText, true);
            branchOptions.appendChild(div);
        });
    } catch (err) {
        console.error("Error loading branches:", err.message);
    }
}

async function loadAttendanceData() {
    const listDiv = document.getElementById('attendanceList');
    const date = document.getElementById('datePicker').value;
   const branchFilter = currentFilters.branch;

    listDiv.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> باردەکرێت...</div>';

    // هێنانی ئامادەبووان و بەستنەوەی بە پڕۆفایل و بنکە
    try {
        let query = adminClient
            .from('attendance')
            .select('*, profiles!inner(full_name, branch_id)')
            .gte('check_in_time', `${date}T00:00:00`)
            .lte('check_in_time', `${date}T23:59:59`);

        const { data, error } = await query;

        if (error) {
            console.error("Attendance Query Error:", error);
            listDiv.innerHTML = `<div class="error-msg">${error.message}</div>`;
            return;
        }

    // هێنانی ڕوونکردنەوەکان بە لیست و پشکنینی هەڵە
    const { data: justs, error: justError } = await adminClient
        .from('justifications')
        .select('user_id, reason')
        .eq('date', date);

    if (justError) {
        console.error("Justification Fetch Error:", justError.message);
    }

    // هێنانی ئادمینەکان بە جیا بۆ ئەوەی هەمیشە هەموویان دیار بن بەبێ گوێدانە فلتەری بنکە
    const { data: admins } = await adminClient
        .from('profiles')
        .select('*, branches(branch_id, branch_name)')
        .eq('role', 'admin')
        .order('full_name');

    // هێنانی فەرمانبەران بەپێی فلتەری بنکە بۆ لیستی ئامادەبوون
    let staffQuery = adminClient.from('profiles').select('*, branches(branch_id, branch_name)').neq('role', 'admin');
    if (branchFilter !== 'all') staffQuery = staffQuery.eq('branch_id', branchFilter);
    const { data: staff } = await staffQuery.order('full_name');

        attendanceCache = data || [];
        staffCache = staff || [];
        justificationsCache = justs || [];

        allAdminsCached = admins; // پاشەکەوتکردنی لیستەکە بۆ بەکارهێنان لە پرێزنس
        renderAdmins(admins);
        document.getElementById('justificationCount').innerText = justificationsCache.length;
        applyFiltersLocally(); // بانگکردنی فلتەرەکان
    } catch (err) {
        console.error("Global load error:", err);
        listDiv.innerHTML = "کێشەیەک لە بارکردنی داتا ڕوویدا.";
    }
}

// فلتەرکردنی داتا بەبێ دووبارە بانگکردنەوەی داتابەیس
function applyFiltersLocally() {
    const statusFilter = currentFilters.status;
    const searchQuery = document.getElementById('nameSearch').value.toLowerCase();
    
    let filteredStaff = staffCache.filter(emp => {
        const record = attendanceCache.find(a => a.user_id === emp.id);
        const hasJustification = justificationsCache.some(j => j.user_id === emp.id);

        // ١. گەڕان بەپێی ناو
        const matchesSearch = emp.full_name.toLowerCase().includes(searchQuery);
        if (!matchesSearch) return false;
        
        if (statusFilter === 'all') return true;
        
        if (record) {
            const checkIn = new Date(record.check_in_time);
            const inTime = checkIn.getHours() * 60 + checkIn.getMinutes();
            const hasExit = record.check_out_time !== null;
            
            if (statusFilter === 'earlyIn') return inTime < 510;
            if (statusFilter === 'lateIn') return inTime >= 510 && inTime <= 540;
            if (statusFilter === 'veryLateIn') return inTime > 540;
            
            if (hasExit) {
                const checkOut = new Date(record.check_out_time);
                const outTime = checkOut.getHours() * 60 + checkOut.getMinutes();
                if (statusFilter === 'earlyOut') return outTime < 870;
                if (statusFilter === 'onTimeOut') return outTime >= 870;
            } else {
                if (statusFilter === 'noExit') return true;
            }
        } else {
            if (statusFilter === 'absent') return true;
        }
        
        if (statusFilter === 'justified') return hasJustification;
        
        return false;
    });

    renderAttendance(attendanceCache, filteredStaff);
}

// --- Custom Dropdown Logic ---
function toggleCustomDropdown(event, id) {
    // پشکنین بۆ ئەوەی بزانین ئایا پارامیتەری یەکەم دەقە (ID) یان ڕووداو (Event)
    // ئەمە کێشەی فلتەرەکان چارەسەر دەکات کە بە شێوازە کۆنەکە بانگ دەکران
    if (typeof event === 'string') {
        id = event;
        event = window.event || null;
    }

    if (event && event.stopPropagation) event.stopPropagation();
    
    const el = document.getElementById(id);
    if (!el) return;

    const isActive = el.classList.contains('active');
    
    // داخستنی هەموو لیستەکان و گەڕاندنەوەی ئاستی خانەکان بۆ دۆخی ئاسایی
    document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.filter-item').forEach(item => item.classList.remove('dropdown-active'));

    if (!isActive) {
        el.classList.add('active');
        const filterItem = el.closest('.filter-item');
        if (filterItem) {
            filterItem.classList.add('dropdown-active'); // تەنها ئەگەر خانەی فلتەر بوو بەرزبێتەوە
        }
    }
}

function selectOption(id, value, text, shouldReload = false) {
    const el = document.getElementById(id);
    el.querySelector('.selected-text').innerText = text;
    el.querySelectorAll('.option').forEach(opt => {
        opt.classList.toggle('selected', opt.innerText === text);
    });
    el.classList.remove('active');
    el.closest('.filter-item').classList.remove('dropdown-active');

    if (id === 'branchSelect') currentFilters.branch = value;
    if (id === 'statusSelect') currentFilters.status = value;

    if (shouldReload) loadAttendanceData();
    else applyFiltersLocally();
}

// داخستنی لیستەکان ئەگەر کلیک لە دەرەوە کرا
window.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select')) {
        document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.filter-item').forEach(item => item.classList.remove('dropdown-active'));
    }
});

function renderAdmins(admins) {
    const container = document.getElementById('adminsSection');
    const listDiv = document.getElementById('adminsList');
    const countBadge = document.getElementById('adminOnlineCount');
    
    if (admins && admins.length > 0) {
        container.style.display = 'flex';
        
        // ژماردنی ئەو ئادمینانەی کە ئێستا بە ڕاستی لەسەر هێڵن بۆ باجەکە
        const onlineCount = admins.filter(adm => 
            Object.values(onlineAdmins).flat().some(presence => presence.user_id === adm.id)
        ).length;

        if (countBadge) {
            countBadge.innerText = `${onlineCount} ${translations[currentLang].countPerson}`;
        }

        listDiv.innerHTML = admins.map(adm => {
            const isOnline = Object.values(onlineAdmins).flat().some(presence => presence.user_id === adm.id);
            return `
                <div class="admin-chip ${isOnline ? 'online' : ''}">
                    <i class="fas fa-user-tie"></i> ${adm.full_name}
                </div>
            `;
        }).join('');

        // هەمیشە کڵاسی درۆپ داون چالاک بکە بۆ مۆبایل
        container.classList.add('mobile-admin-dropdown');
    } else {
        container.style.display = 'none';
        container.classList.remove('mobile-admin-dropdown', 'dropdown-open');
    }
}

function toggleAdminsMobile() {
    const container = document.getElementById('adminsSection');
    if (window.innerWidth <= 600 && container.classList.contains('mobile-admin-dropdown')) {
        container.classList.toggle('dropdown-open');
    }
}

function renderAttendance(attendance, employees) {
    const listDiv = document.getElementById('attendanceList');
    const sectionTitle = document.querySelector('.attendance-container .section-title');
    
    // هەژمارکردنی ئەو کەسانەی کە ئێستا لە دەوامدان (هاتنیان کردووە و دەرنەچوون)
    const onDutyCount = employees.filter(emp => {
        const record = attendance.find(a => a.user_id === emp.id);
        return record && !record.check_out_time;
    }).length;

    // نوێکردنەوەی تایتڵ و زیادکردنی باجی ژمارە
    sectionTitle.innerHTML = `<div class="title-icon-box"><i class="fas fa-list-ul"></i></div> <span>${translations[currentLang].attendanceListTitle}</span> <span class="count-badge" title="${translations[currentLang].onDuty}">${onDutyCount} ${translations[currentLang].onDuty}</span>`;

    // دروستکردنی سەردێڕی خشتەکە بۆ لاپتۆپ
    listDiv.innerHTML = `
        <div class="attendance-header-row">
            <div><i class="fas fa-user-circle header-icon"></i> ${translations[currentLang].colName}</div>
            <div><i class="fas fa-map-marked-alt header-icon"></i> ${translations[currentLang].colBranch}</div>
            <div><i class="fas fa-clock header-icon"></i> ${translations[currentLang].colTime}</div>
            <div><i class="fas fa-fingerprint header-icon"></i> ${translations[currentLang].colStatus}</div>
            <div><i class="fas fa-tags header-icon"></i> ${translations[currentLang].colClass}</div>
            <div style="text-align: center;"><i class="fas fa-comment-dots header-icon"></i> ${translations[currentLang].colJust}</div>
        </div>
    `;

    // پۆلێنکردن بەپێی بنکە
    const grouped = employees.reduce((acc, emp) => {
        const bName = emp.branches ? `${emp.branches.branch_id} | ${emp.branches.branch_name}` : "بێ بنکە";
        if (!acc[bName]) acc[bName] = [];
        acc[bName].push(emp);
        return acc;
    }, {});

    // ئامارە نوێیەکان
    let stats = {
        earlyIn: 0,    // پێش 8:30
        lateIn: 0,     // 8:30 - 9:00
        veryLateIn: 0, // دوای 9:00
        earlyOut: 0,   // پێش 2:30
        onTimeOut: 0,  // دوای 2:30
        absent: 0,     // ئەو کەسانەی چێک ئینیان نەکردووە
        notCheckedOut: 0 // ئەو کەسانەی هاتنیان کردووە بەڵام دەرنەچوون
    };

    for (const [branch, emps] of Object.entries(grouped)) {
        const section = document.createElement('div');
        section.className = "branch-group-container";
        
        emps.forEach(emp => {
            const record = attendance.find(a => a.user_id === emp.id);
            const row = document.createElement('div');
            const isOnDuty = record && !record.check_out_time;
            row.className = 'attendance-item';
            let employeeClassifications = []; // لیستێک بۆ کۆکردنەوەی هەموو پۆڵێنەکان
            const just = justificationsCache.find(j => j.user_id === emp.id);
            const hasJustification = !!just;
            
            if (record) {
                const checkIn = new Date(record.check_in_time);
                const inTime = checkIn.getHours() * 60 + checkIn.getMinutes();
                
                // حیسابکردنی جۆری هاتن
                if (inTime < 510) {
                    stats.earlyIn++;
                    employeeClassifications.push({ label: translations[currentLang].earlyIn, class: 'badge-early', icon: 'fas fa-user-check' });
                } else if (inTime <= 540) { // 8:30 - 9:00
                    stats.lateIn++;
                    employeeClassifications.push({ label: translations[currentLang].midIn, class: 'badge-warn', icon: 'fas fa-user-clock' });
                } else { // دوای 9:00
                    stats.veryLateIn++;
                    employeeClassifications.push({ label: translations[currentLang].veryLateInAdmin, class: 'badge-orange', icon: 'fas fa-user-clock' });
                }

                // حیسابکردنی جۆری دەرچوون (ئەگەر کرابێت)
                if (record.check_out_time) {
                    const checkOut = new Date(record.check_out_time);
                    const outTime = checkOut.getHours() * 60 + checkOut.getMinutes();
                    
                    if (outTime < 870) { // پێش 2:30 (14:30)
                       stats.earlyOut++;
                        employeeClassifications.push({ label: translations[currentLang].earlyOutAdmin, class: 'badge-danger', icon: 'fas fa-door-open' });
                    } else { // دوای 2:30
                        stats.onTimeOut++;
                        employeeClassifications.push({ label: translations[currentLang].onTimeOutAdmin, class: 'badge-early', icon: 'fas fa-walking' });
                    }
                } else {
                    // هاتنی کردووە بەڵام دەرنەچووە
                    stats.notCheckedOut++;
                    employeeClassifications.push({ label: translations[currentLang].noExitStat, class: 'badge-warn', icon: 'fas fa-hourglass-half' });
                }
            } else {
                // ئەگەر هیچ ڕیکۆردێکی نەبوو، واتە نەهاتووە
                stats.absent++;
                employeeClassifications.push({ label: translations[currentLang].absentStat, class: 'badge-danger', icon: 'fas fa-user-slash' });
            }

            // ئەگەر ڕوونکردنەوەی هەبوو، ئایکۆنەکەی بۆ زیاد بکە
            if (hasJustification) {
                employeeClassifications.push({ label: translations[currentLang].justification, class: 'badge-blue', icon: 'fas fa-file-signature' });
            }
            
            const tIn = record ? new Date(record.check_in_time).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12: true}) : '--:--';
            const tOut = record?.check_out_time ? new Date(record.check_out_time).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12: true}) : '--:--';
            const statusLabel = record ? `<span class="status-pill status-present">${translations[currentLang].statusPresent}</span>` : `<span class="status-pill status-absent">${translations[currentLang].statusAbsent}</span>`;
            
           row.innerHTML = `
                <div class="emp-name-col">
                    <span class="emp-name">${isOnDuty ? `<span class="on-duty-pulse" title="${translations[currentLang].onDuty}"></span>` : ''}${emp.full_name}</span>
                </div>
                <div class="emp-branch-col">${branch}</div>
                <div class="emp-time-col">
                    <span class="time-badge time-badge-in"><i class="fas fa-long-arrow-alt-down"></i> ${tIn}</span>
                    <span class="time-badge time-badge-out"><i class="fas fa-long-arrow-alt-up"></i> ${tOut}</span>
                </div>
                <div>${statusLabel}</div>
                <div class="class-badge-col">
                    ${employeeClassifications.map(c => `
                        <span class="class-badge ${c.class}" title="${c.label}"><i class="${c.icon}"></i></span>
                    `).join('')}
                </div>
                <div class="just-col">
                    <div class="just-icon-wrapper ${hasJustification ? 'active' : ''}" onclick="viewDetails('${emp.id}')" title="${hasJustification ? just.reason : translations[currentLang].recordNotFound}">
                        <i class="fas fa-file-signature"></i>
                    </div>
                    <div class="settings-icon-wrapper" onclick="openEmployeeSettings('${emp.id}')" title="${translations[currentLang].empSettings}">
                        <i class="fas fa-user-cog"></i>
                    </div>
                </div>
            `;
            section.appendChild(row);
        });
        listDiv.appendChild(section);
    }

    // نوێکردنەوەی کارتەکان لە UI
    document.getElementById('countEarlyIn').innerText = stats.earlyIn;
    document.getElementById('countLateIn').innerText = stats.lateIn;
    document.getElementById('countVeryLateIn').innerText = stats.veryLateIn;
    document.getElementById('countEarlyOut').innerText = stats.earlyOut;
    document.getElementById('countOnTimeOut').innerText = stats.onTimeOut;
    document.getElementById('countAbsent').innerText = stats.absent;
    document.getElementById('countNotCheckedOut').innerText = stats.notCheckedOut;
}

function viewDetails(userId) {
    const staff = staffCache.find(s => s.id === userId);
    const just = justificationsCache.find(j => j.user_id === userId);

    const titlePrefix = translations[currentLang].justificationOf;
    const staffName = staff ? staff.full_name : translations[currentLang].employee;

    document.getElementById('justUserTitle').innerText = `${titlePrefix} ${staffName}`;
    document.getElementById('justTextContent').innerText = just ? just.reason : translations[currentLang].noJustRecorded;
    document.getElementById('justModal').style.display = 'flex';
}

async function openEmployeeSettings(userId) {
    const emp = staffCache.find(s => s.id === userId);
    if (!emp) return;
    selectedUserIdForReset = userId;

    let modal = document.getElementById('empSettingsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'empSettingsModal';
        modal.className = 'modal-overlay';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        document.body.appendChild(modal);
    }

    const currentBranchName = branchesCache.find(b => b.branch_id === emp.branch_id)?.branch_name || translations[currentLang].allBranches;
    selectedBranchInModal = emp.branch_id;

    const branchOptionsHtml = branchesCache.map(b => `
        <div class="option ${emp.branch_id === b.branch_id ? 'selected' : ''}" onclick="selectModalBranch(event, '${b.branch_id}', '${b.branch_name}')">
            ${b.branch_id} | ${b.branch_name}
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="modal-window" style="max-width:340px; padding:20px; border-radius:22px;">
            <div class="modal-icon" style="font-size:1.6rem; margin-bottom:5px; color:var(--primary);"><i class="fas fa-user-cog"></i></div>
            <h3 style="margin-bottom:2px; font-size:1.1rem; color:var(--text-main);">${translations[currentLang].empSettings}</h3>
            <p style="font-size:0.8rem; font-weight:600; color:var(--text-sub); margin-bottom:15px;">${emp.full_name}</p>
            <div class="settings-grid">
                <div class="settings-group">
                    <label class="settings-label"><i class="fas fa-map-marker-alt"></i> ${translations[currentLang].changeBranch}</label>
                    <div class="custom-select" id="modalBranchSelect" onclick="toggleCustomDropdown(event, 'modalBranchSelect')">
                        <div class="select-trigger" style="height:36px; font-size:0.8rem;">
                            <span class="selected-text">${currentBranchName}</span>
                            <i class="fas fa-chevron-down"></i>
                        </div>
                        <div class="options-list">${branchOptionsHtml}</div>
                    </div>
                    <button class="settings-save-btn" onclick="updateEmployeeBranch('${userId}')"><i class="fas fa-save"></i> ${translations[currentLang].change}</button>
                </div>
                <div class="settings-group reset-group">
                    <label class="settings-label"><i class="fas fa-mobile-alt"></i> ${translations[currentLang].device}</label>
                    <div class="select-trigger device-info-trigger">
                        <span class="selected-text">${emp.device_id ? 'ئامێری پەیوەستکراو (Linked)' : 'ئامێر بەردەست نییە'}</span>
                        <i class="fas fa-mobile-alt"></i>
                    </div>
                    <button class="settings-save-btn btn-danger-modern" onclick="resetDeviceID()"><i class="fas fa-redo"></i> ${translations[currentLang].resetDevice}</button>
                </div>
            </div>
            <button class="modal-close-link" onclick="document.getElementById('empSettingsModal').style.display='none'"><i class="fas fa-times"></i> ${translations[currentLang].close}</button>
        </div>
    `;
    modal.style.display = 'flex';
}

function selectModalBranch(event, branchId, branchName) {
    if (event) event.stopPropagation(); // ڕێگری لە بڵاوبوونەوەی ڕووداوی کلیکەکە
    selectedBranchInModal = branchId;
    const trigger = document.querySelector('#modalBranchSelect .selected-text');
    if (trigger) trigger.innerText = `${branchId} | ${branchName}`; // نوێکردنەوەی تێکستەکە بە ژمارە و ناوی بنکە
    
    document.querySelectorAll('#modalBranchSelect .option').forEach(opt => {
        opt.classList.toggle('selected', opt.innerText.includes(branchName));
    });
    document.getElementById('modalBranchSelect').classList.remove('active'); // داخستنی لیستەکە دوای هەڵبژاردن
}

async function updateEmployeeBranch(userId) {
    const newBranch = selectedBranchInModal;
    if (confirm(translations[currentLang].confirmBranchChange)) {
        if (confirm(translations[currentLang].confirmBranchChangeFinal)) {
            const { error } = await adminClient.from('profiles').update({ branch_id: newBranch }).eq('id', userId);
            if (!error) {
                alert(translations[currentLang].successUpdate);
                loadAttendanceData();
                document.getElementById('empSettingsModal').style.display = 'none';
            }
        }
    }
}

async function resetDeviceID() {
    if (!selectedUserIdForReset) return;

    const confirmReset = confirm(translations[currentLang].resetConfirmMsg);
    if (!confirmReset) return;

    const { error } = await adminClient
        .from('profiles')
        .update({ device_id: null })
        .eq('id', selectedUserIdForReset);

    if (error) {
        alert("Error: " + error.message);
    } else {
        alert(translations[currentLang].resetSuccess);
        if (document.getElementById('empSettingsModal')) document.getElementById('empSettingsModal').style.display = 'none';
    }
}

function toggleStatsMobile() {
    const statsGrid = document.querySelector('.stats-grid');
    const toggleBtn = document.querySelector('.mobile-stats-toggle');
    const toggleText = document.getElementById('statsToggleText');
    
    const isExpanded = statsGrid.classList.toggle('expanded');
    toggleBtn.classList.toggle('active');
    
    // گۆڕینی تێکستەکە بەپێی زمان
    toggleText.innerText = isExpanded ? translations[currentLang].hideStats : translations[currentLang].showStats;
}

function toggleAttendanceMobile() {
    const attendanceContainer = document.querySelector('.attendance-container');
    const filterSection = document.querySelector('.filter-section');
    const toggleBtn = document.querySelector('.mobile-attendance-toggle');
    const toggleText = document.getElementById('attendanceToggleText');
    
    if (!attendanceContainer) return;
    const isExpanded = attendanceContainer.classList.toggle('expanded');
    if (filterSection) filterSection.classList.toggle('expanded');
    if (toggleBtn) toggleBtn.classList.toggle('active');
    
    // گۆڕینی تێکستەکە بەپێی زمان
    if (toggleText) toggleText.innerText = isExpanded ? translations[currentLang].hideAttendanceList : translations[currentLang].showAttendanceList;
}

// داخستنی مۆداڵەکە بە کلیک لە دەرەوە
function closeJustModal(event) {
    if (event.target.id === 'justModal') {
        event.target.style.display = 'none';
    }
}

function handlePrint() {
    const date = document.getElementById('datePicker').value;
    const searchQuery = document.getElementById('nameSearch').value.toLowerCase();
    const statusFilter = currentFilters.status;
    const t = translations[currentLang];

    // فلتەرکردنی داتاکان بە هەمان شێوەی ناو داشبۆردەکە
    const filteredStaff = staffCache.filter(emp => {
        const record = attendanceCache.find(a => a.user_id === emp.id);
        const matchesSearch = emp.full_name.toLowerCase().includes(searchQuery);
        if (!matchesSearch) return false;
        if (statusFilter === 'all') return true;
        
        if (record) {
            const checkIn = new Date(record.check_in_time);
            const inTime = checkIn.getHours() * 60 + checkIn.getMinutes();
            const hasExit = record.check_out_time !== null;
            if (statusFilter === 'earlyIn') return inTime < 510;
            if (statusFilter === 'lateIn') return inTime >= 510 && inTime <= 540;
            if (statusFilter === 'veryLateIn') return inTime > 540;
            if (hasExit) {
                const checkOut = new Date(record.check_out_time);
                const outTime = checkOut.getHours() * 60 + checkOut.getMinutes();
                if (statusFilter === 'earlyOut') return outTime < 870;
                if (statusFilter === 'onTimeOut') return outTime >= 870;
            } else if (statusFilter === 'noExit') return true;
        } else if (statusFilter === 'absent') return true;
        if (statusFilter === 'justified') return justificationsCache.some(j => j.user_id === emp.id);
        return false;
    });

    const printWindow = window.open('', '_blank');
    
    // دروستکردنی ڕیزەکانی خشتەکە
    let rowsHtml = filteredStaff.map((emp, index) => {
        const record = attendanceCache.find(a => a.user_id === emp.id);
        const branchInfo = emp.branches ? `${emp.branches.branch_id} | ${emp.branches.branch_name}` : '-';
        const tIn = record ? new Date(record.check_in_time).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12: true}) : '-';
        const tOut = record?.check_out_time ? new Date(record.check_out_time).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12: true}) : '-';
        
        return `
            <tr>
                <td style="font-weight: 600; color: #444;">${index + 1}</td>
                <td style="text-align: right; font-weight: 700; padding-right: 12px;">${emp.full_name}</td>
                <td style="font-size: 11px;">${branchInfo}</td>
                <td dir="ltr">${tIn}</td>
                <td dir="ltr">${tOut}</td>
                <td></td>
            </tr>
        `;
    }).join('');

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="ku" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>Report - ${date}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;600;800&display=swap');
                
                body { font-family: 'Noto Kufi Arabic', sans-serif; padding: 10px; background: white; color: #000; }
                .header-official { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 2px solid #000; padding-bottom: 15px; }
                .header-text { text-align: right; }
                .header-text h1 { font-size: 18px; margin: 0; font-weight: 800; }
                .header-text h2 { font-size: 14px; margin: 4px 0 0 0; font-weight: 600; color: #333; }
                .header-logo img { width: 75px; display: block; }
                
                .meta-section { display: flex; justify-content: flex-start; margin-bottom: 15px; font-size: 12px; font-weight: 700; padding: 0 5px; }
                
                .table-wrapper { border: 0.8px solid #000; border-radius: 8px; overflow: hidden; }
                table { width: 100%; border-collapse: collapse; background: #fff; }
                th, td { border: 0.2px solid #bbb; padding: 10px 5px; text-align: center; font-size: 11.5px; }
                th { background-color: #f8f8f8; color: #000; font-weight: 800; font-size: 12px; }
                
                .footer-official { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 100px; padding: 0 40px; }
                .sign-area { text-align: center; }
                .sign-area p { margin: 0; font-weight: 800; font-size: 13px; }
                .sign-line { margin-top: 50px; border-top: 0.8px dashed #000; width: 160px; margin-left: auto; margin-right: auto; }
                
                @media print { 
                    @page { size: A4; margin: 0; }
                    body { margin: 1.2cm; padding: 0; color: #000; }
                    .table-wrapper { border-radius: 8px; border: 0.8px solid #000; }
                    th { background-color: #f2f2f2 !important; -webkit-print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <div class="header-official">
                <div class="header-text">
                    <h1>${t.adminDashboardTitle.split(' - ')[0]}</h1>
                    <h2>${t.printHeaderSub}</h2>
                </div>
                <div class="header-logo">
                    <img src="assets/icon.png">
                </div>
            </div>

            <div class="meta-section">
                <span>${t.date}: ${date}</span>
            </div>

            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 25px;">#</th>
                            <th style="text-align: right; padding-right: 15px; width: 30%;">${t.colName}</th>
                            <th style="width: 15%;">${t.colBranch}</th>
                            <th style="width: 85px;">${t.arrival}</th>
                            <th style="width: 85px;">${t.checkout}</th>
                            <th style="width: 110px;">${t.tebini}</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>


            <script>
                window.onload = function() {
                    setTimeout(() => { window.print(); window.close(); }, 500);
                };
            </script>
        </body>
        </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

async function handleLogout() {
    await adminClient.auth.signOut();
    location.href = 'index.html';
}
