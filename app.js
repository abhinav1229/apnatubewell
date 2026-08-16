import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-analytics.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyASCIXAtR-8kOeH1N34_XrFGVapRrvD5sk",
    authDomain: "apnatubewell.firebaseapp.com",
    projectId: "apnatubewell",
    storageBucket: "apnatubewell.firebasestorage.app",
    messagingSenderId: "944312772907",
    appId: "1:944312772907:web:843d76a7a08f8a913c7d6e",
    measurementId: "G-YRRRBHG9BZ"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

/* --- CUSTOM TOAST NOTIFICATIONS (Replaces alert) --- */
window.showToast = function (message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // SVG icons based on type
    let iconSvg = '';
    if (type === 'success') iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    else if (type === 'error') iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    else iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300); // Wait for hide animation
    }, 3000);
}

/* --- THEME TOGGLE (DARK/LIGHT) --- */
const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', currentTheme);
if (currentTheme === 'dark') themeToggle.checked = true;

themeToggle.addEventListener('change', (e) => {
    const targetTheme = e.target.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('theme', targetTheme);
});


/* --- LOCALIZATION & FONTS --- */
const locales = {
    en: {
        appTitle: "Apna Tubewell",
        completeProfile: "Complete Your Profile",
        appSubtitle: "Khet ke paani ka poora hisab, ab mobile par.",
        mobileNumber: "Mobile Number", login: "Send OTP", enterOtp: "Enter OTP", verifyLogin: "Verify & Login",
        ownerAccount: "Owner Account", greeting: "Namaste, Ram Bhai 👋",
        todaySummary: "Today's Summary", waterUsed: "Water Used", revenue: "Revenue", received: "Received", pending: "Pending",
        quickActions: "Quick Actions", paaniHisab: "Paani Ka Hisab", payment: "Payment", pendingPayments: "Pending Payments",
        navHome: "Home", navCustomers: "Customers", navBahi: "Bahi",
        customer: "Customer", startTime: "Start Time", endTime: "End Time", duration: "Duration", rate: "Rate", totalAmount: "Total Amount", save: "Save Record"
    },
    hi: {
        appTitle: "अपना ट्यूबवेल",
        completeProfile: "अपनी प्रोफाइल पूरी करें",
        appSubtitle: "खेत के पानी का पूरा हिसाब, अब मोबाइल पर।",
        mobileNumber: "मोबाइल नंबर", login: "OTP भेजें", enterOtp: "OTP दर्ज करें", verifyLogin: "वेरिफाई और लॉगिन करें",
        ownerAccount: "मालिक खाता", greeting: "नमस्ते, राम भाई 👋",
        todaySummary: "आज का सारांश", waterUsed: "पानी लगा", revenue: "कुल कमाई", received: "प्राप्त हुआ", pending: "बाकी",
        quickActions: "तुरंत कार्य", paaniHisab: "पानी का हिसाब", payment: "भुगतान", pendingPayments: "बाकी भुगतान",
        navHome: "होम", navCustomers: "ग्राहक", navBahi: "बही-खाता",
        customer: "ग्राहक चुनें", startTime: "शुरू का समय", endTime: "बंद का समय", duration: "कुल समय", rate: "रेट", totalAmount: "कुल राशि", save: "सेव करें"
    }
};

let currentLang = 'en';

function setLanguage(lang) {
    currentLang = lang;

    // Apply Font Change (Toggles class on body)
    if (lang === 'hi') {
        document.body.classList.add('lang-hi');
    } else {
        document.body.classList.remove('lang-hi');
    }

    // Translate Text
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (locales[lang][key]) el.innerText = locales[lang][key];
    });

    // Update active states for toggles
    document.getElementById('login-en').classList.toggle('active', lang === 'en');
    document.getElementById('login-hi').classList.toggle('active', lang === 'hi');
    if (document.getElementById('btn-en')) document.getElementById('btn-en').classList.toggle('active', lang === 'en');
    if (document.getElementById('btn-hi')) document.getElementById('btn-hi').classList.toggle('active', lang === 'hi');
}

document.getElementById('login-en').addEventListener('click', () => setLanguage('en'));
document.getElementById('login-hi').addEventListener('click', () => setLanguage('hi'));
// If you add the floating toggle back later
if (document.getElementById('btn-en')) document.getElementById('btn-en').addEventListener('click', () => setLanguage('en'));
if (document.getElementById('btn-hi')) document.getElementById('btn-hi').addEventListener('click', () => setLanguage('hi'));


/* --- NAVIGATION ROUTING (BOTTOM NAV) --- */
const navItems = document.querySelectorAll('.bottom-nav .nav-item');
const views = document.querySelectorAll('.main-view');

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();

        // Remove active from all navs
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        // Hide all views, show target view
        const targetId = item.getAttribute('data-target');
        views.forEach(view => view.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');

        // Optional: Scroll to top smoothly on tab change
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});


/* --- FIREBASE OTP BYPASS (Testing setup) --- */
// Quick Testing Bypass - No Firebase Auth involved to save quota
document.getElementById('send-otp-btn').addEventListener('click', () => {
    const phoneInput = document.getElementById('login-phone').value;

    if (phoneInput.length === 10) {
        showToast(currentLang === 'en' ? "Login Successful!" : "लॉगिन सफल!", "success");
        document.getElementById('login-screen').classList.remove('active');

        const ownerInfo = localStorage.getItem('owner_info');
        if (ownerInfo) {
            document.getElementById('app-shell').style.display = 'block';
            loadOwnerData();
        } else {
            document.getElementById('basic-info-screen').classList.add('active');
        }
    } else {
        showToast(currentLang === 'en' ? "Enter valid 10 digit number" : "सही 10 अंकों का नंबर दर्ज करें", "error");
    }
});

/* --- PROFILE EDIT --- */
window.toggleProfileEdit = function (show) {
    document.getElementById('profile-view-mode').style.display = show ? 'none' : 'block';
    document.getElementById('profile-edit-mode').style.display = show ? 'block' : 'none';
}

window.saveProfile = function () {
    const name = document.getElementById('edit-profile-name').value.trim();
    const business = document.getElementById('edit-profile-business').value.trim();

    if (!name || !business) {
        showToast(currentLang === 'en' ? "Please fill all fields" : "सभी फील्ड भरें", "error");
        return;
    }

    localStorage.setItem('profile_name', name);
    localStorage.setItem('profile_business', business);

    document.getElementById('profile-name-display').innerText = name;
    document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + name + ' 👋';
    document.getElementById('profile-business-display').innerText = business;

    toggleProfileEdit(false);
    showToast(currentLang === 'en' ? "Profile Updated!" : "प्रोफाइल अपडेट हो गई!", "success");
}

// Load saved profile on init
const savedOwner = localStorage.getItem('owner_info');
if (savedOwner) {
    const data = JSON.parse(savedOwner);
    document.getElementById('profile-name-display').innerText = data.name;
    document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + data.name + ' 👋';
    document.getElementById('edit-profile-name').value = data.name;
}
const savedTw = localStorage.getItem('tubewell_data');
if (savedTw) {
    const data = JSON.parse(savedTw);
    document.getElementById('profile-business-display').innerText = data.name;
    document.getElementById('edit-profile-business').value = data.name;
}


/* --- MODALS --- */
window.openModal = function (id) {
    document.getElementById(id).classList.add('active');
}
window.closeModal = function (id) {
    document.getElementById(id).classList.remove('active');
}


/* --- WATER CALCULATION (CORE FEATURE) --- */
const timeStart = document.getElementById('time-start');
const timeEnd = document.getElementById('time-end');
const calcDuration = document.getElementById('calc-duration');
const calcTotal = document.getElementById('calc-total');
function getRate() {
    const tw = JSON.parse(localStorage.getItem('tubewell_data') || '{}');
    return tw.rate || 150;
}
let RATE_PER_HOUR = getRate();

function calculateWaterUsage() {
    const start = timeStart.value;
    const end = timeEnd.value;
    if (!start || !end) return;

    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(`${today}T${start}`);
    let endDate = new Date(`${today}T${end}`);

    if (endDate < startDate) endDate.setDate(endDate.getDate() + 1);

    const diffInMs = endDate - startDate;
    const diffInHours = diffInMs / (1000 * 60 * 60);

    calcDuration.innerText = `${diffInHours.toFixed(2)} Hrs`;
    const rate = getRate();
    const totalAmount = diffInHours * rate;
    document.getElementById('calc-rate').innerText = `₹${rate} / hr`;
    calcTotal.innerText = `₹${Math.round(totalAmount)}`;
}

timeStart.addEventListener('change', calculateWaterUsage);
timeEnd.addEventListener('change', calculateWaterUsage);


/* --- SAVE DATA LOGIC --- */
document.getElementById('save-water-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-water-btn');
    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        const amountString = calcTotal.innerText.replace('₹', '');
        const amount = parseFloat(amountString);

        const payload = {
            business_id: "demo_owner_123",
            customer_id: document.getElementById('water-customer').value,
            start_time: timeStart.value,
            end_time: timeEnd.value,
            duration: parseFloat(calcDuration.innerText),
            rate: getRate(),
            amount: amount,
            created_at: serverTimestamp()
        };

        // Writes to firestore
        await addDoc(collection(db, "water_usage"), payload);

        showToast(currentLang === 'en' ? "Record Saved Successfully!" : "हिसाब सफलता से सेव हो गया!", "success");
        closeModal('water-modal');

    } catch (e) {
        console.error(e);
        showToast("Error saving data to cloud.", "error");
    } finally {
        btn.innerText = locales[currentLang].save;
        btn.disabled = false;
    }
});

/* --- BASIC INFO ONBOARDING --- */
document.getElementById('save-basic-info-btn').addEventListener('click', () => {
    const name = document.getElementById('owner-name').value.trim();
    const village = document.getElementById('owner-village').value.trim();

    if (!name || !village) {
        showToast(currentLang === 'en' ? "Please fill all fields" : "सभी फील्ड भरें", "error");
        return;
    }

    const ownerData = { name, village, phone: document.getElementById('login-phone').value };
    localStorage.setItem('owner_info', JSON.stringify(ownerData));

    document.getElementById('basic-info-screen').classList.remove('active');
    document.getElementById('app-shell').style.display = 'block';
    loadOwnerData();

    showToast(currentLang === 'en' ? "Welcome!" : "स्वागत है!", "success");
});

function loadOwnerData() {
    const data = JSON.parse(localStorage.getItem('owner_info') || '{}');
    if (data.name) {
        document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + data.name + ' 👋';
        document.getElementById('profile-name-display').innerText = data.name;
        document.getElementById('edit-profile-name').value = data.name;
    }
    const tw = JSON.parse(localStorage.getItem('tubewell_data') || '{}');
    if (tw.name) {
        document.getElementById('profile-business-display').innerText = tw.name;
        document.getElementById('edit-profile-business').value = tw.name;
    }
}

function loadTubewellData() {
    const data = JSON.parse(localStorage.getItem('tubewell_data') || '{}');
    if (data.name) {
        document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + (localStorage.getItem('profile_name') || 'Ram Bhai') + ' 👋';
        document.getElementById('calc-rate').innerText = `₹${data.rate} / hr`;
    }
}

/* --- TUBEWELL MANAGEMENT --- */
function renderTubewells() {
    const list = document.getElementById('tubewells-list');
    const primary = JSON.parse(localStorage.getItem('tubewell_data') || '{}');
    const extras = JSON.parse(localStorage.getItem('tubewell_extras') || '[]');
    const all = primary.name ? [primary, ...extras] : extras;

    list.innerHTML = all.map((tw, i) => `
        <div class="list-item">
            <div class="item-info">
                <h4>${tw.name}</h4>
                <p>${tw.location} • ₹${tw.rate}/hr</p>
            </div>
            <span class="role-badge" style="${i === 0 ? '' : 'background: var(--sys-green); color: white;'}">${i === 0 ? 'PRIMARY' : 'ACTIVE'}</span>
        </div>
    `).join('');

    if (all.length === 0) {
        list.innerHTML = '<div class="list-item"><div class="item-info"><p style="color: var(--sys-gray);">No tubewells added yet.</p></div></div>';
    }
}

window.addNewTubewell = function () {
    const name = document.getElementById('new-tw-name').value.trim();
    const location = document.getElementById('new-tw-location').value.trim();
    const rate = parseFloat(document.getElementById('new-tw-rate').value);

    if (!name || !location || !rate) {
        showToast(currentLang === 'en' ? "Please fill all fields" : "सभी फील्ड भरें", "error");
        return;
    }

    const extras = JSON.parse(localStorage.getItem('tubewell_extras') || '[]');
    extras.push({ name, location, rate, createdAt: new Date().toISOString() });
    localStorage.setItem('tubewell_extras', JSON.stringify(extras));

    renderTubewells();
    closeModal('add-tubewell-modal');

    document.getElementById('new-tw-name').value = '';
    document.getElementById('new-tw-location').value = '';
    document.getElementById('new-tw-rate').value = '150';

    showToast(currentLang === 'en' ? "Tubewell Added!" : "ट्यूबवेल जोड़ दिया गया!", "success");
}

// Render on tab switch
const originalNavClick = navItems.forEach;
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        if (item.getAttribute('data-target') === 'view-tubewells') {
            renderTubewells();
        }
    });
});


/* --- CUSTOMER DETAIL VIEW --- */
let currentCustomerId = null;

const customerData = {
    '1': {
        name: 'Ram Lal', phone: '+91 9876543210', village: 'Village XYZ',
        history: [
            { type: 'water', date: '2026-08-15', start: '06:00', end: '08:00', duration: 2, amount: 300, status: 'pending' },
            { type: 'water', date: '2026-08-14', start: '05:30', end: '09:00', duration: 3.5, amount: 525, status: 'pending' },
            { type: 'payment', date: '2026-08-10', amount: 200, note: 'Cash' },
            { type: 'water', date: '2026-08-10', start: '07:00', end: '10:00', duration: 3, amount: 450, status: 'paid' }
        ]
    },
    '2': {
        name: 'Shyam', phone: '+91 9998887776', village: 'Village ABC',
        history: [
            { type: 'water', date: '2026-08-15', start: '06:30', end: '08:00', duration: 1.5, amount: 225, status: 'pending' },
            { type: 'payment', date: '2026-08-12', amount: 100, note: 'UPI' }
        ]
    }
};

window.openCustomerDetail = function (id) {
    currentCustomerId = id;
    const cust = customerData[id];
    if (!cust) return;

    document.getElementById('customer-detail-name').innerText = cust.name;

    let totalDue = 0, totalPaid = 0, totalHours = 0, lastEntry = '-';

    const historyList = document.getElementById('customer-history-list');
    historyList.innerHTML = cust.history.slice().reverse().map((entry, idx) => {
        if (entry.type === 'water') {
            if (entry.status === 'pending') totalDue += entry.amount;
            totalHours += entry.duration;
            if (idx === 0) lastEntry = entry.date;
            return `
                <div class="list-item">
                    <div class="item-info">
                        <h4>💧 Water Usage</h4>
                        <p>${entry.date} • ${entry.start} - ${entry.end} • ${entry.duration} hrs</p>
                    </div>
                    <div style="text-align: right;">
                        <div class="item-value ${entry.status === 'pending' ? 'text-red' : 'text-green'}">₹${entry.amount}</div>
                        <span style="font-size: 11px; color: var(--sys-gray); text-transform: uppercase;">${entry.status}</span>
                    </div>
                </div>
            `;
        } else {
            totalPaid += entry.amount;
            if (idx === 0) lastEntry = entry.date;
            return `
                <div class="list-item">
                    <div class="item-info">
                        <h4>💰 Payment</h4>
                        <p>${entry.date} • ${entry.note || 'Cash'}</p>
                    </div>
                    <div class="item-value text-green">-₹${entry.amount}</div>
                </div>
            `;
        }
    }).join('');

    document.getElementById('cust-total-due').innerText = '₹' + totalDue;
    document.getElementById('cust-total-paid').innerText = '₹' + totalPaid;
    document.getElementById('cust-total-hours').innerHTML = totalHours.toFixed(1) + ' <small>Hrs</small>';
    document.getElementById('cust-last-entry').innerText = lastEntry;

    showView('view-customer-detail');
}

window.showView = function (viewId) {
    views.forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    navItems.forEach(nav => nav.classList.remove('active'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.savePayment = function () {
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const date = document.getElementById('payment-date').value;
    const note = document.getElementById('payment-note').value.trim();

    if (!amount || !date) {
        showToast(currentLang === 'en' ? "Enter amount and date" : "राशि और तारीख दर्ज करें", "error");
        return;
    }

    if (!customerData[currentCustomerId]) return;

    customerData[currentCustomerId].history.push({
        type: 'payment', date, amount, note: note || 'Cash'
    });

    document.getElementById('payment-amount').value = '';
    document.getElementById('payment-note').value = '';
    closeModal('payment-modal');
    openCustomerDetail(currentCustomerId);

    showToast(currentLang === 'en' ? "Payment Saved!" : "भुगतान सेव हो गया!", "success");
}

// Set default payment date to today
document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];