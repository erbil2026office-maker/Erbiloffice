// dashboard.js - Updated & Merged Version
// بەکارهێنانی کڵایێنتە گشتییەکە کە لە script.js پێناسە کراوە

// ڕێکخستنی کاتی ڕێپێدراو بۆ دەرچوون (بۆ نموونە ١١:٤٥)
const CHECKOUT_HOUR_LIMIT = 11;
const CHECKOUT_MINUTE_LIMIT = 45;

// ڕێکخستنی کاتی ڕێپێدراو بۆ ئامادەبوون (بۆ نموونە 7:30 بەیانی تا 12:00 نیوەڕۆ)
const CHECKIN_START_HOUR = 7;
const CHECKIN_START_MINUTE = 30;
const CHECKIN_END_HOUR = 12;
const CHECKIN_END_MINUTE = 0;

let client;

let userPos = null;
let watchID = null;
let locationAttempts = 0;
let attemptTimer = null;
let currentUser = null;
let userProfile = null; // پاشەکەوتکردنی زانیاری پڕۆفایل و بنکە
let isLocationSuitable = false; // مەرجی لۆکەیشن بۆ هەموو سیستمەکە
let isDeviceVerified = false; // بۆ پشکنینی دۆخی ئامێرەکە بە گشتی
let currentDetailDate = null; // بۆ هەڵگرتنی ڕێکەوتی ئەو ڕۆژەی کلیکی لێکراوە
let staffAttendanceData = []; // داتای دەوامی فەرمانبەری هەڵبژێردراو
let staffLeaveData = []; // داتای مۆڵەتی فەرمانبەری هەڵبژێردراو
let userLeaves = []; // مۆڵەتەکانی فەرمانبەری لۆگینبوو
let staffViewDate = new Date(); // ڕێکەوتی پیشاندانی کالێندەری فەرمانبەر
let staffInBranch = []; // بۆ هەڵگرتنی لیستی فەرمانبەرانی بنکەکە
let selectedStaffId = null; // ئەو فەرمانبەرەی بەرپرسی بنکە هەڵیبژاردووە
let lastViewedStaffId = null; // پاشەکەوتکردنی ئایدی فەرمانبەری ئێستا بۆ کالێندەر
let selectedLeaveStartDate = null;
let selectedLeaveStartTime = null;
let selectedLeaveEndTime = null;
let staffDetailModal = null; // New global variable for the staff detail modal
let selectedLeaveEndDate = null;
let selectedLeaveReason = null;

// فەنکشن بۆ دیاریکردنی سەرەتا و کۆتایی ڕۆژی ئێستا
function getTodayBounds(referenceDate = null) {
    // ئەگەر کاتی سێرڤەرمان هەبوو ئەوە بەکاردێنین، ئەگەر نا کاتی مۆبایل
    let now = referenceDate ? new Date(referenceDate) : new Date();
    if (isNaN(now.getTime())) now = new Date(); // ئەگەر کاتی سێرڤەر هەڵە بوو کاتی مۆبایل بەکاربهێنە
    
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Baghdad',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    
    // ئەنجامەکە دەبێتە YYYY-MM-DD بەپێی کاتی عێراق
    const iraqDate = formatter.format(now);
    
    return { 
        start: `${iraqDate}T00:00:00+03:00`, 
        end: `${iraqDate}T23:59:59+03:00` 
    };
}

// فەنکشن بۆ پشکنینی ئەوەی ئایا کاتەکە پێش ١١:٤٥ی بەیانییە بە کاتی عێراق
function isBeforeCheckoutTimeLimit() {
    const parts = new Intl.DateTimeFormat('en-GB', { 
        timeZone: 'Asia/Baghdad', 
        hour: 'numeric', 
        minute: 'numeric', 
        hourCycle: 'h23' 
    }).formatToParts(new Date());
    const h = parseInt(parts.find(p => p.type === 'hour').value);
    const m = parseInt(parts.find(p => p.type === 'minute').value);
    return (h * 60 + m) < (CHECKOUT_HOUR_LIMIT * 60 + CHECKOUT_MINUTE_LIMIT);
}

// فەنکشن بۆ پشکنینی ئەوەی ئایا کاتەکە لە نێوان ٧:٣٠ بۆ ١٢:٠٠ی نیوەڕۆیە بە کاتی عێراق
function isCheckInTimeAllowed() {
    const parts = new Intl.DateTimeFormat('en-GB', { 
        timeZone: 'Asia/Baghdad', 
        hour: 'numeric', 
        minute: 'numeric', 
        hourCycle: 'h23' 
    }).formatToParts(new Date());
    const h = parseInt(parts.find(p => p.type === 'hour').value);
    const m = parseInt(parts.find(p => p.type === 'minute').value);
    const now = h * 60 + m;
    return now >= (CHECKIN_START_HOUR * 60 + CHECKIN_START_MINUTE) && now < (CHECKIN_END_HOUR * 60 + CHECKIN_END_MINUTE);
}

// --- دروستکردنی پەنجەمۆری دەنگ (Audio Fingerprint) ---
async function getAudioFingerprint() {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve('audio-timeout'), 1500);
        try {
            const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            if (!AudioContext) { clearTimeout(timeout); return resolve('no-audio'); }
            
            const context = new AudioContext(1, 44100, 44100);
            const oscillator = context.createOscillator();
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(10000, context.currentTime);
            
            const compressor = context.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-50, context.currentTime);
            compressor.knee.setValueAtTime(40, context.currentTime);
            compressor.ratio.setValueAtTime(12, context.currentTime);
            compressor.attack.setValueAtTime(0, context.currentTime);
            compressor.release.setValueAtTime(0.25, context.currentTime);
            
            oscillator.connect(compressor);
            compressor.connect(context.destination);
            oscillator.start(0);
            
            context.startRendering().then(buffer => {
                clearTimeout(timeout);
                const data = buffer.getChannelData(0);
                const sum = data.slice(4500, 5000).reduce((acc, val) => acc + Math.abs(val), 0);
                resolve(Math.floor(sum * 10000).toString());
            }).catch(() => { clearTimeout(timeout); resolve('audio-err'); });
        } catch (e) { clearTimeout(timeout); resolve('audio-err'); }
    });
}
// --- دروستکردنی پەنجەمۆری ڕەقەکاڵا (Hardware Fingerprint) ---
async function getHardwareFingerprint() {
    let audioHash = 'no-audio';
    try {
        audioHash = await getAudioFingerprint();
    } catch (e) { console.warn("Audio hash skipped"); }

    // زانیاری ووردتر لەسەر GPU و ڕێندەرەر بۆ جیاکاری زیاتر
    let webGLInfo = 'no-webgl';
    try {
        const canvasGL = document.createElement('canvas');
        const gl = canvasGL.getContext('webgl') || canvasGL.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            // زیادکردنی زانیاری زۆر وردی کارتە گرافیکەکان کە لە مۆدێلێک بۆ مۆدێلێکی تر دەگۆڕێت
            const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'no-debug';
            const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            const maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
            webGLInfo = `${renderer}-${maxTextureSize}-${maxRenderBufferSize}`;
        }
    } catch (e) { webGLInfo = 'webgl-err'; }

    // زیادکردنی تایبەتمەندییەکانی فۆنت (ئایفۆنەکان فۆنتی جیاوازیان لەسەرە بەپێی وەشانی iOS)
    const fontCheck = () => {
        const fontList = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Palatino', 'Verdana'];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        return fontList.map(f => {
            ctx.font = `72px ${f}`;
            return ctx.measureText('mmmmmmmmmmlli').width;
        }).join('-');
    };

    // ١. دروستکردنی وێنەیەکی شووشەیی (Canvas)
    // تێبینی: لە ئایفۆن (Safari) پشکنینی پیکسڵەکان جێگیر نییە و ژاوەژاو (Noise) دروست دەکات
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const txt = 'IHEC-ID-2024';
    ctx.font = "16px Arial";
    const textWidth = ctx.measureText(txt).width;
    
    // لە ئایفۆن تەنها سوود لە پێوانەی دەق وەردەگرین بۆ جێگیری، لە ئەندرۆید و دیسکتۆپ وێنەکە بەکاردێنین
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const canvasHash = isIOS ? `ios-${textWidth}-${fontCheck()}` : canvas.toDataURL().substring(0, 100);

    // ٢. کۆکردنەوەی سیفاتە فیزیکییە جێگیرەکان (بۆ زیادکردنی Entropy)
    // لابردنی بەشە گۆڕاوەکانی UserAgent و بەکارهێنانی قەبارەی شاشەی جێگیر
    const uaClean = navigator.userAgent.replace(/Version\/.* Safari\/.*|Mobile\/.*|Standalone/g, '').trim();
    const screenStable = [
        Math.min(screen.width, screen.height),
        Math.max(screen.width, screen.height),
        screen.availWidth,
        screen.availHeight,
        screen.colorDepth,
        window.devicePixelRatio || 1
    ].join('x');
    
    // زانیاری زمانەوانی و ناوچەیی کە لە ئایفۆن جیاوازە
    const localeInfo = [
        Intl.DateTimeFormat().resolvedOptions().calendar,
        Intl.DateTimeFormat().resolvedOptions().numberingSystem,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.maxTouchPoints || '5'
    ].join('-');

    const hardwareFeatures = [
        navigator.platform,
        navigator.language,
        webGLInfo,
        localeInfo, // زیادکردنی وردەکاری دەست لێدان و ڕۆژژمێر
        navigator.doNotTrack || 'unspecified',
        navigator.hardwareConcurrency || '8',
        navigator.deviceMemory || 'unknown', // تەنها لە ئەندرۆید
        screenStable,
        uaClean,
        new Date().getTimezoneOffset(),
        canvasHash, audioHash
    ].join('|');

    let hash = 0;
    for (let i = 0; i < hardwareFeatures.length; i++) {
        hash = ((hash << 5) - hash) + hardwareFeatures.charCodeAt(i);
        hash |= 0;
    }
    
    return 'hw-' + Math.abs(hash).toString(36);
}
// --- بەڕێوەبردنی ئایدی ئامێر (Smart Device Manager) ---
async function getDeviceID() {
    try {
        // ١. هەوڵدان بۆ گەڕاندنەوەی Seed لە LocalStorage یان Cookie
        let persistentSeed = localStorage.getItem('ihec_unique_seed');
        
        // ئەگەر لە LocalStorage نەبوو، لە Cookie بگەڕێ (بۆ کاتی Clear Cache)
        if (!persistentSeed) {
            const cookieMatch = document.cookie.match(/ihec_seed=([^;]+)/);
            persistentSeed = cookieMatch ? cookieMatch[1] : null;
        }

        if (!persistentSeed) {
            // دروستکردنی کۆدێکی هەرەمەکی زۆر درێژ و تاقانە (Cryptographically Strong)
            const array = new Uint32Array(8);
            (window.crypto || window.msCrypto).getRandomValues(array);
            const randomPart = Array.from(array, dec => dec.toString(36)).join('-');
            persistentSeed = `seed-${randomPart}-${Date.now().toString(36)}`;
        }

        // پاشەکەوتکردنەوە لە هەردوو شوێنەکە بۆ دڵنیایی زیاتر
        localStorage.setItem('ihec_unique_seed', persistentSeed);
        document.cookie = `ihec_seed=${persistentSeed}; Max-Age=${60*60*24*365*10}; Path=/; SameSite=Lax`;

        const hardwareFP = await getHardwareFingerprint();
        
        // ٢. دروستکردنی کۆدی کۆتایی (Hardware Hash + Unique Seed)
        const finalID = `IHEC-DEVICE-${hardwareFP.toUpperCase()}-${persistentSeed.toUpperCase()}`;
        localStorage.setItem('device_id', finalID);
        return finalID;
    } catch (e) {
        console.error("Storage error:", e);
        return await getHardwareFingerprint(); 
    }
}

// ئەژمارکردنی دووری نێوان دوو خاڵ بە مەتر (Haversine Formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // نیوەتیرەی زەوی بە مەتر
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// --- Confirmation Logic ---
let pendingAction = null;

function askConfirmation(action) {
    pendingAction = action;
    const modal = document.getElementById('confirmModal');
    const title = document.getElementById('confirmTitle');
    const msg = document.getElementById('confirmMsg');
    
    if (action === 'in') {
        title.innerText = translations[currentLang].confInTitle;
        msg.innerText = translations[currentLang].confInMsg;
    } else {
        title.innerText = translations[currentLang].confOutTitle;
        msg.innerText = translations[currentLang].confOutMsg;
    }
    modal.style.display = 'flex';
}

function closeConfirm() {
    document.getElementById('confirmModal').style.display = 'none';
}

function executeConfirmedAction() {
    closeConfirm();
    if (pendingAction === 'in') processCheckIn();
    else if (pendingAction === 'out') processCheckOut();
}

// Note: Theme management is handled globally in script.js
// This file focuses on Dashboard logic.

function manualRefreshLocation() {
    locationAttempts = 0;
    startTracking();
}

function toggleCalendar() {
    const wrapper = document.getElementById('calendarWrapper');
    if (wrapper) {
        wrapper.classList.toggle('expanded');
    }
}

// --- ١. کاتژمێری زیندوو و ڕێکەوتی کوردی ---
function startLiveClock() {
    const clockElement = document.getElementById('liveClock');
    const dateElement = document.getElementById('liveDate');

    const update = () => {
        const now = new Date();
        if (clockElement) clockElement.innerText = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        
        if (dateElement) {
            const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
            let formattedDate = now.toLocaleDateString(currentLang === 'ku' ? 'ku-IQ' : 'ar-IQ', options);

            // Fallback for Kurdish if toLocaleDateString doesn't provide localized month/weekday names
            // This checks if the formatted date is purely numeric (e.g., "1/1/2023")
            if (currentLang === 'ku' && formattedDate.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
                const monthName = translations[currentLang].months[now.getMonth()];
                const weekdayName = translations[currentLang].weekdays[now.getDay()];
                formattedDate = `${weekdayName}, ${now.getDate()} ${monthName} ${now.getFullYear()}`;
            }
            dateElement.innerText = formattedDate;
        }

        // بەڕێوەبردنی دۆخی دوگمەکان بە شێوەیەکی زیندوو
        const inBtn = document.getElementById('checkinBtn');
        const outBtn = document.getElementById('checkoutBtn');
        const inInfo = document.getElementById('checkInInfo');

        // ئەگەر هێشتا چێک-ئینی نەکردبوو، دوگمەی هاتن پشکنینی کاتی بۆ دەکرێت
        if (inBtn && (!inInfo || inInfo.style.display === 'none')) {
            refreshActionButtons();
        }
        
        refreshActionButtons();
    };
    
    update(); // یەکسەر نیشانی بدە
    setInterval(update, 1000); // هەموو چرکەیەک نوێی بکەرەوە
}

// --- ٢. پشکنینی دۆخی ئێستای فەرمانبەر (ئایا پێشتر هاتنی کردووە؟) ---
async function checkAttendanceStatus() {
    // وەرگرتنی کاتی سێرڤەر بۆ دیاریکردنی ئەوەی "ئەمڕۆ" چ ڕێکەوتێکە
    const { data: serverTime } = await client.rpc('get_server_time');
    const { start, end } = getTodayBounds(serverTime);

    const { data, error } = await client
        .from('attendance')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('check_in_time', start)
        .lte('check_in_time', end)
        .order('check_in_time', { ascending: false })
        .limit(1);

    if (data && data.length > 0) {
        const record = data[0];
        updateComplianceUI(record);
        if (!record.check_out_time) {
            // هاتنی کردووە بەڵام دەرنەچووە
            toggleToCheckoutUI(record.check_in_time);
        } else {
            // هەردووکی کردووە - هەردوو دوگمەکە دەشارینەوە
            document.getElementById('checkinBtn').style.display = 'none';
            document.getElementById('checkoutBtn').style.display = 'none';
            updateStatus(translations[currentLang].dailyLimitReached, "success");
        }
    } else {
        updateComplianceUI(null); // ئەگەر تۆمار نەبوو (واتا دوای ١٢ی شەو یان سەرەتای ڕۆژ)، سفر دەبێتەوە
        // دڵنیابوونەوە لە شاردنەوەی دوگمە و زانیارییەکان کاتێک هیچ تۆمارێک نییە
        if (document.getElementById('checkoutBtn')) document.getElementById('checkoutBtn').style.display = 'none';
        if (document.getElementById('checkInInfo')) document.getElementById('checkInInfo').style.display = 'none';
        if (document.getElementById('checkinBtn')) document.getElementById('checkinBtn').style.display = 'flex';
    }
}

function calculateComplianceScore(record) {
    if (!record) return { total: 0, inPercent: 0, outPercent: 0 };

    const baghdadTime = (date) => {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(date));
        const h = parseInt(parts.find(p => p.type === 'hour').value);
        const m = parseInt(parts.find(p => p.type === 'minute').value);
        return h * 60 + m;
    };

    let inScore = 0;
    let outScore = 0;

    const totalInMinutes = baghdadTime(record.check_in_time);
    if (totalInMinutes <= 510) inScore = 50;
    else inScore = Math.max(0, 50 - (totalInMinutes - 510) * 0.5);

    if (record.check_out_time) {
        const totalOutMinutes = baghdadTime(record.check_out_time);
        if (totalOutMinutes >= 870) outScore = 50;
        else outScore = Math.max(0, 50 - (870 - totalOutMinutes) * 0.5);
    }

    return {
        total: Math.round(inScore + outScore),
        inPercent: Math.round(inScore * 2),
        outPercent: Math.round(outScore * 2)
    };
}

function updateComplianceUI(record) {
    const statusCard = document.querySelector('.status-card');
    let card = document.getElementById('complianceCard');
    
    if (!card) {
        card = document.createElement('div');
        card.id = 'complianceCard';
        card.className = 'compliance-card';
        if (statusCard) statusCard.after(card);
    }

    const { total, inPercent, outPercent } = calculateComplianceScore(record);
    
    const getStatusClass = (percent) => {
        if (percent >= 85) return { color: 'compliance-excellent', bar: 'bg-excellent' };
        if (percent >= 50) return { color: 'compliance-good', bar: 'bg-good' };
        return { color: 'compliance-poor', bar: 'bg-poor' };
    };

    const inStatus = getStatusClass(inPercent);
    const outStatus = getStatusClass(outPercent);
    const totalStatus = getStatusClass(total);

    const t = translations[currentLang];
    card.innerHTML = `
        <div class="compliance-bars">
            <div class="bar-item">
                <div class="bar-label"><span>${t.arrivalCompliance}</span><span>${inPercent}%</span></div>
                <div class="progress-bg"><div class="progress-fill ${inStatus.bar}" style="width: ${inPercent}%"></div></div>
            </div>
            <div class="bar-item">
                <div class="bar-label"><span>${t.departureCompliance}</span><span>${outPercent}%</span></div>
                <div class="progress-bg"><div class="progress-fill ${outStatus.bar}" style="width: ${outPercent}%"></div></div>
            </div>
        </div>
        <div class="compliance-header">
            <div class="compliance-title"><i class="fas fa-chart-line" style="font-size:0.55rem;"></i> ${t.dailyCompliance}</div>
            <div class="total-percentage ${totalStatus.color}">${total}%</div>
        </div>
    `;
}

function refreshActionButtons() {
    const inBtn = document.getElementById('checkinBtn');
    const outBtn = document.getElementById('checkoutBtn');
    const inInfo = document.getElementById('checkInInfo');
    
    const canProceed = isDeviceVerified && isLocationSuitable;

    // ئەگەر لە دۆخی هاتن بێت (دوگمەی دەرچوون نییە)
    if (inBtn && inBtn.style.display !== 'none') {
        inBtn.disabled = !canProceed || !isCheckInTimeAllowed();
    }

    // ئەگەر لە دۆخی دەرچوون بێت
    if (outBtn && outBtn.style.display !== 'none') {
        outBtn.disabled = !canProceed || isBeforeCheckoutTimeLimit();
    }
}

function toggleToCheckoutUI(checkInTime) {
    const checkinBtn = document.getElementById('checkinBtn');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const checkInInfo = document.getElementById('checkInInfo');
    const arrivalTime = document.getElementById('arrivalTime');

    if (checkinBtn) checkinBtn.style.display = 'none';
    if (checkoutBtn) {
        checkoutBtn.style.display = 'flex';
        checkoutBtn.style.justifyContent = 'center';
        checkoutBtn.style.alignItems = 'center';
        // لێگەڕێ با refreshActionButtons دۆخی چالاکبوون دیاری بکات
        refreshActionButtons();
    }
    
    // نیشاندانی کاتی هاتن
    if (checkInInfo) checkInInfo.style.display = 'inline-flex';
    if (arrivalTime) {
        arrivalTime.innerText = formatTime12(checkInTime);
    }
}

// --- ٣. لۆجیکی لۆکەیشن ---
function startTracking() {
    const btn = document.getElementById('checkinBtn');
    const outBtn = document.getElementById('checkoutBtn');
    const txt = document.getElementById('checkinText');

    if (!navigator.geolocation) {
        updateStatus(translations[currentLang].noLocSupport, "error");
        return;
    }

    if (watchID) navigator.geolocation.clearWatch(watchID);
    if (attemptTimer) clearTimeout(attemptTimer);

    // ئەگەر ٣ جار هەوڵیدا و نەبوو، سیستمەکە بوەستێنە و دوگمەی ڕیفرێش نیشان بدە
    if (locationAttempts >= 3) {
        updateVerifyUI('location', false, null, translations[currentLang].errorFetch);
        if (txt) txt.innerText = translations[currentLang].retryBtn;
        // Disable buttons if location is not determined after attempts
        [btn, outBtn].forEach(b => { if(b) b.disabled = true; });
        return;
    }

    locationAttempts++;
    userPos = null; // پاککردنەوەی داتای پێشوو بۆ دڵنیایی زیاتر

    if (txt && btn.style.display !== 'none') txt.innerText = `${translations[currentLang].searching} (${locationAttempts}/3)`; // Update checkin button text
    updateVerifyUI('location', null, 'loading', `${translations[currentLang].searching} (${locationAttempts}/3)`);

    const options = { 
        enableHighAccuracy: true, 
        timeout: 12000, 
        maximumAge: 0 
    };

    watchID = navigator.geolocation.watchPosition(
        (position) => {
            // پشکنینی لۆکەیشنی ساختە
            if (isLocationSpoofed(position)) {
                updateVerifyUI('location', false, null, translations[currentLang].mockLocationError);
                [btn, outBtn].forEach(b => { if(b) b.disabled = true; });
                if (watchID) navigator.geolocation.clearWatch(watchID);
                return;
            }

            userPos = position.coords; // Update userPos with current coordinates
            const accuracy = Math.round(userPos.accuracy);
            const isAccurateEnough = accuracy <= 150; // GPS accuracy check

            isLocationSuitable = isAccurateEnough;

            // Perform geofence check only if userProfile and branch data are available
            if (userProfile && userProfile.branches && userProfile.branches.latitude !== undefined && userProfile.branches.longitude !== undefined) {
                const distanceToBranch = calculateDistance( // Make sure branch coordinates are valid
                    userPos.latitude, userPos.longitude,
                    userProfile.branches.latitude, userProfile.branches.longitude
                );
                const allowedRadius = userProfile.branches.accuracy || 150; // بەکارهێنانی ١٥٠ وەکFallback ئەگەر لە داتابەیس دیاری نەکرابوو
                isLocationSuitable = isAccurateEnough && (distanceToBranch <= allowedRadius);
                
                // نیشاندانی تەنها دووری لە بنکە و شاردنەوەی سنووری ڕێپێدراو
                document.getElementById('accuracyArea').innerText = `${translations[currentLang].distBranch}: ${Math.round(distanceToBranch)} مەتر`;
            }
            
            refreshActionButtons();

            // Update text status for checkin button (if visible)
            if (txt && btn.style.display !== 'none') {
                if (!isDeviceVerified) {
                    txt.innerText = translations[currentLang].invalidDevice;
                } else if (!isAccurateEnough) {
                    txt.innerText = translations[currentLang].gpsWeak;
                } else if (!isLocationSuitable) {
                    txt.innerText = translations[currentLang].notSuitable;
                } else if (!isCheckInTimeAllowed()) {
                    // لۆکەیشن و ئامێر دروستن بەڵام کاتی هاتن نییە - نیشاندانی کاتی بەردەستبوون
                    const startStr = `\u200E${CHECKIN_START_HOUR}:${CHECKIN_START_MINUTE.toString().padStart(2, '0')} AM`;
                    const endStr = `\u200E${CHECKIN_END_HOUR === 12 ? 12 : CHECKIN_END_HOUR % 12}:${CHECKIN_END_MINUTE.toString().padStart(2, '0')} ${CHECKIN_END_HOUR >= 12 ? 'PM' : 'AM'}`;
                    txt.innerText = currentLang === 'ku' 
                        ? `لە ${startStr} بۆ ${endStr} بەدروستە` 
                        : `متاح من ${startStr} الی ${endStr}`;
                } else {
                    txt.innerText = translations[currentLang].checkin;
                }
            }

            // Update verification UI
            if (isLocationSuitable) updateVerifyUI('location', true, null, translations[currentLang].suitable); // Location is fully suitable
            else if (!isAccurateEnough) updateVerifyUI('location', null, 'loading', translations[currentLang].gpsWeak); // GPS accuracy is the issue
            else updateVerifyUI('location', false, null, translations[currentLang].notSuitable); // Outside geofence
            
            refreshActionButtons();

            // If location is suitable, we can clear the watch and timer for this attempt
            if (isLocationSuitable) {
                if (watchID) navigator.geolocation.clearWatch(watchID);
                if (attemptTimer) clearTimeout(attemptTimer);
                locationAttempts = 0; // Reset attempts on success
            }
        },
        (err) => {
            console.warn("Location attempt failed:", err.message);
            if (err.code === 1) { // Permission denied
                updateStatus(translations[currentLang].msgLocErr, "error"); // Show error message
                [btn, outBtn].forEach(b => { if(b) b.disabled = true; }); // Disable buttons on permission error
            }
        },
        options
    );

    // ئەگەر لە ماوەی ١٢ چرکەدا لۆکەیشنەکی وورد نەدۆزرایەوە، هەوڵێکی نوێ بدە یان بوەستە
    attemptTimer = setTimeout(() => {
        // Clear any existing watch, as we are either retrying or stopping
        if (watchID) navigator.geolocation.clearWatch(watchID);

        // Re-evaluate suitability based on the last known userPos (if any)
        const currentAccuracy = userPos ? Math.round(userPos.accuracy) : Infinity; // Get last known accuracy
        const isAccurateEnough = currentAccuracy <= 150; // Check if last known accuracy was good

        let isWithinGeofence = true; // Default to true if no branch data or userPos for geofence check
        let lastKnownDistanceToBranch = Infinity;

        // Check geofence based on last known position
        if (userProfile && userProfile.branches && userProfile.branches.latitude && userProfile.branches.longitude && userPos) {
            const distanceToBranch = calculateDistance(
                userPos.latitude, userPos.longitude,
                userProfile.branches.latitude, userProfile.branches.longitude
            );
            const allowedRadius = userProfile.branches.accuracy || 100;
            isWithinGeofence = distanceToBranch <= allowedRadius;
            lastKnownDistanceToBranch = distanceToBranch;
        } else if (userProfile && !userProfile.branches) {
            // If no branch assigned, geofence check is not applicable, so consider within.
            isWithinGeofence = true;
        } else {
            // If critical data is missing, assume not within for safety.
            isWithinGeofence = false; // Assume not within for safety if data is missing
        }

        const isCurrentlySuitable = isAccurateEnough && isWithinGeofence;

        if (!isCurrentlySuitable) { // If after timeout, location is still not suitable
            if (locationAttempts < 3) {
                startTracking();
            } else {
                if (watchID) navigator.geolocation.clearWatch(watchID); // Ensure watch is cleared
                // Update UI based on why it failed after attempts
            if (!isAccurateEnough) updateVerifyUI('location', false, null, translations[currentLang].gpsWeak);
            else if (!isWithinGeofence) updateVerifyUI('location', false, null, translations[currentLang].notSuitable);
            else updateVerifyUI('location', false, null, translations[currentLang].errorFetch); // Generic error
                // Ensure buttons are disabled if all attempts fail
              [btn, outBtn].forEach(b => { if(b) b.disabled = true; });
                // Also update the checkinText if it's visible
            if (txt && btn.style.display !== 'none') {
                txt.innerText = translations[currentLang].retryBtn;
                }
            }
             } else {
            // If it became suitable just before the timeout, reset attempts
            locationAttempts = 0;
        }
    }, 12000);
}

// --- Helper for Modern Verification UI (Device & Location) ---
function updateVerifyUI(type, isValid, state, message = '') {
    const el = document.getElementById(type + 'Verify');
    if (!el) return;
    
    const statusTextEl = el.querySelector('.status-text'); // Declare here
    const statusIconEl = el.querySelector('.status-icon'); // Declare here
    
    el.classList.remove('verify-success', 'verify-error', 'loading');
    
    if (state === 'loading') {
        el.classList.add('loading');
        statusIconEl.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        statusTextEl.innerText = message || translations[currentLang].verifying;
    } else if (isValid === true) {
        el.classList.add('verify-success');
        statusIconEl.innerHTML = '<i class="fas fa-check-circle"></i>';
        statusTextEl.innerText = message || translations[currentLang].suitable;
    } else {
        el.classList.add('verify-error');
        statusIconEl.innerHTML = '<i class="fas fa-times-circle"></i>';
        statusTextEl.innerText = message || translations[currentLang].errorFetch;
    }

    // نیشاندانی دوگمەی دووبارە پشکنین تەنها ئەگەر یەکێک لە مەرجەکان سوور بوو
    const hasError = document.querySelectorAll('.verify-item.verify-error').length > 0;
    const refreshBtn = document.getElementById('refreshLocBtn');
    if (refreshBtn) {
        refreshBtn.style.display = hasError ? 'flex' : 'none';
    }
}

// --- پشکنینی VPN و ناوچەی کاتی ---
async function isVPNActive() {
    // ١. پشکنینی ناوچەی کاتی (خێراترین ڕێگە بەبێ سێرڤەر)
    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (deviceTimezone !== 'Asia/Baghdad') {
        console.warn("Timezone mismatch detected:", deviceTimezone);
        return true;
    }

    // ٢. پشکنینی ئایپی لە ڕێگەی خزمەتگوزاری دەرەکی (ئارەزوومەندانە بەڵام زۆر وردە)
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        // ئەگەر ئایپییەکە هی Proxy یان VPN بێت، زۆربەی جار لە داتاکەدا دیارە
        if (data.security && (data.security.vpn || data.security.proxy)) return true;
        if (data.country_code !== 'IQ') return true; // ئەگەر لە عێراق نەبوو
    } catch (e) { console.error("VPN Check Failed", e); }

    return false;
}

// --- پشکنینی لۆکەیشنی ساختە (Fake GPS Detection) ---
function isLocationSpoofed(position) {
    // ١. پشکنینی ئاڵای mocked کە لە هەندێک وێبگەڕدا هەیە
    if (position.mocked || (position.coords && position.coords.mocked)) return true;

    // ٢. پشکنینی تەمەنی لۆکەیشن (Timestamp) - ئەگەر لۆکەیشنەکە لە ١٥ چرکە کۆنتر بوو، ڕەنگە فێڵ بێت
    const locationAge = Date.now() - position.timestamp;
    if (locationAge > 15000) return true; 

    // ٢. پشکنینی وردی گوماناوی (ئەگەر وردی تەنها ٠ یان ١ مەتر بوو، یان زۆر جێگیر بوو)
    if (position.coords.accuracy < 1) return true;

    return false;
}

// --- ٤. کرداری هاتن (Check In) ---
async function processCheckIn() {
    const btn = document.getElementById('checkinBtn');
    const txt = document.getElementById('checkinText');

    // پشکنینی VPN پێش دەستپێکردن
    if (await isVPNActive()) {
        updateStatus(translations[currentLang].vpnError, "error");
        return;
    }

    // پشکنینی کۆتایی بۆ کاتی ڕێپێدراوی هاتن (بۆ ڕێگری لە دەستکاریکردنی کۆد)
    if (!isCheckInTimeAllowed()) {
        const startStr = `\u200E${CHECKIN_START_HOUR}:${CHECKIN_START_MINUTE.toString().padStart(2, '0')} AM`;
        const endStr = `\u200E${CHECKIN_END_HOUR === 12 ? 12 : CHECKIN_END_HOUR % 12}:${CHECKIN_END_MINUTE.toString().padStart(2, '0')} ${CHECKIN_END_HOUR >= 12 ? 'PM' : 'AM'}`;
        const msg = currentLang === 'ku' 
            ? `تۆمارکردنی هاتن تەنها لە نێوان کاتژمێر ${startStr} بۆ ${endStr} ڕێپێدراوە.` 
            : `تسجيل الحضور متاح فقط بين الساعة ${startStr} و ${endStr}.`;
        updateStatus(msg, "error");
        return;
    }

    // پشکنین بۆ ئەوەی بزانین ئایا لەم ڕۆژەدا هیچ تۆمارێکی هەیە (هاتن یان دەرچوون)
    const { data: serverTime } = await client.rpc('get_server_time');
    const checkInTime = serverTime || new Date().toISOString();
    
    const { start, end } = getTodayBounds(checkInTime);

    const { data: activeCheckIn, error: activeCheckInError } = await client
        .from('attendance')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('check_in_time', start)
        .lte('check_in_time', end)
        .limit(1);

    if (activeCheckInError) {
        updateStatus(activeCheckInError.message, "error");
        return;
    }

    if (activeCheckIn && activeCheckIn.length > 0) {
        // ئەگەر پێشتر تۆماری هەبوو بۆ ئەمڕۆ، پەیامی سنووری ڕۆژانە نیشان دەدەین
        const record = activeCheckIn[0];
        const msg = record.check_out_time ? translations[currentLang].dailyLimitReached : translations[currentLang].alreadyCheckedIn;
        updateStatus(msg, "error");
        return;
    }

    if (!userPos || !currentUser) {
        updateStatus(translations[currentLang].msgLocErr, "error");
        return;
    }

    // IMPORTANT: Re-check location suitability before processing
    const accuracy = Math.round(userPos.accuracy);
    const isAccurateEnough = accuracy <= 150;

    let isWithinGeofence = true;
    if (userProfile && userProfile.branches &&
        userProfile.branches.latitude !== null && userProfile.branches.latitude !== undefined &&
        userProfile.branches.longitude !== null && userProfile.branches.longitude !== undefined) {

        const distanceToBranch = calculateDistance(
            userPos.latitude, userPos.longitude,
            userProfile.branches.latitude, userProfile.branches.longitude
        );
        isWithinGeofence = distanceToBranch <= (userProfile.branches.accuracy || 150);
    } else if (userProfile && !userProfile.branches) {
        // If user has no assigned branch, geofence check is skipped, so it's considered within.
        isWithinGeofence = true; // If no branch assigned, geofence check is not applicable for strict blocking, but we still need to check if it's explicitly set to null/undefined
    } else {
        // If userProfile or userPos is missing, we can't determine geofence.
        updateStatus(translations[currentLang].msgBranchErr, "error");
        return;
    }

    if (!isLocationSuitable || !isAccurateEnough) {
        updateStatus(translations[currentLang].msgAccErr, "error");
        return;
    }
    if (!isWithinGeofence) {
        updateStatus(translations[currentLang].msgOutsideErr, "error");
        return;
    }

    btn.disabled = true;
    txt.innerText = translations[currentLang].waitRecord;

    const currentDevice = await getDeviceID();

    // پشکنینی توندی ئامێر پێش ناردن بۆ داتابەیس
    if (userProfile.device_id && userProfile.device_id !== currentDevice) {
        updateStatus(translations[currentLang].deviceTaken, "error");
        btn.disabled = false;
        txt.innerText = translations[currentLang].checkin;
        return;
    }

    const { error } = await client.from('attendance').insert([{
        user_id: currentUser.id,
        portal_lat: userPos.latitude,
        portal_long: userPos.longitude,
        device_used: currentDevice,
        check_in_time: checkInTime,
        status: "on_time"
    }]);

    if (error) {
        updateStatus(error.message, "error");
        btn.disabled = false;
        txt.innerText = translations[currentLang].checkin;
    } else {
        updateStatus(translations[currentLang].msgInSuccess, "success");
        toggleToCheckoutUI(checkInTime);
    }
}

// --- ٥. کرداری دەرچوون (Check Out) ---
async function processCheckOut() {
    const btn = document.getElementById('checkoutBtn');
    if (!currentUser) return;

    // پشکنینی VPN پێش دەرچوون
    if (await isVPNActive()) {
        updateStatus(translations[currentLang].vpnError, "error");
        return;
    }

    if (!userPos) {
        updateStatus(translations[currentLang].msgLocErr, "error");
        return;
    }

    // IMPORTANT: Re-check location suitability before processing
    const accuracy = Math.round(userPos.accuracy);
    const isAccurateEnough = accuracy <= 150;

    let isWithinGeofence = true;
    if (userProfile && userProfile.branches &&
        userProfile.branches.latitude !== null && userProfile.branches.latitude !== undefined &&
        userProfile.branches.longitude !== null && userProfile.branches.longitude !== undefined) {

        const distanceToBranch = calculateDistance(
            userPos.latitude, userPos.longitude,
            userProfile.branches.latitude, userProfile.branches.longitude
        );
        isWithinGeofence = distanceToBranch <= (userProfile.branches.accuracy || 150);
    } else if (userProfile && !userProfile.branches) {
        isWithinGeofence = true;
    } else { // If userProfile or branch data is missing, cannot perform geofence check, so block
        updateStatus(translations[currentLang].msgBranchErr, "error");
        return;
    }

    if (!isAccurateEnough || !isWithinGeofence) {
        updateStatus(translations[currentLang].msgOutLocErr, "error");
        return;
    }

    // پشکنینی کۆتایی بۆ کاتی ڕێپێدراو (بۆ ڕێگری لە فێڵکردن یان دەستکاریکردنی کۆد)
    if (isBeforeCheckoutTimeLimit()) {
        const timeStr = `\u200E${CHECKOUT_HOUR_LIMIT}:${CHECKOUT_MINUTE_LIMIT.toString().padStart(2, '0')} AM`;
        const msg = currentLang === 'ku' 
            ? `ناتوانیت دەرچوون تۆمار بکەیت پێش کاتژمێر ${timeStr}` 
            : `لا يمكنك تسجيل الانصراف قبل الساعة ${timeStr}`;
        updateStatus(msg, "error");
        return;
    }

    btn.disabled = true;
    const originalHTML = btn.innerHTML; // Save original HTML before changing
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${translations[currentLang].waitRecord}`; // Show spinner

    const { error } = await client
        .from('attendance')
        .update({ 
            check_out_time: new Date().toISOString()
        })
        .eq('user_id', currentUser.id)
        .is('check_out_time', null);

    if (error) {
        console.error("Checkout DB Error:", error);
        updateStatus(error.message, "error");
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    } else {
        updateStatus(translations[currentLang].msgOutSuccess, "success");
        if (btn) btn.style.display = 'none';
        if (document.getElementById('checkInInfo')) document.getElementById('checkInInfo').style.display = 'none';
    }
}

// --- ٦. کاتێک لاپەڕەکە بار دەبێت ---
document.addEventListener('DOMContentLoaded', async () => {
    // وەرگرتنی کڵایێنتەکە لە ویندۆوە بۆ ڕێگری لە ReferenceError
    client = window.supabaseClient || supabaseClient;

    if (!client) {
        console.error("Supabase client is not initialized.");
        return;
    }

    // پشکنینی ناسنامە - دەبێت ئەمە یەکەمین کار بێت بۆ ڕێگریکردن لە بینینی ناوەڕۆک بەبێ لۆگین
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
        window.location.href = 'index.html';
        return;
    }

    // نیشاندانی ناوەڕۆکەکان تەنها ئەگەر لۆگین بوون سەرکەوتوو بوو
    document.querySelector('.dashboard-container').style.display = 'block';
    document.querySelector('.top-controls').style.display = 'flex';
    applyLanguage();
    startLiveClock();

    currentUser = user;

    // هێنانی پڕۆفایل و زانیاری بنکەکە بەیەکەوە
    const { data: profile, error: profError } = await client
        .from('profiles')
        .select('*, branches(*)')
        .eq('id', user.id)
        .maybeSingle();

    const welcomeLabel = document.getElementById('welcomeUser');
    const roleLabel = document.getElementById('userRole');

    if (profile) {
        userProfile = profile;
        renderProfileDisplay();
        // گوێگرتن لە گۆڕینی زمان بۆ نوێکردنەوەی ڕۆڵ و بنکە بە شێوەیەکی داینامیکی
        window.addEventListener('languageChanged', renderProfileDisplay);

        let currentDev = await getDeviceID();

       // ١. پشکنین بکە ئایا ئەم ئایدییە تاقانەیە (Hardware + Seed) پێشتر لای کەسێکی تر تۆمار کراوە؟
        const { data: deviceOwner, error: deviceError } = await client
            .from('profiles')
            .select('id, full_name, device_id')
            .not('device_id', 'is', null)
            .eq('device_id', currentDev) // پشکنینی ئایدییە تەواوەکە
            .maybeSingle(); // یەکەم کەس دەهێنێت کە ئەم ئامێرەی تۆمار کردبێت

        if (deviceError) {
            console.error("Device verification error:", deviceError);
            isDeviceVerified = false;
            updateVerifyUI('device', isDeviceVerified, null, translations[currentLang].errorFetch);
            return;
        }

        let deviceMsgShort = translations[currentLang].verified;
        let deviceMsgLong = "";

        if (deviceOwner) {
           // ئەگەر ئامێرەکە پێشتر لای ئەم کەسە تۆمارکراوە
            if (deviceOwner.id === user.id) {
                isDeviceVerified = true;
            } else {
                // حاڵەتی یەکەم: ئامێرەکە پێشتر لای کەسێکی تر تۆمار کراوە
                isDeviceVerified = false;
                deviceMsgShort = translations[currentLang].deviceTakenShort;
                deviceMsgLong = translations[currentLang].deviceTaken;
            }
        } else {
             // ئەگەر فەرمانبەرەکە ئایدی تۆمارکراوی نییە، یان ئایدییەکەی شێوازە کۆنەکەیە
            if (!profile.device_id || !profile.device_id.startsWith('IHEC-DEVICE-')) {
                // ئەپدەیتکردن یان تۆمارکردنی ئامێر بۆ وەشانی نوێی جێگیر
                const { error: regError } = await client.from('profiles').update({ device_id: currentDev }).eq('id', user.id);
                if (regError) {
                    console.error("Failed to register device:", regError);
                } else {
                    isDeviceVerified = true;
                }
            } else {
                // پشکنینی ئامێری تۆمارکراو لەگەڵ ئامێری ئێستا
                if (profile.device_id === currentDev) {
                    isDeviceVerified = true;
                } else {
                    isDeviceVerified = false;
                    deviceMsgShort = translations[currentLang].notPreviousDevice;
                    deviceMsgLong = translations[currentLang].notPreviousDevicelong;
                }
            }
        }
        
        refreshActionButtons();
        // نوێکردنەوەی ئایکۆنی بچووک بە تێکستی کورت
        updateVerifyUI('device', isDeviceVerified, null, deviceMsgShort);

        // ئەگەر ئامێرەکە هەڵە بوو، یەکسەر دوگمەکە ناچالاک بکە
        if (!isDeviceVerified) {
            [document.getElementById('checkinBtn'), document.getElementById('checkoutBtn')].forEach(b => { if(b) b.disabled = true; });
            // نیشاندانی پەیامە درێژەکە لە باڕە سوورەکەی سەرەوە
            updateStatus(deviceMsgLong || deviceMsgShort, 'error');
        }
    } else {
        const userName = user.user_metadata?.full_name || user.email.split('@')[0];
        if (welcomeLabel) welcomeLabel.innerText = userName;
    }

    await checkAttendanceStatus();
    await fetchAttendance();
    startTracking();

    // کاشکردنی فایلەکانی داشبۆڕد بۆ خێراکردنی ئەزموونی بەکارهێنەر
    cacheDashboardAssets();
});

async function cacheDashboardAssets() {
    if ('caches' in window) {
        try {
            const cache = await caches.open('ihec-dashboard-v1');
            await cache.addAll([
                'dashboard.html',
                'dashboard.js',
                'style.css',
                'lang.js',
                'script.js',
                'assets/icon.png'
            ]);
            console.log('Dashboard assets cached successfully.');
        } catch (err) {
            console.warn('Dashboard cache failed:', err);
        }
    }
}

function renderProfileDisplay() {
    if (!userProfile) return;
    const welcomeLabel = document.getElementById('welcomeUser');
    const roleLabel = document.getElementById('userRole');
    
    if (welcomeLabel) welcomeLabel.innerText = userProfile.full_name;

    // وەرگێڕانی ڕۆڵ بە شێوەیەکی وورد و چارەسەرکردنی کێشەی پیتە گەورە و بچووکەکان
    const roleKey = (userProfile.role || 'employee').toLowerCase();
    const translatedRole = translations[currentLang][roleKey] || (roleKey === 'admin' ? translations[currentLang].admin : translations[currentLang].employee);
    let roleDisplay = translatedRole;

    if (userProfile.branches) {
        roleDisplay = `${roleDisplay} ${translations[currentLang].at} ${userProfile.branches.branch_id} | ${userProfile.branches.branch_name}`;
    }
    if (roleLabel) roleLabel.innerText = roleDisplay;

    // ئەگەر بەڕێوەبەر یان یاریدەدەری بنکە بوو، بەشی بەڕێوەبردن کارا بکە
    if (userProfile.role === 'sub-admin' || userProfile.role === 'assistant-manager') {
        initSubAdminPanel();
    }
}

async function initSubAdminPanel() {
    // دروستکردنی کۆنتێنەری بەڕێوەبردن لە ژێر کالێندەرەکە
    const container = document.querySelector('.dashboard-container');
    const panel = document.createElement('div');
    panel.className = 'status-card sub-admin-panel';
    panel.style.marginTop = '20px';
    
    const t = translations[currentLang];
    
    panel.innerHTML = `
        <h4 class="panel-title">
            <i class="fas fa-users-cog"></i> ${t.branchManagement}
        </h4>
        <div class="custom-select" id="staffSelectDropdown" onclick="toggleCustomDropdown(event, 'staffSelectDropdown')" style="margin-bottom:10px;">
            <div class="select-trigger">
                <span class="selected-text">${t.selectStaff}...</span>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="options-list" id="staffOptionsList"></div>
        </div>
        <div id="staffActions" style="display:none; gap:12px; flex-direction:column; margin-top:10px;">
            <button class="checkin-btn history-btn" onclick="viewSelectedStaffAttendance(this)">
                <i class="fas fa-history"></i> <span>${t.viewHistory}</span>
            </button>
            <div id="staffCalendarWrapper" style="max-height: 0; opacity: 0; overflow: hidden; visibility: hidden; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); transform-origin: top;">
                <div id="staffCalendarView" class="calendar-container" style="margin-top: 10px; border: 1px solid var(--border-color); background: var(--card-bg);"></div>
            </div>
            <div class="leave-management-card">
                <label class="leave-label"><i class="fas fa-plane-departure"></i> ${t.leaveManagement}</label>
                
                <div class="date-range-container">
                    <div class="input-wrapper-labeled">
                        <label>${t.from}</label>
                        <input type="date" id="subLeaveStart" class="glass-input" onchange="selectedLeaveStartDate=this.value">
                    </div>
                    <div class="input-wrapper-labeled">
                        <label>${t.to}</label>
                        <input type="date" id="subLeaveEnd" class="glass-input" onchange="selectedLeaveEndDate=this.value">
                    </div>
                </div>
                
                <div id="hourlyTimeInputs" class="date-range-container" style="display:none;">
                    <div class="input-wrapper-labeled">
                        <label>${t.from}</label>
                        <input type="time" id="subLeaveStartTime" class="glass-input" onchange="selectedLeaveStartTime=this.value">
                    </div>
                    <div class="input-wrapper-labeled">
                        <label>${t.to}</label>
                        <input type="time" id="subLeaveEndTime" class="glass-input" onchange="selectedLeaveEndTime=this.value">
                    </div>
                </div>
                
                <div class="custom-select" id="subLeaveReasonSelect" onclick="toggleCustomDropdown(event, 'subLeaveReasonSelect')" style="margin-bottom:8px;">
                    <div class="select-trigger" style="height:44px; font-size:0.85rem;">
                        <span class="selected-text">${t.selectLeaveReason}</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="options-list">
                        <div class="option" onclick="selectSubLeaveReason(event, 'hourlyLeave', '${translations[currentLang].hourlyLeave}')">${translations[currentLang].hourlyLeave}</div>
                        <div class="option" onclick="selectSubLeaveReason(event, 'regularLeave', '${translations[currentLang].regularLeave}')">${translations[currentLang].regularLeave}</div>
                        <div class="option" onclick="selectSubLeaveReason(event, 'sickLeave', '${translations[currentLang].sickLeave}')">${translations[currentLang].sickLeave}</div>
                        <div class="option" onclick="selectSubLeaveReason(event, 'maternityLeave', '${translations[currentLang].maternityLeave}')">${translations[currentLang].maternityLeave}</div>
                        <div class="option" onclick="selectSubLeaveReason(event, 'longTermLeave', '${translations[currentLang].longTermLeave}')">${translations[currentLang].longTermLeave}</div>
                        <div class="option" onclick="selectSubLeaveReason(event, 'mobileTeam', '${translations[currentLang].mobileTeam}')">${translations[currentLang].mobileTeam}</div>
                        <div class="option" onclick="selectSubLeaveReason(event, 'workshop', '${translations[currentLang].workshop}')">${translations[currentLang].workshop}</div>
                    </div>
                </div>
                <button class="login-btn save-leave-btn" onclick="saveStaffLeave()">
                    <i class="fas fa-save"></i> <span>${t.saveLeave}</span>
                </button>
            </div>
        </div>
    `;
    container.appendChild(panel);

    // هێنانی فەرمانبەرانی هەمان بنکە
    const { data: staff } = await client
        .from('profiles') 
        .select('id, full_name')
        .eq('branch_id', userProfile.branch_id);

    if (staff) {
        staffInBranch = staff; // Assign the fetched staff to the global variable
        const optionsList = document.getElementById('staffOptionsList');
        staff.forEach(s => {
            const div = document.createElement('div');
            div.className = 'option';
            div.innerText = s.full_name;
            div.onclick = (e) => selectStaffOption(e, s.id, s.full_name);
            optionsList.appendChild(div);
        });
    }
}

function toggleCustomDropdown(event, id) {
    if (event) event.stopPropagation();
    const el = document.getElementById(id);
    const isActive = el.classList.contains('active');
    document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('active'));
    if (!isActive) el.classList.add('active');
}

function selectStaffOption(event, id, name) {
    if (event) event.stopPropagation();
    selectedStaffId = id;
    const drop = document.getElementById('staffSelectDropdown');
    drop.querySelector('.selected-text').innerText = name;
    drop.querySelectorAll('.option').forEach(opt => opt.classList.toggle('selected', opt.innerText === name));
    drop.classList.remove('active');

    document.getElementById('staffActions').style.display = 'flex';
    
    // ئەگەر بەرپرسی بنکە ناوی خۆی هەڵبژارد، دوگمەی مێژوو بشارەوە چونکە کالێندەری یەکەم هی خۆیەتی
    const historyBtn = document.querySelector('.sub-admin-panel .history-btn');
    if (historyBtn) {
        historyBtn.style.display = (id === currentUser.id) ? 'none' : 'flex';
    }

    // شاردنەوەی کالێندەری فەرمانبەری پێشوو ئەگەر کراوە بوو
    const wrapper = document.getElementById('staffCalendarWrapper');
    wrapper.style.maxHeight = '0';
    wrapper.style.opacity = '0';
    wrapper.style.visibility = 'hidden';
}

function selectSubLeaveReason(event, key, text) {
    if (event) event.stopPropagation();
    selectedLeaveReason = key;
    const drop = document.getElementById('subLeaveReasonSelect');
    drop.querySelector('.selected-text').innerText = text;
    
    // نیشاندانی کاتژمێرەکان تەنها ئەگەر مۆڵەتی کاتی بێت
    const timeInputs = document.getElementById('hourlyTimeInputs');
    if (timeInputs) timeInputs.style.display = (key === 'hourlyLeave' || key === 'mobileTeam') ? 'flex' : 'none';
    
    drop.querySelectorAll('.option').forEach(opt => opt.classList.toggle('selected', opt.innerText === text));
    drop.classList.remove('active');
}

// داخستنی لیستەکان ئەگەر کلیک لە دەرەوە کرا
window.addEventListener('click', () => {
    document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('active'));
});

// فەنکشنی نوێ بۆ ڕێندەرکردنی کالێندەری فەرمانبەر لە شوێنێکی جیاواز
function renderStaffCalendar(data, staffId) {
    lastViewedStaffId = staffId;
    const view = document.getElementById('staffCalendarView');
    const wrapper = document.getElementById('staffCalendarWrapper');
    if (!view || !wrapper) return;

    wrapper.style.maxHeight = '600px';
    wrapper.style.opacity = '1';
    wrapper.style.visibility = 'visible';
    view.innerHTML = ""; // پاککردنەوەی پێشوو
    
    const year = staffViewDate.getFullYear();
    const month = staffViewDate.getMonth();
    const monthName = new Intl.DateTimeFormat(currentLang === 'ku' ? 'ku-IQ' : 'ar-IQ', { month: 'long', year: 'numeric' }).format(staffViewDate);
    
    const header = document.createElement('div');
    header.className = 'calendar-header';
    header.innerHTML = `
        <button class="icon-btn calendar-nav-btn" onclick="changeStaffMonth(-1)"><i class="fas fa-chevron-right"></i></button>
        <h4 id="staffMonthDisplay" style="font-size:0.85rem; margin:0; color:var(--primary); font-weight:700;">${monthName}</h4>
        <button class="icon-btn calendar-nav-btn" onclick="changeStaffMonth(1)"><i class="fas fa-chevron-left"></i></button>
    `;
    view.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    
    const dayNames = currentLang === 'ku' ? ["شەممە", "1شەم", "2شەم", "3شەم", "4شەم", "5شەم", "هەینی"] : ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
    dayNames.forEach(d => {
        grid.innerHTML += `<div class="calendar-day-name" style="font-size:0.65rem;">${d}</div>`;
    });

    const firstDay = new Date(year, month, 1).getDay();
    const spaces = (firstDay + 1) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0,0,0,0);

    for (let i = 0; i < spaces; i++) grid.innerHTML += `<div></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const record = data.find(r => r.check_in_time.startsWith(dateStr));
        const leave = staffLeaveData.find(l => dateStr >= l.start_date && dateStr <= l.end_date);
        const isOnLeave = !!leave;
        const dayDate = new Date(year, month, d);
        const dayOfWeek = dayDate.getDay();
        const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6);
        const isPastDay = (dayDate < today);
        
        let className = "calendar-day";
        if (isWeekend) className += " weekend-default-day";
        if (record) className += " has-record";
        else if (isOnLeave) {
            if (leave.reason === 'workshop') className += " calendar-workshop";
            else if (leave.reason === 'mobileTeam') className += " calendar-mobile-team";
            else className += " calendar-leave";
        }
        else if (isPastDay && !isWeekend) className += " missed-day";
        if (today.toDateString() === dayDate.toDateString()) className += " today";
        
        const dayEl = document.createElement('div');
        dayEl.className = className;
        dayEl.style.fontSize = "0.75rem";
        dayEl.innerText = d;
        dayEl.onclick = () => showStaffDayDetails(record, dateStr, staffId); // بەکارهێنانی ئایدی ناوخۆیی
        grid.appendChild(dayEl);
    }
    view.appendChild(grid);
}

function changeStaffMonth(step) {
    staffViewDate.setMonth(staffViewDate.getMonth() + step);
    renderStaffCalendar(staffAttendanceData, lastViewedStaffId);
}

async function viewSelectedStaffAttendance(clickedBtn) {
    if (!selectedStaffId) return;
    
    const wrapper = document.getElementById('staffCalendarWrapper');
    // ئەگەر کالێندەرەکە کراوە بوو و هەمان فەرمانبەر هەڵبژێردرابوو، دایبخە (Toggle)
    const isVisible = wrapper.style.maxHeight !== '0px' && wrapper.style.maxHeight !== '';
    if (isVisible && lastViewedStaffId === selectedStaffId) {
        wrapper.style.maxHeight = '0';
        wrapper.style.opacity = '0';
        wrapper.style.visibility = 'hidden';
        return;
    }

    const staffIdToView = selectedStaffId; // جێگیرکردنی ئایدی فەرمانبەر
    
    const btn = clickedBtn || document.querySelector('.sub-admin-panel .history-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${translations[currentLang].waitText}`;
    
    const { data: attendance } = await client
        .from('attendance')
        .select('check_in_time, check_out_time')
        .eq('user_id', selectedStaffId);
    
    const { data: leaves } = await client
        .from('leaves')
        .select('id, start_date, end_date, reason, start_time, end_time')
        .eq('user_id', selectedStaffId);

    btn.innerHTML = originalHTML;
    if (attendance) {
        staffAttendanceData = attendance;
        staffLeaveData = leaves || [];
        renderStaffCalendar(attendance, staffIdToView);
    }
}

// New function to show staff attendance details in a read-only modal
async function showStaffDayDetails(record, dateStr, staffId) {
    if (!staffDetailModal) {
        staffDetailModal = document.createElement('div');
        staffDetailModal.id = 'staffDetailModal';
        staffDetailModal.className = 'modal-overlay';
        staffDetailModal.onclick = (e) => { if (e.target === staffDetailModal) staffDetailModal.style.display = 'none'; };
        document.body.appendChild(staffDetailModal);
    }

    // نیشاندانی مۆداڵەکە یەکسەر بە دۆخی بارکردنەوە
    staffDetailModal.style.display = 'flex';
    staffDetailModal.innerHTML = `
        <div class="modal-window update-card" style="max-width:380px;">
            <div class="update-body" style="padding: 40px; text-align: center;">
                <i class="fas fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--primary);"></i>
                <p style="margin-top: 15px;">${translations[currentLang].waitText}</p>
            </div>
        </div>
    `;

    const staff = staffInBranch.find(s => s.id === staffId);
    const staffName = staff ? staff.full_name : translations[currentLang].employee;

    const leave = staffLeaveData.find(l => dateStr >= l.start_date && dateStr <= l.end_date);
    const isOnLeave = !!leave;
    const todayStr = new Date().toISOString().split('T')[0];

    try {
        // هێنانی ڕوونکردنەوە لە داتابەیس
    const { data: justification, error: justError } = await client
        .from('justifications')
        .select('reason')
        .eq('user_id', staffId)
        .eq('date', dateStr)
        .maybeSingle();

    let justificationContent = translations[currentLang].noJustRecorded;
    if (justification && justification.reason) {
        justificationContent = justification.reason;
    }

    // دروستکردنی ناوەڕۆکی وردەکاری دەوام یان مۆڵەت
    let detailsHtml = '';
    
    // ١. پشکنین بۆ ئامادەبوون (Attendance)
    if (record) {
        const { total, inPercent, outPercent } = calculateComplianceScore(record);
        const getStatus = (p) => {
            if (p >= 85) return 'compliance-excellent';
            if (p >= 50) return 'compliance-good';
            return 'compliance-poor';
        };

        detailsHtml += `
            <div class="detail-text" style="border-right: 4px solid #22c55e; background: rgba(34, 197, 94, 0.05);">
                <i class="fas fa-sign-in-alt" style="color: #22c55e;"></i> 
                <div>${translations[currentLang].arrival}: <b>${formatTime12(record.check_in_time)}</b></div>
            </div>
            <div class="detail-text" style="border-right: 4px solid #ef4444; background: rgba(239, 68, 68, 0.05);">
                <i class="fas fa-sign-out-alt" style="color: #ef4444;"></i> 
                <div>${translations[currentLang].checkout}: <b>${record.check_out_time ? formatTime12(record.check_out_time) : translations[currentLang].notRecorded}</b></div>
            </div>
            <div class="modal-compliance-box">
                <div class="m-comp-header">
                    <span class="m-comp-title">${translations[currentLang].dailyCompliance}</span>
                    <span class="m-comp-value ${getStatus(total)}">${total}%</span>
                </div>
                <div class="m-comp-bars">
                    <div class="m-bar"><div class="m-fill ${getStatus(inPercent).replace('compliance-', 'bg-')}" style="width:${inPercent}%"></div></div>
                    <div class="m-bar"><div class="m-fill ${getStatus(outPercent).replace('compliance-', 'bg-')}" style="width:${outPercent}%"></div></div>
                </div>
            </div>
        `;
    }

    // ٢. پشکنین بۆ مۆڵەت (Leave) - هەردووکیان پێکەوە نیشان دەدات ئەگەر هەبوو
    if (isOnLeave) {
        let leaveColor = "#ffc107";
        let leaveBg = "rgba(255, 193, 7, 0.05)";
        let leaveIcon = "fas fa-plane-departure";
        
        if (leave.reason === 'mobileTeam') {
            leaveColor = "#14b8a6";
            leaveBg = "rgba(20, 184, 166, 0.05)";
            leaveIcon = "fas fa-car-side";
        } else if (leave.reason === 'workshop') {
             leaveColor = "#6366f1";
            leaveBg = "rgba(99, 102, 241, 0.05)";
            leaveIcon = "fas fa-tools";
        }
        detailsHtml += `
            <div class="detail-text" style="border-right: 4px solid ${leaveColor}; background: ${leaveBg}; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 12px;">
                     <i class="${leaveIcon}" style="color: ${leaveColor};"></i>  
                    <div>
                        ${translations[currentLang].reasonForLeave}: <b>${translations[currentLang][leave.reason] || leave.reason}</b>
                        ${leave.start_time ? `<br><small style="color:var(--text-sub);">${formatTime12(leave.start_time)} - ${formatTime12(leave.end_time)}</small>` : ''}
                    </div>
                </div>
                <button class="btn-delete" onclick="deleteStaffLeave('${leave.id}', '${staffId}')" style="width: 32px !important; height: 32px !important; border-radius: 8px !important; margin: 0 !important;">
                    <i class="fas fa-trash-alt" style="font-size: 0.75rem;"></i>
                </button>
            </div>
        `;
    }
    
    // ٣. نیشاندانی نەهاتوو تەنها ئەگەر هیچ کامیان نەبوو
    if (!record && !isOnLeave && dateStr <= todayStr) {
        detailsHtml = `
            <div class="detail-text" style="border-right: 4px solid #ef4444; justify-content: center; color: #991b1b; background: #fef2f2;">
                <i class="fas fa-user-slash"></i> <b>${translations[currentLang].absentStat}</b>
            </div>
        `;
    }

    staffDetailModal.innerHTML = `
        <div class="modal-window update-card" style="max-width:380px;">
            <div class="update-header history-header">
                <div class="update-icon-wrapper">
                    <i class="fas fa-user-clock"></i>
                </div>
            </div>
            <div class="update-body">
                <h3 style="margin-bottom:5px;">${translations[currentLang].staffAttendanceDetails}</h3>
                <p style="font-size:0.8rem; color:var(--text-sub); margin-bottom:15px;">${staffName} - ${translations[currentLang].date} ${dateStr}</p>
                
                ${detailsHtml}

                <div class="justification-area" style="margin-top:20px; border-top:1px dashed var(--border-color); padding-top:15px;">
                    <label style="font-size:0.8rem; font-weight:700; color:var(--text-sub); margin-bottom:8px; display:block;">
                        <i class="fas fa-file-signature"></i> ${translations[currentLang].justification}
                    </label>
                    <div class="justification-view-box" style="min-height: 60px; font-size:0.85rem;">
                        ${justificationContent}
                    </div>
                </div>

                <button class="login-btn" onclick="document.getElementById('staffDetailModal').style.display='none'" style="margin-top:20px;">
                    <span data-i18n="close">${translations[currentLang].close}</span>
                </button>
            </div>
        </div>
    `;
    } catch (err) {
        staffDetailModal.style.display = 'none';
        console.error("Error opening staff details:", err);
    }
}

async function saveStaffLeave() {
    if (!selectedStaffId || !selectedLeaveStartDate || !selectedLeaveEndDate || !selectedLeaveReason) {
        alert(translations[currentLang].selectDates);
        return;
    }

    const saveBtn = document.querySelector('.sub-admin-panel .login-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

    const leaveData = {
        user_id: selectedStaffId,
        start_date: selectedLeaveStartDate,
        end_date: selectedLeaveEndDate,
        reason: selectedLeaveReason
    };

    if (selectedLeaveReason === 'hourlyLeave' || selectedLeaveReason === 'mobileTeam') {
        leaveData.start_time = selectedLeaveStartTime;
        leaveData.end_time = selectedLeaveEndTime;
    }

    const { error } = await client.from('leaves').insert([leaveData]);

    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;

    if (!error) {
        alert(translations[currentLang].leaveSavedSuccess);
    } else {
        if (error.code === '23505') alert("ئەم فەرمانبەرە پێشتر مۆڵەتی بۆ ئەم ڕێکەوتە تۆمار کراوە");
        else alert("Error: " + error.message);
    }
}

async function deleteStaffLeave(leaveId, staffId) {
    if (!confirm(translations[currentLang].confirmDeleteLeave)) return;
    
    const { error } = await client
        .from('leaves')
        .delete()
        .eq('id', leaveId);

    if (!error) {
        alert(translations[currentLang].leaveDeletedSuccess);
        if (staffDetailModal) staffDetailModal.style.display = 'none';
        // نوێکردنەوەی داتاکان بە دیاریکردنی ئایدی فەرمانبەرەکە بۆ ئەوەی گۆڕانکارییەکە یەکسەر دەربکەوێت
        selectedStaffId = staffId;
        viewSelectedStaffAttendance(); 
    } else {
        alert("Error: " + error.message);
    }
}

function updateStatus(msg, type) {
    const errDiv = document.getElementById('error-msg');
    if (errDiv) {
        const icon = type === 'success' 
            ? '<i class="fas fa-check-circle"></i>' 
            : '<i class="fas fa-exclamation-circle"></i>';
        
        errDiv.innerHTML = `${icon} <span>${msg}</span>`;
        errDiv.className = type; // Adds 'success' or 'error' class
        errDiv.style.display = 'flex';
    }
}

let currentViewDate = new Date();
let attendanceData = [];

// ١. وەرگرتنی هەموو تۆمارەکانی فەرمانبەر لە سوپابەیس
async function fetchAttendance() {
    const { data: attendance, error: attError } = await client
        .from('attendance')
        .select('check_in_time, check_out_time')
        .eq('user_id', currentUser.id);

    const { data: leaves, error: leaveError } = await client
        .from('leaves')
        .select('start_date, end_date, reason, start_time, end_time')
        .eq('user_id', currentUser.id);

    if (!attError && !leaveError) {
        attendanceData = attendance;
        userLeaves = leaves || [];
        renderCalendar();
    }
}

// ٢. دروستکردنی کالێندەر
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthLabel = document.getElementById('monthDisplay');
    grid.innerHTML = "";

    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();

    monthLabel.innerText = new Intl.DateTimeFormat(currentLang === 'ku' ? 'ku-IQ' : 'ar-IQ', { month: 'long', year: 'numeric' }).format(currentViewDate);

    // ناوی ڕۆژەکان
    const days = currentLang === 'ku' ? ["شەممە", "1شەم", "2شەم", "3شەم", "4شەم", "5شەم", "هەینی"] : ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
    days.forEach(d => {
        grid.innerHTML += `<div class="calendar-day-name">${d}</div>`;
    });

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const firstDay = new Date(year, month, 1).getDay(); // Sunday is 0
    const spaces = (firstDay + 1) % 7; // Adjust for Saturday start
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // شوێنی بەتاڵ بۆ دەستپێکی مانگ (ئەگەر هەفتە بە شەممە دەست پێ بکات)
    for (let i = 0; i < spaces; i++) {
        grid.innerHTML += `<div></div>`;
    }

    // دروستکردنی ڕۆژەکان
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const record = attendanceData.find(r => r.check_in_time.startsWith(dateStr));
        const leave = userLeaves.find(l => dateStr >= l.start_date && dateStr <= l.end_date);
        const isOnLeave = !!leave;
        const dayDate = new Date(year, month, day);
        const dayOfWeek = dayDate.getDay(); // 0=Sun, 5=Fri, 6=Sat
        const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6); // 5 for Friday, 6 for Saturday
        const isPastDay = (dayDate < todayDate);
        
        let className = "calendar-day";

        if (isWeekend) {
            className += " weekend-default-day"; // Default blue for weekends
        }

        if (record) {
            className += " has-record";
        } else if (isOnLeave) {
            if (leave.reason === 'workshop') className += " calendar-workshop";
            else if (leave.reason === 'mobileTeam') className += " calendar-mobile-team";
            else className += " calendar-leave";
        } else if (isPastDay && !isWeekend) {
            // تەنها ڕۆژانی ڕابردووی نا-پشوو کە تۆماریان نییە بە سوور دیاری دەکرێن
            className += " missed-day";
        }
        if (new Date().toDateString() === dayDate.toDateString()) className += " today";

        const dayEl = document.createElement('div');
        dayEl.className = className;
        dayEl.innerText = day;
        dayEl.onclick = () => showDayDetails(record, dateStr);
        grid.appendChild(dayEl);
    }
}

function showDayDetails(record, dateStr) {
    currentDetailDate = dateStr;
    const modal = document.getElementById('dayDetails');
    const input = document.getElementById('justificationInput');
    const saveBtn = document.getElementById('saveJustBtn');

     document.getElementById('detailDate').innerText = translations[currentLang].date + " " + dateStr;
     input.value = ""; // پاککردنەوەی پێشوو
    
    const detailIn = document.getElementById('detailIn');
    const detailOut = document.getElementById('detailOut');
    const leave = userLeaves.find(l => dateStr >= l.start_date && dateStr <= l.end_date);
    const isOnLeave = !!leave;

    // پاککردنەوە و شاردنەوەی سەرەتا بۆ ڕێگری لە تێکەڵبوونی داتای ڕۆژانی پێشوو
    detailIn.style.display = 'none';
    detailOut.style.display = 'none';
    detailIn.innerHTML = "";
    detailOut.innerHTML = "";

    // سڕینەوەی کاردی ڕێژەی کۆن ئەگەر هەبێت بۆ ڕێگری لە دووبارەبوونەوە
    const existingComp = modal.querySelector('.modal-compliance-box');
    if (existingComp) existingComp.remove();

    // پاککردنەوەی ستایلی دیفۆڵت بۆ ئەوەی دیزاینەکە وەک هی بەڕێوەبەر بێت
    detailIn.style.background = "";
    detailIn.style.borderRight = "";
    detailOut.style.background = "";
    detailOut.style.borderRight = "";
    detailOut.style.padding = "";
    detailOut.style.gap = "";
    detailOut.style.flexDirection = "row"; 
    detailOut.style.alignItems = "center";

    if (record) {
        const { total, inPercent, outPercent } = calculateComplianceScore(record);
        const getStatus = (p) => {
            if (p >= 85) return 'compliance-excellent';
            if (p >= 50) return 'compliance-good';
            return 'compliance-poor';
        };

        const complianceHtml = `
            <div class="modal-compliance-box">
                <div class="m-comp-header">
                    <span class="m-comp-title">${translations[currentLang].dailyCompliance}</span>
                    <span class="m-comp-value ${getStatus(total)}">${total}%</span>
                </div>
                <div class="m-comp-bars">
                    <div class="m-bar"><div class="m-fill ${getStatus(inPercent).replace('compliance-', 'bg-')}" style="width:${inPercent}%"></div></div>
                    <div class="m-bar"><div class="m-fill ${getStatus(outPercent).replace('compliance-', 'bg-')}" style="width:${outPercent}%"></div></div>
                </div>
            </div>
        `;

        detailIn.style.display = 'flex';
        detailOut.style.display = 'flex';
        
        // سڕینەوەی هەر کاردێکی کۆن کە لە ناو مۆداڵەکەدایە بەرلە زیادکردنی نوێ
        const existingBox = modal.querySelector('.modal-compliance-box');
        if (existingBox) existingBox.remove();

        // جێگیرکردنی ستایلی ئامادەبوون (وەک هی بەڕێوەبەر)
        detailIn.style.borderRight = "4px solid #22c55e";
        detailIn.style.background = "rgba(34, 197, 94, 0.05)";
        detailIn.innerHTML = `<i class="fas fa-sign-in-alt" style="color: #22c55e;"></i> <div>${translations[currentLang].arrival}: <b>${formatTime12(record.check_in_time)}</b></div>`;

        // جێگیرکردنی ستایلی دەرچوون (وەک هی بەڕێوەبەر)
        detailOut.style.borderRight = "4px solid #ef4444";
        detailOut.style.background = "rgba(239, 68, 68, 0.05)";
        detailOut.innerHTML = `<i class="fas fa-sign-out-alt" style="color: #ef4444;"></i> <div>${translations[currentLang].checkout}: <b>${record.check_out_time ? formatTime12(record.check_out_time) : translations[currentLang].notRecorded}</b></div>`;
        
        detailOut.insertAdjacentHTML('afterend', complianceHtml);
    }

    if (isOnLeave) {
        let leaveColor = "#ffc107";
        let leaveBg = "rgba(255, 193, 7, 0.05)";
        let leaveIcon = "fas fa-plane-departure";
        
        if (leave.reason === 'mobileTeam') {
            leaveColor = "#14b8a6";
            leaveBg = "rgba(20, 184, 166, 0.05)";
            leaveIcon = "fas fa-car-side";
        } else if (leave.reason === 'workshop') {
            leaveColor = "#6366f1";
            leaveBg = "rgba(99, 102, 241, 0.15)";
            leaveIcon = "fas fa-tools";
        }

        const leaveHtmlContent = `
            <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                <i class="${leaveIcon}" style="color: ${leaveColor};"></i> 
                <div>
                    ${translations[currentLang].reasonForLeave}: <b>${translations[currentLang][leave.reason] || leave.reason}</b>
                    ${leave.start_time ? `<br><small style="opacity:0.7;">${formatTime12(leave.start_time)} - ${formatTime12(leave.end_time)}</small>` : ''}
                </div>
            </div>`;

        if (!record) {
            detailIn.style.display = 'flex';
            detailIn.style.borderRight = `4px solid ${leaveColor}`;
            detailIn.style.background = leaveBg;
            detailIn.innerHTML = leaveHtmlContent;
        } else {
            // ئەگەر هاتن و دەرچوون و مۆڵەت پێکەوە هەبوون (مۆڵەتی کاتی)
            const checkoutHtml = detailOut.innerHTML;
            detailOut.style.flexDirection = "column";
            detailOut.style.alignItems = "stretch";
            detailOut.style.padding = "0";
            detailOut.style.background = "none";
            detailOut.style.border = "none";
            detailOut.style.gap = "5px"; // جێگیرکردنی بۆشایی نێوان دوو پارچەکە ڕێک بە ٥ پیکسڵ

            detailOut.innerHTML = `
                <div class="detail-text" style="border-right: 4px solid #ef4444; background: rgba(239, 68, 68, 0.05); margin: 0 !important; display: flex; align-items: center; gap: 12px;">
                    ${checkoutHtml}
                </div>
                <div class="detail-text" style="border-right: 4px solid ${leaveColor}; background: ${leaveBg}; margin: 0 !important; display: flex; align-items: center; gap: 12px;">
                    ${leaveHtmlContent}
                </div>
            `;
        }
    } else if (!record) {
        detailIn.style.display = 'flex';
        detailIn.innerHTML = `<div style="text-align: center; width: 100%; padding: 20px 0; color: var(--text-sub);">
            <i class="fas fa-calendar-times" style="font-size: 2.5rem; display: block; margin-bottom: 10px; opacity: 0.5;"></i>
            ${translations[currentLang].recordNotFound}
        </div>`;
    }

    // هێنانی ڕوونکردنەوە ئەگەر پێشتر نێردرابێت
    fetchJustification(dateStr);

    modal.style.display = 'flex';  // دڵنیابوونەوە لە بەکارهێنانی flex بۆ ناوەندکردنی تەواو
}

async function fetchJustification(dateStr) {
    const input = document.getElementById('justificationInput');
    const saveBtn = document.getElementById('saveJustBtn');
    const { data } = await client
        .from('justifications')
        .select('reason')
        .eq('user_id', currentUser.id)
        .eq('date', dateStr)
        .maybeSingle();
    
    if (data && data.reason) {
        input.value = data.reason;
        input.readOnly = true; // قفڵکردنی تێکستەکە ئەگەر ڕوونکردنەوە پێشتر هەبوو
        saveBtn.classList.add('btn-justification-edit');
        saveBtn.innerHTML = `<i class="fas fa-edit"></i> <span>${translations[currentLang].editJustification}</span>`;
        if (document.getElementById('deleteJustBtn')) document.getElementById('deleteJustBtn').style.display = 'flex';
    } else {
        input.value = "";
        input.readOnly = false; // کراوە بێت ئەگەر ڕوونکردنەوە نەبوو
        saveBtn.classList.remove('btn-justification-edit');
        saveBtn.innerHTML = `<i class="fas fa-paper-plane"></i> <span>${translations[currentLang].saveJustification}</span>`;
        if (document.getElementById('deleteJustBtn')) document.getElementById('deleteJustBtn').style.display = 'none';
    }
    
    input.placeholder = translations[currentLang].justificationPlaceholder;
}

async function submitJustification() {
    const input = document.getElementById('justificationInput');
    const saveBtn = document.getElementById('saveJustBtn');

    // ئەگەر لە دۆخی دەستکاریکردن بوو، تەنها قفڵەکە بکەرەوە و دوگمەکە ناچالاک بکە تا گۆڕانکاری دەکرێت
    if (saveBtn.classList.contains('btn-justification-edit')) {
        input.readOnly = false;
        input.focus();
        saveBtn.classList.remove('btn-justification-edit');
        saveBtn.innerHTML = `<i class="fas fa-paper-plane"></i> <span>${translations[currentLang].saveJustification}</span>`;
        saveBtn.disabled = true; // ناچالاککردن تاوەکو فەرمانبەر دەستکاری تێکستەکە دەکات
        
        // چالاککردنەوەی دوگمەکە کاتێک فەرمانبەر دەست دەکات بە نووسین یان گۆڕانکاری
        input.oninput = () => {
            saveBtn.disabled = false;
            input.oninput = null; // لابردنی لیسنەرەکە دوای چالاکبوونەوە
        };
        return;
    }

    const reason = input.value.trim();
    if (!reason) return;

    // بارکردنی دوگمەکە و نیشاندانی سپینەر بۆ ئاگادارکردنەوەی بەکارهێنەر
    const originalHTML = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i>`;

    const { error } = await client
        .from('justifications')
        .upsert({ user_id: currentUser.id, date: currentDetailDate, reason: reason }, { onConflict: 'user_id,date' });

    if (!error) {
        // نیشاندانی دڵنیایی سەرکەوتن بە ڕەنگی سەوز و ئایکۆنی چک
        const successMsg = translations[currentLang].updateSuccess;
        saveBtn.style.background = "#22c55e";
        saveBtn.style.color = "white";
        saveBtn.innerHTML = `<i class="fas fa-check-circle"></i> <span>${successMsg}</span>`;

        setTimeout(() => {
            // گەڕاندنەوەی دوگمەکە بۆ دۆخی ئاسایی و دووبارە قفڵکردنەوەی تێکستەکە
            saveBtn.disabled = false;
            saveBtn.style.background = ""; 
            saveBtn.style.color = "";
            input.readOnly = true; 
            saveBtn.classList.add('btn-justification-edit');
            saveBtn.innerHTML = `<i class="fas fa-edit"></i> <span>${translations[currentLang].editJustification}</span>`;
            if (document.getElementById('deleteJustBtn')) document.getElementById('deleteJustBtn').style.display = 'flex';
            updateStatus(successMsg, 'success');
        }, 2500);
    } else {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHTML;
        updateStatus(error.message, 'error');
    }
}

async function deleteJustification() {
    if (!currentDetailDate) return;
    
    const confirmDel = confirm(translations[currentLang].deleteConfirmMsg);
    if (!confirmDel) return;

    const delBtn = document.getElementById('deleteJustBtn');
    const saveBtn = document.getElementById('saveJustBtn');
    const input = document.getElementById('justificationInput');

    delBtn.disabled = true;
    delBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i>`;

    const { error } = await client
        .from('justifications')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('date', currentDetailDate);

    if (!error) {
        updateStatus(translations[currentLang].deleteSuccess, 'success');
        fetchJustification(currentDetailDate); // دووبارە ڕێکخستنەوەی مۆداڵەکە بۆ دۆخی بەتاڵ
    } else {
        alert("Error: " + error.message);
        delBtn.disabled = false;
        delBtn.innerHTML = `<i class="fas fa-trash-alt"></i>`;
    }
}

function closeModal(event) {
    // ئەگەر کلیک لە دەرەوەی کاردەکە کرا، دایبخە
    if (event.target.id === 'dayDetails' || event.target.className === 'modal-overlay') {
        document.getElementById('dayDetails').style.display = 'none';
    }
}

function changeMonth(step) {
    currentViewDate.setMonth(currentViewDate.getMonth() + step);
    renderCalendar();
}

function navigateToSettings() {
    const btn = document.getElementById('settingsBtn');
    const icon = btn ? btn.querySelector('i') : null;
    
    if (icon) {
        icon.classList.add('fa-spin-once');
    }

    // گۆڕینی ئەنیمەیشن بۆ سڵاید بەرەو لای چەپ
    document.body.classList.add('page-slide-left');

    // کەمکردنەوەی کاتەکە بۆ ئەوەی یەکسەر بارکردن دەستپێبکات، لە کاتێکدا ئەنیمەیشنەکە هێشتا دەڕوات
    setTimeout(() => {
        window.location.href = 'settings.html';
    }, 150); 
}