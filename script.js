// script.js - فایلی سەرەکی کارپێکردن

// --- ١. ڕێکخستنی سوپابەیس ---
const SUPABASE_URL = 'https://mygqlubvxdbbsygitjuj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Z3FsdWJ2eGRiYnN5Z2l0anVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjA3NzIsImV4cCI6MjA5MTI5Njc3Mn0.bAecJcTMfZEiT1doet_PgH3EEjjAB6juNRoCJlK9qeA';

// --- PWA Logic & Service Worker Registration ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error("SW failed", err));
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // نیشاندانی بانەری پێشنیار دوای ٣ چرکە
    setTimeout(showPwaPrompt, 3000);
});

function showPwaPrompt() {
    const banner = document.getElementById('pwaBanner');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    if (isStandalone) return; // ئەگەر ئەپەکە پێشتر دابەزێنرابوو

    if (banner) {
        banner.classList.add('show');
        if (isIOS) {
            document.getElementById('pwaInstallBtn').style.display = 'none';
            document.getElementById('pwaIosHint').style.display = 'block';
        }
    }
}

document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') hidePwaPrompt();
        deferredPrompt = null;
    }
});

function hidePwaPrompt() {
    document.getElementById('pwaBanner')?.classList.remove('show');
}

// داخستنی بانەرەکە ئەگەر بەکارهێنەر دەستی بە "Handle"ەکەدا هێنا بۆ خوارەوە
document.getElementById('pwaBanner')?.addEventListener('click', (e) => {
    if (e.target.className === 'pwa-handle') hidePwaPrompt();
    // Also hide if the close button is clicked
    if (e.target.closest('.pwa-close-btn')) hidePwaPrompt();
});

// --- Version Check for Forced Refresh ---
async function checkAppVersion() {
    try {
        // Add a cache-buster to ensure we always fetch the latest version.json
        const response = await fetch('version.json?t=' + new Date().getTime());
        const data = await response.json();
        const serverVersion = data.version;
        const clientVersion = localStorage.getItem('app_version');

        if (clientVersion && clientVersion !== serverVersion) {
            showUpdateModal(serverVersion);
            return true; // Indicate that a reload was triggered
        } else if (!clientVersion) {
            // First time load or version not set, store it
            localStorage.setItem('app_version', serverVersion);
        }
    } catch (error) {
        console.error('Failed to check app version:', error);
    }
    return false; // Indicate no reload was triggered
}

function showUpdateModal(newVersion) {
    const modal = document.getElementById('updateModal');
    if (modal) {
        modal.setAttribute('data-new-version', newVersion);
        modal.style.display = 'flex';
    }
}

function forceUpdateApp() {
    const modal = document.getElementById('updateModal');
    const newVersion = modal.getAttribute('data-new-version');
    
    // پارێزگاری لە ڕێکخستنە سەرەکییەکان
    const lang = localStorage.getItem('lang');
    const theme = localStorage.getItem('theme');
    const deviceID = localStorage.getItem('device_id');

    localStorage.clear();

    if (lang) localStorage.setItem('lang', lang);
    if (theme) localStorage.setItem('theme', theme);
    if (deviceID) localStorage.setItem('device_id', deviceID);
    localStorage.setItem('app_version', newVersion);

    window.location.reload(true);
}

// لێرە ناوی گۆڕاوەکەمان گۆڕی بۆ supabaseClient بۆ ئەوەی چیتر تووشی هەڵەی (already declared) نەبیت
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- ٢. دۆخی تاریک و ڕوون (Theme) ---
let currentTheme = localStorage.getItem('theme') || 'light';

function applyTheme() {
    const body = document.documentElement;
    const themeIcon = document.querySelector('.theme-icon');
    const themeBtn = document.getElementById('themeBtn');

    if (currentTheme === 'dark') {
        body.setAttribute('data-theme', 'dark');
        document.body.classList.add('dark-mode');
        if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-moon theme-icon-anim" style="color: #ffffff;"></i>';
    } else {
        body.removeAttribute('data-theme');
        document.body.classList.remove('dark-mode');
        if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-sun theme-icon-anim" style="color: #ff9f43;"></i>';
    }
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', currentTheme);
    applyTheme();
}

// دڵنیابوونەوە لەوەی کاتێک لاپەڕەکە کرایەوە Theme جێبەجێ دەبێت
document.addEventListener('DOMContentLoaded', async () => {
    const reloadTriggered = await checkAppVersion();
    if (!reloadTriggered) {
        applyTheme();

        // Update current year
        const year = new Date().getFullYear();
        document.querySelectorAll('.current-year').forEach(el => el.innerText = year);
        
        // چالاککردنی کلیلی Enter بۆ چوونەژوورەوە
        const loginInputs = document.querySelectorAll('#email, #password');
        loginInputs.forEach(input => {
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
        });

        // ڕێگری لە کۆپیکردن و کلیکی ڕاست (ContextMenu) لە هەموو لاپەڕەکاندا
        document.addEventListener('copy', (e) => e.preventDefault());
        document.addEventListener('contextmenu', (e) => {
            // ڕێگە بدە تەنها لە ناو خانەکانی نووسین کلیکی ڕاست کار بکات
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
        });
    }
});

// --- ٣. فانکشنەکانی لاپەڕەی چوونەژوورەوە ---

// --- Language Dropdown Toggle ---
function toggleLangDropdown(event) {
    if (event) event.stopPropagation();
    const dropdownContent = document.querySelector('.lang-dropdown-content');
    if (dropdownContent) {
        dropdownContent.classList.toggle('show');
    }
}

document.addEventListener('click', () => {
    const dropdownContent = document.querySelector('.lang-dropdown-content');
    if (dropdownContent) dropdownContent.classList.remove('show');
});

// Close the dropdown if the user clicks outside of it
document.addEventListener('click', function(event) {
    const dropdownContent = document.querySelector('.lang-dropdown-content');
    if (dropdownContent && dropdownContent.classList.contains('show')) {
        dropdownContent.classList.remove('show');
    }
});

function togglePassword() {
    const passInput = document.getElementById('password');
    const eyeIconSpan = document.querySelector('.eye-icon'); // Select the span element
    const eyeIconSvg = eyeIconSpan ? eyeIconSpan.querySelector('svg') : null; // Select the SVG inside the span

    if (passInput && eyeIconSpan && eyeIconSvg) {
        if (passInput.type === 'password') {
            passInput.type = 'text';
            eyeIconSvg.innerHTML = '<path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-4.143 1.12l.57.57a3.501 3.501 0 0 1-4.743-4.743l.57.57a2.5 2.5 0 0 0 3.603 3.603z"/><path d="M12.457 13.359c-1.518 1.708-3.237 2.641-4.457 2.641-5 0-8-5.5-8-5.5a7.028 7.028 0 0 1 1.053-1.638L.15 7.15a.5.5 0 0 1 .708-.708l12.303 12.303a.5.5 0 0 1-.708.708l-1.457-1.457z"/>';
            eyeIconSpan.classList.add('eye-slash-active'); // Add class for specific color
        } else {
            passInput.type = 'password';
            eyeIconSvg.innerHTML = '<path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>';
            eyeIconSpan.classList.remove('eye-slash-active'); // Remove class
        }
    }
}

async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = document.getElementById('loginBtn');
    const loader = document.getElementById('loader');
    const btnText = document.getElementById('btnText');
    const errorMsg = document.getElementById('error-msg');

    errorMsg.style.display = 'none';

    if (!email || !password) {
        errorMsg.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <span>${translations[currentLang].errorEmpty}</span>`;
        errorMsg.style.display = 'flex';
        return;
    }

    // دەستپێکردنی لۆدینگ و گۆڕینی تێکستی دوگمەکە
    btn.disabled = true;
    loader.style.display = 'block';
    if (btnText) btnText.innerText = translations[currentLang].waitText;

    try {
        // بەکارهێنانی supabaseClient بۆ چوونەژوورەوە
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            // ئەگەر هەڵەیەک هەبوو لە لایەن سوپابەیسەوە
            const msg = currentLang === 'ku' ? "ئیمەیڵ یان پاسوۆرد هەڵەیە!" : "البريد الإلكتروني أو كلمة المرور غير صحيحة!";
            errorMsg.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span>${msg}</span>`;
            errorMsg.style.display = 'flex';
            
            // گەڕاندنەوەی دوگمەکە بۆ دۆخی ئاسایی
            btn.disabled = false;
            loader.style.display = 'none';
            btnText.innerText = translations[currentLang].loginBtnText;
        } else {
            // پشکنینی ڕۆڵی بەکارهێنەر لە خشتەی profiles
            const { data: profile, error: profileError } = await supabaseClient
                .from('profiles')
                .select('role')
                .eq('id', data.user.id)
                .single();

            if (!profileError && profile && profile.role === 'admin') {
                window.location.href = "admin_dashboard.html";
            } else {
                window.location.href = "dashboard.html";
            }
        }
    } catch (err) {
        console.error("Unexpected error:", err);
        btn.disabled = false;
        loader.style.display = 'none';
        btnText.innerText = translations[currentLang].loginBtnText;
    }
}