// dashboard.js - Updated & Merged Version
const URL_SB = 'https://mygqlubvxdbbsygitjuj.supabase.co';
const KEY_SB = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Z3FsdWJ2eGRiYnN5Z2l0anVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjA3NzIsImV4cCI6MjA5MTI5Njc3Mn0.bAecJcTMfZEiT1doet_PgH3EEjjAB6juNRoCJlK9qeA';

const client = supabase.createClient(URL_SB, KEY_SB);

let userPos = null;
let watchID = null;
let locationAttempts = 0;
let attemptTimer = null;
let currentUser = null;
let userProfile = null; // پاشەکەوتکردنی زانیاری پڕۆفایل و بنکە
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

// فەنکشنی یاریدەدەر بۆ گۆڕینی کات لە ٢٤ کاتژمێرییەوە بۆ ١٢ کاتژمێری
function formatTime12(input) {
    if (!input) return '';
    let d = new Date(input);

    // ئەگەر تەنها کات بوو، ڕێکەوتێکی بۆ زیاد بکە تاوەکو وەک Date بناسرێت
    if (isNaN(d.getTime()) && typeof input === 'string') {
        d = new Date(`2000-01-01T${input.includes('T') ? input.split('T')[1] : input}`);
    }
    if (isNaN(d.getTime())) return '--:--';

    try {
        const options = { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hour12: true };
        const timeStr = new Intl.DateTimeFormat('en-US', options).format(d);
        return `\u200E${timeStr}`;
    } catch (e) {
        return '--:--';
    }
}

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
    const audioHash = await getAudioFingerprint();
    // ١. دروستکردنی وێنەیەکی شووشەیی (Canvas) بۆ جیاکردنەوەی ووردتری GPU
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const txt = 'iHEC-Attendance-Check-Unique-ID-2024';
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125,1,62,20);
    ctx.fillStyle = "#069";
    ctx.fillText(txt, 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText(txt, 4, 17);
    const canvasHash = canvas.toDataURL();

    // ٢. کۆکردنەوەی سیفاتە فیزیکییەکانی تری ئامێر
    const hardwareFeatures = [
        navigator.userAgent,
        screen.width + "x" + screen.height,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || '8',
        navigator.platform,
        navigator.language,
        screen.colorDepth,
        canvasHash,
        audioHash // زیادکردنی پەنجەمۆری دەنگ بۆ گەیشتن بە ئەوپەڕی ووردکاری
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
    const fingerprint = await getHardwareFingerprint();
    // ناسنامەی ئامێر یەکسانە بە پەنجەمۆری ڕەقەکاڵاکە بەبێ گۆڕانکاری
    localStorage.setItem('device_id', fingerprint);
    return fingerprint;
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
        if (!record.check_out_time) {
            // هاتنی کردووە بەڵام دەرنەچووە
            toggleToCheckoutUI(record.check_in_time);
        } else {
            // هەردووکی کردووە - هەردوو دوگمەکە دەشارینەوە
            document.getElementById('checkinBtn').style.display = 'none';
            document.getElementById('checkoutBtn').style.display = 'none';
            updateStatus(translations[currentLang].dailyLimitReached, "success");
        }
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

            let isWithinGeofence = true; // Assume true if no branch or no geofence data

            // Perform geofence check only if userProfile and branch data are available
            if (userProfile && userProfile.branches && userProfile.branches.latitude !== undefined && userProfile.branches.longitude !== undefined) {
                const distanceToBranch = calculateDistance( // Make sure branch coordinates are valid
                    userPos.latitude, userPos.longitude,
                    userProfile.branches.latitude, userProfile.branches.longitude
                );
                const allowedRadius = userProfile.branches.accuracy || 150; // بەکارهێنانی ١٥٠ وەکFallback ئەگەر لە داتابەیس دیاری نەکرابوو
                isWithinGeofence = distanceToBranch <= allowedRadius;
                
                // نیشاندانی تەنها دووری لە بنکە و شاردنەوەی سنووری ڕێپێدراو
                document.getElementById('accuracyArea').innerText = `${translations[currentLang].distBranch}: ${Math.round(distanceToBranch)} مەتر`;
            } else if (userProfile && !userProfile.branches) {
                console.warn("Branch location data missing for user. Geofence check skipped.");
                document.getElementById('accuracyArea').innerText = `${translations[currentLang].gpsAcc}: ${accuracy} m (${translations[currentLang].noBranch})`;
            }

            // Determine overall location suitability
            const isLocationSuitable = isAccurateEnough && isWithinGeofence;

            // لێرە پشکنین بۆ هەردوو مەرجەکە دەکەین (لۆکەیشن + ئامێر)
            const canProceed = isLocationSuitable && isDeviceVerified; // Both must be true
            
            // Update button states
            [btn, outBtn].forEach(b => { if(b) b.disabled = !canProceed; });

            // Update text status for checkin button (if visible)
            if (txt && btn.style.display !== 'none') {
                if (canProceed) {
                    txt.innerText = translations[currentLang].checkin;
                } else if (!isDeviceVerified) {
                    txt.innerText = translations[currentLang].invalidDevice;
                } else if (!isAccurateEnough) {
                    txt.innerText = translations[currentLang].gpsWeak;
                } else if (!isWithinGeofence) {
                    txt.innerText = translations[currentLang].notSuitable;
                }
            }

            // Update verification UI
            if (isLocationSuitable) updateVerifyUI('location', true, null, translations[currentLang].suitable); // Location is fully suitable
            else if (!isAccurateEnough) updateVerifyUI('location', null, 'loading', translations[currentLang].gpsWeak); // GPS accuracy is the issue
            else if (!isWithinGeofence) updateVerifyUI('location', false, null, translations[currentLang].notSuitable); // Outside geofence

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

    if (!isAccurateEnough) {
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
    let status = "on_time";

    // ١. پشکنینی ئامێر
    if (userProfile.device_id && userProfile.device_id !== currentDevice) {
        status = "invalid_device";
    }

    // ٣. پشکنینی لۆکەیشن (ئەگەر بنکەکەی دیاریکرابوو)
    if (userProfile.branches) {
        const distance = calculateDistance(
            userPos.latitude, userPos.longitude,
            userProfile.branches.latitude, userProfile.branches.longitude
        );
        
        if (distance > userProfile.branches.accuracy) {
            status = "outside_location";
        }
    }

    const { error } = await client.from('attendance').insert([{
        user_id: currentUser.id,
        portal_lat: userPos.latitude,
        portal_long: userPos.longitude,
        device_used: currentDevice,
        check_in_time: checkInTime,
        status: status
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

       const hardwareFP = await getHardwareFingerprint();
        let currentDev = await getDeviceID();

        // ١. گەڕان بەدوای خاوەنی ئەم ئامێرە (ڕەقەکاڵایە) لەناو هەموو پڕۆفایلەکان
        const { data: deviceOwner, error: deviceError } = await client
            .from('profiles')
            .select('id, full_name, device_id')
            .not('device_id', 'is', null)
            .eq('device_id', hardwareFP) // پشکنینی وورد و یەکسان بۆ ناسنامەی ئامێر
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
            if (deviceOwner.id === user.id) {
                isDeviceVerified = true;
            } else {
                // حاڵەتی یەکەم: ئامێرەکە پێشتر لای کەسێکی تر تۆمار کراوە
                isDeviceVerified = false;
                deviceMsgShort = translations[currentLang].deviceTakenShort;
                deviceMsgLong = translations[currentLang].deviceTaken;
            }
        } else {
            if (!profile.device_id) {
                // تۆمارکردنی ئامێری نوێ
                await client.from('profiles').update({ device_id: hardwareFP }).eq('id', user.id);
                isDeviceVerified = true;
            } else {
                // حاڵەتی دووەم: فەرمانبەرەکە ئامێری تری هەیە و ئەمە هی ئەو نییە
                isDeviceVerified = false;
                deviceMsgShort = translations[currentLang].notPreviousDevice;
                deviceMsgLong = translations[currentLang].notPreviousDevicelong;
            }
        }

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
    panel.innerHTML = `
        <h4 style="margin-bottom:15px; font-size:0.9rem; color:var(--primary);">
            <i class="fas fa-users-cog"></i> ${translations[currentLang].branchManagement}
        </h4>
        <div class="custom-select" id="staffSelectDropdown" onclick="toggleCustomDropdown(event, 'staffSelectDropdown')" style="margin-bottom:10px;">
            <div class="select-trigger">
                <span class="selected-text">${translations[currentLang].selectStaff}...</span>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="options-list" id="staffOptionsList"></div>
        </div>
        <div id="staffActions" style="display:none; gap:10px; flex-direction:column; margin-top:10px;">
            <button class="checkin-btn history-btn" onclick="viewSelectedStaffAttendance(this)" style="margin:0; height:38px; font-size:0.8rem;">
                <i class="fas fa-history"></i> ${translations[currentLang].viewHistory}
            </button>
            <div id="staffCalendarWrapper" style="max-height: 0; opacity: 0; overflow: hidden; visibility: hidden; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); transform-origin: top;">
                <div id="staffCalendarView" class="calendar-container" style="margin-top: 10px; border: 1px solid var(--border-color); background: var(--card-bg);"></div>
            </div>
            <div class="justification-area" style="border:1px solid var(--border-color); padding:15px; border-radius:15px; background:var(--bg-color);">
                <label style="font-size:0.8rem; margin-bottom:10px;"><i class="fas fa-plane-departure"></i> ${translations[currentLang].leaveManagement}</label>
                <div class="date-range-group" style="margin-bottom:12px; display: flex; gap: 10px; width: 100%;">
                    <input type="date" id="subLeaveStart" class="glass-input" style="height:40px; font-size:0.85rem; padding: 0 10px; flex: 1; min-width: 0;" onchange="selectedLeaveStartDate=this.value">
                    <input type="date" id="subLeaveEnd" class="glass-input" style="height:40px; font-size:0.85rem; padding: 0 10px; flex: 1; min-width: 0;" onchange="selectedLeaveEndDate=this.value">
                </div>
                <div id="hourlyTimeInputs" class="date-range-group" style="display:none; margin-bottom:12px; gap: 10px; width: 100%;">
                    <input type="time" id="subLeaveStartTime" class="glass-input" style="height:40px; font-size:0.85rem; padding: 0 10px; flex: 1; min-width: 0;" onchange="selectedLeaveStartTime=this.value">
                    <input type="time" id="subLeaveEndTime" class="glass-input" style="height:40px; font-size:0.85rem; padding: 0 10px; flex: 1; min-width: 0;" onchange="selectedLeaveEndTime=this.value">
                </div>
                <div class="custom-select" id="subLeaveReasonSelect" onclick="toggleCustomDropdown(event, 'subLeaveReasonSelect')" style="margin-bottom:8px;">
                    <div class="select-trigger" style="height:40px; font-size:0.85rem;">
                        <span class="selected-text">${translations[currentLang].selectLeaveReason}</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="options-list">
                        <div class="option" onclick="selectSubLeaveReason(event, 'hourlyLeave', '${translations[currentLang].hourlyLeave}')">${translations[currentLang].hourlyLeave}</div>
                        <div class="option" onclick="selectSubLeaveReason(event, 'regularLeave', '${translations[currentLang].regularLeave}')">${translations[currentLang].regularLeave}</div>
                        <div class="option" onclick="selectSubLeaveReason(event, 'sickLeave', '${translations[currentLang].sickLeave}')">${translations[currentLang].sickLeave}</div>
                        <div class="option" onclick="selectSubLeaveReason(event, 'maternityLeave', '${translations[currentLang].maternityLeave}')">${translations[currentLang].maternityLeave}</div>
                        <div class="option" onclick="selectSubLeaveReason(event, 'longTermLeave', '${translations[currentLang].longTermLeave}')">${translations[currentLang].longTermLeave}</div>
                    </div>
                </div>
                <button class="login-btn" onclick="saveStaffLeave()" style="padding:12px; font-size:0.9rem; margin-top:5px;">
                    <i class="fas fa-save"></i> ${translations[currentLang].saveLeave}
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
    if (timeInputs) timeInputs.style.display = (key === 'hourlyLeave') ? 'flex' : 'none';
    
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
        const isOnLeave = staffLeaveData.some(l => dateStr >= l.start_date && dateStr <= l.end_date);
        const dayDate = new Date(year, month, d);
        const dayOfWeek = dayDate.getDay();
        const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6);
        const isPastDay = (dayDate < today);
        
        let className = "calendar-day";
        if (isWeekend) className += " weekend-default-day";
        if (record) className += " has-record";
        else if (isOnLeave) className += " calendar-leave";
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
        .select('start_date, end_date, reason, start_time, end_time')
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
        detailsHtml += `
            <div class="detail-text" style="border-right: 4px solid #22c55e; background: rgba(34, 197, 94, 0.05);">
                <i class="fas fa-sign-in-alt" style="color: #22c55e;"></i> 
                <div>${translations[currentLang].arrival}: <b>${formatTime12(record.check_in_time)}</b></div>
            </div>
            <div class="detail-text" style="border-right: 4px solid #ef4444; background: rgba(239, 68, 68, 0.05);">
                <i class="fas fa-sign-out-alt" style="color: #ef4444;"></i> 
                <div>${translations[currentLang].checkout}: <b>${record.check_out_time ? formatTime12(record.check_out_time) : translations[currentLang].notRecorded}</b></div>
            </div>
        `;
    }

    // ٢. پشکنین بۆ مۆڵەت (Leave) - هەردووکیان پێکەوە نیشان دەدات ئەگەر هەبوو
    if (isOnLeave) {
        detailsHtml += `
            <div class="detail-text" style="border-right: 4px solid #ffc107; background: rgba(255, 193, 7, 0.05); justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <i class="fas fa-plane-departure" style="color: #ffc107;"></i> 
                    <div>
                        ${translations[currentLang].reasonForLeave}: <b>${translations[currentLang][leave.reason] || leave.reason}</b>
                        ${leave.start_time ? `<br><small style="color:var(--text-sub);">${formatTime12(leave.start_time)} - ${formatTime12(leave.end_time)}</small>` : ''}
                    </div>
                </div>
                <button class="btn-delete" onclick="deleteStaffLeave('${staffId}', '${leave.start_date}')" style="width: 32px !important; height: 32px !important; border-radius: 8px !important; margin: 0 !important;">
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

    if (selectedLeaveReason === 'hourlyLeave') {
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

async function deleteStaffLeave(staffId, startDate) {
    if (!confirm(translations[currentLang].confirmDeleteLeave)) return;
    
    const { error } = await client
        .from('leaves')
        .delete()
        .eq('user_id', staffId)
        .eq('start_date', startDate);

    if (!error) {
        alert(translations[currentLang].leaveDeletedSuccess);
        if (staffDetailModal) staffDetailModal.style.display = 'none';
        // دووبارە بارکردنەوەی داتاکان بۆ نوێکردنەوەی کالێندەرەکە
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
        const isOnLeave = userLeaves.some(l => dateStr >= l.start_date && dateStr <= l.end_date);
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
            className += " calendar-leave";
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
        detailIn.style.display = 'flex';
        detailOut.style.display = 'flex';

        // جێگیرکردنی ستایلی ئامادەبوون (وەک هی بەڕێوەبەر)
        detailIn.style.borderRight = "4px solid #22c55e";
        detailIn.style.background = "rgba(34, 197, 94, 0.05)";
        detailIn.innerHTML = `<i class="fas fa-sign-in-alt" style="color: #22c55e;"></i> <div>${translations[currentLang].arrival}: <b>${formatTime12(record.check_in_time)}</b></div>`;

        // جێگیرکردنی ستایلی دەرچوون (وەک هی بەڕێوەبەر)
        detailOut.style.borderRight = "4px solid #ef4444";
        detailOut.style.background = "rgba(239, 68, 68, 0.05)";
        detailOut.innerHTML = `<i class="fas fa-sign-out-alt" style="color: #ef4444;"></i> <div>${translations[currentLang].checkout}: <b>${record.check_out_time ? formatTime12(record.check_out_time) : translations[currentLang].notRecorded}</b></div>`;
    }

    if (isOnLeave) {
        const leaveHtmlContent = `
            <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                <i class="fas fa-plane-departure" style="color: #ffc107;"></i> 
                <div>
                    ${translations[currentLang].reasonForLeave}: <b>${translations[currentLang][leave.reason] || leave.reason}</b>
                    ${leave.start_time ? `<br><small style="opacity:0.7;">${formatTime12(leave.start_time)} - ${formatTime12(leave.end_time)}</small>` : ''}
                </div>
            </div>`;

        if (!record) {
            detailIn.style.display = 'flex';
            detailIn.style.borderRight = "4px solid #ffc107";
            detailIn.style.background = "rgba(255, 193, 7, 0.05)";
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
                <div class="detail-text" style="border-right: 4px solid #ffc107; background: rgba(255, 193, 7, 0.05); margin: 0 !important; display: flex; align-items: center; gap: 12px;">
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