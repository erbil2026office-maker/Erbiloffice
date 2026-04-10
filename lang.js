// lang.js - فایلی تایبەت بە زمانەکان و وەرگێڕان

const translations = {
    ku: {
        title: "ERBIL OFFICE - IHEC",
        subtitle: "سیستەمی هاتن و دەرچوونی فەرمانبەران",
        emailLabel: "ئیمەیڵ",
        passLabel: "تێپەڕەوشە (پاسوۆرد)",
        loginBtnText: "چوونە ژوورەوە",
        waitText: "چاوەڕێ بکە...",
        errorEmpty: "تکایە ئیمەیڵ و پاسوۆرد بنووسە!",
        login_error: "ئیمەیڵ یان وشەی تێپەڕ هەڵەیە!",
        logout: "چوونە دەرەوە",
        employee: "فەرمانبەر",
        admin: "بەڕێوەبەر",
        clockLoading: "باردەکرێت...",
        arrival: "ئامادەبوون",
        device: "ئامێر",
        location: "لۆکەیشن",
        verifying: "پشکنین...",
        checkin: "ئامادە بوون",
        checkout: "دەرچوون",
        history: "مێژووی هاتن و دەرچوونەکانت",
        month: "مانگ",
        confirmTitle: "دڵنیایت؟",
        confirmMsg: "ئایا دەتەوێت ئەم کردارە ئەنجام بدەیت؟",
        no: "نەخێر",
        yes: "بەڵێ، دڵنیام",
        date: "ڕێکەوت",
        close: "داخستن",
        at: "لە",
        verified: "ناسراوە",
        unverified: "نەناسراوە",
        suitable: "گونجاوە",
        notSuitable: "لۆکەیشن گونجاو نییە",
        gpsWeak: "شوێن ورد نییە",
        searching: "چاوەڕوانبە...",
        errorFetch: "هەڵە لە پشکنین",
        distBranch: "دووری لە بنکە",
        limit: "سنوور",
        gpsAcc: "وردی GPS",
        confInTitle: "تۆمارکردنی هاتن",
        confInMsg: "ئایا دڵنیایت لە تۆمارکردنی ئامادەبوونی ئێستات؟",
        confOutTitle: "تۆمارکردنی دەرچوون",
        confOutMsg: "ئایا دڵنیایت دەتەوێت دەرچوون تۆمار بکەیت؟",
        msgLocErr: "هەڵە: زانیاری لۆکەیشن یان بەکارهێنەر بەردەست نییە.",
        msgBranchErr: "هەڵە: زانیاری بنکەی کارکردن بەردەست نییە.",
        msgAccErr: "هەڵە: وردی لۆکەیشنەکەت گونجاو نییە. تکایە هەوڵ بدەرەوە.",
        msgOutsideErr: "هەڵە: تۆ لە دەرەوەی سنووری بنکەی کارکردنی خۆتیت.",
        msgOutLocErr: "هەڵە: لۆکەیشنەکەت گونجاو نییە بۆ دەرچوون. تکایە هەوڵ بدەرەوە.",
        msgInSuccess: "ئامادەبوونت تۆمار کرا!",
        msgOutSuccess: "دەرچوونەکەت تۆمار کرا. کاتێکی خۆش!",
        recordNotFound: "هیچ تۆمارێک بۆ ئەم ڕۆژە نییە",
        retryBtn: "دووبارە پشکنین",
        notRecorded: "تۆمار نەکراوە", 
        months: ["کانوونی دووەم", "شوبات", "ئازار", "نیسان", "ئایار", "حوزەیران", "تەمموز", "ئاب", "ئەیلوول", "تشرینی یەکەم", "تشرینی دووەم", "کانوونی یەکەم"],
        weekdays: ["یەکشەممە", "دووشەممە", "سێشەممە", "چوارشەممە", "پێنجشەممە", "هەینی", "شەممە"],
        noLocSupport: "وێبگەڕەکەت لۆکەیشن پشتگیری ناکات",
        invalidDevice: "ئامێر نەناسراوە",
        noBranch: "زانیاری بنکە نییە",
        waitRecord: "تۆمارکردن...",
        deviceTaken: "ئامێری پێشوو نییە",
        alreadyCheckedIn: "تۆ پێشتر هاتنت تۆمار کردووە و دەرنەچوویت.",
        dailyLimitReached: "سوپاس بۆ پابەندی ئەمڕۆت ، کاتێکی خۆش!",
        updateTitle: "وەشانی نوێ بەردەستە",
        updateMsg: "چەندین گۆڕانکاری و چاکسازی نوێ ئەنجامدراوە بۆ باشترکردنی ئەزموونی بەکارهێنانت.",
        updateBtn: "ئێستا نوێی بکەرەوە",
        pwaTitle: "دابەزاندنی ئەپ",
        pwaDesc: "بۆ ئەزموونێکی باشتر و خێراتر، ئەپەکە بخەرە سەر شاشەی سەرەکی.",
        pwaInstall: "دابەزاندن",
        pwaIOSMsg: "کلیک لە 'Share' بکە و پاشان 'Add to Home Screen' هەڵبژێرە.",
        changeTheme: "گۆڕینی ڕەنگ (تێم)",
        justification: "ڕوونکردنەوەی فەرمی",
        vpnError: "هەڵە: VPN چالاک کراوە! تکایە بیکوژێنەرەوە بۆ ئەوەی بتوانیت هاتن و دەرچوون تۆمار بکەیت.",
        adminDashboardTitle: "کۆمسیۆنی باڵای سەربەخۆی هەڵبژاردنەکان - هەولێر",
        generalOffice: "سیستەمی چاودێری دەوامی فەرمانبەران لە ئۆفیسی پارێزگای هەولێر",
        adminLabel: " چاودێران :",
        earlyIn: "پێش 8:30 (هاتن)",
        midIn: "8:30 - 9:00 (هاتن)",
        veryLateInAdmin: "دوای 9:00 (هاتن)",
        absentStat: "نەهاتوو (Absent)",
        earlyOutAdmin: "پێش 2:30 (دەرچوون)",
        onTimeOutAdmin: "دوای 2:30 (دەرچوون)",
        noExitStat: "دەرنەچوو (No Exit)",
        searchName: "گەڕان بەپێی ناو",
        searchPlaceholder: "ناوی فەرمانبەر بنووسە...",
        branchLabel: "بنکە",
        allBranches: "هەموو بنکەکان",
        statusLabel: "دۆخی ئامادەبوون",
        allStatus: "هەموو دۆخەکان",
        printReport: "پرێنتکردن",
        attendanceListTitle: "لیستی ئامادەبووان",
        colName: "ناوی فەرمانبەر",
        colBranch: "ژمارە | بنکە",
        colTime: "کاتی (هاتن / دەرچوون)",
        colStatus: "دۆخی ئێستا",
        colClass: "پۆڵێن",
        colJust: "ڕوونکردنەوە",
        statusPresent: "ئامادەبوو",
        statusAbsent: "نەهاتوو",
        countPerson: "کەس",
        noJustRecorded: "بۆ ئەم ڕێکەوتە هیچ ڕوونکردنەوەیەک نەنووسراوە.",
        justificationOf: "ڕوونکردنەوەی:",
        mockLocationError: "هەڵە: لۆکەیشنی ساختە (Fake GPS) دۆزرایەوە! تکایە ئەپەکان بکوژێنەرەوە.",
        saveJustification: "ناردنی ڕوونکردنەوە",
        editJustification: "دەستکاریکردنی ڕوونکردنەوە",
        justificationPlaceholder: "هۆکاری درەنگ هاتن یان نەهاتن لێرە بنووسە...",
        justificationSuccess: "ڕوونکردنەوەکەت بە سەرکەوتوویی تۆمار کرا.",
        print: "چاپکردن"
    },
    ar: {
        title: "ERBIL OFFICE - IHEC",
        subtitle: " نظام الحضور والانصراف للموظفين",
        emailLabel: "البريد الإلكتروني",
        passLabel: "كلمة المرور",
        loginBtnText: "تسجيل الدخول",
        waitText: "يرجى الانتظار...",
        errorEmpty: "يرجى إدخال البريد الإلكتروني وكلمة المرور!",
        login_error: "البريد الإلكتروني أو كلمة المرور غير صحيحة!",
        logout: "تسجيل الخروج",
        employee: "موظف",
        admin: "مدير",
        clockLoading: "جاري التحميل...",
        arrival: "الحضور",
        device: "الجهاز",
        location: "الموقع",
        verifying: "جاري التحقق...",
        checkin: "تسجيل حضور",
        checkout: "انصراف",
        history: "سجل الحضور والانصراف",
        month: "الشهر",
        confirmTitle: "هل أنت متأكد؟",
        confirmMsg: "هل تريد إجراء هذه العملية؟",
        no: "لا",
        yes: "نعم، أنا متأكد",
        date: "التاريخ",
        close: "إغلاق",
        at: "في",
        verified: "معروف",
        unverified: "غير معروف",
        suitable: "مناسب",
        notSuitable: "الموقع غير مناسب",
        gpsWeak: "الموقع غير دقيق",
        searching: "انتظر قليلاً...",
        errorFetch: "خطأ في التحقق",
        distBranch: "المسافة عن المركز",
        limit: "الحد",
        gpsAcc: "دقة GPS",
        confInTitle: "تسجيل الحضور",
        confInMsg: "هل أنت متأكد من تسجيل حضورك الآن؟",
        confOutTitle: "تسجيل الانصراف",
        confOutMsg: "هل أنت متأكد من تسجيل انصرافك؟",
        msgLocErr: "خطأ: معلومات الموقع أو المستخدم غير متوفرة.",
        msgBranchErr: "خطأ: معلومات موقع العمل غير متوفرة.",
        msgAccErr: "خطأ: دقة موقعك غير كافية. يرجى المحاولة مرة أخرى.",
        msgOutsideErr: "خطأ: أنت خارج حدود موقع عملك.",
        msgOutLocErr: "خطأ: موقعك غير مناسب لتسجيل الانصراف. يرجى المحاولة مرة أخرى.",
        msgInSuccess: "تم تسجيل حضورك بنجاح!",
        msgOutSuccess: "تم تسجيل انصرافك. طاب يومك!",
        recordNotFound: "لا يوجد سجل لهذا اليوم",
        retryBtn: "إعادة التحقق",
        notRecorded: "لم يتم التسجيل", 
        months: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
        weekdays: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
        noLocSupport: "متصفحك لا يدعم الموقع",
        invalidDevice: "جهاز غير معروف",
        noBranch: "لا توجد معلومات عن الفرع",
        waitRecord: "جاري التسجيل...",
        deviceTaken: "الجهاز غير متوفر",
        alreadyCheckedIn: "لقد سجلت حضورك بالفعل ولم تسجل انصرافك بعد.",
        dailyLimitReached: "شكراً لالتزامك اليوم، طاب يومك!",
        updateTitle: "تحديث جديد متاح",
        updateMsg: "تم إجراء العديد من التغييرات والتحسينات الجديدة لتحسين تجربتك.",
        updateBtn: "تحديث الآن",
        pwaTitle: "تثبيت التطبيق",
        pwaDesc: "للحصول على تجربة أفضل وأسرع، قم بتثبيت التطبيق على شاشتك الرئيسية.",
        pwaInstall: "تثبيت",
        pwaIOSMsg: "اضغط على 'Share' ثم اختر 'Add to Home Screen'.",
        changeTheme: "تغيير المظهر",
        justification: "تبرير رسمي",
        vpnError: "خطأ: تم اكتشاف VPN! يرجى إيقاف تشغيله لتتمكن من تسجيل الحضور والانصراف.",
        adminDashboardTitle: "المفوضیة العليا المستقلة للانتخابات - أربيل",
        generalOffice: "نظام مراقبة دوام الموظفين في مكتب محافظة أربيل",
        adminLabel: "المراقبون :",
        earlyIn: "قبل 8:30 (دخول)",
        midIn: "8:30 - 9:00 (دخول)",
        veryLateInAdmin: "بعد 9:00 (دخول)",
        absentStat: "غائب (Absent)",
        earlyOutAdmin: "قبل 2:30 (خروج)",
        onTimeOutAdmin: "بعد 2:30 (خروج)",
        noExitStat: "لم يخرج (No Exit)",
        searchName: "بحث بالاسم",
        searchPlaceholder: "اكتب اسم الموظف...",
        branchLabel: "المركز",
        allBranches: "كل المراكز",
        statusLabel: "حالة الحضور",
        allStatus: "كل الحالات",
        printReport: "طباعة التقرير",
        attendanceListTitle: "قائمة الحضور",
        colName: "اسم الموظف",
        colBranch: "الرقم | المركز",
        colTime: "وقت (الدخول / الخروج)",
        colStatus: "الحالة الحالية",
        colClass: "التصنيف",
        colJust: "التبرير",
        statusPresent: "حاضر",
        statusAbsent: "غائب",
        countPerson: "أشخاص",
        noJustRecorded: "لا يوجد تبرير مسجل لهذا التاريخ.",
        justificationOf: "تبرير:",
        mockLocationError: "خطأ: تم اكتشاف موقع وهمي (Fake GPS)! يرجى إيقاف تشغيل التطبيقات.",
        saveJustification: "إرسال التبرير",
        editJustification: "تعديل التبرير",
        justificationPlaceholder: "اكتب سبب التأخير أو الغياب هنا...",
        justificationSuccess: "تم تسجيل التبرير بنجاح.",
        print: "طباعة"
    }
};

let currentLang = localStorage.getItem('lang') || 'ku';

function applyLanguage() {
    document.documentElement.lang = currentLang;
    const langBtn = document.getElementById('current-lang-text');
    const flag = document.getElementById('current-flag');
    
    if (langBtn && flag) {
        if (currentLang === 'ku') {
            langBtn.innerText = 'کوردی';
            if (flag.tagName === 'IMG') flag.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Flag_of_Kurdistan.svg/40px-Flag_of_Kurdistan.svg.png';
            else flag.className = 'flag-icon flag-ku';
        } else {
            langBtn.innerText = 'العربية';
            if (flag.tagName === 'IMG') flag.src = 'https://flagcdn.com/w40/iq.png';
            else flag.className = 'flag-icon flag-ar';
        }
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = translations[currentLang][key];
        if (translation) {
            if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.hasAttribute('placeholder')) {
                el.placeholder = translation;
            } else if (el.hasAttribute('aria-label')) {
                el.setAttribute('aria-label', translation);
            } else if (el.hasAttribute('title')) {
                el.setAttribute('title', translation);
            } else {
                el.innerText = translation;
            }
        }
    });
}

function setLang(lang) { // Renamed from selectLanguage to setLang as per index.html
    currentLang = lang;
    localStorage.setItem('lang', currentLang);
    applyLanguage();
    document.getElementById('dropdown-options').classList.remove('show');
}

document.addEventListener('DOMContentLoaded', applyLanguage);