const sbURL = 'https://mygqlubvxdbbsygitjuj.supabase.co';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Z3FsdWJ2eGRiYnN5Z2l0anVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjA3NzIsImV4cCI6MjA5MTI5Njc3Mn0.bAecJcTMfZEiT1doet_PgH3EEjjAB6juNRoCJlK9qeA';
const supabaseClientSettings = supabase.createClient(sbURL, sbKey);

document.addEventListener('DOMContentLoaded', async () => {
    // ١. بەکارهێنانی getSession لەبری getUser بۆ ئەوەی یەکسەر و بەبێ چاوەڕوانی سێرڤەر ناوەڕۆکەکە نیشان بدات
    const { data: { session } } = await supabaseClientSettings.auth.getSession();
    const user = session?.user;

    if (!user) {
        window.location.replace('index.html');
        return;
    }

    // ٢. نیشاندانی ناوەڕۆک تەنها بۆ کەسی ڕێپێدراو
    const content = document.getElementById('settingsContent');
    if (content) content.style.display = 'block';

    const ver = localStorage.getItem('app_version');
    if (ver) document.getElementById('appVersion').innerText = 'v' + ver;
    updateActiveLangUI();

    // ٣. کاشکردنی فایلەکانی ڕێکخستن بۆ خێراکردن (Browser Caching)
    cacheSettingsAssets();
});

async function cacheSettingsAssets() {
    if ('caches' in window) {
        try {
            const cache = await caches.open('ihec-settings-v1');
            await cache.addAll([
                'settings.html',
                'settings.css',
                'settings.js',
                'style.css',
                'lang.js'
            ]);
        } catch (err) {
            console.log('Cache failed:', err);
        }
    }
}

function showConfirmModal() {
    const oldPass = document.getElementById('oldPassword').value;
    if (!oldPass) {
        showToast(translations[currentLang].errorOldPass, 'error');
        return;
    }
    document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
}

window.addEventListener('languageChanged', () => {
    updateActiveLangUI();
});

function togglePassVisibility(id) {
    const input = document.getElementById(id);
    const icon = input.parentElement.querySelector('.eye-icon i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

function checkPasswordStrength() {
    const pass = document.getElementById('newPassword').value;
    const bar = document.getElementById('strengthBar');
    const label = document.getElementById('strengthText');
    const meterContainer = document.querySelector('.strength-meter');
    const t = translations[currentLang];

    if (pass.length === 0) {
        meterContainer.style.display = 'none';
        label.style.display = 'none';
        return;
    }

    meterContainer.style.display = 'block';
    label.style.display = 'inline-flex';

    let strength = 0;
    if (pass.length >= 8) strength += 25;
    if (/[A-Z]/.test(pass)) strength += 25;
    if (/[0-9]/.test(pass)) strength += 25;
    if (/[^A-Za-z0-9]/.test(pass)) strength += 25;

    bar.style.width = strength + '%';
    bar.className = 'bar'; // Reset classes
    label.className = 'strength-label'; // Reset classes

    if (strength <= 25) {
        bar.classList.add('weak');
        label.classList.add('weak');
        label.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        label.innerText = t.weak;
    } else if (strength <= 50) {
        bar.classList.add('medium');
        label.classList.add('medium');
        label.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
        label.innerText = t.medium;
    } else if (strength <= 75) {
        bar.classList.add('strong');
        label.classList.add('strong');
        label.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
        label.innerText = t.strong;
    } else {
        bar.classList.add('very-strong');
        label.classList.add('very-strong');
        label.style.backgroundColor = 'rgba(14, 165, 233, 0.1)';
        label.innerText = t.veryStrong;
    }
    checkPasswordMatch();
}

function updateActiveLangUI() {
    const current = localStorage.getItem('lang') || 'ku';
    document.querySelectorAll('.lang-option-btn').forEach(btn => btn.classList.remove('active-lang'));
    const activeBtn = current === 'ku' ? document.getElementById('langKu') : document.getElementById('langAr');
    
    // Reset all buttons first
    document.querySelectorAll('.lang-option-btn').forEach(btn => {
        btn.style.borderColor = 'var(--border-color)';
        btn.style.background = 'var(--input-bg)';
    });

    if (activeBtn) {
        activeBtn.style.borderColor = 'var(--primary)';
        activeBtn.style.background = 'rgba(var(--primary-rgb), 0.1)';
    }
    
    // دووبارە بانگکردنەوەی هێزی پاسوۆرد بۆ وەرگێڕانی تێکستەکە ئەگەر هەبوو
    checkPasswordStrength();
}

function checkPasswordMatch() {
    const oldPass = document.getElementById('oldPassword').value;
    const pass = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    const feedback = document.getElementById('matchFeedback');
    const btn = document.getElementById('updatePassBtn');

    if (!confirm) {
        feedback.style.display = 'none';
    } else {
        feedback.style.display = 'flex';
        if (pass === confirm && pass.length >= 6) {
            feedback.className = 'match-feedback match-success';
            feedback.querySelector('span').innerText = translations[currentLang].passMatch;
            feedback.querySelector('i').className = 'fas fa-check-circle';
        } else {
            feedback.className = 'match-feedback match-error';
            feedback.querySelector('span').innerText = translations[currentLang].passNotMatch;
            feedback.querySelector('i').className = 'fas fa-times-circle';
        }
    }

    // پشکنینی سێ مەرجەکە بۆ چالاککردنی دوگمەکە
    const isOldPassFilled = oldPass.trim().length > 0;
    const isNewPassValid = pass.length >= 6;
    const isMatching = pass === confirm;

    // دوگمەکە تەنها کاتێک کارا دەبێت کە هەر سێ مەرجەکە ڕاست بن
    btn.disabled = !(isOldPassFilled && isNewPassValid && isMatching);
}

async function updatePassword() {
    const oldPass = document.getElementById('oldPassword').value;
    const pass = document.getElementById('newPassword').value;
    const btn = document.getElementById('updatePassBtn');
    const modal = document.getElementById('confirmModal');
    
    if (!oldPass) {
        showToast(translations[currentLang].errorOldPass, 'error');
        return;
    }

    closeConfirmModal();
    btn.disabled = true;

    // پشکنینی تێپەڕەوشەی کۆن بە دووبارە لۆگین کردن
    const { data: { user } } = await supabaseClientSettings.auth.getUser();
    const { error: signInError } = await supabaseClientSettings.auth.signInWithPassword({
        email: user.email,
        password: oldPass
    });

    if (signInError) {
        showToast(translations[currentLang].errorOldPassWrong, 'error');
        btn.disabled = false;
        return;
    }

    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${translations[currentLang].waitText}`;
    const { error } = await supabaseClientSettings.auth.updateUser({ password: pass });
    
    if (error) {
        showToast(error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-key"></i> ${translations[currentLang].changePasswordBtn}`;
    } else {
        showToast(translations[currentLang].passChangedSuccess, 'success');
        setTimeout(() => window.location.href = 'dashboard.html', 2000);
    }
}

function showToast(msg, type) {
    const toast = document.getElementById('error-msg');
    toast.innerText = msg;
    toast.className = 'status-toast ' + (type === 'success' ? 'success' : 'error');
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}

async function handleLogout() {
    await supabaseClientSettings.auth.signOut();
    window.location.href = 'index.html';
}

function goBackToDashboard() {
    // چالاککردنی ئەنیمەیشنی سڵاید بۆ لای ڕاست
    document.body.classList.add('page-slide-out-right');
    
    // گواستنەوە بۆ داشبۆرد دوای تەواوبوونی ئەنیمەیشنەکە
    setTimeout(() => {
        window.location.href = 'dashboard.html';
    }, 450);
}