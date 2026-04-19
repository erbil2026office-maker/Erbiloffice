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

        // // ڕێگری لە کۆپیکردن و کلیکی ڕاست (ContextMenu) لە هەموو لاپەڕەکاندا
        // document.addEventListener('copy', (e) => e.preventDefault());
        // 
        // // ڕێگری لە کلیلە کورتکراوەکانی پشکنینی کۆد (F12, Ctrl+Shift+I, Ctrl+U)
        // document.addEventListener('keydown', (e) => {
        //     if (e.keyCode === 123 || 
        //         (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) || 
        //         (e.ctrlKey && e.keyCode === 85)) {
        //         e.preventDefault();
        //     }
        // });
        // 
        // document.addEventListener('contextmenu', (e) => {
        //     // ڕێگە بدە تەنها لە ناو خانەکانی نووسین کلیکی ڕاست کار بکات
        //     if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
        // });
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
    const icon = document.querySelector('.eye-icon i');

    if (passInput && icon) {
        // زیادکردنی ئەنیمەیشنێکی بچووک لەکاتی کلیک
        icon.classList.add('eye-icon-anim');
        setTimeout(() => icon.classList.remove('eye-icon-anim'), 300);

        if (passInput.type === 'password') {
            passInput.type = 'text';
            icon.className = 'fas fa-eye-slash active';
        } else {
            passInput.type = 'password';
            icon.className = 'fas fa-eye';
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