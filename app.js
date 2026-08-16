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
let currentLang = 'en';
let userRole = localStorage.getItem('user_role') || 'owner';

window.logout = function () {
    localStorage.removeItem('is_logged_in');
    localStorage.removeItem('user_phone');
    localStorage.removeItem('user_role');
    localStorage.removeItem('owner_info');
    localStorage.removeItem('profile_name');
    localStorage.removeItem('profile_business');
    location.reload();
}

window.selectRole = function (role) {
    userRole = role;
    document.getElementById('role-owner').classList.toggle('active', role === 'owner');
    document.getElementById('role-customer').classList.toggle('active', role === 'customer');
}

/* --- DATA HELPERS --- */
function getCustomers() { return JSON.parse(localStorage.getItem('customers') || '[]'); }
function saveCustomers(arr) { localStorage.setItem('customers', JSON.stringify(arr)); }
function getCustomerById(id) { return getCustomers().find(c => c.id === id); }
function getQueue() { return JSON.parse(localStorage.getItem('water_queue') || '[]'); }
function saveQueue(arr) { localStorage.setItem('water_queue', JSON.stringify(arr)); }
function getTubewellData() { return JSON.parse(localStorage.getItem('tubewell_data') || '{}'); }
function saveTubewellData(obj) { localStorage.setItem('tubewell_data', JSON.stringify(obj)); }
function getWaterHistory() { return JSON.parse(localStorage.getItem('water_history') || '[]'); }
function saveWaterHistory(arr) { localStorage.setItem('water_history', JSON.stringify(arr)); }

function loadCustomerData() {
    const customers = getCustomers();
    const history = JSON.parse(localStorage.getItem('customer_history') || '{}');
    customers.forEach(c => {
        customerData[c.id] = { name: c.name, phone: c.phone, history: history[c.id] || [] };
    });
}

function populateCustomerDropdowns() {
    const customers = getCustomers();
    const options = customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const startSelect = document.getElementById('start-water-customer');
    if (startSelect) startSelect.innerHTML = '<option value="">-- ' + (currentLang === 'en' ? 'Select customer' : 'ग्राहक चुनें') + ' --</option>' + options;
    const waterSelect = document.getElementById('water-customer');
    const waterDisplay = document.getElementById('water-customer-display');
    const waterOptions = document.getElementById('water-customer-options');
    if (waterSelect && customers.length > 0) {
        waterSelect.value = customers[0].id;
        if (waterDisplay) waterDisplay.innerText = customers[0].name;
        if (waterOptions) waterOptions.innerHTML = customers.map(c => `<div class="custom-option ${c.id === customers[0].id ? 'selected' : ''}" data-value="${c.id}" onclick="selectOption(this)">${c.name}</div>`).join('');
    }
}

/* --- TUBEWELL STATUS --- */
window.renderStatusCard = function () {
    const tw = getTubewellData();
    const status = tw.status || 'stopped';
    const badge = document.getElementById('status-badge');
    const occLine = document.getElementById('status-occupant-line');
    const occName = document.getElementById('status-occupant-name');
    const timeLine = document.getElementById('status-time-line');
    const startTime = document.getElementById('status-start-time');
    const btnStart = document.getElementById('btn-start-water');
    const btnStop = document.getElementById('btn-stop-water');
    const btnMaint = document.getElementById('btn-maintenance');
    const btnExit = document.getElementById('btn-exit-maintenance');

    if (!badge) return;
    [btnStart, btnStop, btnMaint, btnExit].forEach(b => { if (b) b.style.display = 'none'; });
    if (timeLine) timeLine.style.display = 'none';

    badge.className = 'status-badge ' + status;
    if (status === 'stopped') {
        badge.innerText = locales[currentLang].statusStopped;
        if (occLine) { occLine.style.display = 'block'; occLine.innerHTML = '<span data-i18n="notOccupied">' + locales[currentLang].notOccupied + '</span>'; }
        if (btnStart) btnStart.style.display = 'block';
        if (btnMaint) btnMaint.style.display = 'block';
    } else if (status === 'running') {
        badge.innerText = locales[currentLang].statusRunning;
        const cust = tw.currentCustomer ? getCustomerById(tw.currentCustomer) : null;
        if (occLine) { occLine.style.display = 'block'; occLine.innerHTML = '<span data-i18n="currentlyOccupiedBy">' + locales[currentLang].currentlyOccupiedBy + '</span>: <strong>' + (cust ? cust.name : '-') + '</strong>'; }
        if (timeLine) { timeLine.style.display = 'block'; startTime.innerText = tw.currentStartTime || '-'; }
        if (btnStop) btnStop.style.display = 'block';
    } else if (status === 'work_in_progress') {
        badge.innerText = locales[currentLang].statusWorkInProgress;
        if (occLine) { occLine.style.display = 'block'; occLine.innerHTML = '<span data-i18n="maintenanceMode">' + locales[currentLang].maintenanceMode + '</span>'; }
        if (btnExit) btnExit.style.display = 'block';
    }
}

window.renderQueue = function () {
    const queue = getQueue();
    const container = document.getElementById('queue-list-container');
    if (!container) return;
    if (queue.length === 0) {
        container.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p data-i18n="noQueue">' + locales[currentLang].noQueue + '</p></div></div>';
        return;
    }
    container.innerHTML = queue.map((entry, idx) => {
        const cust = getCustomerById(entry.customerId);
        return '<div class="list-item"><div style="display:flex; align-items:center; gap:12px;"><span class="queue-num">' + (idx + 1) + '</span><div class="item-info"><h4>' + (cust ? cust.name : 'Unknown') + '</h4><p>' + (cust ? cust.phone : '') + '</p></div></div><button class="btn-small" onclick="removeFromQueue(\'' + entry.customerId + '\')">' + locales[currentLang].removeFromQueue + '</button></div>';
    }).join('');
}

window.addCustomerToQueue = function (customerId) {
    const queue = getQueue();
    if (queue.find(q => q.customerId === customerId)) {
        showToast(currentLang === 'en' ? 'Already in queue' : 'पहले से कतार में है', 'info');
        return;
    }
    queue.push({ customerId, addedAt: new Date().toISOString() });
    saveQueue(queue);
    renderQueue();
    showToast(currentLang === 'en' ? 'Added to queue' : 'कतार में जोड़ दिया गया', 'success');
}

window.removeFromQueue = function (customerId) {
    saveQueue(getQueue().filter(q => q.customerId !== customerId));
    renderQueue();
    showToast(currentLang === 'en' ? 'Removed from queue' : 'कतार से हटा दिया गया', 'success');
}

window.startWaterSession = function () {
    const customerId = document.getElementById('start-water-customer').value;
    if (!customerId) { showToast(currentLang === 'en' ? 'Select a customer' : 'ग्राहक चुनें', 'error'); return; }
    const tw = getTubewellData();
    if (tw.status === 'work_in_progress') { showToast(currentLang === 'en' ? 'Tubewell under maintenance' : 'ट्यूबवेल मरम्मत में है', 'error'); return; }
    saveQueue(getQueue().filter(q => q.customerId !== customerId));
    renderQueue();
    tw.status = 'running';
    tw.currentCustomer = customerId;
    tw.currentStartTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    saveTubewellData(tw);
    renderStatusCard();
    closeModal('start-water-modal');
    showToast(currentLang === 'en' ? 'Water started' : 'पानी शुरू हो गया', 'success');
}

window.stopWaterSession = function () {
    const tw = getTubewellData();
    if (tw.status !== 'running' || !tw.currentCustomer) return;
    const startTime = tw.currentStartTime;
    const endTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const today = new Date().toISOString().split('T')[0];
    const start = new Date(today + 'T' + startTime);
    let end = new Date(today + 'T' + endTime);
    if (end < start) end.setDate(end.getDate() + 1);
    const duration = (end - start) / (1000 * 60 * 60);
    const rate = tw.rate || 150;
    const amount = Math.round(duration * rate);

    const history = getWaterHistory();
    history.push({ customerId: tw.currentCustomer, date: today, start: startTime, end: endTime, duration: parseFloat(duration.toFixed(2)), rate, amount, status: 'pending', type: 'water' });
    saveWaterHistory(history);

    const custHistory = JSON.parse(localStorage.getItem('customer_history') || '{}');
    if (!custHistory[tw.currentCustomer]) custHistory[tw.currentCustomer] = [];
    custHistory[tw.currentCustomer].push({ type: 'water', date: today, start: startTime, end: endTime, duration: parseFloat(duration.toFixed(2)), amount, status: 'pending' });
    localStorage.setItem('customer_history', JSON.stringify(custHistory));

    if (!customerData[tw.currentCustomer]) customerData[tw.currentCustomer] = { name: '', phone: '', history: [] };
    customerData[tw.currentCustomer].history.push({ type: 'water', date: today, start: startTime, end: endTime, duration: parseFloat(duration.toFixed(2)), amount, status: 'pending' });

    tw.status = 'stopped';
    tw.currentCustomer = null;
    tw.currentStartTime = null;
    saveTubewellData(tw);
    renderStatusCard();
    updateDashboardStats();
    renderPendingPayments();
    showToast((currentLang === 'en' ? 'Stopped. Duration: ' : 'बंद. समय: ') + duration.toFixed(2) + (currentLang === 'en' ? ' hrs' : ' घंटे'), 'success');
}

window.setMaintenanceMode = function (active) {
    const tw = getTubewellData();
    if (active && tw.status === 'running') { showToast(currentLang === 'en' ? 'Stop water first' : 'पहले पानी बंद करें', 'error'); return; }
    tw.status = active ? 'work_in_progress' : 'stopped';
    if (active) { tw.currentCustomer = null; tw.currentStartTime = null; }
    saveTubewellData(tw);
    renderStatusCard();
    showToast(currentLang === 'en' ? (active ? 'Maintenance mode on' : 'Maintenance mode off') : (active ? 'मरम्मत मोड चालू' : 'मरम्मत मोड बंद'), 'success');
}

/* --- CUSTOMER MANAGEMENT --- */
window.addNewCustomer = function () {
    const name = document.getElementById('new-customer-name').value.trim();
    const phone = document.getElementById('new-customer-phone').value.trim();
    const tubewellId = document.getElementById('new-customer-tubewell').value;
    if (!name || !phone || phone.length !== 10) {
        showToast(currentLang === 'en' ? 'Enter valid name and 10-digit phone' : 'सही नाम और 10 अंकों का फोन दर्ज करें', 'error');
        return;
    }
    const customers = getCustomers();
    if (customers.find(c => c.phone === phone)) {
        showToast(currentLang === 'en' ? 'Customer already exists' : 'ग्राहक पहले से मौजूद है', 'error');
        return;
    }
    const id = 'cust_' + Date.now();
    customers.push({ id, name, phone, tubewellId, linkedAt: new Date().toISOString() });
    saveCustomers(customers);
    customerData[id] = { name, phone, history: [] };
    populateCustomerDropdowns();
    renderCustomers();
    closeModal('add-customer-modal');
    document.getElementById('new-customer-name').value = '';
    document.getElementById('new-customer-phone').value = '';
    showToast(currentLang === 'en' ? 'Customer added!' : 'ग्राहक जोड़ दिया गया!', 'success');
}

window.renderCustomers = function () {
    const customers = getCustomers();
    const list = document.getElementById('customers-list');
    if (!list) return;
    if (customers.length === 0) {
        list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p data-i18n="noCustomers">' + locales[currentLang].noCustomers + '</p></div></div>';
        return;
    }
    list.innerHTML = customers.map(c => '<div class="list-item" onclick="openCustomerDetail(\'' + c.id + '\')"><div class="item-info"><h4>' + c.name + '</h4><p>' + c.phone + '</p></div><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ios-gray)" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></div>').join('');
}

window.updateDashboardStats = function () {
    const history = getWaterHistory();
    const today = new Date().toISOString().split('T')[0];
    let hours = 0, revenue = 0, received = 0, pending = 0;
    history.forEach(e => {
        if (e.date === today && e.type === 'water') {
            hours += e.duration || 0;
            revenue += e.amount || 0;
            if (e.status === 'paid') received += e.amount;
            else if (e.status === 'pending') pending += e.amount;
        }
    });
    const hrsEl = document.getElementById('stat-hours');
    if (hrsEl) hrsEl.innerHTML = hours.toFixed(1) + ' <small data-i18n="hrs">' + locales[currentLang].hrs + '</small>';
    const revEl = document.getElementById('stat-revenue');
    if (revEl) revEl.innerText = '₹' + revenue;
    const recEl = document.getElementById('stat-received');
    if (recEl) recEl.innerText = '₹' + received;
    const penEl = document.getElementById('stat-pending');
    if (penEl) penEl.innerText = '₹' + pending;
}

window.renderPendingPayments = function () {
    const history = getWaterHistory();
    const pending = history.filter(h => h.status === 'pending' && h.type === 'water');
    const list = document.getElementById('pending-payments-list');
    if (!list) return;
    if (pending.length === 0) {
        list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p data-i18n="noPendingPayments">' + locales[currentLang].noPendingPayments + '</p></div></div>';
        return;
    }
    const byCustomer = {};
    pending.forEach(e => { if (!byCustomer[e.customerId]) byCustomer[e.customerId] = 0; byCustomer[e.customerId] += e.amount; });
    list.innerHTML = Object.entries(byCustomer).map(([cid, amt]) => {
        const c = getCustomerById(cid);
        return '<div class="list-item"><div class="item-info"><h4>' + (c ? c.name : 'Unknown') + '</h4><p>' + (c ? c.phone : '') + '</p></div><div class="item-value text-red">₹' + amt + '</div></div>';
    }).join('');
}

/* --- CUSTOMER ROLE: LINK TO TUBEWELL --- */
window.renderCustomerLinkedTubewell = function () {
    const link = JSON.parse(localStorage.getItem('customer_link') || 'null');
    const infoDiv = document.getElementById('customer-linked-tubewell-info');
    const formDiv = document.getElementById('link-tubewell-form');
    if (!infoDiv) return;
    if (link) {
        const ownerInfo = JSON.parse(localStorage.getItem('owner_info') || '{}');
        const twData = JSON.parse(localStorage.getItem('tubewell_data') || '{}');
        infoDiv.innerHTML = '<div class="list-item" style="padding:0;"><div class="item-info"><h4>' + (twData.name || 'Tubewell') + '</h4><p>' + (ownerInfo.name || 'Owner') + ' • ' + (twData.location || '') + '</p><p style="margin-top:4px;">Rate: ₹' + (twData.rate || 150) + '/hr</p></div></div><button class="btn-ghost mt-2" onclick="unlinkTubewell()" style="width:100%; color:var(--ios-red);">' + locales[currentLang].unlink + '</button>';
        if (formDiv) formDiv.style.display = 'none';
        const linkedName = document.getElementById('linked-tubewell-name');
        if (linkedName) linkedName.innerText = twData.name || 'Tubewell';
    } else {
        infoDiv.innerHTML = '<p style="color: var(--ios-gray); font-size: 14px;">' + (currentLang === 'en' ? 'No tubewell linked' : 'कोई ट्यूबवेल लिंक नहीं') + '</p>';
        if (formDiv) formDiv.style.display = 'block';
    }
}

window.linkToOwnerTubewell = function () {
    const phone = document.getElementById('link-owner-phone').value.trim();
    if (phone.length !== 10) { showToast(currentLang === 'en' ? 'Enter valid 10-digit phone' : 'सही 10 अंकों का फोन दर्ज करें', 'error'); return; }
    const ownerInfo = JSON.parse(localStorage.getItem('owner_info') || '{}');
    const allUserInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    if (ownerInfo.phone === phone || allUserInfo.phone === phone) {
        const twData = JSON.parse(localStorage.getItem('tubewell_data') || '{}');
        localStorage.setItem('customer_link', JSON.stringify({ ownerPhone: phone, tubewellId: 'primary', linkedAt: new Date().toISOString() }));
        renderCustomerLinkedTubewell();
        showToast(currentLang === 'en' ? 'Linked successfully!' : 'सफलतापूर्वक जुड़ गया!', 'success');
    } else {
        showToast(currentLang === 'en' ? 'Owner not found. Ask owner to add you first.' : 'मालिक नहीं मिला। मालिक से कहें कि वह आपको जोड़े।', 'error');
    }
}

window.unlinkTubewell = function () {
    localStorage.removeItem('customer_link');
    renderCustomerLinkedTubewell();
    showToast(currentLang === 'en' ? 'Unlinked' : 'हटा दिया गया', 'info');
}

window.renderCustomerQueuePosition = function () {
    const queue = getQueue();
    const posEl = document.getElementById('cust-queue-position');
    if (!posEl) return;
    const link = JSON.parse(localStorage.getItem('customer_link') || 'null');
    if (!link) { posEl.innerText = '-'; return; }
    const userPhone = localStorage.getItem('user_phone');
    const idx = queue.findIndex(q => {
        const c = getCustomerById(q.customerId);
        return c && c.phone === userPhone;
    });
    if (idx === -1) { posEl.innerText = '-'; return; }
    if (idx === 0) { posEl.innerHTML = '<span style="color:var(--ios-green); font-size:13px;">' + locales[currentLang].youAreNext + '</span>'; return; }
    posEl.innerText = '#' + (idx + 1);
}

/* --- TOAST NOTIFICATIONS --- */
window.showToast = function (message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    else if (type === 'error') iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    else iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* --- THEME TOGGLE --- */
const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', currentTheme);
if (currentTheme === 'dark') themeToggle.checked = true;

themeToggle.addEventListener('change', (e) => {
    const targetTheme = e.target.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('theme', targetTheme);
});

/* --- LOCALIZATION --- */
const locales = {
    en: {
        appTitle: "Apna Tubewell",
        appSubtitle: "Khet ke paani ka poora hisab, ab mobile par.",
        mobileNumber: "Mobile Number", login: "Send OTP", enterOtp: "Enter OTP", verifyLogin: "Verify & Login",
        ownerAccount: "Owner Account", greeting: "Namaste, Ram Bhai",
        todaySummary: "Today\'s Summary", waterUsed: "Water Used", revenue: "Revenue", received: "Received", pending: "Pending",
        quickActions: "Quick Actions", paaniHisab: "Paani Ka Hisab", payment: "Payment", pendingPayments: "Pending Payments",
        navHome: "Home", navCustomers: "Customers", navBahi: "Bahi",
        customer: "Customer", startTime: "Start Time", endTime: "End Time", duration: "Duration", rate: "Rate", totalAmount: "Total Amount", save: "Save Record",
        noPendingPayments: "No pending payments",
        noCustomers: "Add customers to get started",
        months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        hrs: "Hrs",
        myProfile: "My Profile", darkMode: "Dark Mode", logout: "Logout", editProfile: "Edit Profile",
        saveChanges: "Save Changes", cancel: "Cancel", name: "Name", businessName: "Business Name",
        bahiSubtitle: "Select a customer to view their complete ledger.",
        myTubewells: "My Tubewells",
        noTubewells: "No tubewells added yet.",
        tubewellName: "Tubewell Name",
        location: "Location / Village",
        ratePerHour: "Rate per Hour (₹)",
        addTubewell: "Add New Tubewell",
        addTubewellBtn: "Add Tubewell",
        villageLocation: "Village / Location",
        tubewellStatus: "Tubewell status",
        statusRunning: "Running",
        statusStopped: "Stopped",
        statusWorkInProgress: "Work in progress",
        currentlyOccupiedBy: "Currently occupied by",
        notOccupied: "Not occupied",
        customerQueue: "Customer queue",
        addToQueue: "Add to queue",
        removeFromQueue: "Remove",
        noQueue: "No customers in queue",
        startWater: "Start water",
        stopWater: "Stop water",
        maintenanceMode: "Maintenance mode",
        exitMaintenance: "Exit maintenance",
        nextInQueue: "Next in queue",
        addCustomer: "Add customer",
        customerPhone: "Customer phone",
        customerName: "Customer name",
        selectTubewell: "Select tubewell",
        unlink: "Unlink",
        startedAt: "Started at",
        youAreNext: "You are next!",
        myQueuePosition: "My queue position",
        totalCustomers: "Total customers",
        waterRunningFor: "Water running for",
        add: "Add",
    },
    hi: {
        appTitle: "अपना ट्यूबवेल",
        appSubtitle: "खेत के पानी का पूरा हिसाब, अब मोबाइल पर।",
        mobileNumber: "मोबाइल नंबर", login: "OTP भेजें", enterOtp: "OTP दर्ज करें", verifyLogin: "वेरिफाई और लॉगिन करें",
        ownerAccount: "मालिक खाता", greeting: "नमस्ते, राम भाई",
        todaySummary: "आज का सारांश", waterUsed: "पानी लगा", revenue: "कुल कमाई", received: "प्राप्त हुआ", pending: "बाकी",
        quickActions: "तुरंत कार्य", paaniHisab: "पानी का हिसाब", payment: "भुगतान", pendingPayments: "बाकी भुगतान",
        navHome: "होम", navCustomers: "ग्राहक", navBahi: "बही-खाता",
        customer: "ग्राहक चुनें", startTime: "शुरू का समय", endTime: "बंद का समय", duration: "कुल समय", rate: "रेट", totalAmount: "कुल राशि", save: "सेव करें",
        noPendingPayments: "कोई बाकी भुगतान नहीं",
        noCustomers: "शुरू करने के लिए ग्राहक जोड़ें",
        months: ["जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
        hrs: "घंटे",
        myProfile: "मेरी प्रोफाइल",
        darkMode: "डार्क मोड",
        logout: "लॉग आउट",
        editProfile: "प्रोफाइल एडिट करें",
        saveChanges: "बदलाव सेव करें",
        cancel: "रद्द करें",
        name: "नाम",
        businessName: "व्यवसाय का नाम",
        bahiSubtitle: "पूरी बही-खाता देखने के लिए ग्राहक चुनें।",
        myTubewells: "मेरे ट्यूबवेल",
        noTubewells: "अभी तक कोई ट्यूबवेल नहीं जोड़ा गया।",
        tubewellName: "ट्यूबवेल का नाम",
        location: "गांव / स्थान",
        ratePerHour: "प्रति घंटा दर (₹)",
        addTubewell: "नया ट्यूबवेल जोड़ें",
        addTubewellBtn: "ट्यूबवेल जोड़ें",
        villageLocation: "गांव / स्थान",
        tubewellStatus: "ट्यूबवेल स्थिति",
        statusRunning: "चालू",
        statusStopped: "बंद",
        statusWorkInProgress: "काम जारी",
        currentlyOccupiedBy: "वर्तमान में उपयोगकर्ता",
        notOccupied: "खाली",
        customerQueue: "ग्राहक कतार",
        addToQueue: "कतार में जोड़ें",
        removeFromQueue: "हटाएं",
        noQueue: "कोई कतार नहीं",
        startWater: "पानी शुरू करें",
        stopWater: "पानी बंद करें",
        maintenanceMode: "मरम्मत मोड",
        exitMaintenance: "मरम्मत समाप्त",
        nextInQueue: "कतार में अगला",
        addCustomer: "ग्राहक जोड़ें",
        customerPhone: "ग्राहक का फोन",
        customerName: "ग्राहक का नाम",
        selectTubewell: "ट्यूबवेल चुनें",
        unlink: "हटाएं",
        startedAt: "शुरू हुआ",
        youAreNext: "आप अगले हैं!",
        myQueuePosition: "मेरी कतार में स्थिति",
        totalCustomers: "कुल ग्राहक",
        waterRunningFor: "पानी चालू है",
        add: "जोड़ें",
    }
};

function setLanguage(lang) {
    currentLang = lang;
    if (lang === 'hi') {
        document.body.classList.add('lang-hi');
    } else {
        document.body.classList.remove('lang-hi');
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (locales[lang][key]) el.innerText = locales[lang][key];
    });

    // Update greeting with actual user name
    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    const ownerInfo = JSON.parse(localStorage.getItem('owner_info') || '{}');
    const userName = userInfo.name || ownerInfo.name || (lang === 'en' ? 'Ram Bhai' : 'राम भाई');
    const greetingEl = document.querySelector('.greeting');
    if (greetingEl) {
        greetingEl.innerText = (lang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + userName;
    }

    document.getElementById('login-en').classList.toggle('active', lang === 'en');
    document.getElementById('login-hi').classList.toggle('active', lang === 'hi');
    if (document.getElementById('btn-en')) document.getElementById('btn-en').classList.toggle('active', lang === 'en');
    if (document.getElementById('btn-hi')) document.getElementById('btn-hi').classList.toggle('active', lang === 'hi');
    document.getElementById('current-lang-label').innerText = lang.toUpperCase();

    localStorage.setItem('app_lang', lang);
    updateDateDisplay();
}

document.getElementById('login-en').addEventListener('click', () => setLanguage('en'));
document.getElementById('login-hi').addEventListener('click', () => setLanguage('hi'));
if (document.getElementById('btn-en')) document.getElementById('btn-en').addEventListener('click', () => setLanguage('en'));
if (document.getElementById('btn-hi')) document.getElementById('btn-hi').addEventListener('click', () => setLanguage('hi'));

/* --- NAVIGATION --- */
const navItems = document.querySelectorAll('.bottom-nav .nav-item');
const views = document.querySelectorAll('.main-view');

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        views.forEach(view => view.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (targetId === 'view-tubewells') renderTubewells();
    });
});

/* --- LOGIN --- */
document.getElementById('send-otp-btn').addEventListener('click', () => {
    const phoneInput = document.getElementById('login-phone').value;
    if (phoneInput.length === 10) {
        localStorage.setItem('is_logged_in', 'true');
        localStorage.setItem('user_phone', phoneInput);
        localStorage.setItem('user_role', userRole);
        showToast(currentLang === 'en' ? "Login Successful!" : "लॉगिन सफल!", "success");

        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('login-screen').classList.remove('active');

        const ownerInfo = localStorage.getItem('owner_info');

        if (userRole === 'customer') {
            document.getElementById('basic-info-screen').classList.add('active');
        } else {
            // Owner flow
            if (ownerInfo) {
                document.getElementById('app-shell').style.display = 'block';
                loadOwnerData();
                setupOwnerUI();
            } else {
                document.getElementById('basic-info-screen').classList.add('active');
            }
        }
    } else {
        showToast(currentLang === 'en' ? "Enter valid 10 digit number" : "सही 10 अंकों का नंबर दर्ज करें", "error");
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

    const userData = { name, village, phone: document.getElementById('login-phone').value };
    localStorage.setItem('user_info', JSON.stringify(userData)); // Generic user info, not owner-specific

    document.getElementById('basic-info-screen').classList.remove('active');
    document.getElementById('app-shell').style.display = 'block';

    // Load greeting for both roles
    document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + name;
    document.getElementById('profile-name-display').innerText = name;
    document.getElementById('edit-profile-name').value = name;

    if (userRole === 'customer') {
        document.getElementById('app-shell').style.display = 'block';
        setupCustomerUI();
    } else {
        localStorage.setItem('owner_info', JSON.stringify(userData)); // Only set owner_info for owners
        loadOwnerData();
        setupOwnerUI();
    }

    showToast(currentLang === 'en' ? "Welcome!" : "स्वागत है!", "success");
});

function loadOwnerData() {
    const data = JSON.parse(localStorage.getItem('owner_info') || localStorage.getItem('user_info') || '{}');
    if (data.name) {
        document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + data.name;
        document.getElementById('profile-name-display').innerText = data.name;
        document.getElementById('edit-profile-name').value = data.name;
    }
    const tw = JSON.parse(localStorage.getItem('tubewell_data') || '{}');
    if (tw.name) {
        const village = data.village || 'Village XYZ';
        document.getElementById('profile-business-display').innerText = village;
        document.getElementById('edit-profile-business').value = village;
    }
}

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
    localStorage.setItem('profile_village', business);
    document.getElementById('profile-name-display').innerText = name;
    document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + name;
    document.getElementById('profile-business-display').innerText = business;
    toggleProfileEdit(false);
    showToast(currentLang === 'en' ? "Profile Updated!" : "प्रोफाइल अपडेट हो गई!", "success");
}

/* --- MODALS --- */
window.openModal = function (id) {
    document.getElementById(id).classList.add('active');
}
window.closeModal = function (id) {
    document.getElementById(id).classList.remove('active');
}

/* --- WATER CALCULATION --- */
const timeStart = document.getElementById('time-start');
const timeEnd = document.getElementById('time-end');
const calcDuration = document.getElementById('calc-duration');
const calcTotal = document.getElementById('calc-total');

function getRate() {
    const tw = JSON.parse(localStorage.getItem('tubewell_data') || '{}');
    return tw.rate || 150;
}

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
    calcDuration.innerText = `${diffInHours.toFixed(2)} ${locales[currentLang].hrs}`;
    const rate = getRate();
    const totalAmount = diffInHours * rate;
    calcTotal.innerText = `₹${Math.round(totalAmount)}`;
    document.getElementById('calc-rate').innerText = `₹${rate} / hr`;
}

timeStart.addEventListener('change', calculateWaterUsage);
timeEnd.addEventListener('change', calculateWaterUsage);

/* --- SAVE WATER --- */
document.getElementById('save-water-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-water-btn');
    btn.innerText = "Saving...";
    btn.disabled = true;
    try {
        const amountString = calcTotal.innerText.replace('₹', '');
        const amount = parseFloat(amountString);
        const customerId = document.getElementById('water-customer').value;
        const duration = parseFloat(calcDuration.innerText);
        const today = new Date().toISOString().split('T')[0];
        const payload = {
            business_id: "demo_owner_123",
            customer_id: customerId,
            start_time: timeStart.value,
            end_time: timeEnd.value,
            duration: duration,
            rate: getRate(),
            amount: amount,
            created_at: serverTimestamp()
        };
        await addDoc(collection(db, "water_usage"), payload);

        // Save to localStorage for dashboard
        const history = getWaterHistory();
        history.push({ customerId, date: today, start: timeStart.value, end: timeEnd.value, duration, rate: getRate(), amount, status: 'pending', type: 'water' });
        saveWaterHistory(history);

        const custHistory = JSON.parse(localStorage.getItem('customer_history') || '{}');
        if (!custHistory[customerId]) custHistory[customerId] = [];
        custHistory[customerId].push({ type: 'water', date: today, start: timeStart.value, end: timeEnd.value, duration, amount, status: 'pending' });
        localStorage.setItem('customer_history', JSON.stringify(custHistory));

        if (!customerData[customerId]) customerData[customerId] = { name: '', phone: '', history: [] };
        customerData[customerId].history.push({ type: 'water', date: today, start: timeStart.value, end: timeEnd.value, duration, amount, status: 'pending' });

        updateDashboardStats();
        renderPendingPayments();
        showToast(currentLang === 'en' ? "Record Saved!" : "हिसाब सेव हो गया!", "success");
        closeModal('water-modal');
    } catch (e) {
        console.error(e);
        showToast("Error saving data.", "error");
    } finally {
        btn.innerText = locales[currentLang].save;
        btn.disabled = false;
    }
});

/* --- TUBEWELL MANAGEMENT --- */
function renderTubewells() {
    const list = document.getElementById('tubewells-list');
    const primary = getTubewellData();
    const extras = JSON.parse(localStorage.getItem('tubewell_extras') || '[]');
    const all = primary.name ? [primary, ...extras] : extras;

    // Update tubewell select in add-customer modal
    const twSelect = document.getElementById('new-customer-tubewell');
    if (twSelect) {
        twSelect.innerHTML = all.map((tw, i) => '<option value="' + (i === 0 ? 'primary' : 'extra_' + i) + '">' + tw.name + '</option>').join('');
    }

    list.innerHTML = all.map((tw, i) => {
        const statusText = tw.status === 'running' ? '● ' + locales[currentLang].statusRunning : tw.status === 'work_in_progress' ? '● ' + locales[currentLang].statusWorkInProgress : '● ' + locales[currentLang].statusStopped;
        const statusColor = tw.status === 'running' ? 'var(--ios-green)' : tw.status === 'work_in_progress' ? '#FF9500' : 'var(--ios-gray)';
        return '<div class="list-item"><div class="item-info"><h4>' + tw.name + '</h4><p>' + tw.location + ' • ₹' + tw.rate + '/hr</p><p style="font-size:12px; color:' + statusColor + '; margin-top:2px;">' + statusText + '</p></div><span class="role-badge" style="' + (i === 0 ? '' : 'background: rgba(52,199,89,0.1); color: var(--ios-green);') + '">' + (i === 0 ? 'PRIMARY' : 'ACTIVE') + '</span></div>';
    }).join('');

    if (all.length === 0) {
        list.innerHTML = '<div class="list-item"><div class="item-info"><p style="color: var(--ios-gray);">' + locales[currentLang].noTubewells + '</p></div></div>';
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

/* --- CUSTOMER DETAIL VIEW --- */
let currentCustomerId = null;

const customerData = {
};

window.openCustomerDetail = function (id) {
    currentCustomerId = id;
    const cust = customerData[id];
    if (!cust) {
        // Try loading from localStorage
        const customers = getCustomers();
        const found = customers.find(c => c.id === id);
        if (found) {
            customerData[id] = { name: found.name, phone: found.phone, history: [] };
        } else {
            return;
        }
    }
    const historyList = document.getElementById('customer-history-list');
    const allHistory = customerData[id].history || [];
    document.getElementById('customer-detail-name').innerText = customerData[id].name;

    if (allHistory.length === 0) {
        historyList.innerHTML = '<div class="list-item"><div class="item-info"><p style="color: var(--ios-gray);">No entries yet.</p></div></div>';
        document.getElementById('cust-total-due').innerText = '₹0';
        document.getElementById('cust-total-paid').innerText = '₹0';
        document.getElementById('cust-total-hours').innerHTML = '0 <small>Hrs</small>';
        document.getElementById('cust-last-entry').innerText = '-';
        showView('view-customer-detail');
        return;
    }

    let totalDue = 0, totalPaid = 0, totalHours = 0, lastEntry = '-';
    historyList.innerHTML = allHistory.slice().reverse().map((entry, idx) => {
        if (entry.type === 'water') {
            if (entry.status === 'pending') totalDue += entry.amount;
            totalHours += entry.duration;
            if (idx === 0) lastEntry = entry.date;
            return '<div class="list-item"><div class="item-info"><h4>Water Usage</h4><p>' + entry.date + ' • ' + entry.start + ' - ' + entry.end + ' • ' + entry.duration + ' hrs</p></div><div style="text-align: right;"><div class="item-value ' + (entry.status === 'pending' ? 'text-red' : 'text-green') + '">₹' + entry.amount + '</div><span style="font-size: 11px; color: var(--ios-gray); text-transform: uppercase;">' + entry.status + '</span></div></div>';
        } else {
            totalPaid += entry.amount;
            if (idx === 0) lastEntry = entry.date;
            return '<div class="list-item"><div class="item-info"><h4>Payment</h4><p>' + entry.date + ' • ' + (entry.note || 'Cash') + '</p></div><div class="item-value text-green">-₹' + entry.amount + '</div></div>';
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

    customerData[currentCustomerId].history.push({ type: 'payment', date, amount, note: note || 'Cash' });

    const custHistory = JSON.parse(localStorage.getItem('customer_history') || '{}');
    if (!custHistory[currentCustomerId]) custHistory[currentCustomerId] = [];
    custHistory[currentCustomerId].push({ type: 'payment', date, amount, note: note || 'Cash' });
    localStorage.setItem('customer_history', JSON.stringify(custHistory));

    document.getElementById('payment-amount').value = '';
    document.getElementById('payment-note').value = '';
    closeModal('payment-modal');
    openCustomerDetail(currentCustomerId);
    updateDashboardStats();
    renderPendingPayments();
    showToast(currentLang === 'en' ? "Payment Saved!" : "भुगतान सेव हो गया!", "success");
}
// Set default payment date
document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
window.toggleCustomSelect = function () {
    document.getElementById('water-customer-wrapper').classList.toggle('active');
}

window.selectOption = function (el) {
    document.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('water-customer-display').innerText = el.innerText;
    document.getElementById('water-customer').value = el.dataset.value;
    document.getElementById('water-customer-wrapper').classList.remove('active');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('water-customer-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        wrapper.classList.remove('active');
    }
});


window.toggleLangMenu = function () {
    const menu = document.getElementById('lang-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

window.switchLang = function (lang) {
    setLanguage(lang);
    document.getElementById('current-lang-label').innerText = lang.toUpperCase();

    // Remove active from all, add to clicked
    document.querySelectorAll('.lang-menu-item').forEach(el => {
        el.classList.remove('active');
        const svg = el.querySelector('svg');
        if (svg) svg.style.opacity = '0';
    });

    const clicked = event.currentTarget;
    clicked.classList.add('active');
    const clickedSvg = clicked.querySelector('svg');
    if (clickedSvg) clickedSvg.style.opacity = '1';

    document.getElementById('lang-menu').style.display = 'none';
    showToast(currentLang === 'en' ? "Language changed" : "भाषा बदल गई", "success");
    localStorage.setItem('app_lang', lang);
}

// Close lang menu when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('lang-menu');
    const btn = document.getElementById('lang-btn');
    if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.style.display = 'none';
    }
});

function updateDateDisplay() {
    const now = new Date();
    const day = now.getDate();
    const month = locales[currentLang].months[now.getMonth()];
    const year = now.getFullYear();
    document.querySelector('.date-display').innerText = `${day} ${month} ${year}`;
}

/* --- ROLE-BASED UI SETUP --- */
function setupOwnerUI() {
    // Restore owner nav
    const nav = document.querySelector('.bottom-nav');
    nav.innerHTML = `
        <div class="nav-item active" data-target="view-home">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span data-i18n="navHome">Home</span>
        </div>
        <div class="nav-item" data-target="view-customers">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span data-i18n="navCustomers">Customers</span>
        </div>
        <div class="nav-item" data-target="view-bahi">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <span data-i18n="navBahi">Bahi</span>
        </div>
        <div class="nav-item" data-target="view-tubewells">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            <span>Tubewells</span>
        </div>
    `;

    // Re-attach nav listeners
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.bottom-nav .nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            document.querySelectorAll('.main-view').forEach(v => v.classList.remove('active'));
            const target = document.getElementById(targetId);
            if (target) target.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (targetId === 'view-tubewells') renderTubewells();
            if (targetId === 'view-customers') renderCustomers();
        });
    });

    // Hide customer-only views completely
    document.querySelectorAll('.customer-only').forEach(v => {
        v.style.display = 'none';
        v.classList.remove('active');
    });

    // Show only owner views, but keep them hidden until nav activates them
    document.querySelectorAll('.main-view:not(.customer-only)').forEach(v => {
        v.style.display = ''; // Reset to CSS default (none from .main-view rule)
        v.classList.remove('active');
    });

    // Activate only home view
    const homeView = document.getElementById('view-home');
    if (homeView) homeView.classList.add('active');

    // Set role badge
    document.getElementById('role-badge-text').innerText = currentLang === 'en' ? 'Owner Account' : 'मालिक खाता';
    document.getElementById('role-badge-text').style.background = 'rgba(0,122,255,0.1)';
    document.getElementById('role-badge-text').style.color = 'var(--ios-blue)';

    loadCustomerData();
    populateCustomerDropdowns();
    renderCustomers();
    renderStatusCard();
    renderQueue();
    updateDashboardStats();
    renderPendingPayments();
}

function setupCustomerUI() {
    // Rebuild bottom nav for customer
    const nav = document.querySelector('.bottom-nav');
    nav.innerHTML = `
        <div class="nav-item active" data-target="view-customer-usage">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            <span>My Usage</span>
        </div>
        <div class="nav-item" data-target="view-my-tubewell">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>My Tubewell</span>
        </div>
        <div class="nav-item" data-target="view-my-payments">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            <span>Payments</span>
        </div>
        <div class="nav-item" data-target="view-profile">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>Profile</span>
        </div>
    `;

    // Re-attach nav listeners
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.bottom-nav .nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            document.querySelectorAll('.main-view').forEach(v => v.classList.remove('active'));
            const target = document.getElementById(targetId);
            if (target) target.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // Hide owner views
    document.querySelectorAll('.main-view:not(.customer-only)').forEach(v => {
        v.style.display = 'none';
        v.classList.remove('active');
    });

    // Show customer views (reset inline display so CSS .active works)
    document.querySelectorAll('.customer-only').forEach(v => {
        v.style.display = ''; // Reset to CSS default
        v.classList.remove('active');
    });

    // Activate only customer usage view
    const custDash = document.getElementById('view-customer-usage');
    if (custDash) custDash.classList.add('active');

    // Set role badge
    document.getElementById('role-badge-text').innerText = currentLang === 'en' ? 'Customer' : 'ग्राहक';
    document.getElementById('role-badge-text').style.background = 'rgba(52,199,89,0.1)';
    document.getElementById('role-badge-text').style.color = 'var(--ios-green)';
    renderCustomerLinkedTubewell();
    renderCustomerQueuePosition();
}


window.becomeOwner = function () {
    if (!confirm(currentLang === 'en' ? "Switch to owner mode? Your customer data will be preserved." : "मालिक मोड में स्विच करें? आपका ग्राहक डेटा सुरक्षित रहेगा।")) {
        return;
    }
    userRole = 'owner';
    localStorage.setItem('user_role', 'owner');

    // Hide customer UI, show basic info for owner onboarding
    document.getElementById('app-shell').style.display = 'none';
    document.querySelectorAll('.main-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.customer-only').forEach(v => v.style.display = 'none');

    document.getElementById('basic-info-screen').classList.add('active');
    showToast(currentLang === 'en' ? "Complete your owner profile" : "अपना मालिक प्रोफाइल पूरा करें", "info");
}


/* --- INIT & AUTO LOGIN --- */
const savedOwner = localStorage.getItem('owner_info');
if (savedOwner) {
    const data = JSON.parse(savedOwner);
    document.getElementById('profile-name-display').innerText = data.name;
    document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + data.name;
    document.getElementById('edit-profile-name').value = data.name;
}
const savedUserInfo = localStorage.getItem('user_info');
if (savedUserInfo) {
    const data = JSON.parse(savedUserInfo);
    if (data.village) {
        document.getElementById('profile-business-display').innerText = data.village;
        document.getElementById('edit-profile-business').value = data.village;
    }
}

const savedLang = localStorage.getItem('app_lang') || 'en';
setLanguage(savedLang);

/* --- AUTO LOGIN CHECK --- */
const isLoggedIn = localStorage.getItem('is_logged_in');
const userInfo = localStorage.getItem('user_info');
const ownerInfo = localStorage.getItem('owner_info');
const savedRole = localStorage.getItem('user_role') || 'owner';
userRole = savedRole;

if (isLoggedIn === 'true') {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('basic-info-screen').classList.remove('active');

    if (userInfo) {
        const data = JSON.parse(userInfo);
        document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + data.name;
        document.getElementById('profile-name-display').innerText = data.name;
        document.getElementById('edit-profile-name').value = data.name;

        if (userRole === 'customer') {
            document.getElementById('role-badge-text').innerText = currentLang === 'en' ? 'Customer' : 'ग्राहक';
            document.getElementById('role-badge-text').style.background = 'rgba(52,199,89,0.1)';
            document.getElementById('role-badge-text').style.color = 'var(--ios-green)';
            document.getElementById('app-shell').style.display = 'block';
            setupCustomerUI();
        } else {
            document.getElementById('role-badge-text').innerText = currentLang === 'en' ? 'Owner Account' : 'मालिक खाता';
            document.getElementById('role-badge-text').style.background = 'rgba(0,122,255,0.1)';
            document.getElementById('role-badge-text').style.color = 'var(--ios-blue)';
            if (ownerInfo) {
                document.getElementById('app-shell').style.display = 'block';
                loadOwnerData();
                setupOwnerUI();
            } else {
                document.getElementById('basic-info-screen').classList.add('active');
            }
        }
    } else {
        document.getElementById('basic-info-screen').classList.add('active');
    }
}

const savedUser = localStorage.getItem('user_info');
if (savedUser) {
    const data = JSON.parse(savedUser);
    document.getElementById('profile-name-display').innerText = data.name;
    document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + data.name;
    document.getElementById('edit-profile-name').value = data.name;
}

// Initialize data
loadCustomerData();
populateCustomerDropdowns();