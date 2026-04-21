// بەکارهێنانی کڵایێنتە گشتییەکە کە لە script.js پێناسە کراوە
let adminClient;

let attendanceCache = []; // پاشەکەوتکردنی داتا بۆ فلتەرکردنی خێرا
let staffCache = [];      // پاشەکەوتکردنی فەرمانبەران
let justificationsCache = []; // پاشەکەوتکردنی ڕوونکردنەوەکان
let leavesCache = []; // پاشەکەوتکردنی مۆڵەتەکان
let allAdminsCached = []; // بۆ هەڵگرتنی لیستی ئادمینەکان و نوێکردنەوەی دۆخی ئۆنلاین
let onlineAdmins = {};    // بۆ هەڵگرتنی ئەو ئادمینانەی ئێستا لەسەر هێڵن
let selectedUserIdForReset = null; // بۆ هەڵگرتنی ئایدی ئەو بەکارهێنەرەی ئێستا مۆداڵەکەی بۆ کراوەتەوە
let branchesCache = []; // پاشەکەوتکردنی لیستی هەموو بنکەکان
let selectedBranchInModal = null; // بۆ هەڵگرتنی بنکەی دیاریکراو لە ناو مۆداڵ
let selectedLeaveStartDate = null;
let selectedLeaveEndDate = null;
let selectedLeaveReasonInModal = null;
let selectedLeaveStartTime = null;
let selectedLeaveEndTime = null;
let selectedRoleInModal = null; // بۆ هەڵگرتنی ڕۆڵی دیاریکراو لە مۆداڵ

let currentFilters = {
    // زیادکردنی فلتەری مۆڵەت
    // leave: 'all', // ئەگەر ویستت فلتەری مۆڵەتیش زیاد بکەیت
    leaveTypes: [], // لیستێک بۆ جۆرە مۆڵەتە دیاریکراوەکان
    branch: 'all',
    status: 'all'
};

document.addEventListener('DOMContentLoaded', async () => {
    // وەرگرتنی کڵایێنتەکە لە ویندۆوە بۆ ڕێگری لە ReferenceError
    adminClient = window.supabaseClient || supabaseClient;
    
    if (!adminClient) {
        console.error("Supabase client is not initialized. Check script.js loading order.");
        return;
    }

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

    // --- Modern Real-time Synchronizer ---
    // چاودێریکردنی هەموو گۆڕانکارییەکانی ئامادەبوون و ڕوونکردنەوەکان بە شێوەی زیندوو
    adminClient
        .channel('db_live_sync')
        // گوێگرتن لە (Insert, Update, Delete) لە خشتەی ئامادەبوون
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
            loadAttendanceData(); 
        })
        // گوێگرتن لە هەر گۆڕانکارییەک لە ڕوونکردنەوەکان (Justifications)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'justifications' }, () => {
            loadAttendanceData();
        })
        // گوێگرتن لە هەر گۆڕانکارییەک لە مۆڵەتەکان (Leaves)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, () => {
            loadAttendanceData();
        })
        .subscribe();

    // دانانی ڕێکەوتی ئەمڕۆ وەک دیفۆڵت
    document.getElementById('datePicker').valueAsDate = new Date();
    applyLanguage(); // دڵنیابوونەوە لە جێبەجێبوونی وەرگێڕان لە سەرەتاوە
    
    await loadBranches();
    await loadAttendanceData();
    renderLeaveTypeCheckboxes(); // دروستکردنی چیک-بۆکسەکان لە کاتی بارکردن
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
            .select('*, profiles:user_id!inner(full_name, branch_id)')
            // بەکارهێنانی Offsetی +03:00 بۆ عێراق لە ناو SQL query
            .gte('check_in_time', `${date}T00:00:00+03:00`)
            .lte('check_in_time', `${date}T23:59:59+03:00`);

        const { data, error } = await query;

        if (error) {
            throw new Error(`Attendance: ${error.message}`);
        }

    // هێنانی ڕوونکردنەوەکان بە لیست و پشکنینی هەڵە
    const { data: justs, error: justError } = await adminClient
        .from('justifications')
        .select('user_id, reason')
        .eq('date', date);

    if (justError) throw new Error(`Justifications: ${justError.message}`);

    // هێنانی مۆڵەتەکان
    const { data: leaves, error: leavesError } = await adminClient
        .from('leaves')
        .select('*');
    
    if (leavesError) throw new Error(`Leaves: ${leavesError.message}`);

    // هێنانی ئادمینەکان بە جیا بۆ ئەوەی هەمیشە هەموویان دیار بن بەبێ گوێدانە فلتەری بنکە
    const { data: admins, error: adminError } = await adminClient
        .from('profiles')
        .select('*, branches:branch_id(branch_id, branch_name)')
        .eq('role', 'admin')
        .order('full_name');

    if (adminError) throw new Error(`Admins: ${adminError.message}`);

    // هێنانی فەرمانبەران بەپێی فلتەری بنکە بۆ لیستی ئامادەبوون
    let staffQuery = adminClient
        .from('profiles')
        .select('*, branches:branch_id(branch_id, branch_name)')
        .neq('role', 'admin');

    if (branchFilter !== 'all') staffQuery = staffQuery.eq('branch_id', branchFilter);
    
    const { data: staff, error: staffError } = await staffQuery.order('full_name');

    if (staffError) throw new Error(`Staff: ${staffError.message}`);

        attendanceCache = data || [];
        staffCache = staff || [];
        leavesCache = leaves || [];
        justificationsCache = justs || [];

        allAdminsCached = admins; // پاشەکەوتکردنی لیستەکە بۆ بەکارهێنان لە پرێزنس
        renderAdmins(admins);
        document.getElementById('justificationCount').innerText = justificationsCache.length;
        applyFiltersLocally(); // بانگکردنی فلتەرەکان
    } catch (err) {
        console.error("Global load error:", err);
        listDiv.innerHTML = `<div class="error-msg"><i class="fas fa-exclamation-triangle"></i> هەڵە: ${err.message}</div>`;
    }
}

// فلتەرکردنی داتا بەبێ دووبارە بانگکردنەوەی داتابەیس
function applyFiltersLocally() {
    const statusFilter = currentFilters.status;
    const searchQuery = document.getElementById('nameSearch').value.toLowerCase();
    
    const selectedDateStr = document.getElementById('datePicker').value; // "YYYY-MM-DD"

    let filteredStaff = staffCache.filter(emp => {
        const employeeLeave = leavesCache.find(l => l.user_id === emp.id && l.start_date <= selectedDateStr && l.end_date >= selectedDateStr);
        const isOnLeave = !!employeeLeave;
        const record = attendanceCache.find(a => a.user_id === emp.id);
        const hasJustification = justificationsCache.some(j => j.user_id === emp.id);

        // ١. گەڕان بەپێی ناو
        const matchesSearch = emp.full_name.toLowerCase().includes(searchQuery);
        if (!matchesSearch) return false;
        
        // ٢. فلتەری جۆری مۆڵەت (Checkboxes)
        if (currentFilters.leaveTypes.length > 0) {
            if (!isOnLeave || !currentFilters.leaveTypes.includes(employeeLeave.reason)) return false;
        }

        if (statusFilter === 'all') return true;
        
        if (record) {
            const checkInDate = new Date(record.check_in_time);
            if (isNaN(checkInDate.getTime())) return false;

            // دەرهێنانی کاتژمێر و خولەک بەپێی کاتی عێراق بۆ فلتەرکردن
            const iraqHours = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: 'numeric' }).format(checkInDate));
            const iraqMinutes = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', minute: 'numeric' }).format(checkInDate));
            const inTime = iraqHours * 60 + iraqMinutes;
            
            const hasExit = record.check_out_time !== null;
            
            if (statusFilter === 'earlyIn') return inTime <= 540; // پێش ٩:٠٠
            if (statusFilter === 'lateIn') return isOnLeave;    // ئێستا lateIn بەکاردێت بۆ فلتەری مۆڵەتەکان
            if (statusFilter === 'veryLateIn') return inTime > 540;
            
            if (hasExit) {
                const outDate = new Date(record.check_out_time);
                if (isNaN(outDate.getTime())) return false;

                const iraqOutHours = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: 'numeric' }).format(outDate));
                const iraqOutMinutes = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', minute: 'numeric' }).format(outDate));
                const outTime = iraqOutHours * 60 + iraqOutMinutes;

                if (statusFilter === 'earlyOut') return outTime < 870;
                if (statusFilter === 'onTimeOut') return outTime >= 870;
            } else {
                if (statusFilter === 'noExit') return true;
            } // ئەگەر لە مۆڵەتدا بوو، ئەوا بە "نەهاتوو" ناژمێردرێت
        } else {
            if (statusFilter === 'absent') return true;
        }
        
        if (statusFilter === 'justified') return hasJustification;
        
        return false;
    });

    renderAttendance(attendanceCache, filteredStaff);
}

// فەنکشن بۆ دروستکردنی چیک-بۆکسەکانی مۆڵەت بە شێوەیەکی داینامیکی
function renderLeaveTypeCheckboxes() {
    const filterGrid = document.querySelector('.filter-grid');
    if (!filterGrid) return;

    const leaveItem = document.createElement('div');
    leaveItem.className = 'filter-item';
    leaveItem.id = 'leaveCheckboxFilter';

    const label = document.createElement('label');
    label.innerHTML = `<i class="fas fa-plane-departure"></i> ${translations[currentLang].filterByLeave}`;
    
    const container = document.createElement('div');
    container.className = 'leave-checkbox-container';
    
    const types = [
        { key: 'sickLeave', text: translations[currentLang].sickLeave },
        { key: 'maternityLeave', text: translations[currentLang].maternityLeave },
        { key: 'longTermLeave', text: translations[currentLang].longTermLeave },
        { key: 'regularLeave', text: translations[currentLang].regularLeave },
        { key: 'hourlyLeave', text: translations[currentLang].hourlyLeave }
    ];

    types.forEach(t => {
        const item = document.createElement('label');
        item.className = 'leave-checkbox-item';
        item.innerHTML = `
            <input type="checkbox" value="${t.key}" onchange="toggleLeaveTypeFilter('${t.key}')">
            <span>${t.text}</span>
        `;
        container.appendChild(item);
    });

    leaveItem.appendChild(label);
    leaveItem.appendChild(container);
    
    // جێگیرکردنی پێش دوگمەی پرێنت
    const actions = filterGrid.querySelector('.filter-actions');
    if (actions) {
        // بردنی دوگمەکان بۆ ئەوپەڕی لای چەپ لە سیستەمی RTL
        actions.style.display = 'flex';
        actions.style.gap = '10px';
        actions.style.alignItems = 'center';

        filterGrid.insertBefore(leaveItem, actions);
        
        // زیادکردنی دوگمەی ئێکسپۆڕت ئەگەر پێشتر دروست نەکرابوو
        if (!document.getElementById('exportExcelBtn')) {
            const exportBtn = document.createElement('button');
            exportBtn.id = 'exportExcelBtn';
            exportBtn.className = 'print-btn';
            exportBtn.style.background = '#16a34a'; // ڕەنگی سەوز بۆ ئێکسڵ
            exportBtn.style.margin = '0'; 
            exportBtn.innerHTML = `<i class="fas fa-file-excel"></i> ${translations[currentLang].exportExcel}`;
            exportBtn.onclick = handleExportExcel;
            actions.appendChild(exportBtn);
        }
    } else {
        filterGrid.appendChild(leaveItem);
    }
}

function toggleLeaveTypeFilter(key) {
    const index = currentFilters.leaveTypes.indexOf(key);
    if (index === -1) currentFilters.leaveTypes.push(key);
    else currentFilters.leaveTypes.splice(index, 1);
    applyFiltersLocally();
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
    
    // ١. ڕیزکردنی فەرمانبەران: ئەو کەسانەی چێک-ئینیان کردووە و دەرنەچوون دێنە سەرەوەی لیستەکە
    const selectedDateStr = document.getElementById('datePicker').value;

    const langCode = currentLang === 'ku' ? 'ku' : 'ar';
    employees.sort((a, b) => {
        const recA = attendance.find(r => r.user_id === a.id);
        const recB = attendance.find(r => r.user_id === b.id);
        const onDutyA = (recA && !recA.check_out_time) ? 1 : 0;
        const onDutyB = (recB && !recB.check_out_time) ? 1 : 0;

        const onLeaveA = leavesCache.some(l => l.user_id === a.id && l.start_date <= selectedDateStr && l.end_date >= selectedDateStr) ? 1 : 0;
        const onLeaveB = leavesCache.some(l => l.user_id === b.id && l.start_date <= selectedDateStr && l.end_date >= selectedDateStr) ? 1 : 0;

        if (onDutyA !== onDutyB) return onDutyB - onDutyA; // ئەوانەی لە دەوامدان (1) دێنە پێش (0)
        if (onLeaveA !== onLeaveB) return onLeaveB - onLeaveA; // پاشان ئەوانەی لە مۆڵەتن
        return a.full_name.localeCompare(b.full_name, langCode); // پاشان بەپێی ناو
    });

    // ٢. هەژمارکردنی ئەو کەسانەی کە ئێستا لە دەوامدان بۆ نیشاندان لە باجەکەدا
    const onDutyCount = employees.filter(emp => {
        const record = attendance.find(a => a.user_id === emp.id);
        return record && !record.check_out_time;
    }).length;

    // نوێکردنەوەی تایتڵ و زیادکردنی باجی ژمارە
    const onLeaveCount = employees.filter(emp => {
        return leavesCache.some(l => l.user_id === emp.id && l.start_date <= selectedDateStr && l.end_date >= selectedDateStr);
    }).length;

    sectionTitle.innerHTML = `<div class="title-icon-box"><i class="fas fa-list-ul"></i></div> <span>${translations[currentLang].attendanceListTitle}</span> 
                              <span class="count-badge" title="${translations[currentLang].onDuty}">${onDutyCount} ${translations[currentLang].onDuty}</span> <span class="count-badge badge-leave-count" title="${translations[currentLang].onLeave}">${onLeaveCount} ${translations[currentLang].onLeave}</span>`;

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

    // دروستکردنی لیستەکە وەک یەک پارچەی یەکگرتوو بۆ ئەوەی ڕیزبەندییەکە بە دروستی کار بکات
    const section = document.createElement('div');
    section.className = "branch-group-container";

    // حیسابکردنی ئامارەکان لەسەر هەموو فەرمانبەران، بەبێ ئەوانەی لە مۆڵەتن
    employees.forEach(emp => {
            const record = attendance.find(a => a.user_id === emp.id);
            const branch = emp.branches ? `${emp.branches.branch_id} | ${emp.branches.branch_name}` : "بێ بنکە";
            const row = document.createElement('div');
            const isOnDuty = record && !record.check_out_time;
            row.className = `attendance-item ${isOnDuty ? 'on-duty-row' : ''}`;
            let employeeClassifications = []; // لیستێک بۆ کۆکردنەوەی هەموو پۆڵێنەکان

            const employeeLeave = leavesCache.find(l => 
                l.user_id === emp.id &&
                l.start_date <= selectedDateStr &&
                l.end_date >= selectedDateStr
            );
            const isOnLeave = !!employeeLeave;
            const leaveTypeText = isOnLeave ? (translations[currentLang][employeeLeave.reason] || employeeLeave.reason) : "";

            const just = justificationsCache.find(j => j.user_id === emp.id);
            const hasJustification = !!just;
            
            if (isOnLeave) {
                row.classList.add('on-leave-row');
                employeeClassifications.push({ label: `${translations[currentLang].reasonForLeave}: ${leaveTypeText}`, class: 'badge-leave', icon: 'fas fa-plane-departure' });
            }

            if (record) { // ئەگەر چێک-ئینی کردبوو
                const checkIn = new Date(record.check_in_time);
                const inTime = checkIn.getHours() * 60 + checkIn.getMinutes();
                
                // حیسابکردنی جۆری هاتن
                if (inTime <= 540) { // پێش ٩:٠٠ (٩ چرکە * ٦٠ خولەک = ٥٤٠)
                    stats.earlyIn++;
                    employeeClassifications.push({ label: translations[currentLang].earlyIn, class: 'badge-early', icon: 'fas fa-user-check' });
                } else { // دوای 9:00
                    stats.veryLateIn++;
                    employeeClassifications.push({ label: translations[currentLang].veryLateInAdmin, class: 'badge-orange', icon: 'fas fa-user-clock' });
                }

                // حیسابکردنی جۆری دەرچوون (ئەگەر کرابێت)
                if (record.check_out_time) {
                    const checkOut = new Date(record.check_out_time);
                    const iraqOutHours = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: 'numeric' }).format(checkOut));
                    const iraqOutMinutes = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', minute: 'numeric' }).format(checkOut));
                    const outTime = iraqOutHours * 60 + iraqOutMinutes;

                    
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
            } else if (!isOnLeave) {
                // ئەگەر هیچ ڕیکۆردێکی نەبوو و لە مۆڵەتیشدا نەبوو، واتە نەهاتووە
                stats.absent++;
                employeeClassifications.push({ label: translations[currentLang].absentStat, class: 'badge-danger', icon: 'fas fa-user-slash' });
            }

            // ئەگەر ڕوونکردنەوەی هەبوو، ئایکۆنەکەی بۆ زیاد بکە
            if (hasJustification) {
                employeeClassifications.push({ label: translations[currentLang].justification, class: 'badge-blue', icon: 'fas fa-file-signature' });
            }
            
            const tIn = record ? formatTime12(record.check_in_time) : '--:--';
            const tOut = record?.check_out_time ? formatTime12(record.check_out_time) : '--:--';
            
            // دیاریکردنی تایتڵی ستوونی دۆخ بە شێوەیەکی وورد
            let statusLabel = "";
            if (isOnLeave) {
                if (employeeLeave.reason === 'hourlyLeave') {
                    const timeRange = `${formatTime12(employeeLeave.start_time)} - ${formatTime12(employeeLeave.end_time)}`;
                    const hourlyBadge = `<span class="status-pill status-leave" style="cursor:pointer;" onclick="alert('${leaveTypeText}: ${timeRange}')" title="${timeRange}">${leaveTypeText}</span>`;
                    
                    if (record) {
                        statusLabel = `${hourlyBadge} <span style="font-weight:800; color:var(--text-sub); font-size:0.7rem;">+</span> <span class="status-pill status-present">${translations[currentLang].statusPresent}</span>`;
                    } else {
                        statusLabel = hourlyBadge;
                    }
                } else {
                    statusLabel = `<span class="status-pill status-leave">${leaveTypeText}</span>`;
                }
            } else if (record) {
                statusLabel = `<span class="status-pill status-present">${translations[currentLang].statusPresent}</span>`;
            } else {
                statusLabel = `<span class="status-pill status-absent">${translations[currentLang].statusAbsent}</span>`;
            }
            
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

    // نوێکردنەوەی کارتەکان لە UI
    document.getElementById('countEarlyIn').innerText = stats.earlyIn;
    document.getElementById('countLateIn').innerText = onLeaveCount; // پیشاندانی ژمارەی مۆڵەتەکان
    document.getElementById('countVeryLateIn').innerText = stats.veryLateIn;
    document.getElementById('countEarlyOut').innerText = stats.earlyOut;
    document.getElementById('countOnTimeOut').innerText = stats.onTimeOut;
    document.getElementById('countAbsent').innerText = stats.absent;
    document.getElementById('countNotCheckedOut').innerText = stats.notCheckedOut;
}

// فەنکشنی یاریدەدەر بۆ دروستکردنی ڕیزی ئامادەبوون
// ئەم فەنکشنە لابراوە چونکە لۆجیکی ڕیزکردنەکە گوازرایەوە بۆ renderAttendance
// و ڕیزەکان ڕاستەوخۆ لەوێ دروست دەکرێن

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
    
    // پاککردنەوەی زانیارییەکانی مۆڵەت پێش کردنەوەی مۆداڵ بۆ فەرمانبەرێکی نوێ
    selectedLeaveStartDate = null;
    selectedLeaveEndDate = null;
    selectedLeaveReasonInModal = null;
    selectedLeaveStartTime = null;
    selectedLeaveEndTime = null;

    let modal = document.getElementById('empSettingsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'empSettingsModal';
        modal.className = 'modal-overlay';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        document.body.appendChild(modal);
    }

    // Branch selection HTML
    const currentBranchName = branchesCache.find(b => b.branch_id === emp.branch_id)?.branch_name || translations[currentLang].allBranches;
    selectedBranchInModal = emp.branch_id;

    // Role selection logic
    const rolesList = [
        { key: 'employee', text: translations[currentLang].employee },
        { key: 'sub-admin', text: translations[currentLang]['sub-admin'] },
        { key: 'assistant-manager', text: translations[currentLang]['assistant-manager'] }
    ];
    const currentRole = rolesList.find(r => r.key === emp.role) || rolesList[0];
    selectedRoleInModal = currentRole.key;
    const currentRoleText = currentRole.text;

    const branchOptionsHtml = branchesCache.map(b => `
        <div class="option ${emp.branch_id === b.branch_id ? 'selected' : ''}" onclick="selectModalBranch(event, '${b.branch_id}', '${b.branch_name}')">
            ${b.branch_id} | ${b.branch_name}
        </div>
    `).join('');

    const roleOptionsHtml = rolesList.map(r => `
        <div class="option ${emp.role === r.key ? 'selected' : ''}" onclick="selectModalRole(event, '${r.key}', '${r.text}')">
            ${r.text}
        </div>
    `).join('');

    // ئامادەکردنی لیستی جۆرەکانی مۆڵەت بۆ ناو مۆداڵ
    const leaveTypes = [
        { key: 'hourlyLeave', text: translations[currentLang].hourlyLeave },
        { key: 'regularLeave', text: translations[currentLang].regularLeave },
        { key: 'sickLeave', text: translations[currentLang].sickLeave },
        { key: 'maternityLeave', text: translations[currentLang].maternityLeave },
        { key: 'longTermLeave', text: translations[currentLang].longTermLeave }
    ];

    const leaveOptionsHtml = leaveTypes.map(l => `
        <div class="option" onclick="selectModalLeaveReason(event, '${l.key}', '${l.text}')">
            ${l.text}
        </div>
    `).join('');

    // وەرگێڕانەکان بۆ ناو تابەکان
    const tabGeneralText = translations[currentLang].empSettings;
    const tabLeaveText = translations[currentLang].leaveManagementt;
    const tabCheckoutText = translations[currentLang].manualCheckoutTab;

    modal.innerHTML = `
        <div class="modal-window compact-settings-modal" style="max-width:400px; padding:20px; border-radius:25px;">
            <div class="modal-header-compact">
                <i class="fas fa-user-cog"></i>
                <div>
                    <h3 style="margin:0; font-size:1.1rem;">${translations[currentLang].emppSettings}</h3>
                    <p style="margin:0; font-size:0.75rem; color:var(--text-sub);">${emp.full_name}</p>
                </div>
            </div>

            <div class="settings-tabs">
                <button class="tab-btn active" onclick="switchSettingsTab(event, 'general-tab')"><i class="fas fa-id-card"></i> ${tabGeneralText}</button>
                <button class="tab-btn" onclick="switchSettingsTab(event, 'leave-tab')"><i class="fas fa-plane-departure"></i> ${tabLeaveText}</button>
                <button class="tab-btn" onclick="switchSettingsTab(event, 'checkout-tab')"><i class="fas fa-sign-out-alt"></i> ${tabCheckoutText}</button>
            </div>
            
            <div id="general-tab" class="tab-pane active">
                <div class="settings-grid">
                <div class="settings-group">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label class="settings-label" style="margin:0;"><i class="fas fa-map-marker-alt"></i> ${translations[currentLang].branchLabel}</label>
                        <button class="mini-action-link" onclick="updateEmployeeBranch('${userId}')">${translations[currentLang].change}</button>
                    </div>
                    <div class="custom-select" id="modalBranchSelect" onclick="toggleCustomDropdown(event, 'modalBranchSelect')">
                        <div class="select-trigger mini-trigger">
                            <span class="selected-text">${currentBranchName}</span>
                            <i class="fas fa-chevron-down"></i>
                        </div>
                        <div class="options-list">${branchOptionsHtml}</div>
                    </div>
                </div>

                <div class="settings-group">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label class="settings-label" style="margin:0;"><i class="fas fa-user-tag"></i> ${translations[currentLang].collClass}</label>
                        <button class="mini-action-link" onclick="updateEmployeeRole('${userId}')">${translations[currentLang].change}</button>
                    </div>
                    <div class="custom-select" id="modalRoleSelect" onclick="toggleCustomDropdown(event, 'modalRoleSelect')">
                        <div class="select-trigger mini-trigger">
                            <span class="selected-text">${currentRoleText}</span>
                            <i class="fas fa-chevron-down"></i>
                        </div>
                        <div class="options-list">${roleOptionsHtml}</div>
                    </div>
                </div>
                </div>
            </div>

            <div id="leave-tab" class="tab-pane">
                <div id="leaveRegistrationSection" class="settings-group" style="background: rgba(var(--primary-rgb), 0.03); border: 1px dashed var(--primary); margin-top:0; padding: 10px;">
                    <label class="settings-label" style="margin-bottom:8px; font-size:0.6rem;"><i class="fas fa-plane-departure"></i> ${translations[currentLang].leaveManagement}</label>
                    
                    <div style="display:flex; gap:6px; margin-bottom:6px;">
                        <input type="date" class="glass-input mini-trigger" onchange="selectedLeaveStartDate=this.value" style="flex:1; font-size:0.65rem; height:32px !important; padding: 0 8px;">
                        <input type="date" class="glass-input mini-trigger" onchange="selectedLeaveEndDate=this.value" style="flex:1; font-size:0.65rem; height:32px !important; padding: 0 8px;">
                    </div>
                    
                     <div id="modalHourlyTimeInputs" style="display:none; gap:6px; margin-bottom:6px;">
                        <input type="time" class="glass-input mini-trigger" onchange="selectedLeaveStartTime=this.value" style="flex:1; font-size:0.65rem; height:32px !important; padding: 0 8px;">
                        <input type="time" class="glass-input mini-trigger" onchange="selectedLeaveEndTime=this.value" style="flex:1; font-size:0.65rem; height:32px !important; padding: 0 8px;">
                    </div>

                    <div style="display:flex; gap:6px; align-items: stretch;">
                        <div class="custom-select" id="modalLeaveSelect" onclick="toggleCustomDropdown(event, 'modalLeaveSelect')" style="flex: 2;">
                            <div class="select-trigger mini-trigger" style="height:32px !important; font-size:0.7rem;">
                                <span class="selected-text" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${translations[currentLang].selectLeaveReason}</span>
                                <i class="fas fa-chevron-down" style="font-size:0.6rem;"></i>
                            </div>
                            <div class="options-list">${leaveOptionsHtml}</div>
                        </div>
                        <button class="settings-save-btn" onclick="saveModalLeave('${userId}')" style="flex: 1; margin-top:0; height:32px; background:var(--primary); font-size:0.7rem; border-radius:10px;">
                            <i class="fas fa-check"></i> ${translations[currentLang].saveLeave}
                        </button>
                    </div>
                </div>

                <div class="active-leaves-list" style="margin-top:15px; border-top:1px dashed var(--border-color); padding-top:15px;">
                    <label class="settings-label" style="margin-bottom:10px;"><i class="fas fa-history"></i> ${translations[currentLang].leaveStatus}</label>
                    <div id="leavesItemsContainer" style="padding:2px;">
                        <div class="loading-state" style="padding:10px;"><i class="fas fa-circle-notch fa-spin"></i></div>
                    </div>
                </div>
            </div>

            <div id="checkout-tab" class="tab-pane">
                <div class="settings-group reset-group" style="padding: 12px; margin-top: 0;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="text-align:right;">
                            <span class="settings-label" style="margin:0;"><i class="fas fa-mobile-alt"></i> ${translations[currentLang].device}</span>
                            <span style="font-size:0.65rem; color:${emp.device_id ? '#ef4444' : 'var(--text-sub)'}">${emp.device_id ? 'Linked' : 'Not Linked'}</span>
                        </div>
                        <button class="mini-btn btn-danger-modern" style="width:auto; padding:0 12px; height:32px; font-size:0.75rem;" onclick="resetDeviceID()"><i class="fas fa-redo"></i> Reset</button>
                    </div>
                </div>
            </div>

            <button class="modal-close-link mini-close" onclick="document.getElementById('empSettingsModal').style.display='none'"><i class="fas fa-times"></i> ${translations[currentLang].close}</button>
        </div>
    `;
    modal.style.display = 'flex';
}

function switchSettingsTab(event, tabId) {
    if (event) event.stopPropagation();
    
    // لابردنی ئاکتیڤ لە هەموو تابەکان
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    
    // چالاککردنی تابی دیاریکراو
    event.currentTarget.classList.add('active');
    document.getElementById(tabId).classList.add('active');

    // ئەگەر تابی مۆڵەت کرایەوە، مۆڵەتەکان بار بکە
    if (tabId === 'leave-tab') {
        loadEmployeeLeaves(selectedUserIdForReset);
    }
}

async function loadEmployeeLeaves(userId, showAll = false) {
    const container = document.getElementById('leavesItemsContainer');
    const regSection = document.getElementById('leaveRegistrationSection');
    if (!container || !regSection) return;

    // هێنانی هەموو مۆڵەتەکانی ئەم فەرمانبەرە بۆ ئەوەی ئادمین بتوانێت بەڕێوەیان ببات
    // لابردنی فلتەری ڕێکەوتی ئەمڕۆ چونکە ڕێگری دەکرد لە بینینی مۆڵەتەکانی داهاتوو یان ڕابردوو
    const { data, error } = await adminClient
        .from('leaves')
        .select('*')
        .eq('user_id', userId)
        .order('start_date', { ascending: false }); 
    if (error) {
        container.innerHTML = `<div style="color:var(--status-absent); font-size:0.7rem;">Error loading data</div>`;
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = `<div style="font-size:0.75rem; color:var(--text-sub); text-align:center; padding:15px;">${translations[currentLang].noLeaveRecorded}</div>`;
        return;
    }

    // ئەگەر نیشاندانی هەمووی هەڵبژێردرا، بەشی تۆمارکردن بشارەوە
    regSection.style.display = showAll ? 'none' : 'block';

    // ئەگەر نیشاندانی هەمووی نەبوو، تەنها نوێترین پشان بدە
    const displayData = showAll ? data : [data[0]];

    let leavesListHtml = displayData.map(leave => {
        const leaveText = translations[currentLang][leave.reason] || leave.reason;
        // کورتکردنەوەی کاتی مۆڵەتی کاتی بۆ یەك هێڵ و لادانی سپەیسە زیادەکان بۆ کۆمپاکتکردن
        const timeRange = leave.start_time ? ` <small style="color:var(--primary); font-weight:normal; font-size:0.6rem;">(${formatTime12(leave.start_time).replace(/\s/g,'')}-${formatTime12(leave.end_time).replace(/\s/g,'')})</small>` : '';
        const dateRangeText = leave.start_date === leave.end_date ? leave.start_date : `${leave.start_date} ← ${leave.end_date}`;
        
        return `
            <div class="modal-leave-item" style="padding: 8px 12px; margin-bottom: 6px; border-radius: 12px; background: var(--bg-color); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
                <div style="text-align:right; flex: 1; min-width: 0; padding-left: 10px;">
                    <div style="font-size:0.78rem; font-weight:700; color:var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3;">
                        ${leaveText} ${timeRange}
                    </div>
                    <div style="font-size:0.65rem; color:var(--text-sub); font-family: 'JetBrains Mono', monospace; letter-spacing: -0.5px;">${dateRangeText}</div>
                </div>
                <button class="mini-btn" style="width:28px; height:28px; min-width:28px; margin:0; border-radius:8px; background: rgba(239, 68, 68, 0.08); color: #ef4444; border: none; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onclick="deleteModalLeave('${leave.id}', '${userId}')">
                    <i class="fas fa-trash-alt" style="font-size:0.6rem;"></i>
                </button>
            </div>
        `;
    }).join('');

    if (!showAll && data.length > 1) {
        const viewAllText = currentLang === 'ku' ? "بینینی هەمووی" : "عرض الكل";
        leavesListHtml += `
            <button class="mini-action-link" style="width:100%; margin-top:10px; padding: 8px; border: 1px dashed var(--border-color); border-radius: 10px; text-decoration: none; color: var(--primary); display: block;" onclick="loadEmployeeLeaves('${userId}', true)">
                <i class="fas fa-layer-group"></i> ${viewAllText} (${data.length})
            </button>`;
    } else if (showAll) {
        const backText = currentLang === 'ku' ? "تۆمارکردنی نوێ" : "تسجيل جديد";
        leavesListHtml = `
            <button class="mini-action-link" style="width:100%; margin-bottom:12px; text-align:right; display:block; text-decoration:none; color:var(--text-sub); font-size:0.7rem;" onclick="loadEmployeeLeaves('${userId}', false)">
                <i class="fas fa-chevron-right"></i> ${backText}
            </button>
            <div style="max-height: 195px; overflow-y: auto; padding-left: 4px; padding-right: 2px;">
                ${leavesListHtml}
            </div>
        `;
    }

    container.innerHTML = leavesListHtml;
}

async function deleteModalLeave(leaveId, userId) {
    if (!confirm(translations[currentLang].confirmDeleteLeave)) return;

    const { error } = await adminClient
        .from('leaves')
        .delete()
        .eq('id', leaveId);

    if (!error) {
        loadEmployeeLeaves(userId); // نوێکردنەوەی لیستەکە لە ناو مۆداڵ
        loadAttendanceData();       // نوێکردنەوەی ئامارەکان لە داشبۆردی سەرەکی
    } else {
        alert("Error deleting: " + error.message);
    }
}

function selectModalBranch(event, branchId, branchName) {
    if (event) event.stopPropagation(); // ڕێگری لە بڵاوبوونەوەی ڕووداوی کلیکەکە
    selectedBranchInModal = branchId;
    const trigger = document.querySelector('#modalBranchSelect .selected-text');
    if (trigger) trigger.innerText = `${branchId} | ${branchName}`; // نوێکردنەوەی تێکستەکە بە ژمارە و ناوی بنکە
    
    document.querySelectorAll('#modalBranchSelect .option').forEach(opt => {
        // Fix: Check if opt.innerText contains branchName, not just equals
        opt.classList.toggle('selected', opt.innerText.includes(branchName));
    });
    document.getElementById('modalBranchSelect').classList.remove('active'); // داخستنی لیستەکە دوای هەڵبژاردن
}

function selectModalLeaveReason(event, key, text) {
    if (event) event.stopPropagation();
    selectedLeaveReasonInModal = key;
    const triggerText = document.querySelector('#modalLeaveSelect .selected-text');
    if (triggerText) triggerText.innerText = text;
    
    const timeInputs = document.getElementById('modalHourlyTimeInputs');
    if (timeInputs) timeInputs.style.display = (key === 'hourlyLeave') ? 'flex' : 'none';
    
    document.getElementById('modalLeaveSelect').classList.remove('active');
}

async function saveModalLeave(userId) {
    if (!selectedLeaveStartDate || !selectedLeaveEndDate || !selectedLeaveReasonInModal) {
        alert(translations[currentLang].selectDates);
        return;
    }

    // پشکنینی وورد بۆ ڕێگری لە تێکەڵبوونی ڕێکەوتی مۆڵەتەکان (Overlap Detection)
    // ئەم لۆجیکە ڕێگری دەکات لەوەی فەرمانبەر لە یەک کاتدا یان لە یەک ڕۆژدا دوو مۆڵەتی هەبێت
    const isOverlapping = leavesCache.some(l => {
        return l.user_id === userId && 
               selectedLeaveStartDate <= l.end_date && 
               selectedLeaveEndDate >= l.start_date;
    });

    if (isOverlapping) {
        const errorMsg = currentLang === 'ku' 
            ? "هەڵە: ئەم فەرمانبەرە لەم مەودای ڕێکەوتەدا مۆڵەتی بۆ تۆمار کراوە. ناتوانرێت دوو مۆڵەت بۆ هەمان ڕۆژ تۆمار بکرێت." 
            : "خطأ: هذا الموظف لديه إجازة مسجلة في هذا النطاق الزمني. لا يمكن تسجيل إجازتين لنفس اليوم.";
        alert(errorMsg);
        return;
    }

    const leaveData = {
        user_id: userId,
        start_date: selectedLeaveStartDate,
        end_date: selectedLeaveEndDate,
        reason: selectedLeaveReasonInModal
    };

    if (selectedLeaveReasonInModal === 'hourlyLeave') {
        leaveData.start_time = selectedLeaveStartTime;
        leaveData.end_time = selectedLeaveEndTime;
    }

    if (confirm(translations[currentLang].confirmSaveLeave)) {
        const { error } = await adminClient.from('leaves').insert([leaveData]);
        if (!error) {
            alert(translations[currentLang].leaveSavedSuccess);
            loadEmployeeLeaves(userId); // لیستەکە نوێ بکەرەوە دوای سەیڤکردن
            loadAttendanceData();
        } else {
            alert(error.code === '23505' ? "ئەم فەرمانبەرە پێشتر مۆڵەتی بۆ ئەم ڕێکەوتە تۆمار کراوە" : "Error: " + error.message);
        }
    }
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

function selectModalRole(event, roleKey, roleText) {
    if (event) event.stopPropagation();
    selectedRoleInModal = roleKey;
    const trigger = document.querySelector('#modalRoleSelect .selected-text');
    if (trigger) trigger.innerText = roleText;

    document.querySelectorAll('#modalRoleSelect .option').forEach(opt => {
        opt.classList.toggle('selected', opt.innerText === roleText);
    });
    document.getElementById('modalRoleSelect').classList.remove('active');
}

async function updateEmployeeRole(userId) {
    const newRole = selectedRoleInModal;
    if (confirm(translations[currentLang].confirmBranchChange)) {
        const { error } = await adminClient.from('profiles').update({ role: newRole }).eq('id', userId);
        if (!error) {
            alert(translations[currentLang].successUpdate);
            loadAttendanceData();
            document.getElementById('empSettingsModal').style.display = 'none';
        } else {
            alert("Error: " + error.message);
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
        const employeeLeave = leavesCache.find(l => l.user_id === emp.id && l.start_date <= date && l.end_date >= date);
        const isOnLeave = !!employeeLeave;
        const record = attendanceCache.find(a => a.user_id === emp.id);
        const matchesSearch = emp.full_name.toLowerCase().includes(searchQuery);
        if (!matchesSearch) return false;

        // فلتەری جۆری مۆڵەت (Checkboxes)
        if (currentFilters.leaveTypes.length > 0) {
            if (!isOnLeave || !currentFilters.leaveTypes.includes(employeeLeave.reason)) return false;
        }

        if (statusFilter === 'all') return true;
        
        if (record) {
            const checkIn = new Date(record.check_in_time);
            const inTime = checkIn.getHours() * 60 + checkIn.getMinutes();
            if (statusFilter === 'earlyIn') return inTime <= 540;
            if (statusFilter === 'lateIn') return isOnLeave;
            if (statusFilter === 'veryLateIn') return inTime > 540;
            if (record.check_out_time) {
                const checkOut = new Date(record.check_out_time);
                const iraqOutHours = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: 'numeric' }).format(checkOut));
                const iraqOutMinutes = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', minute: 'numeric' }).format(checkOut));
                const outTime = iraqOutHours * 60 + iraqOutMinutes;

                if (statusFilter === 'earlyOut') return outTime < 870;
                if (statusFilter === 'onTimeOut') return outTime >= 870;
            } else if (statusFilter === 'noExit') return true;
        } else if (statusFilter === 'absent') return !isOnLeave;
        if (statusFilter === 'justified') return justificationsCache.some(j => j.user_id === emp.id);
        return false;
    });

    const printWindow = window.open('', '_blank');
    
    // دروستکردنی ڕیزەکانی خشتەکە
    let rowsHtml = filteredStaff.map((emp, index) => {
        const record = attendanceCache.find(a => a.user_id === emp.id);
        const employeeLeave = leavesCache.find(l => l.user_id === emp.id && l.start_date <= date && l.end_date >= date);
        const isOnLeave = !!employeeLeave;
        const branchInfo = emp.branches ? `${emp.branches.branch_id} | ${emp.branches.branch_name}` : '-';
        const tIn = record ? formatTime12(record.check_in_time) : '-';
        const tOut = record?.check_out_time ? formatTime12(record.check_out_time) : '-';
        
        let statusText = "";
        if (isOnLeave) {
            const leaveTypeText = translations[currentLang][employeeLeave.reason] || employeeLeave.reason;
            statusText = leaveTypeText;
            if (employeeLeave.reason === 'hourlyLeave') {
                statusText += ` (${formatTime12(employeeLeave.start_time)} - ${formatTime12(employeeLeave.end_time)})`;
                if (record) statusText += ` + ${t.statusPresent}`;
            }
        } else if (record) {
            statusText = t.statusPresent;
        } else {
            statusText = t.statusAbsent;
        }

        return `
            <tr>
                <td style="font-weight: 600; color: #444;">${index + 1}</td>
                <td style="text-align: right; font-weight: 700; padding-right: 12px;">${emp.full_name}</td>
                <td style="font-size: 11px;">${branchInfo}</td>
                <td dir="ltr">${tIn}</td>
                <td dir="ltr">${tOut}</td>
                <td>${statusText}</td>
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
                            <th style="width: 20%;">${t.colBranch}</th>
                            <th style="width: 60px;">${t.arrival}</th>
                            <th style="width: 60px;">${t.checkout}</th>
                            <th style="width: 175px;">${t.colStatus}</th>
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

function handleExportExcel() {
    const date = document.getElementById('datePicker').value;
    const searchQuery = document.getElementById('nameSearch').value.toLowerCase();
    const statusFilter = currentFilters.status;
    const t = translations[currentLang];

    // فلتەرکردنی داتاکان ڕێک بەپێی ئەوەی لە لیستەکەدا دەردەکەوێت
    const filteredStaff = staffCache.filter(emp => {
        const employeeLeave = leavesCache.find(l => l.user_id === emp.id && l.start_date <= date && l.end_date >= date);
        const isOnLeave = !!employeeLeave;
        const record = attendanceCache.find(a => a.user_id === emp.id);
        const matchesSearch = emp.full_name.toLowerCase().includes(searchQuery);
        if (!matchesSearch) return false;

        if (currentFilters.leaveTypes.length > 0) {
            if (!isOnLeave || !currentFilters.leaveTypes.includes(employeeLeave.reason)) return false;
        }
        if (statusFilter === 'all') return true;
        if (record) {
            const checkIn = new Date(record.check_in_time);
            const inTime = checkIn.getHours() * 60 + checkIn.getMinutes();
            if (statusFilter === 'earlyIn') return inTime <= 540;
            if (statusFilter === 'lateIn') return isOnLeave;
            if (statusFilter === 'veryLateIn') return inTime > 540;
            if (record.check_out_time) {
                const outDate = new Date(record.check_out_time);
                const iraqOutHours = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: 'numeric' }).format(outDate));
                const iraqOutMinutes = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', minute: 'numeric' }).format(outDate));
                const outTime = iraqOutHours * 60 + iraqOutMinutes;

                if (statusFilter === 'earlyOut') return outTime < 870;
                if (statusFilter === 'onTimeOut') return outTime >= 870;
            } else if (statusFilter === 'noExit') return true;
        } else if (statusFilter === 'absent') return !isOnLeave;
        if (statusFilter === 'justified') return justificationsCache.some(j => j.user_id === emp.id);
        return false;
    });

    // دروستکردنی ناوەڕۆکی CSV
    const headers = ["#", t.colName, t.colBranch, t.arrival, t.checkout, t.colStatus, t.colJust];
    let csvContent = headers.join(",") + "\n";

    filteredStaff.forEach((emp, index) => {
        const record = attendanceCache.find(a => a.user_id === emp.id);
        const employeeLeave = leavesCache.find(l => l.user_id === emp.id && l.start_date <= date && l.end_date >= date);
        const branchInfo = emp.branches ? `${emp.branches.branch_id} | ${emp.branches.branch_name}` : '-';
        
        const tIn = record ? formatTime12(record.check_in_time).replace(/\u200E/g, '') : '-';
        const tOut = record?.check_out_time ? formatTime12(record.check_out_time).replace(/\u200E/g, '') : '-';
        
        let statusText = "";
        if (employeeLeave) {
            statusText = (translations[currentLang][employeeLeave.reason] || employeeLeave.reason) + (record ? ` + ${t.statusPresent}` : "");
        } else if (record) {
            statusText = t.statusPresent;
        } else {
            statusText = t.statusAbsent;
        }

        const just = justificationsCache.find(j => j.user_id === emp.id);
        const justText = just ? just.reason.replace(/\n/g, ' ').replace(/,/g, ';') : '-';

        const row = [
            index + 1,
            `"${emp.full_name}"`,
            `"${branchInfo}"`,
            `"${tIn}"`,
            `"${tOut}"`,
            `"${statusText}"`,
            `"${justText}"`
        ];
        csvContent += row.join(",") + "\n";
    });

    // داگرتنی فایلەکە بە بەکارهێنانی BOM بۆ پشتگیری زمانی کوردی
    const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Attendance_Report_${date}.csv`;
    link.click();
}

async function handleLogout() {
    await adminClient.auth.signOut();
    location.href = 'index.html';
}
