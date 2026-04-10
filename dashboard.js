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

// فەنکشن بۆ دیاریکردنی سەرەتا و کۆتایی ڕۆژی ئێستا
function getTodayBounds() {
    // بەدەستهێنانی کاتی ئێستا بە کاتی عێراق (UTC+3) بۆ دیاریکردنی ڕێکەوتی دروست
    const now = new Date();
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

// --- دروستکردنی پەنجەمۆری ڕەقەکاڵا (Hardware Fingerprint) ---
function getHardwareFingerprint() {
    // ١. کۆکردنەوەی سیفاتە فیزیکییەکانی ئامێر
    const hardwareFeatures = [
        navigator.userAgent,
        screen.width + "x" + screen.height,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || '8',
        navigator.platform
    ].join('|');

    let hash = 0;
    for (let i = 0; i < hardwareFeatures.length; i++) {
        hash = ((hash << 5) - hash) + hardwareFeatures.charCodeAt(i);
        hash |= 0;
    }
    
return 'hw-' + Math.abs(hash).toString(36);
}

// --- بەڕێوەبردنی ئایدی ئامێر (Smart Device Manager) ---
function getDeviceID() {
    const fingerprint = getHardwareFingerprint();

    let storedID = localStorage.getItem('device_id');
    // ئەگەر لە ناو LocalStorage هەبوو، هەر ئەوە دەگەڕێنینەوە
    if (storedID && storedID.startsWith(fingerprint)) {
        return storedID;
    }

    // ئەگەر نەبوو یان تێكچووبوو، جارێ تەنها پەنجەمۆرەکە دەگەڕێنینەوە
    // لە DOMContentLoaded دووبارە پشکنینی بۆ دەکەینەوە
    return storedID || fingerprint;
}

// دروستکردنی ئایدی نوێ بۆ یەکەمجار
function generateNewFullID() {
    const fingerprint = getHardwareFingerprint();
    const newID = fingerprint + '-' + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('device_id', newID);
    return newID;

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
        wrapper.style.display = wrapper.style.display === 'none' ? 'block' : 'none';
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
    const { start, end } = getTodayBounds();
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
        arrivalTime.innerText = new Date(checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
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
                const allowedRadius = userProfile.branches.accuracy || 100; // Default to 100m if not set
                isWithinGeofence = distanceToBranch <= allowedRadius;
                
                // Update accuracyArea with distance to branch
                document.getElementById('accuracyArea').innerText = `${translations[currentLang].distBranch}: ${Math.round(distanceToBranch)} m | ${translations[currentLang].limit}: ${allowedRadius} m`;
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

// --- ٤. کرداری هاتن (Check In) ---
async function processCheckIn() {
    const btn = document.getElementById('checkinBtn');
    const txt = document.getElementById('checkinText');

    // پشکنین بۆ ئەوەی بزانین ئایا لەم ڕۆژەدا هیچ تۆمارێکی هەیە (هاتن یان دەرچوون)
    const { start, end } = getTodayBounds();
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
        isWithinGeofence = distanceToBranch <= userProfile.branches.accuracy;
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

    const currentDevice = getDeviceID();
    let status = "on_time"; // بە شێوەی سەرەکی

    // ١. پشکنینی ئامێر
    if (userProfile.device_id && userProfile.device_id !== currentDevice) {
        status = "invalid_device";
    }

    // ٢. پشکنینی لۆکەیشن (ئەگەر بنکەکەی دیاریکرابوو)
    if (userProfile.branches) {
        const distance = calculateDistance(
            userPos.latitude, userPos.longitude,
            userProfile.branches.latitude, userProfile.branches.longitude
        );
        
        if (distance > userProfile.branches.accuracy) {
            status = "outside_location";
        }
    }

    const checkInTime = new Date().toISOString();
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
        isWithinGeofence = distanceToBranch <= userProfile.branches.accuracy;
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
        if (welcomeLabel) welcomeLabel.innerText = profile.full_name;
        
        const roleMap = { 'admin': translations[currentLang].admin, 'employee': translations[currentLang].employee };
        let roleDisplay = roleMap[profile.role] || profile.role;

        // زیادکردنی ووردەکاری بنکە ئەگەر فەرمانبەرەکە بەستراوەتەوە بە بنکەیەکەوە
        if (profile.branches) {
            roleDisplay = `${roleDisplay} ${translations[currentLang].at} ${profile.branches.branch_id} | ${profile.branches.branch_name}`;
        }

        if (roleLabel) roleLabel.innerText = roleDisplay;

        const hardwareFP = getHardwareFingerprint();
        let currentDev = getDeviceID();
        if (!profile.device_id) {
            // حاڵەتی ١: یەکەمجارە ئامێر تۆمار دەکات
            currentDev = generateNewFullID();
            await client
                .from('profiles')
                .update({ device_id: currentDev })
                .eq('id', user.id);
             isDeviceVerified = true;
        } else if (profile.device_id.startsWith(hardwareFP)) {
            // حاڵەتی ٢: Smart Recovery
            // ئەگەر پەنجەمۆری ڕەقەکاڵاکە وەک یەک بوو، ئایدییە تەواوەکە دەگەڕێنینەوە بۆ مۆبایلەکە
            localStorage.setItem('device_id', profile.device_id);
            currentDev = profile.device_id;
            isDeviceVerified = true;
        } else {
            // حاڵەتی ٣: ئامێرەکە جیاوازە و هی کەسێکی ترە
            isDeviceVerified = false;
        }
        
        updateVerifyUI('device', isDeviceVerified, null, isDeviceVerified ? translations[currentLang].verified : translations[currentLang].deviceTaken);

        // ئەگەر ئامێرەکە هەڵە بوو، یەکسەر دوگمەکە ناچالاک بکە
        if (!isDeviceVerified) [document.getElementById('checkinBtn'), document.getElementById('checkoutBtn')].forEach(b => { if(b) b.disabled = true; });
    } else {
        const userName = user.user_metadata?.full_name || user.email.split('@')[0];
        if (welcomeLabel) welcomeLabel.innerText = userName;
    }

    await checkAttendanceStatus();
    await fetchAttendance();
    startTracking();
});

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

async function handleLogout() {
    await client.auth.signOut();
    window.location.href = 'index.html';
}

let currentViewDate = new Date();
let attendanceData = [];

// ١. وەرگرتنی هەموو تۆمارەکانی فەرمانبەر لە سوپابەیس
async function fetchAttendance() {
    const { data, error } = await client
        .from('attendance')
        .select('check_in_time, check_out_time')
        .eq('user_id', currentUser.id);

    if (!error) {
        attendanceData = data;
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
    const days = currentLang === 'ku' ? ["ش", "ی", "د", "س", "چ", "پ", "هـ"] : ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
    days.forEach(d => {
        grid.innerHTML += `<div class="calendar-day-name">${d}</div>`;
    });

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
        const dayDate = new Date(year, month, day);
        const dayOfWeek = dayDate.getDay(); // 0=Sun, 5=Fri, 6=Sat
        
        let className = "calendar-day";
        if (record) className += " has-record";
        if (dayOfWeek === 5 || dayOfWeek === 6) className += " weekend-day";
        if (new Date().toDateString() === dayDate.toDateString()) className += " today";

        const dayEl = document.createElement('div');
        dayEl.className = className;
        dayEl.innerText = day;
        dayEl.onclick = () => showDayDetails(record, dateStr);
        grid.appendChild(dayEl);
    }
}

function showDayDetails(record, dateStr) {
    const modal = document.getElementById('dayDetails');
     document.getElementById('detailDate').innerText = translations[currentLang].date + " " + dateStr;
    if (record) {
         document.getElementById('detailIn').innerHTML = `<i class="fas fa-sign-in-alt" style="color: #22c55e; margin-left: 10px;"></i> ${translations[currentLang].arrival}: <b>${new Date(record.check_in_time).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12: true})}</b>`;
        document.getElementById('detailOut').innerHTML = `<i class="fas fa-sign-out-alt" style="color: #ef4444; margin-left: 10px;"></i> ${translations[currentLang].checkout}: <b>${record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12: true}) : translations[currentLang].notRecorded}</b>`;
    } else {
        document.getElementById('detailIn').innerHTML = `<i class="fas fa-info-circle"></i> ${translations[currentLang].recordNotFound}`;
        document.getElementById('detailOut').innerText = "";
    }
    modal.style.display = 'flex';  // دڵنیابوونەوە لە بەکارهێنانی flex بۆ ناوەندکردنی تەواو
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