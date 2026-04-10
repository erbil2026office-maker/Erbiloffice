const URL_SB = 'https://mygqlubvxdbbsygitjuj.supabase.co';
const KEY_SB = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Z3FsdWJ2eGRiYnN5Z2l0anVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjA3NzIsImV4cCI6MjA5MTI5Njc3Mn0.bAecJcTMfZEiT1doet_PgH3EEjjAB6juNRoCJlK9qeA';
const adminClient = supabase.createClient(URL_SB, KEY_SB);

let allAdminsCached = []; // بۆ هەڵگرتنی لیستی ئادمینەکان و نوێکردنەوەی دۆخی ئۆنلاین
let onlineAdmins = {};    // بۆ هەڵگرتنی ئەو ئادمینانەی ئێستا لەسەر هێڵن

document.addEventListener('DOMContentLoaded', async () => {
    // پشکنینی ئادمین
    const { data: { user } } = await adminClient.auth.getUser();
    if (!user) { location.href = 'index.html'; return; }

    const { data: profile } = await adminClient.from('profiles').select('role').eq('id', user.id).single();
    if (profile.role !== 'admin') { location.href = 'dashboard.html'; return; }

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

    // دانانی ڕێکەوتی ئەمڕۆ وەک دیفۆڵت
    document.getElementById('datePicker').valueAsDate = new Date();
    
    await loadBranches();
    await loadAttendanceData();
});

async function loadBranches() {
    try {
        const { data, error } = await adminClient.from('branches').select('*').order('branch_name');
        if (error) throw error;
        
        const select = document.getElementById('branchFilter');
        if (data) {
            data.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.branch_id;
                opt.innerText = b.branch_name;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Error loading branches:", err.message);
    }
}

async function loadAttendanceData() {
    const listDiv = document.getElementById('attendanceList');
    const date = document.getElementById('datePicker').value;
    const branchFilter = document.getElementById('branchFilter').value;

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

    // هێنانی ژمارەی ڕوونکردنەوەکان بۆ ئەو ڕێکەوتە
    const { count: justCount } = await adminClient
        .from('justifications')
        .select('*', { count: 'exact', head: true })
        .eq('date', date);

    // هێنانی هەموو فەرمانبەران بۆ ئەوەی بزانین کێ غائیبە
    let profQuery = adminClient.from('profiles').select('*, branches(branch_name)');
    if (branchFilter !== 'all') profQuery = profQuery.eq('branch_id', branchFilter);
    const { data: allEmployees } = await profQuery.order('full_name');

        // جیاکردنەوەی ئادمینەکان لە فەرمانبەران
        const admins = allEmployees.filter(emp => emp.role === 'admin');
        const staff = allEmployees.filter(emp => emp.role !== 'admin');

        allAdminsCached = admins; // پاشەکەوتکردنی لیستەکە بۆ بەکارهێنان لە پرێزنس
        renderAdmins(admins);
        document.getElementById('justificationCount').innerText = justCount || 0;
        renderAttendance(data || [], staff || []);
    } catch (err) {
        console.error("Global load error:", err);
        listDiv.innerHTML = "کێشەیەک لە بارکردنی داتا ڕوویدا.";
    }
}

function renderAdmins(admins) {
    const container = document.getElementById('adminsSection');
    const listDiv = document.getElementById('adminsList');
    
    if (admins && admins.length > 0) {
        container.style.display = 'flex';
        listDiv.innerHTML = admins.map(adm => {
            // لۆجیکی نوێ: گەڕان لە ناو تەواوی لیستی Presence بۆ دۆزینەوەی ئایدی بەکارهێنەر
            const isOnline = Object.values(onlineAdmins).flat().some(presence => presence.user_id === adm.id);
            
            return `
                <div class="admin-chip ${isOnline ? 'online' : ''}">
                    <i class="fas fa-user-tie"></i> ${adm.full_name}
                </div>
            `;
        }).join('');
    } else {
        container.style.display = 'none';
    }
}

function renderAttendance(attendance, employees) {
    const listDiv = document.getElementById('attendanceList');
    listDiv.innerHTML = "";

    // پۆلێنکردن بەپێی بنکە
    const grouped = employees.reduce((acc, emp) => {
        const bName = emp.branches ? emp.branches.branch_name : "بێ بنکە";
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
        section.innerHTML = `<div class="branch-group-header"><span>${branch}</span> <span>${emps.length} فەرمانبەر</span></div>`;
        
        emps.forEach(emp => {
            const record = attendance.find(a => a.user_id === emp.id);
            const row = document.createElement('div');
            row.className = 'attendance-item';
            
            if (record) {
                const checkIn = new Date(record.check_in_time);
                const inTime = checkIn.getHours() * 60 + checkIn.getMinutes();
                
                // حیسابکردنی جۆری هاتن
                if (inTime < 510) { // پێش 8:30
                    stats.earlyIn++;
                } else if (inTime <= 540) { // 8:30 - 9:00
                    stats.lateIn++;
                } else { // دوای 9:00
                    stats.veryLateIn++;
                }

                // حیسابکردنی جۆری دەرچوون (ئەگەر کرابێت)
                if (record.check_out_time) {
                    const checkOut = new Date(record.check_out_time);
                    const outTime = checkOut.getHours() * 60 + checkOut.getMinutes();
                    
                    if (outTime < 870) { // پێش 2:30 (14:30)
                        stats.earlyOut++;
                    } else { // دوای 2:30
                        stats.onTimeOut++;
                    }
                } else {
                    // هاتنی کردووە بەڵام دەرنەچووە
                    stats.notCheckedOut++;
                }
            } else {
                // ئەگەر هیچ ڕیکۆردێکی نەبوو، واتە نەهاتووە
                stats.absent++;
            }
            
            const timeIn = record ? new Date(record.check_in_time).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12: true}) : '---';
            const status = record ? '<span class="status-pill status-present">ئامادەبوو</span>' : '<span class="status-pill status-absent">نەهاتوو</span>';
            
            row.innerHTML = `
                <div style="font-weight: 700; color: var(--text-main);">${emp.full_name}</div>
                <div style="font-family: monospace; font-weight: bold;">${timeIn}</div>
                <div>${status}</div>
                <div style="text-align: left;"><button onclick="viewDetails('${emp.id}')" class="lang-dropbtn" style="height:32px; padding: 0 15px;">ووردەکاری <i class="fas fa-chevron-left" style="font-size: 0.7rem; margin-right: 5px;"></i></button></div>
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
    // لێرە دەتوانین مۆداڵێک بکەینەوە بۆ بینینی لۆکەیشن یان ڕیسێت کردنی ئامێر
    alert("ووردەکاری بۆ فەرمانبەر: " + userId);
}
