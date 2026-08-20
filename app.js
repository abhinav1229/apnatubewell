import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-analytics.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDoc, doc, setDoc, updateDoc, onSnapshot, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
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
const isMockMode = false; // Set to false when you enable real Firebase Auth
let currentLang = 'en';
let userRole = localStorage.getItem('user_role') || 'owner';

async function safeSetDoc(docRef, data) {
    if (isMockMode) return Promise.resolve();
    return setDoc(docRef, data);
}

async function safeUpdateDoc(docRef, data) {
    if (isMockMode) return Promise.resolve();
    return updateDoc(docRef, data);
}

async function safeAddDoc(collectionRef, data) {
    if (isMockMode) return Promise.resolve({ id: 'mock_' + Date.now() });
    return addDoc(collectionRef, data);
}

async function safeDeleteDoc(docRef) {
    if (isMockMode) return Promise.resolve();
    return deleteDoc(docRef);
}

function safeServerTimestamp() {
    return isMockMode ? new Date().toISOString() : serverTimestamp();
}


window.logout = function () {
    stopListeners();

    // Clear ALL user-related localStorage
    localStorage.removeItem('is_logged_in');
    localStorage.removeItem('user_phone');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_uid');
    localStorage.removeItem('user_info');
    localStorage.removeItem('owner_info');
    localStorage.removeItem('profile_name');
    localStorage.removeItem('profile_village');
    localStorage.removeItem('profile_business');
    localStorage.removeItem('customer_link');
    localStorage.removeItem('pending_request_owner');
    localStorage.removeItem('customers');
    localStorage.removeItem('water_queue');
    localStorage.removeItem('tubewell_data');
    localStorage.removeItem('tubewell_extras');
    localStorage.removeItem('water_history');
    localStorage.removeItem('customer_history');
    localStorage.removeItem('user_roles');
    localStorage.removeItem('bahi_contacts');

    auth.signOut();
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
    const bahiContacts = JSON.parse(localStorage.getItem('bahi_contacts') || '{}');

    customers.forEach(c => {
        customerData[c.id] = {
            name: c.name,
            phone: c.phone,
            history: history[c.id] || (customerData[c.id] && customerData[c.id].history) || []
        };
    });

    // Restored removed customers for Bahi
    Object.keys(bahiContacts).forEach(cid => {
        if (!customerData[cid]) {
            customerData[cid] = {
                name: bahiContacts[cid].name || 'Customer',
                phone: bahiContacts[cid].phone || '',
                history: history[cid] || []
            };
        } else {
            if (!customerData[cid].name) customerData[cid].name = bahiContacts[cid].name;
            if (!customerData[cid].phone) customerData[cid].phone = bahiContacts[cid].phone;
            if (!customerData[cid].history || !customerData[cid].history.length) {
                customerData[cid].history = history[cid] || [];
            }
        }
    });

    Object.keys(history).forEach(cid => {
        if (!customerData[cid]) {
            const meta = bahiContacts[cid] || {};
            customerData[cid] = {
                name: meta.name || 'Customer',
                phone: meta.phone || '',
                history: history[cid] || []
            };
        }
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

function waterKey(r) {
    return r.id || `${r.date}|${r.start || r.start_time || ''}|${r.amount}`;
}

/** Payments applied to water bills oldest-first. Returns Set of settled water keys. */
function getSettledWaterKeys(waterList, paymentsList) {
    const totalPaid = (paymentsList || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    let creditLeft = totalPaid;
    const settled = new Set();
    const sorted = (waterList || []).slice().sort((a, b) =>
        (a.date || '').localeCompare(b.date || '') ||
        ((a.start || a.start_time || '') + '').localeCompare((b.start || b.start_time || '') + '')
    );
    sorted.forEach(r => {
        const amt = parseFloat(r.amount) || 0;
        const key = waterKey(r);
        if (creditLeft >= amt) {
            settled.add(key);
            creditLeft -= amt;
        }
    });
    return settled;
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

    // Update queue count badge on status card
    const countEl = document.getElementById('queue-count-badge');
    if (countEl) {
        countEl.innerText = queue.length > 0
            ? (currentLang === 'en' ? (queue.length + ' in queue') : (queue.length + ' कतार में'))
            : '';
        countEl.style.display = queue.length > 0 ? 'inline-block' : 'none';
    }

    if (queue.length === 0) {
        container.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p data-i18n="noQueue">' + locales[currentLang].noQueue + '</p></div></div>';
    } else {
        container.innerHTML = queue.map((entry, idx) => {
            const cust = getCustomerById(entry.customerId);
            return '<div class="list-item"><div style="display:flex; align-items:center; gap:12px;"><span class="queue-num">' + (idx + 1) + '</span><div class="item-info"><h4>' + (cust ? cust.name : 'Unknown') + '</h4><p>' + (cust ? cust.phone : '') + (idx === 0 ? ' · <span style="color:var(--ios-green);">' + (currentLang === 'en' ? 'Next' : 'अगला') + '</span>' : '') + '</p></div></div><button class="btn-small" onclick="removeFromQueue(\'' + entry.customerId + '\')">' + locales[currentLang].removeFromQueue + '</button></div>';
        }).join('');
    }
    renderNextInQueue();
}

window.renderNextInQueue = function () {
    const el = document.getElementById('next-in-queue-section');
    if (!el) return;
    const queue = getQueue();
    if (queue.length === 0) {
        el.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p style="color:var(--ios-gray); font-size:14px;">' + (currentLang === 'en' ? 'No one waiting in queue' : 'कतार में कोई नहीं') + '</p></div></div>';
        return;
    }
    const entry = queue[0];
    const cust = getCustomerById(entry.customerId);
    const name = cust ? cust.name : 'Unknown';
    const phone = cust ? cust.phone : '';
    el.innerHTML = '<div class="list-item" style="background:rgba(0,122,255,0.06);"><div style="display:flex; align-items:center; gap:12px; width:100%;"><span class="queue-num">1</span><div class="item-info"><h4>' + name + '</h4><p>' + phone + ' · ' + (currentLang === 'en' ? 'Next in queue' : 'कतार में अगला') + '</p></div></div></div>';
}

window.addCustomerToQueue = async function (customerId) {
    const ownerUid = localStorage.getItem('user_uid');
    const queueRef = collection(db, 'queues');
    const q = query(queueRef, where('ownerId', '==', ownerUid), where('customerId', '==', customerId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        showToast(currentLang === 'en' ? 'Already in queue' : 'पहले से कतार में है', 'info');
        return;
    }
    await safeAddDoc(queueRef, { ownerId: ownerUid, customerId, addedAt: safeServerTimestamp() });
    // Update local queue
    const localQ = getQueue();
    if (!localQ.find(e => e.customerId === customerId)) {
        localQ.push({ customerId, addedAt: new Date().toISOString() });
        saveQueue(localQ);
    }
    renderQueue();
    showToast(currentLang === 'en' ? 'Added to queue' : 'कतार में जोड़ दिया गया', 'success');
};

window.removeFromQueue = async function (customerId) {
    const ownerUid = localStorage.getItem('user_uid');
    const queueRef = collection(db, 'queues');
    const q = query(queueRef, where('ownerId', '==', ownerUid), where('customerId', '==', customerId));
    const snapshot = await getDocs(q);
    snapshot.forEach(async (d) => { await safeDeleteDoc(doc(db, 'queues', d.id)); });
    const localQ = getQueue().filter(e => e.customerId !== customerId);
    saveQueue(localQ);
    renderQueue();
    showToast(currentLang === 'en' ? 'Removed from queue' : 'कतार से हटा दिया गया', 'success');
};

window.startWaterSession = async function () {
    const customerId = document.getElementById('start-water-customer').value;
    if (!customerId) { showToast(currentLang === 'en' ? 'Select a customer' : 'ग्राहक चुनें', 'error'); return; }

    const rateInput = document.getElementById('start-water-rate');
    const sessionRate = rateInput ? (parseFloat(rateInput.value) || 0) : 0;
    if (!sessionRate || sessionRate <= 0) {
        showToast(currentLang === 'en' ? 'Enter a valid rate' : 'सही रेट दर्ज करें', 'error');
        return;
    }

    const ownerUid = localStorage.getItem('user_uid');
    const twRef = doc(db, 'tubewells', ownerUid + '_primary');
    const twDoc = await getDoc(twRef);
    const tw = twDoc.data() || {};

    if (tw.status === 'work_in_progress') {
        showToast(currentLang === 'en' ? 'Tubewell under maintenance' : 'ट्यूबवेल मरम्मत में है', 'error');
        return;
    }

    // Remove from queue in Firestore
    const queueRef = collection(db, 'queues');
    const q = query(queueRef, where('ownerId', '==', ownerUid), where('customerId', '==', customerId));
    const queueSnap = await getDocs(q);
    queueSnap.forEach(async (d) => { await safeDeleteDoc(doc(db, 'queues', d.id)); });

    const startTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    await safeUpdateDoc(twRef, {
        status: 'running',
        currentCustomer: customerId,
        currentCustomerUid: getCustomerById(customerId)?.customerUid || customerId,
        currentStartTime: startTime,
        currentSessionRate: sessionRate
    });

    // Update local
    const localTw = getTubewellData();
    localTw.status = 'running';
    localTw.currentCustomer = customerId;
    localTw.currentStartTime = startTime;
    localTw.currentSessionRate = sessionRate;
    saveTubewellData(localTw);

    renderStatusCard();
    renderQueue();
    renderNextInQueue();
    closeModal('start-water-modal');
    showToast(currentLang === 'en' ? 'Water started @ ₹' + sessionRate + '/hr' : 'पानी शुरू @ ₹' + sessionRate + '/घंटा', 'success');
};

window.stopWaterSession = async function () {
    const ownerUid = localStorage.getItem('user_uid');
    const twRef = doc(db, 'tubewells', ownerUid + '_primary');
    const twDoc = await getDoc(twRef);
    const tw = twDoc.data();

    if (tw.status !== 'running' || !tw.currentCustomer) return;

    const startTime = tw.currentStartTime;
    const endTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const today = new Date().toISOString().split('T')[0];
    const start = new Date(today + 'T' + startTime);
    let end = new Date(today + 'T' + endTime);
    if (end < start) end.setDate(end.getDate() + 1);
    const duration = (end - start) / (1000 * 60 * 60);
    const rate = tw.currentSessionRate || tw.rate || 150;
    const amount = Math.round(duration * rate);

    // Resolve customer identity for cross-device sync
    const cust = getCustomerById(tw.currentCustomer) || {};
    const customerUid = tw.currentCustomerUid || cust.customerUid || ('phone_' + (cust.phone || ''));
    const customerPhone = cust.phone || '';
    const customerName = cust.name || '';

    const ownerInfo = JSON.parse(localStorage.getItem('user_info') || localStorage.getItem('owner_info') || '{}');
    const twLocal = getTubewellData();

    // Save usage to Firestore — full fields so customer app can query it
    const usageRef = doc(collection(db, 'water_usage'));
    const usagePayload = {
        business_id: ownerUid,
        customer_id: tw.currentCustomer,
        customer_uid: customerUid,
        customer_phone: customerPhone,
        customer_name: customerName,
        start_time: startTime,
        end_time: endTime,
        duration: parseFloat(duration.toFixed(2)),
        rate,
        amount,
        status: 'pending',
        type: 'water',
        date: today,
        created_at: safeServerTimestamp(),
        owner_name: ownerInfo.name || '',
        owner_phone: localStorage.getItem('user_phone') || '',
        tubewell_name: twLocal.name || tw.name || 'Tubewell'
    };
    await safeSetDoc(usageRef, usagePayload);

    // Reset tubewell in Firestore
    await safeUpdateDoc(twRef, {
        status: 'stopped',
        currentCustomer: null,
        currentCustomerUid: null,
        currentStartTime: null,
        currentSessionRate: null
    });

    // Update local
    const localTw = getTubewellData();
    localTw.status = 'stopped';
    localTw.currentCustomer = null;
    localTw.currentStartTime = null;
    localTw.currentSessionRate = null;
    saveTubewellData(localTw);

    // Save to local history (owner)
    const history = getWaterHistory();
    history.push({
        id: usageRef.id,
        customerId: tw.currentCustomer,
        customerUid,
        customerPhone,
        date: today,
        start: startTime,
        end: endTime,
        duration: parseFloat(duration.toFixed(2)),
        rate,
        amount,
        status: 'pending',
        type: 'water'
    });
    saveWaterHistory(history);

    // Also mirror into customer_history for Bahi / detail views
    const custHistory = JSON.parse(localStorage.getItem('customer_history') || '{}');
    if (!custHistory[tw.currentCustomer]) custHistory[tw.currentCustomer] = [];
    custHistory[tw.currentCustomer].push({
        type: 'water', date: today, start: startTime, end: endTime,
        duration: parseFloat(duration.toFixed(2)), rate, amount, status: 'pending'
    });
    localStorage.setItem('customer_history', JSON.stringify(custHistory));
    if (!customerData[tw.currentCustomer]) customerData[tw.currentCustomer] = { name: customerName, phone: customerPhone, history: [] };
    customerData[tw.currentCustomer].history.push({
        type: 'water', date: today, start: startTime, end: endTime,
        duration: parseFloat(duration.toFixed(2)), rate, amount, status: 'pending'
    });

    renderStatusCard();
    renderQueue();
    if (typeof renderNextInQueue === 'function') renderNextInQueue();
    updateDashboardStats();
    renderPendingPayments();
    showToast((currentLang === 'en' ? 'Stopped. Duration: ' : 'बंद. समय: ') + duration.toFixed(2) + (currentLang === 'en' ? ' hrs · ₹' : ' घंटे · ₹') + amount, 'success');
};

window.setMaintenanceMode = async function (active) {
    const ownerUid = localStorage.getItem('user_uid');
    const twRef = doc(db, 'tubewells', ownerUid + '_primary');
    const twDoc = await getDoc(twRef);
    const tw = twDoc.data();

    if (active && tw.status === 'running') {
        showToast(currentLang === 'en' ? 'Stop water first' : 'पहले पानी बंद करें', 'error');
        return;
    }
    await safeUpdateDoc(twRef, {
        status: active ? 'work_in_progress' : 'stopped',
        currentCustomer: active ? null : tw.currentCustomer,
        currentStartTime: active ? null : tw.currentStartTime
    });

    const localTw = getTubewellData();
    localTw.status = active ? 'work_in_progress' : 'stopped';
    if (active) { localTw.currentCustomer = null; localTw.currentStartTime = null; }
    saveTubewellData(localTw);

    renderStatusCard();
    showToast(currentLang === 'en' ? (active ? 'Maintenance mode on' : 'Maintenance mode off') : (active ? 'मरम्मत मोड चालू' : 'मरम्मत मोड बंद'), 'success');
};

/* --- CUSTOMER MANAGEMENT --- */
window.addNewCustomer = async function () {
    const phoneEl = document.getElementById('new-customer-phone');
    const phone = (phoneEl && phoneEl.value || '').trim();

    if (phone.length !== 10) {
        showToast(
            currentLang === 'en' ? 'Enter valid 10-digit phone' : 'सही 10 अंकों का फोन दर्ज करें',
            'error'
        );
        return;
    }

    const ownerUid = localStorage.getItem('user_uid');
    const ownerPhone = localStorage.getItem('user_phone');

    if (phone === ownerPhone) {
        showToast(
            currentLang === 'en' ? 'You cannot add your own number' : 'अपना नंबर नहीं जोड़ सकते',
            'error'
        );
        return;
    }

    // Already in active list?
    const customers = getCustomers();
    if (customers.some(c => c.phone === phone)) {
        showToast(
            currentLang === 'en' ? 'Customer already in your list' : 'ग्राहक पहले से सूची में है',
            'info'
        );
        return;
    }

    // Must be registered in app — get name from users
    let name = '';
    let customerUid = 'phone_' + phone;
    try {
        const userSnap = await getDocs(query(collection(db, 'users'), where('phone', '==', phone)));
        if (userSnap.empty) {
            showToast(
                currentLang === 'en'
                    ? 'This number is not registered in the app'
                    : 'यह नंबर ऐप में पंजीकृत नहीं है',
                'error'
            );
            return;
        }
        const uDoc = userSnap.docs[0];
        const uData = uDoc.data();

        // Block if account fully deleted
        if (uData.accountStatus === 'deleted') {
            showToast(
                currentLang === 'en'
                    ? 'This account has been deleted. Cannot add to contacts.'
                    : 'यह खाता हटा दिया गया है। संपर्क में नहीं जोड़ सकते।',
                'error'
            );
            return;
        }

        // Must still have customer role (or any active role you allow)
        const roles = Array.isArray(uData.roles)
            ? uData.roles
            : (uData.role ? [uData.role] : []);

        const hasCustomer =
            roles.includes('customer') ||
            uData.role === 'customer';

        // If they only deleted customer role but kept owner, still block as customer-contact
        if (!hasCustomer) {
            showToast(
                currentLang === 'en'
                    ? 'This user is not registered as a customer'
                    : 'यह उपयोगकर्ता ग्राहक के रूप में पंजीकृत नहीं है',
                'error'
            );
            return;
        }


        customerUid = uDoc.id;
        name = (uData.name || '').trim();
        if (!name) {
            showToast(
                currentLang === 'en' ? 'User has no name on profile' : 'प्रोफ़ाइल पर नाम नहीं है',
                'error'
            );
            return;
        }
    } catch (e) {
        console.error(e);
        showToast(
            currentLang === 'en' ? 'Could not verify number' : 'नंबर जाँच नहीं हो सका',
            'error'
        );
        return;
    }

    // ---------- Find existing id (removed customer / old Bahi) ----------
    let id = null;

    // A) Firestore customers for this owner + phone (including status: removed)
    try {
        const cSnap = await getDocs(
            query(
                collection(db, 'customers'),
                where('ownerId', '==', ownerUid),
                where('phone', '==', phone)
            )
        );
        if (!cSnap.empty) {
            const d = cSnap.docs[0];
            const data = d.data();
            id = data.id || d.id;
            if (data.name) name = data.name;
        }
    } catch (e) {
        console.error('lookup customers by phone', e);
    }

    // B) Local bahi_contacts
    if (!id) {
        const bahiContacts = JSON.parse(localStorage.getItem('bahi_contacts') || '{}');
        Object.keys(bahiContacts).forEach(cid => {
            if (!id && bahiContacts[cid] && bahiContacts[cid].phone === phone) {
                id = cid;
                if (bahiContacts[cid].name) name = bahiContacts[cid].name;
            }
        });
    }

    // C) customerData by phone
    if (!id) {
        Object.keys(customerData).forEach(cid => {
            if (!id && customerData[cid] && customerData[cid].phone === phone) {
                id = cid;
                if (customerData[cid].name) name = customerData[cid].name;
            }
        });
    }

    // D) water_history by phone
    if (!id) {
        const wh = getWaterHistory();
        for (let i = 0; i < wh.length; i++) {
            if (wh[i].customerPhone === phone && wh[i].customerId) {
                id = wh[i].customerId;
                break;
            }
        }
    }

    // E) New customer
    if (!id) {
        id = 'cust_' + Date.now();
    }

    // ---------- Save ----------
    const newCust = {
        id: id,
        name: name,
        phone: phone,
        customerUid: customerUid,
        ownerId: ownerUid,
        ownerPhone: ownerPhone,
        status: 'active',
        linkedAt: new Date().toISOString()
    };

    customers.push(newCust);
    saveCustomers(customers);

    // Keep old ledger history if any
    const historyMap = JSON.parse(localStorage.getItem('customer_history') || '{}');
    const prevHistory = (customerData[id] && customerData[id].history) || historyMap[id] || [];
    customerData[id] = { name: name, phone: phone, history: prevHistory };
    if (prevHistory.length) {
        historyMap[id] = prevHistory;
        localStorage.setItem('customer_history', JSON.stringify(historyMap));
    }

    const bahiContacts = JSON.parse(localStorage.getItem('bahi_contacts') || '{}');
    bahiContacts[id] = { id: id, name: name, phone: phone };
    localStorage.setItem('bahi_contacts', JSON.stringify(bahiContacts));

    // Firestore — same id, mark active again
    try {
        await safeSetDoc(doc(db, 'customers', id), {
            id: id,
            name: name,
            phone: phone,
            customerUid: customerUid,
            ownerId: ownerUid,
            ownerPhone: ownerPhone,
            status: 'active',
            linkedAt: safeServerTimestamp()
        });
    } catch (e) {
        console.error('save customer FS', e);
    }

    // Link for customer app
    try {
        if (customerUid) {
            await safeSetDoc(doc(db, 'customer_links', customerUid + '_' + ownerUid), {
                customerUid: customerUid,
                customerPhone: phone,
                customerName: name,
                ownerUid: ownerUid,
                ownerPhone: ownerPhone,
                tubewellId: 'primary',
                status: 'linked',
                linkedAt: safeServerTimestamp()
            });
        }
    } catch (e) {
        console.error('customer_links', e);
    }

    if (phoneEl) phoneEl.value = '';
    closeModal('add-customer-modal');
    populateCustomerDropdowns();
    renderCustomers();
    if (typeof renderBahiCustomers === 'function') renderBahiCustomers();

    showToast(
        currentLang === 'en' ? 'Customer added: ' + name : 'ग्राहक जोड़ा: ' + name,
        'success'
    );
};

window.renderCustomers = async function () {
    const ownerUid = localStorage.getItem('user_uid');
    const list = document.getElementById('customers-list');
    if (!list) return;

    function rowHtml(c) {
        return '<div class="list-item">' +
            '<div class="item-info" style="flex:1;cursor:pointer;" onclick="openCustomerDetail(\'' + c.id + '\')">' +
            '<h4>' + (c.name || '') + '</h4><p>' + (c.phone || '') + '</p></div>' +
            '<button class="btn-small" style="margin-right:8px;" onclick="removeCustomer(\'' + c.id + '\', event)">' +
            (currentLang === 'en' ? 'Remove' : 'हटाएं') +
            '</button>' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ios-gray)" stroke-width="2" onclick="openCustomerDetail(\'' + c.id + '\')"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
            '</div>';
    }

    // 1) Show local active list first
    let localCustomers = getCustomers().filter(c => c.status !== 'removed');
    if (localCustomers.length === 0) {
        list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p data-i18n="noCustomers">' +
            locales[currentLang].noCustomers + '</p></div></div>';
    } else {
        list.innerHTML = localCustomers.map(rowHtml).join('');
    }

    // 2) Sync from Firestore — ONLY active (not removed)
    try {
        const snapshot = await getDocs(
            query(collection(db, 'customers'), where('ownerId', '==', ownerUid))
        );
        const active = [];
        snapshot.forEach(d => {
            const data = d.data();
            if (data.status === 'removed') return; // critical
            active.push({
                ...data,
                id: data.id || d.id,
                status: data.status || 'active'
            });
        });

        // Always write local list (even if empty)
        saveCustomers(active);
        loadCustomerData();

        if (active.length === 0) {
            list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p data-i18n="noCustomers">' +
                locales[currentLang].noCustomers + '</p></div></div>';
        } else {
            list.innerHTML = active.map(rowHtml).join('');
        }
    } catch (e) {
        console.error('renderCustomers FS', e);
    }
};

window.removeCustomer = function (customerId, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const cust = getCustomerById(customerId) || (customerData[customerId] || {});
    const name = cust.name || 'Customer';

    showConfirmPopup(
        currentLang === 'en' ? 'Remove customer' : 'ग्राहक हटाएं',
        currentLang === 'en'
            ? 'Remove ' + name + ' from your list? Bahi / payment history will be kept.'
            : name + ' को सूची से हटाएं? बही / भुगतान इतिहास सुरक्षित रहेगा।',
        currentLang === 'en' ? 'Remove' : 'हटाएं',
        currentLang === 'en' ? 'Cancel' : 'रद्द करें',
        function () { proceedRemoveCustomer(customerId); },
        null
    );
};

async function proceedRemoveCustomer(customerId) {
    const ownerUid = localStorage.getItem('user_uid');
    const cust = getCustomerById(customerId) || customerData[customerId] || {};
    const phone = cust.phone || '';
    const name = cust.name || 'Customer';

    // Local Bahi meta (optional, for this session)
    const bahiContacts = JSON.parse(localStorage.getItem('bahi_contacts') || '{}');
    bahiContacts[customerId] = { id: customerId, name: name, phone: phone };
    localStorage.setItem('bahi_contacts', JSON.stringify(bahiContacts));

    if (!customerData[customerId]) {
        customerData[customerId] = { name: name, phone: phone, history: [] };
    } else {
        customerData[customerId].name = name;
        customerData[customerId].phone = phone;
    }

    // Active list only
    saveCustomers(getCustomers().filter(c => c.id !== customerId && c.phone !== phone));

    // DB: mark removed — do NOT delete doc
    try {
        await safeUpdateDoc(doc(db, 'customers', customerId), {
            status: 'removed',
            removedAt: safeServerTimestamp(),
            name: name,
            phone: phone
        });
    } catch (e) {
        // Fallback if doc id differs
        try {
            const snap = await getDocs(query(collection(db, 'customers'), where('ownerId', '==', ownerUid)));
            for (const d of snap.docs) {
                const data = d.data();
                if (d.id === customerId || data.id === customerId || (phone && data.phone === phone)) {
                    await safeUpdateDoc(doc(db, 'customers', d.id), {
                        status: 'removed',
                        removedAt: safeServerTimestamp(),
                        name: data.name || name,
                        phone: data.phone || phone
                    });
                }
            }
        } catch (e2) {
            console.error(e2);
        }
    }

    // Queue only
    try {
        saveQueue(getQueue().filter(e => e.customerId !== customerId));
        const qs = await getDocs(query(
            collection(db, 'queues'),
            where('ownerId', '==', ownerUid),
            where('customerId', '==', customerId)
        ));
        for (const d of qs.docs) {
            await safeDeleteDoc(doc(db, 'queues', d.id));
        }
        if (typeof renderQueue === 'function') renderQueue();
    } catch (e) { }

    populateCustomerDropdowns();
    await renderCustomers();
    renderBahiCustomers();
    showToast(
        currentLang === 'en' ? 'Removed from list. Bahi kept.' : 'सूची से हटाया। बही सुरक्षित।',
        'success'
    );
}

window.renderBahiCustomers = async function () {
    const list = document.getElementById('bahi-customers-list');
    if (!list) return;

    const ownerUid = localStorage.getItem('user_uid');
    const byId = {};

    // From Firestore customers (including removed)
    try {
        const snap = await getDocs(query(collection(db, 'customers'), where('ownerId', '==', ownerUid)));
        snap.forEach(d => {
            const data = d.data();
            const id = data.id || d.id;
            byId[id] = {
                id: id,
                name: data.name || 'Customer',
                phone: data.phone || ''
            };
        });
    } catch (e) {
        console.error(e);
    }

    // Merge local history / water_history / bahi_contacts (backup)
    const active = getCustomers();
    active.forEach(c => {
        byId[c.id] = { id: c.id, name: c.name, phone: c.phone || '' };
    });
    const historyMap = JSON.parse(localStorage.getItem('customer_history') || '{}');
    const bahiContacts = JSON.parse(localStorage.getItem('bahi_contacts') || '{}');
    Object.keys(bahiContacts).forEach(cid => {
        if (!byId[cid]) {
            byId[cid] = {
                id: cid,
                name: bahiContacts[cid].name || 'Customer',
                phone: bahiContacts[cid].phone || ''
            };
        }
    });
    Object.keys(historyMap).forEach(cid => {
        if (historyMap[cid] && historyMap[cid].length && !byId[cid]) {
            const h = customerData[cid] || bahiContacts[cid] || {};
            byId[cid] = { id: cid, name: h.name || 'Customer', phone: h.phone || '' };
        }
    });

    const rows = Object.values(byId);
    if (rows.length === 0) {
        list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p data-i18n="noCustomers">' +
            locales[currentLang].noCustomers + '</p></div></div>';
        return;
    }

    list.innerHTML = rows.map(c =>
        '<div class="list-item" onclick="openBahiLedger(\'' + c.id + '\')">' +
        '<div class="item-info"><h4>' + (c.name || 'Customer') + '</h4><p>' + (c.phone || '') + '</p></div>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ios-gray)" stroke-width="2">' +
        '<polyline points="9 18 15 12 9 6"></polyline></svg></div>'
    ).join('');
};

window.openBahiLedger = function (id) {
    const cust = customerData[id];
    if (!cust) {
        const customers = getCustomers();
        const found = customers.find(c => c.id === id);
        if (found) {
            customerData[id] = { name: found.name, phone: found.phone, history: [] };
        } else {
            return;
        }
    }

    document.getElementById('bahi-ledger-name').innerText = customerData[id].name;
    const history = customerData[id].history || [];
    const list = document.getElementById('bahi-ledger-list');

    if (history.length === 0) {
        list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p>No entries yet.</p></div></div>';
        document.getElementById('bahi-total-due').innerText = '₹0';
        document.getElementById('bahi-total-paid').innerText = '₹0';
        document.getElementById('bahi-balance').innerText = '₹0';
        showView('view-bahi-ledger');
        return;
    }

    const waters = history.filter(e => e.type === 'water');
    const pays = history.filter(e => e.type !== 'water');

    const allWaterAmt = waters.reduce((s, w) => s + (parseFloat(w.amount) || 0), 0);
    const allPaidAmt = pays.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const netDue = Math.max(0, allWaterAmt - allPaidAmt);
    const finalBalance = allWaterAmt - allPaidAmt;

    const sorted = history.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    let runningBalance = 0;

    const ledgerRows = sorted.map(entry => {
        let debit = 0, credit = 0, title = '', noteHtml = '';

        if (entry.type === 'water') {
            debit = entry.amount || 0;
            runningBalance += debit;
            title = 'Water: ' + entry.start + '-' + entry.end + ' (' + entry.duration + ' hrs)';
        } else {
            credit = entry.amount || 0;
            runningBalance -= credit;
            title = 'Payment · ' + (entry.mode || 'Cash');
            if (entry.note) {
                noteHtml = '<p style="font-size:12px;color:var(--ios-gray);margin-top:2px;">' + entry.note + '</p>';
            }
        }

        return '<div class="list-item" style="flex-direction: column; align-items: flex-start; gap: 4px;">' +
            '<div style="display:flex; justify-content:space-between; width:100%;">' +
            '<div class="item-info">' +
            '<h4>' + title + '</h4>' +
            noteHtml +
            '<p style="font-size:12px; color:var(--ios-gray); margin-top: 5px; color: #fa8072;">' + entry.date + '</p>' +
            '</div>' +
            '<div style="text-align:right; min-width:80px;">' +
            '<div style="font-size:13px; color:var(--ios-red);">' + (debit ? '₹' + debit : '') + '</div>' +
            '<div style="font-size:13px; color:var(--ios-green);">' + (credit ? '₹' + credit : '') + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="width:100%; text-align:right; font-size:12px; color:var(--ios-gray); border-top:1px solid var(--ios-border); padding-top:4px;">Balance: <strong style="color:' +
            (runningBalance > 0 ? 'var(--ios-red)' : 'var(--ios-green)') +
            ';">₹' + runningBalance + '</strong></div>' +
            '</div>';
    }).join('');

    list.innerHTML = ledgerRows;
    document.getElementById('bahi-total-due').innerText = '₹' + netDue;
    document.getElementById('bahi-total-paid').innerText = '₹' + allPaidAmt;
    document.getElementById('bahi-balance').innerText = '₹' + finalBalance;
    showView('view-bahi-ledger');
};

let dashboardPeriod = 'today';

window.setDashboardPeriod = function (period) {
    dashboardPeriod = period;
    document.querySelectorAll('.period-btn').forEach(b => {
        const isActive = b.dataset.period === period;
        b.classList.toggle('active', isActive);
        if (isActive) {
            b.style.background = 'var(--ios-blue)';
            b.style.color = '#fff';
            b.style.border = 'none';
        } else {
            b.style.background = 'var(--card)';
            b.style.color = 'var(--text)';
            b.style.border = '1px solid var(--separator)';
        }
    });
    const custom = document.getElementById('custom-date-range');
    if (custom) custom.style.display = period === 'custom' ? 'grid' : 'none';
    if (period === 'custom') {
        const from = document.getElementById('dash-from-date');
        const to = document.getElementById('dash-to-date');
        if (from && !from.value) from.value = new Date().toISOString().split('T')[0];
        if (to && !to.value) to.value = new Date().toISOString().split('T')[0];
        if (from) from.onchange = updateDashboardStats;
        if (to) to.onchange = updateDashboardStats;
    }
    updateDashboardStats();
};

window.updateDashboardStats = function () {
    const history = getWaterHistory();
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    let hours = 0, revenue = 0, received = 0, pending = 0;

    const inRange = (dateStr) => {
        if (!dateStr) return false;
        if (dashboardPeriod === 'today') return dateStr === today;
        if (dashboardPeriod === 'month') {
            return dateStr.startsWith(today.slice(0, 7));
        }
        if (dashboardPeriod === 'year') {
            return dateStr.startsWith(String(now.getFullYear()));
        }
        if (dashboardPeriod === 'custom') {
            const from = (document.getElementById('dash-from-date') || {}).value || today;
            const to = (document.getElementById('dash-to-date') || {}).value || today;
            return dateStr >= from && dateStr <= to;
        }
        return dateStr === today;
    };

    const periodWater = history.filter(e => e.type === 'water' && inRange(e.date));
    const periodPay = history.filter(e => e.type === 'payment' && inRange(e.date));

    // For settlement, use ALL payments for that customer (not only in period),
    // so advance paid earlier still covers today's water.
    const custHistory = JSON.parse(localStorage.getItem('customer_history') || '{}');

    periodWater.forEach(e => {
        hours += e.duration || 0;
        revenue += e.amount || 0;
    });

    // Received in period = payments in period
    periodPay.forEach(e => { received += e.amount || 0; });

    // Pending = water in period not covered by that customer's total payments
    periodWater.forEach(e => {
        const cid = e.customerId;
        const pays = (custHistory[cid] || []).filter(x => x.type === 'payment')
            .concat(history.filter(h => h.customerId === cid && h.type === 'payment'));
        const watersForCust = history.filter(h => h.customerId === cid && h.type === 'water');
        const settled = getSettledWaterKeys(watersForCust, pays);
        if (e.status === 'paid' || settled.has(waterKey(e))) {
            // already covered — count toward received if you want period paid water
        } else {
            pending += e.amount || 0;
        }
    });

    const hrsEl = document.getElementById('stat-hours');
    if (hrsEl) hrsEl.innerHTML = hours.toFixed(1) + ' <small data-i18n="hrs">' + locales[currentLang].hrs + '</small>';
    const revEl = document.getElementById('stat-revenue');
    if (revEl) revEl.innerText = '₹' + Math.round(revenue);
    const recEl = document.getElementById('stat-received');
    if (recEl) recEl.innerText = '₹' + Math.round(received);
    const penEl = document.getElementById('stat-pending');
    if (penEl) penEl.innerText = '₹' + Math.round(pending);
};

window.saveDailyNote = function () {
    const input = document.getElementById('daily-note-input');
    if (!input) return;
    const note = input.value.trim();
    const today = new Date().toISOString().split('T')[0];
    const notes = JSON.parse(localStorage.getItem('daily_notes') || '{}');
    notes[today] = note;
    localStorage.setItem('daily_notes', JSON.stringify(notes));
    showToast(currentLang === 'en' ? 'Note saved' : 'नोट सेव हो गया', 'success');
};

function loadDailyNote() {
    const input = document.getElementById('daily-note-input');
    if (!input) return;
    const today = new Date().toISOString().split('T')[0];
    const notes = JSON.parse(localStorage.getItem('daily_notes') || '{}');
    input.value = notes[today] || '';
}

window.renderPendingPayments = function () {
    const history = getWaterHistory();
    const list = document.getElementById('pending-payments-list');
    if (!list) return;

    const custHistory = JSON.parse(localStorage.getItem('customer_history') || '{}');
    const water = history.filter(h => h.type === 'water');
    const byCustomer = {};

    water.forEach(e => {
        const cid = e.customerId;
        const pays = (custHistory[cid] || []).filter(x => x.type === 'payment');
        // Also include payments stored only in water_history if any
        const paysFromHistory = history.filter(h => h.customerId === cid && h.type === 'payment');
        const allPays = pays.concat(paysFromHistory);
        const watersForCust = water.filter(w => w.customerId === cid);
        const settled = getSettledWaterKeys(watersForCust, allPays);
        if (settled.has(waterKey(e)) || e.status === 'paid') return;
        if (!byCustomer[cid]) byCustomer[cid] = 0;
        byCustomer[cid] += e.amount || 0;
    });

    if (Object.keys(byCustomer).length === 0) {
        list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p data-i18n="noPendingPayments">' + locales[currentLang].noPendingPayments + '</p></div></div>';
        return;
    }

    list.innerHTML = Object.entries(byCustomer).map(([cid, amt]) => {
        if (amt <= 0) return '';
        const c = getCustomerById(cid);
        return '<div class="list-item"><div class="item-info"><h4>' + (c ? c.name : 'Unknown') + '</h4><p>' + (c ? c.phone : '') + '</p></div><div class="item-value text-red">₹' + amt + '</div></div>';
    }).filter(Boolean).join('');

    if (!list.innerHTML) {
        list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p data-i18n="noPendingPayments">' + locales[currentLang].noPendingPayments + '</p></div></div>';
    }
};


/* --- CUSTOMER ROLE: LINK TO TUBEWELL --- */
window.renderCustomerLinkedTubewell = async function () {
    const customerUid = localStorage.getItem('user_uid');
    const infoDiv = document.getElementById('customer-linked-tubewell-info');
    const formDiv = document.getElementById('link-tubewell-form');
    const statusDiv = document.getElementById('customer-request-status');
    if (!infoDiv) return;

    // Check localStorage first
    const link = JSON.parse(localStorage.getItem('customer_link') || 'null');
    const pending = JSON.parse(localStorage.getItem('pending_request_owner') || 'null');

    // Also fetch from Firestore to catch owner-added links
    let firestoreLinks = [];
    if (!isMockMode && customerUid) {
        try {
            const linksRef = collection(db, 'customer_links');
            const q = query(linksRef, where('customerUid', '==', customerUid));
            const snapshot = await getDocs(q);
            snapshot.forEach(d => firestoreLinks.push(d.data()));
        } catch (e) {
            console.error('Fetch customer links failed:', e);
        }
    }

    // If owner added customer directly, auto-create local link
    if (firestoreLinks.length > 0 && !link) {
        const firstLink = firestoreLinks[0];
        localStorage.setItem('customer_link', JSON.stringify({
            ownerPhone: firstLink.ownerPhone,
            ownerUid: firstLink.ownerUid,
            tubewellId: firstLink.tubewellId || 'primary',
            linkedAt: new Date().toISOString()
        }));
        // Refresh to use updated localStorage
        return renderCustomerLinkedTubewell();
    }

    // Always keep the link form visible so customer can link more owners
    if (formDiv) formDiv.style.display = 'block';
    if (statusDiv) statusDiv.style.display = 'none';

    // Show linked / pending status summary (can have multiple)
    let summaryHtml = '';
    if (firestoreLinks.length > 0) {
        summaryHtml = firestoreLinks.map(fl => {
            return '<div class="list-item" style="padding:8px 0; border-bottom:0.5px solid var(--separator);"><div class="item-info"><h4 style="font-size:14px;">' + (fl.ownerPhone || 'Owner') + '</h4><p style="font-size:12px; color:var(--ios-green);">' + (currentLang === 'en' ? 'Linked' : 'जुड़ा हुआ') + '</p></div></div>';
        }).join('');
    } else if (link) {
        const twData = JSON.parse(localStorage.getItem('tubewell_data') || '{}');
        summaryHtml = '<div class="list-item" style="padding:8px 0;"><div class="item-info"><h4 style="font-size:14px;">' + (twData.name || link.ownerPhone || 'Tubewell') + '</h4><p style="font-size:12px; color:var(--ios-green);">' + (currentLang === 'en' ? 'Linked' : 'जुड़ा हुआ') + '</p></div></div>';
    }
    if (pending && pending.status === 'pending') {
        summaryHtml += '<p style="color: var(--ios-orange); font-size: 13px; margin-top:6px;">' + (currentLang === 'en' ? 'Pending request to ' : 'लंबित अनुरोध: ') + pending.ownerPhone + '</p>';
        if (statusDiv) statusDiv.style.display = 'block';
    }
    if (pending && pending.status === 'rejected') {
        summaryHtml += '<p style="color: var(--ios-red); font-size: 13px; margin-top:6px;">' + (currentLang === 'en' ? 'Last request was rejected' : 'पिछला अनुरोध अस्वीकार') + '</p>';
        localStorage.removeItem('pending_request_owner');
    }
    if (!summaryHtml) {
        summaryHtml = '<p style="color: var(--ios-gray); font-size: 14px;">' + (currentLang === 'en' ? 'No tubewell linked yet. Enter owner phone below.' : 'अभी कोई ट्यूबवेल लिंक नहीं। नीचे मालिक का नंबर डालें।') + '</p>';
    }
    infoDiv.innerHTML = summaryHtml;
};
window.renderMyTubewell = async function () {
    const container = document.getElementById('my-tubewell-info');
    if (!container) return;

    const customerUid = localStorage.getItem('user_uid');
    if (!customerUid) {
        container.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p>' + (currentLang === 'en' ? 'Please login first.' : 'कृपया पहले लॉगिन करें।') + '</p></div></div>';
        return;
    }

    // Fetch all links from Firestore
    let links = [];

    if (!isMockMode) {
        try {
            const linksRef = collection(db, 'customer_links');
            const q = query(linksRef, where('customerUid', '==', customerUid));
            const snapshot = await getDocs(q);
            snapshot.forEach(d => links.push(d.data()));
        } catch (e) {
            console.error('Fetch links failed:', e);
        }
    }

    // Fallback to localStorage
    if (links.length === 0) {
        const localLink = JSON.parse(localStorage.getItem('customer_link') || 'null');
        if (localLink) links.push(localLink);
    }

    if (links.length === 0) {
        container.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p>' + (currentLang === 'en' ? 'No tubewell linked yet.' : 'अभी तक कोई ट्यूबवेल लिंक नहीं।') + '</p></div></div>';
        return;
    }

    // Build HTML for all linked tubewells
    let html = '';

    // Find this customer's ID in the customers collection for each owner
    let myCustomerIds = {};
    if (!isMockMode) {
        try {
            const custRef = collection(db, 'customers');
            const cq = query(custRef, where('phone', '==', localStorage.getItem('user_phone')));
            const csnap = await getDocs(cq);
            csnap.forEach(d => {
                const data = d.data();
                myCustomerIds[data.ownerId] = data.id;
            });
        } catch (e) { }
    }

    for (const link of links) {
        const ownerUid = link.ownerUid || link.ownerId;
        if (!ownerUid) continue;

        // Fetch tubewell data
        let twData = {};
        let ownerName = link.ownerName || link.ownerPhone || 'Owner';

        if (!isMockMode) {
            try {
                const twDoc = await getDoc(doc(db, 'tubewells', ownerUid + '_primary'));
                if (twDoc.exists()) twData = twDoc.data();
            } catch (e) { }

            try {
                const ownerDoc = await getDoc(doc(db, 'users', ownerUid));
                if (ownerDoc.exists()) ownerName = ownerDoc.data().name || ownerName;
            } catch (e) { }
        }

        const statusText = twData.status === 'running' ? locales[currentLang].statusRunning :
            twData.status === 'work_in_progress' ? locales[currentLang].statusWorkInProgress :
                locales[currentLang].statusStopped;

        const statusColor = twData.status === 'running' ? 'var(--ios-green)' :
            twData.status === 'work_in_progress' ? '#FF9500' :
                'var(--ios-gray)';

        html +=
            '<div class="list-item" style="flex-direction: column; align-items: flex-start; gap: 8px; margin-bottom: 12px;">' +
            '<div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">' +
            '<h4 style="font-size: 17px; font-weight: 600;">' + (twData.name || 'Tubewell') + '</h4>' +
            '<span class="status-badge ' + (twData.status || 'stopped') + '">' + statusText + '</span>' +
            '</div>' +
            '<p style="color: var(--ios-gray); font-size: 14px;">' + ownerName + ' • ' + (twData.location || '') + '</p>' +
            '<p style="color: var(--ios-gray); font-size: 14px;">Rate: ₹' + (twData.rate || 150) + '/hr</p>' +
            '<div style="margin-top: 8px; padding: 12px; background: var(--bg); border-radius: 10px; width: 100%;">' +
            '<p style="font-size: 13px; color: var(--ios-gray); margin-bottom: 4px;">' + (currentLang === 'en' ? 'Current Status' : 'वर्तमान स्थिति') + '</p>' +
            '<p style="font-size: 15px; font-weight: 500; color: ' + statusColor + ';">' +
            (twData.status === 'running' ?
                (currentLang === 'en' ? 'Water is running' : 'पानी चालू है') :
                twData.status === 'work_in_progress' ?
                    (currentLang === 'en' ? 'Under maintenance' : 'मरम्मत में है') :
                    (currentLang === 'en' ? 'Available for use' : 'उपयोग के लिए उपलब्ध')) +
            '</p>' +
            (twData.currentCustomer ?
                '<p style="font-size: 13px; color: var(--ios-gray); margin-top: 4px;">' +
                (twData.currentCustomer === myCustomerIds[ownerUid] ?
                    (currentLang === 'en' ? 'Running for you' : 'आपके लिए चालू है') :
                    (currentLang === 'en' ? 'Currently in use by another customer' : 'वर्तमान में दूसरे ग्राहक द्वारा उपयोग में है')) +
                '</p>' : '') +
            '</div>' +
            '<button class="btn-ghost mt-2" onclick="unlinkTubewellByOwner(\'' + ownerUid + '\')" style="width:100%; color:var(--ios-red); font-size: 13px; padding: 8px;">' +
            (currentLang === 'en' ? 'Unlink this tubewell' : 'इस ट्यूबवेल को हटाएं') +
            '</button>' +
            '</div>';
    }

    container.innerHTML = html || '<div class="list-item empty-state"><div class="item-info"><p>' + (currentLang === 'en' ? 'No tubewell linked yet.' : 'अभी तक कोई ट्यूबवेल लिंक नहीं।') + '</p></div></div>';
};

window.unlinkTubewellByOwner = async function (ownerUid) {
    const customerUid = localStorage.getItem('user_uid');
    const customerPhone = localStorage.getItem('user_phone');
    if (!customerUid || !ownerUid) return;

    if (!isMockMode) {
        try {
            await safeDeleteDoc(doc(db, 'customer_links', customerUid + '_' + ownerUid));

            // Also try query-based delete
            const linksRef = collection(db, 'customer_links');
            const lq = query(linksRef, where('customerUid', '==', customerUid), where('ownerUid', '==', ownerUid));
            const lsnap = await getDocs(lq);
            lsnap.forEach(async (d) => { await safeDeleteDoc(doc(db, 'customer_links', d.id)); });

            // Remove from owner's customers list (keep water_usage for Bahi)
            const custRef = collection(db, 'customers');
            const cq = query(custRef, where('ownerId', '==', ownerUid), where('phone', '==', customerPhone));
            const csnap = await getDocs(cq);
            csnap.forEach(async (d) => { await safeDeleteDoc(doc(db, 'customers', d.id)); });

            const reqRef = collection(db, 'link_requests');
            const rq = query(reqRef, where('ownerUid', '==', ownerUid), where('customerUid', '==', customerUid));
            const rsnap = await getDocs(rq);
            rsnap.forEach(async (d) => {
                await safeUpdateDoc(doc(db, 'link_requests', d.id), { status: 'rejected' });
            });
        } catch (e) {
            console.error('Unlink failed:', e);
        }
    }

    const linksRef2 = collection(db, 'customer_links');
    const q2 = query(linksRef2, where('customerUid', '==', customerUid));
    const snapshot = await getDocs(q2);
    if (snapshot.empty) {
        localStorage.removeItem('customer_link');
    }

    renderMyTubewell();
    renderCustomerLinkedTubewell();
    showToast(currentLang === 'en' ? 'Unlinked' : 'हटा दिया गया', 'info');
};

window.sendLinkRequest = async function () {
    const phone = document.getElementById('link-owner-phone').value.trim();
    if (phone.length !== 10) {
        showToast(currentLang === 'en' ? 'Enter valid 10-digit phone' : 'सही 10 अंकों का फोन दर्ज करें', 'error');
        return;
    }

    // Query by phone only (do not filter role == owner)
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('phone', '==', phone));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        showToast(currentLang === 'en' ? 'Owner not found' : 'मालिक नहीं मिला', 'error');
        return;
    }

    // Pick a user who is (or can be) an owner: roles includes 'owner' OR role === 'owner'
    let ownerDoc = null;
    for (const d of snapshot.docs) {
        const data = d.data();
        const roles = Array.isArray(data.roles)
            ? data.roles
            : (data.role ? [data.role] : []);
        if (roles.includes('owner') || data.role === 'owner') {
            ownerDoc = d;
            break;
        }
    }

    if (!ownerDoc) {
        showToast(
            currentLang === 'en'
                ? 'This number is not registered as an Owner'
                : 'यह नंबर मालिक के रूप में पंजीकृत नहीं है',
            'error'
        );
        return;
    }

    const ownerData = ownerDoc.data();
    const ownerUid = ownerDoc.id;
    const customerUid = localStorage.getItem('user_uid');
    const customerPhone = localStorage.getItem('user_phone');
    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');

    // Do not allow linking to yourself
    if (ownerUid === customerUid) {
        showToast(
            currentLang === 'en' ? 'You cannot link to your own number' : 'आप अपने नंबर से लिंक नहीं कर सकते',
            'error'
        );
        return;
    }

    // Check if already linked
    const linksRefCheck = collection(db, 'customer_links');
    const linkQ = query(linksRefCheck, where('customerUid', '==', customerUid), where('ownerUid', '==', ownerUid));
    const linkSnap = await getDocs(linkQ);
    if (!linkSnap.empty) {
        showToast(currentLang === 'en' ? 'Already linked' : 'पहले से जुड़ा हुआ है', 'info');
        return;
    }

    // Check if already requested
    const reqRef = collection(db, 'link_requests');
    const existing = query(reqRef, where('ownerUid', '==', ownerUid), where('customerUid', '==', customerUid));
    const exSnap = await getDocs(existing);
    if (!exSnap.empty) {
        const status = exSnap.docs[0].data().status;
        if (status === 'pending') {
            showToast(currentLang === 'en' ? 'Already requested' : 'अनुरोध पहले से भेजा गया है', 'info');
            return;
        }
        if (status === 'accepted') {
            showToast(currentLang === 'en' ? 'Already linked' : 'पहले से जुड़ा हुआ है', 'info');
            return;
        }
    }

    // Create request
    await safeAddDoc(reqRef, {
        ownerUid,
        ownerPhone: phone,
        customerUid,
        customerPhone,
        customerName: userInfo.name || '',
        status: 'pending',
        createdAt: safeServerTimestamp()
    });

    // Notification for owner
    await safeAddDoc(collection(db, 'notifications'), {
        toUid: ownerUid,
        type: 'link_request',
        title: currentLang === 'en' ? 'New link request' : 'नया लिंक अनुरोध',
        body: (userInfo.name || customerPhone) + (currentLang === 'en' ? ' wants to connect' : ' जुड़ना चाहता है'),
        requestData: { customerUid, customerPhone, customerName: userInfo.name || '' },
        read: false,
        createdAt: safeServerTimestamp()
    });

    localStorage.setItem('pending_request_owner', JSON.stringify({ ownerUid, ownerPhone: phone, status: 'pending' }));
    const phoneEl = document.getElementById('link-owner-phone');
    if (phoneEl) phoneEl.value = '';
    renderCustomerLinkedTubewell();
    renderMyTubewell();
    showToast(
        currentLang === 'en' ? 'Request sent! Check My Tubewell section.' : 'अनुरोध भेज दिया गया! मेरा ट्यूबवेल सेक्शन देखें।',
        'success'
    );
};


window.unlinkTubewell = async function () {
    const customerUid = localStorage.getItem('user_uid');
    const customerPhone = localStorage.getItem('user_phone');
    const link = JSON.parse(localStorage.getItem('customer_link') || 'null');
    if (link && link.ownerUid) {
        // Remove customer_links
        const linksRef = collection(db, 'customer_links');
        const q = query(linksRef, where('customerUid', '==', customerUid), where('ownerUid', '==', link.ownerUid));
        const snap = await getDocs(q);
        snap.forEach(async (d) => { await safeDeleteDoc(doc(db, 'customer_links', d.id)); });

        // Remove from owner's customers list (transactions in water_usage stay for Bahi)
        try {
            const custRef = collection(db, 'customers');
            const cq = query(custRef, where('ownerId', '==', link.ownerUid), where('phone', '==', customerPhone));
            const csnap = await getDocs(cq);
            csnap.forEach(async (d) => { await safeDeleteDoc(doc(db, 'customers', d.id)); });
        } catch (e) { console.error('Remove from owner customers failed', e); }

        // Update link_requests to rejected
        const reqRef = collection(db, 'link_requests');
        const rq = query(reqRef, where('ownerUid', '==', link.ownerUid), where('customerUid', '==', customerUid));
        const rsnap = await getDocs(rq);
        rsnap.forEach(async (d) => { await safeUpdateDoc(doc(db, 'link_requests', d.id), { status: 'rejected' }); });
    }
    localStorage.removeItem('customer_link');
    localStorage.removeItem('pending_request_owner');
    renderCustomerLinkedTubewell();
    renderMyTubewell();
    showToast(currentLang === 'en' ? 'Unlinked' : 'हटा दिया गया', 'info');
};

window.renderCustomerQueuePosition = async function () {
    const posEl = document.getElementById('cust-queue-position');
    if (!posEl) return;
    const customerUid = localStorage.getItem('user_uid');
    const userPhone = localStorage.getItem('user_phone');
    let position = -1;

    // Try Firestore queues for linked owners
    try {
        const linksRef = collection(db, 'customer_links');
        const lq = query(linksRef, where('customerUid', '==', customerUid));
        const lsnap = await getDocs(lq);
        for (const ld of lsnap.docs) {
            const ownerUid = ld.data().ownerUid;
            // Find my customer id under this owner
            const custRef = collection(db, 'customers');
            const cq = query(custRef, where('ownerId', '==', ownerUid), where('phone', '==', userPhone));
            const csnap = await getDocs(cq);
            if (csnap.empty) continue;
            const myCustId = csnap.docs[0].id;
            const queueRef = collection(db, 'queues');
            const qq = query(queueRef, where('ownerId', '==', ownerUid));
            const qsnap = await getDocs(qq);
            const entries = qsnap.docs.map(d => d.data()).sort((a, b) => {
                const ta = a.addedAt?.toMillis ? a.addedAt.toMillis() : 0;
                const tb = b.addedAt?.toMillis ? b.addedAt.toMillis() : 0;
                return ta - tb;
            });
            const idx = entries.findIndex(e => e.customerId === myCustId);
            if (idx >= 0) { position = idx; break; }
        }
    } catch (e) { console.error(e); }

    // Fallback local queue
    if (position < 0) {
        const queue = getQueue();
        position = queue.findIndex(q => {
            const c = getCustomerById(q.customerId);
            return c && c.phone === userPhone;
        });
    }

    if (position < 0) { posEl.innerText = '-'; return; }
    if (position === 0) {
        posEl.innerHTML = '<span style="color:var(--ios-green); font-size:13px;">' + locales[currentLang].youAreNext + '</span>';
        return;
    }
    posEl.innerText = '#' + (position + 1);
}

/* --- OWNER: LINK REQUESTS --- */
window.renderLinkRequests = async function () {
    const ownerUid = localStorage.getItem('user_uid');
    if (!ownerUid) return;

    const reqRef = collection(db, 'link_requests');
    const q = query(reqRef, where('ownerUid', '==', ownerUid), where('status', '==', 'pending'));
    const snapshot = await getDocs(q);

    const section = document.getElementById('link-requests-section');
    const list = document.getElementById('link-requests-list');
    const dot = document.getElementById('notif-dot-customers');

    if (snapshot.empty) {
        if (section) section.style.display = 'none';
        if (dot) dot.style.display = 'none';
        return;
    }

    if (section) section.style.display = 'block';
    if (dot) dot.style.display = 'block';

    list.innerHTML = snapshot.docs.map(d => {
        const data = d.data();
        return `<div class="list-item" style="flex-direction: column; align-items: flex-start; gap: 8px;"><div class="item-info"><h4>${data.customerName || data.customerPhone}</h4><p>${data.customerPhone}</p></div><div style="display: flex; gap: 8px; width: 100%;"><button class="btn-primary" style="flex: 1; padding: 8px; font-size: 13px;" onclick="acceptLinkRequest('${d.id}', '${data.customerUid}', '${data.customerPhone}', '${(data.customerName || '').replace(/'/g, "\\'")}')">${locales[currentLang].accept}</button><button class="btn-danger" style="flex: 1; padding: 8px; font-size: 13px;" onclick="rejectLinkRequest('${d.id}', '${data.customerUid}')">${locales[currentLang].reject}</button></div></div>`;
    }).join('');
};

window.acceptLinkRequest = async function (requestId, customerUid, customerPhone, customerName) {
    const ownerUid = localStorage.getItem('user_uid');
    const ownerPhone = localStorage.getItem('user_phone');

    // Update request status
    await safeUpdateDoc(doc(db, 'link_requests', requestId), { status: 'accepted' });

    // Add to customers collection
    const custId = 'cust_' + Date.now();
    await safeSetDoc(doc(db, 'customers', custId), {
        id: custId,
        name: customerName || customerPhone,
        phone: customerPhone,
        customerUid: customerUid,
        tubewellId: 'primary',
        ownerId: ownerUid,
        ownerPhone: ownerPhone,
        linkedAt: safeServerTimestamp()
    });

    // Create customer_link doc
    await safeSetDoc(doc(db, 'customer_links', customerUid + '_' + ownerUid), {
        customerUid,
        customerPhone,
        customerName: customerName || '',
        ownerUid,
        ownerPhone,
        tubewellId: 'primary',
        status: 'linked',
        linkedAt: safeServerTimestamp()
    });

    // Notify customer
    await safeAddDoc(collection(db, 'notifications'), {
        toUid: customerUid,
        type: 'request_accepted',
        title: currentLang === 'en' ? 'Request accepted' : 'अनुरोध स्वीकार',
        body: locales[currentLang].requestAcceptedMsg,
        requestData: { ownerUid: ownerUid, ownerPhone: ownerPhone },
        read: false,
        createdAt: safeServerTimestamp()
    });

    renderLinkRequests();
    renderCustomers();
    showToast(currentLang === 'en' ? 'Customer linked!' : 'ग्राहक जुड़ गया!', 'success');
};

window.rejectLinkRequest = async function (requestId, customerUid) {
    const ownerUid = localStorage.getItem('user_uid');
    const ownerPhone = localStorage.getItem('user_phone');
    await safeUpdateDoc(doc(db, 'link_requests', requestId), { status: 'rejected' });

    // Notify customer
    await safeAddDoc(collection(db, 'notifications'), {
        toUid: customerUid,
        type: 'request_rejected',
        title: currentLang === 'en' ? 'Request rejected' : 'अनुरोध अस्वीकार',
        body: locales[currentLang].requestRejectedMsg,
        requestData: { ownerUid: ownerUid, ownerPhone: ownerPhone },
        read: false,
        createdAt: safeServerTimestamp()
    });

    renderLinkRequests();
    showToast(currentLang === 'en' ? 'Request rejected' : 'अनुरोध अस्वीकार कर दिया', 'info');
};

/* --- REAL-TIME LISTENERS --- */
let unsubTubewell = null;
let unsubQueue = null;
let unsubCustomers = null;

window.startOwnerListeners = function () {
    const ownerUid = localStorage.getItem('user_uid');
    if (!ownerUid || isMockMode) return;

    // Listen to tubewell changes
    const twRef = doc(db, 'tubewells', ownerUid + '_primary');
    unsubTubewell = onSnapshot(twRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            saveTubewellData(data);
            renderStatusCard();
            renderTubewells();
        }
    });

    // Listen to queue changes
    const queueRef = collection(db, 'queues');
    const q = query(queueRef, where('ownerId', '==', ownerUid));
    unsubQueue = onSnapshot(q, (snapshot) => {
        const queue = [];
        snapshot.forEach(d => queue.push(d.data()));
        queue.sort((a, b) => a.addedAt?.toMillis?.() - b.addedAt?.toMillis?.() || 0);
        saveQueue(queue);
        renderQueue();
    });

    // Listen to customers changes
    const custRef = collection(db, 'customers');
    const cq = query(custRef, where('ownerId', '==', ownerUid));
    unsubCustomers = onSnapshot(cq, (snapshot) => {
        const customers = [];
        snapshot.forEach(d => customers.push(d.data()));
        saveCustomers(customers);
        loadCustomerData();
        renderCustomers();
        renderBahiCustomers();
        populateCustomerDropdowns();
    });

    // Listen for new link requests
    const reqRef = collection(db, 'link_requests');
    const rq = query(reqRef, where('ownerUid', '==', ownerUid), where('status', '==', 'pending'));
    onSnapshot(rq, () => {
        renderLinkRequests();
    });

    // Live sync water_usage → dashboard / pending / Bahi
    const uq = query(collection(db, 'water_usage'), where('business_id', '==', ownerUid));
    onSnapshot(uq, () => {
        syncOwnerUsageFromServer();
    });
    // Initial
    syncOwnerUsageFromServer();
};


/* --- CUSTOMER USAGE SYNC FROM FIRESTORE --- */
window.loadCustomerUsageFromServer = async function () {
    const customerUid = localStorage.getItem('user_uid');
    const customerPhone = localStorage.getItem('user_phone');
    if (!customerUid && !customerPhone) return [];

    const records = [];
    const seen = new Set();

    try {
        // Query by customer_uid
        if (customerUid) {
            const q1 = query(collection(db, 'water_usage'), where('customer_uid', '==', customerUid));
            const s1 = await getDocs(q1);
            s1.forEach(d => {
                if (!seen.has(d.id)) {
                    seen.add(d.id);
                    records.push({ id: d.id, ...d.data() });
                }
            });
        }
        // Also by phone (covers owner-added customers before account existed)
        if (customerPhone) {
            const q2 = query(collection(db, 'water_usage'), where('customer_phone', '==', customerPhone));
            const s2 = await getDocs(q2);
            s2.forEach(d => {
                if (!seen.has(d.id)) {
                    seen.add(d.id);
                    records.push({ id: d.id, ...d.data() });
                }
            });
        }
    } catch (e) {
        console.error('loadCustomerUsage failed', e);
    }

    // Sort by date desc
    records.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.start_time || '').localeCompare(a.start_time || ''));
    return records;
};

// Cache owner names
const ownerNameCache = {};
async function getOwnerLabel(businessId) {
    if (!businessId) return currentLang === 'en' ? 'Unknown owner' : 'अज्ञात मालिक';
    if (ownerNameCache[businessId]) return ownerNameCache[businessId];
    try {
        const od = await getDoc(doc(db, 'users', businessId));
        if (od.exists()) {
            const d = od.data();
            ownerNameCache[businessId] = (d.name || '') + (d.phone ? ' · ' + d.phone : '');
            return ownerNameCache[businessId];
        }
    } catch (e) { }
    ownerNameCache[businessId] = businessId;
    return businessId;
}

async function getOwnerAndTubewell(businessId) {
    let ownerName = currentLang === 'en' ? 'Owner' : 'मालिक';
    let twName = currentLang === 'en' ? 'Tubewell' : 'ट्यूबवेल';
    if (!businessId) return { ownerName, twName };
    try {
        const u = await getDoc(doc(db, 'users', businessId));
        if (u.exists()) ownerName = u.data().name || ownerName;
    } catch (e) { }
    try {
        const t = await getDoc(doc(db, 'tubewells', businessId + '_primary'));
        if (t.exists()) twName = t.data().name || twName;
    } catch (e) { }
    return { ownerName, twName };
}

window.renderCustomerUsageDashboard = async function () {
    const records = await loadCustomerUsageFromServer();
    const water = records.filter(r => r.type === 'water' || (!r.type && r.duration != null));
    const payments = records.filter(r => r.type === 'payment');

    let totalHrs = 0, totalDue = 0, totalPaid = 0;
    water.forEach(r => {
        totalHrs += parseFloat(r.duration) || 0;
        if (r.status === 'pending') totalDue += parseFloat(r.amount) || 0;
        else if (r.status === 'paid') totalPaid += parseFloat(r.amount) || 0;
    });
    payments.forEach(r => { totalPaid += parseFloat(r.amount) || 0; });
    // Net due = water pending - (payments beyond paid water). Simple: due = max(0, sum water - sum payments)
    const allWaterAmt = water.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const netDue = Math.max(0, allWaterAmt - totalPaid);

    const hrsEl = document.getElementById('cust-total-hrs');
    const dueEl = document.getElementById('cust-total-due-display');
    const paidEl = document.getElementById('cust-total-paid-display');
    if (hrsEl) hrsEl.innerHTML = totalHrs.toFixed(1) + ' <small>Hrs</small>';
    if (dueEl) dueEl.innerText = '₹' + Math.round(netDue);
    if (paidEl) paidEl.innerText = '₹' + Math.round(totalPaid);

    const list = document.getElementById('customer-usage-list');
    if (list) {
        if (water.length === 0) {
            list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p>' + (currentLang === 'en' ? 'No usage yet' : 'अभी कोई उपयोग नहीं') + '</p></div></div>';
        } else {
            // Apply payments against water (oldest first)
            let creditLeft = totalPaid;
            const waterSorted = water.slice().sort((a, b) =>
                (a.date || '').localeCompare(b.date || '') ||
                (a.start_time || '').localeCompare(b.start_time || '')
            );
            const settledIds = new Set();
            waterSorted.forEach(r => {
                const amt = parseFloat(r.amount) || 0;
                if (creditLeft >= amt) {
                    settledIds.add(r.id || (r.date + r.start_time + amt));
                    creditLeft -= amt;
                }
            });

            Promise.all(water.map(async r => {
                const { ownerName, twName } = await getOwnerAndTubewell(r.business_id);
                const key = r.id || (r.date + r.start_time + (r.amount || 0));
                const isSettled = r.status === 'paid' || settledIds.has(key) || settledIds.has(r.id);
                return { r, ownerName, twName, isSettled };
            })).then(rows => {
                list.innerHTML = rows.map(({ r, ownerName, twName, isSettled }) => {
                    const st = isSettled
                        ? '<span style="font-size:11px;color:var(--ios-green);">PAID</span>'
                        : '<span style="font-size:11px;color:var(--ios-red);">PENDING</span>';
                    return '<div class="list-item"><div class="item-info">' +
                        '<h4>' + (currentLang === 'en' ? 'Water' : 'पानी') + '</h4>' +
                        '<p>' + (r.date || '') + ' · ' + (r.start_time || '') + ' - ' + (r.end_time || '') +
                        ' · ' + (r.duration || 0) + ' hrs</p>' +
                        '<p style="font-size:12px;color:var(--ios-blue);margin-top:2px;">' +
                        twName + ' · ' + ownerName +
                        '</p></div>' +
                        '<div style="text-align:right;"><div class="item-value ' +
                        (isSettled ? 'text-green' : 'text-red') + '">₹' + (r.amount || 0) +
                        '</div>' + st + '</div></div>';
                }).join('');
            });
        }
    }

    // When building payList — make the map async-friendly:
    const payList = document.getElementById('customer-payments-list');
    if (payList) {
        if (payments.length === 0) {
            payList.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p>' +
                (currentLang === 'en' ? 'No payments yet' : 'अभी कोई भुगतान नहीं') +
                '</p></div></div>';
        } else {
            // Resolve names then render
            Promise.all(payments.map(async r => {
                const ownerLabel = await getOwnerLabel(r.business_id);
                return { r, ownerLabel };
            })).then(rows => {
                payList.innerHTML = rows.map(({ r, ownerLabel }) => {
                    return '<div class="list-item"><div class="item-info">' +
                        '<h4>' + (r.note || (currentLang === 'en' ? 'Cash' : 'नकद')) + '</h4>' +
                        '<p>' + (r.date || '') + '</p>' +
                        '<p style="font-size:12px;color:var(--ios-blue);margin-top:2px;">' +
                        (currentLang === 'en' ? 'To: ' : 'को: ') + ownerLabel +
                        '</p></div>' +
                        '<div class="item-value text-green">₹' + (r.amount || 0) + '</div></div>';
                }).join('');
            });
        }
    }
};

/* --- OWNER: SYNC water_usage FROM SERVER INTO LOCAL --- */
window.syncOwnerUsageFromServer = async function () {
    const ownerUid = localStorage.getItem('user_uid');
    if (!ownerUid) return;
    try {
        const q = query(collection(db, 'water_usage'), where('business_id', '==', ownerUid));
        const snap = await getDocs(q);
        const history = [];
        const custHistory = {};
        snap.forEach(d => {
            const r = d.data();
            const cid = r.customer_id;
            if (r.type === 'water' || (!r.type && r.duration != null)) {
                history.push({
                    id: d.id,
                    customerId: cid,
                    customerUid: r.customer_uid,
                    customerPhone: r.customer_phone,
                    date: r.date,
                    start: r.start_time,
                    end: r.end_time,
                    duration: r.duration,
                    rate: r.rate,
                    amount: r.amount,
                    status: r.status || 'pending',
                    type: 'water'
                });
                if (!custHistory[cid]) custHistory[cid] = [];
                custHistory[cid].push({
                    type: 'water', date: r.date, start: r.start_time, end: r.end_time,
                    duration: r.duration, rate: r.rate, amount: r.amount, status: r.status || 'pending'
                });
            } else if (r.type === 'payment') {
                if (!custHistory[cid]) custHistory[cid] = [];
                custHistory[cid].push({
                    id: d.id,
                    type: 'payment',
                    date: r.date,
                    amount: r.amount,
                    mode: r.mode || (r.note === 'Cash' || r.note === 'UPI' || r.note === 'Online' || r.note === 'Bank' ? r.note : 'Cash'),
                    note: r.note || ''
                });
            }
        });
        saveWaterHistory(history);
        localStorage.setItem('customer_history', JSON.stringify(custHistory));
        // Rebuild customerData histories
        Object.keys(custHistory).forEach(cid => {
            if (!customerData[cid]) {
                const c = getCustomerById(cid);
                customerData[cid] = { name: c ? c.name : '', phone: c ? c.phone : '', history: [] };
            }
            customerData[cid].history = custHistory[cid];
        });
        updateDashboardStats();
        renderPendingPayments();
    } catch (e) {
        console.error('syncOwnerUsage failed', e);
    }
};

window.startCustomerListeners = function () {
    const customerUid = localStorage.getItem('user_uid');
    if (!customerUid || isMockMode) return;

    const link = JSON.parse(localStorage.getItem('customer_link') || 'null');
    const pending = JSON.parse(localStorage.getItem('pending_request_owner') || 'null');

    // If already linked, listen to tubewell and queue
    if (link && link.ownerUid) {
        const twRef = doc(db, 'tubewells', link.ownerUid + '_primary');
        unsubTubewell = onSnapshot(twRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                saveTubewellData(data);
                renderCustomerLinkedTubewell();
                renderCustomerQueuePosition();
                renderMyTubewell();
            }
        });

        const queueRef = collection(db, 'queues');
        const q = query(queueRef, where('ownerId', '==', link.ownerUid));
        unsubQueue = onSnapshot(q, (snapshot) => {
            const queue = [];
            snapshot.forEach(d => queue.push(d.data()));
            saveQueue(queue);
            renderCustomerQueuePosition();
        });
    }

    // Live sync of water usage / payments for this customer
    const phone = localStorage.getItem('user_phone');
    try {
        if (customerUid) {
            const uq = query(collection(db, 'water_usage'), where('customer_uid', '==', customerUid));
            onSnapshot(uq, () => { renderCustomerUsageDashboard(); });
        }
        if (phone) {
            const pq = query(collection(db, 'water_usage'), where('customer_phone', '==', phone));
            onSnapshot(pq, () => { renderCustomerUsageDashboard(); });
        }
    } catch (e) { console.error(e); }
    // Initial load
    renderCustomerUsageDashboard();

    // Always listen for notifications (accept/reject) regardless of link status
    const notifRef = collection(db, 'notifications');
    const nq = query(notifRef, where('toUid', '==', customerUid), where('read', '==', false));
    onSnapshot(nq, (snapshot) => {
        snapshot.docChanges().forEach(async change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                const pending = JSON.parse(localStorage.getItem('pending_request_owner') || 'null');
                if (data.type === 'request_accepted') {
                    const ownerPhone = pending ? pending.ownerPhone : (data.requestData ? data.requestData.ownerPhone : '');
                    const ownerUid = pending ? pending.ownerUid : (data.requestData ? data.requestData.ownerUid : '');
                    localStorage.setItem('customer_link', JSON.stringify({
                        ownerPhone: ownerPhone,
                        ownerUid: ownerUid,
                        tubewellId: 'primary',
                        linkedAt: new Date().toISOString()
                    }));
                    localStorage.removeItem('pending_request_owner');
                    renderCustomerLinkedTubewell();
                    renderCustomerQueuePosition();
                    showToast(data.body, 'success');
                } else if (data.type === 'request_rejected') {
                    localStorage.setItem('pending_request_owner', JSON.stringify({
                        ownerPhone: pending ? pending.ownerPhone : '',
                        ownerUid: pending ? pending.ownerUid : '',
                        status: 'rejected'
                    }));
                    renderCustomerLinkedTubewell();
                    showToast(data.body, 'error');
                }
                await safeUpdateDoc(doc(db, 'notifications', change.doc.id), { read: true });
            }
        });
    });
};

window.stopListeners = function () {
    if (unsubTubewell) { unsubTubewell(); unsubTubewell = null; }
    if (unsubQueue) { unsubQueue(); unsubQueue = null; }
    if (unsubCustomers) { unsubCustomers(); unsubCustomers = null; }
};

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


window.showConfirmPopup = function (title, message, okText, cancelText, onOk, onCancel) {
    let overlay = document.getElementById('confirm-popup-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'confirm-popup-overlay';
        overlay.className = 'modal-overlay active';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width: 360px; margin: auto; border-radius: 16px; transform: none;">
                <div class="modal-header"><h3 id="confirm-popup-title"></h3></div>
                <div class="modal-body">
                    <p id="confirm-popup-msg" style="font-size:15px; color:var(--text-secondary); margin-bottom:20px; line-height:1.45;"></p>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-ghost" id="confirm-popup-cancel" style="flex:1;"></button>
                        <button class="btn-primary" id="confirm-popup-ok" style="flex:1;"></button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    }
    document.getElementById('confirm-popup-title').innerText = title;
    document.getElementById('confirm-popup-msg').innerText = message;
    document.getElementById('confirm-popup-ok').innerText = okText || 'OK';
    document.getElementById('confirm-popup-cancel').innerText = cancelText || 'Cancel';
    overlay.classList.add('active');
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const okBtn = document.getElementById('confirm-popup-ok');
    const cancelBtn = document.getElementById('confirm-popup-cancel');
    const close = () => { overlay.classList.remove('active'); overlay.style.display = 'none'; };
    okBtn.onclick = () => { close(); if (onOk) onOk(); };
    cancelBtn.onclick = () => { close(); if (onCancel) onCancel(); };
};

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
        linkRequestSent: "Link request sent",
        requestPending: "Request pending",
        waitingForApproval: "Waiting for owner approval",
        newRequest: "New request",
        accept: "Accept",
        reject: "Reject",
        requestAccepted: "Request accepted",
        requestRejected: "Request rejected",
        noNotifications: "No notifications",
        linkRequests: "Link requests",
        requestedBy: "Requested by",
        requestAcceptedMsg: "Owner accepted your request",
        requestRejectedMsg: "Owner rejected your request",
        sendRequest: "Send request",
        ledger: "Ledger",
        debit: "Debit",
        credit: "Credit",
        balance: "Balance",
        totalDue: "Total Due",
        totalPaid: "Total Paid",
        deleteAccount: "Delete Account",
        howAppWorks: "How this app works",
        howAppWorksSub: "Guide for owners & customers",
        dateOfBirth: "Date of Birth",
        iAmA: "I am a",
        tubewellOwner: "Tubewell Owner",
        customerRole: "Customer",
        loginBtn: "Login",
        registerBtn: "Register",
        continueWithDetails: "Should we continue with these details?",
        completeProfile: "Complete Your Profile",
        tellAboutYourself: "Tell us a bit about yourself.",
        yourName: "Your Name",
        primaryTubewellName: "Primary Tubewell Name",
        continueToApp: "Continue to App",
        addEmail: "Add Email",
        emailOptional: "Email (optional)",
        periodToday: "Today",
        periodMonth: "This Month",
        periodYear: "This Year",
        periodCustom: "Custom",
        selectPeriod: "Period",
        notesReminder: "Today's Note",
        saveNote: "Save Note",
        noNotes: "No notes for today",
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
        linkRequestSent: "लिंक अनुरोध भेजा गया",
        requestPending: "अनुरोध लंबित",
        waitingForApproval: "मालिक की स्वीकृति का इंतजार",
        newRequest: "नया अनुरोध",
        accept: "स्वीकार करें",
        reject: "अस्वीकार करें",
        requestAccepted: "अनुरोध स्वीकार",
        requestRejected: "अनुरोध अस्वीकार",
        noNotifications: "कोई सूचना नहीं",
        linkRequests: "लिंक अनुरोध",
        requestedBy: "अनुरोध किया",
        requestAcceptedMsg: "मालिक ने अनुरोध स्वीकार किया",
        requestRejectedMsg: "मालिक ने अनुरोध अस्वीकार किया",
        sendRequest: "अनुरोध भेजें",
        ledger: "बही-खाता",
        debit: "जमा",
        credit: "नामे",
        balance: "बाकी",
        totalDue: "कुल बाकी",
        totalPaid: "कुल जमा",
        deleteAccount: "खाता हटाएं",
        howAppWorks: "ऐप कैसे काम करता है",
        howAppWorksSub: "मालिक और ग्राहक गाइड",
        dateOfBirth: "जन्म तिथि",
        iAmA: "मैं हूँ",
        tubewellOwner: "ट्यूबवेल मालिक",
        customerRole: "ग्राहक",
        loginBtn: "लॉगिन",
        registerBtn: "पंजीकरण",
        continueWithDetails: "क्या हम इन विवरणों के साथ आगे बढ़ें?",
        completeProfile: "अपना प्रोफाइल पूरा करें",
        tellAboutYourself: "अपने बारे में थोड़ा बताएं।",
        yourName: "आपका नाम",
        primaryTubewellName: "प्राथमिक ट्यूबवेल का नाम",
        continueToApp: "ऐप में जारी रखें",
        addEmail: "ईमेल जोड़ें",
        emailOptional: "ईमेल (वैकल्पिक)",
        periodToday: "आज",
        periodMonth: "इस महीने",
        periodYear: "इस साल",
        periodCustom: "कस्टम",
        selectPeriod: "अवधि",
        notesReminder: "आज का नोट",
        saveNote: "नोट सेव करें",
        noNotes: "आज कोई नोट नहीं",
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
    const userName = userInfo.name || ownerInfo.name || '';
    const greetingEl = document.querySelector('.greeting');
    if (greetingEl) {
        if (userName) greetingEl.innerText = (lang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + userName;
        else greetingEl.innerText = (lang === 'en' ? 'Namaste' : 'नमस्ते');
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
let confirmationResult = null;
/* --- LOGIN STATE --- */
let isRegisterMode = false;

document.getElementById('send-otp-btn').addEventListener('click', async () => {
    const phoneInput = document.getElementById('login-phone').value.trim();
    const dobInput = document.getElementById('login-dob').value;
    if (phoneInput.length !== 10) {
        showToast(currentLang === 'en' ? "Enter valid 10 digit number" : "सही 10 अंकों का नंबर दर्ज करें", "error");
        return;
    }
    if (!dobInput) {
        showToast(currentLang === 'en' ? "Please enter Date of Birth" : "कृपया जन्म तिथि दर्ज करें", "error");
        return;
    }

    const uid = 'phone_' + phoneInput;
    localStorage.setItem('user_uid', uid);
    localStorage.setItem('user_phone', phoneInput);
    localStorage.setItem('user_role', userRole);
    localStorage.setItem('user_dob', dobInput);

    // REGISTER MODE: go to profile completion
    if (isRegisterMode) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('basic-info-screen').classList.add('active');
        const extra = document.getElementById('owner-extra-fields');
        if (extra) extra.style.display = userRole === 'owner' ? 'block' : 'none';
        return;
    }

    // LOGIN MODE: check if user exists
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            const existingUser = userDoc.data();

            if (existingUser.accountStatus === 'deleted') {
                showConfirmPopup(
                    currentLang === 'en' ? 'Account deleted' : 'खाता हटाया गया',
                    currentLang === 'en'
                        ? 'This account was deleted. Do you want to register again with this number?'
                        : 'यह खाता हटा दिया गया था। क्या आप इसी नंबर से फिर पंजीकरण करना चाहते हैं?',
                    currentLang === 'en' ? 'Register again' : 'फिर पंजीकरण',
                    currentLang === 'en' ? 'Cancel' : 'रद्द करें',
                    function () {
                        isRegisterMode = true;
                        const btn = document.getElementById('send-otp-btn');
                        if (btn) btn.innerText = currentLang === 'en' ? 'Register' : 'पंजीकरण करें';
                        const msg = document.getElementById('register-confirm-msg');
                        if (msg) msg.style.display = 'block';
                        showToast(
                            currentLang === 'en' ? 'Confirm details and tap Register' : 'विवरण की पुष्टि करें और पंजीकरण पर टैप करें',
                            'info'
                        );
                    },
                    null
                );
                return;
            }

            // Verify DOB
            if (existingUser.dob && existingUser.dob !== dobInput) {
                showToast(currentLang === 'en' ? "Wrong Date of Birth. Please check details." : "गलत जन्म तिथि। कृपया विवरण जांचें।", "error");
                return;
            }

            // Roles this account already has
            const existingRoles = Array.isArray(existingUser.roles)
                ? existingUser.roles
                : (existingUser.role ? [existingUser.role] : []);

            // CASE A: Requested role already exists → normal login
            if (existingRoles.includes(userRole)) {
                localStorage.setItem('is_logged_in', 'true');
                localStorage.setItem('user_role', userRole);
                localStorage.setItem('user_info', JSON.stringify({
                    name: existingUser.name || '',
                    village: existingUser.village || '',
                    phone: phoneInput,
                    email: existingUser.email || '',
                    dob: existingUser.dob || dobInput
                }));

                if (userRole === 'owner' || existingRoles.includes('owner')) {
                    localStorage.setItem('owner_info', JSON.stringify({
                        name: existingUser.name || '',
                        village: existingUser.village || '',
                        phone: phoneInput,
                        email: existingUser.email || ''
                    }));
                    const twDoc = await getDoc(doc(db, 'tubewells', uid + '_primary'));
                    if (twDoc.exists()) {
                        localStorage.setItem('tubewell_data', JSON.stringify(twDoc.data()));
                    }
                }

                localStorage.setItem('user_roles', JSON.stringify(existingRoles));

                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('login-screen').classList.remove('active');
                document.getElementById('app-shell').style.display = 'block';

                if (userRole === 'customer') {
                    setupCustomerUI();
                } else {
                    loadOwnerData();
                    setupOwnerUI();
                }
                showToast(currentLang === 'en' ? "Welcome back!" : "वापसी का स्वागत है!", "success");
                return;
            }

            // CASE B: Account exists with other role only → ask to add this role
            const otherRoleLabel = existingRoles.includes('owner')
                ? (currentLang === 'en' ? 'Owner' : 'मालिक')
                : (currentLang === 'en' ? 'Customer' : 'ग्राहक');
            const wantLabel = userRole === 'customer'
                ? (currentLang === 'en' ? 'Customer' : 'ग्राहक')
                : (currentLang === 'en' ? 'Owner' : 'मालिक');

            showConfirmPopup(
                currentLang === 'en' ? 'Account already exists' : 'खाता पहले से मौजूद है',
                currentLang === 'en'
                    ? 'You already have an ' + otherRoleLabel + ' account. Do you want to also create a ' + wantLabel + ' profile with the same details?'
                    : 'आपके पास पहले से ' + otherRoleLabel + ' खाता है। क्या आप उन्हीं विवरणों से ' + wantLabel + ' प्रोफ़ाइल भी बनाना चाहते हैं?',
                currentLang === 'en' ? 'Yes, create' : 'हाँ, बनाएं',
                currentLang === 'en' ? 'Cancel' : 'रद्द करें',
                () => {
                    isRegisterMode = true;
                    localStorage.setItem('user_role', userRole);

                    document.getElementById('owner-name').value = existingUser.name || '';
                    document.getElementById('owner-village').value = existingUser.village || '';

                    const extra = document.getElementById('owner-extra-fields');
                    if (extra) extra.style.display = userRole === 'owner' ? 'block' : 'none';

                    document.getElementById('login-screen').style.display = 'none';
                    document.getElementById('login-screen').classList.remove('active');
                    document.getElementById('basic-info-screen').classList.add('active');

                    showToast(
                        currentLang === 'en'
                            ? 'Name & village filled. Confirm and save.'
                            : 'नाम और गाँव भर दिए गए। पुष्टि करके सेव करें।',
                        'info'
                    );
                },
                () => {
                    showToast(currentLang === 'en' ? 'Login cancelled' : 'लॉगिन रद्द', 'info');
                }
            );
            return;
        }
    } catch (e) {
        console.error('User lookup failed:', e);
    }

    // User does not exist — show custom popup
    showConfirmPopup(
        currentLang === 'en' ? 'Account not found' : 'खाता नहीं मिला',
        currentLang === 'en'
            ? 'This account does not exist. Do you want to register yourself?'
            : 'यह खाता मौजूद नहीं है। क्या आप पंजीकरण करना चाहते हैं?',
        currentLang === 'en' ? 'Create new' : 'नया बनाएं',
        currentLang === 'en' ? 'Correct Details' : 'विवरण सही करें',
        () => {
            isRegisterMode = true;
            const btn = document.getElementById('send-otp-btn');
            if (btn) btn.innerText = currentLang === 'en' ? 'Register' : 'पंजीकरण करें';
            const msg = document.getElementById('register-confirm-msg');
            if (msg) msg.style.display = 'block';
            showToast(currentLang === 'en' ? 'Confirm details and tap Register' : 'विवरण की पुष्टि करें और पंजीकरण पर टैप करें', 'info');
        },
        () => {
            showToast(currentLang === 'en' ? 'Please correct your details' : 'कृपया अपना विवरण सही करें', 'info');
        }
    );
});

/* --- BASIC INFO ONBOARDING --- */
document.getElementById('save-basic-info-btn').addEventListener('click', async () => {
    const name = document.getElementById('owner-name').value.trim();
    const village = document.getElementById('owner-village').value.trim();
    if (!name || !village) {
        showToast(currentLang === 'en' ? "Please fill all fields" : "सभी फील्ड भरें", "error");
        return;
    }

    const phone = localStorage.getItem('user_phone');
    const uid = localStorage.getItem('user_uid');
    const dob = localStorage.getItem('user_dob') || '';

    let twName = '';
    let twRate = 150;
    if (userRole === 'owner') {
        twName = (document.getElementById('reg-tw-name') || {}).value?.trim() || '';
        twRate = parseFloat((document.getElementById('reg-tw-rate') || {}).value) || 150;
        if (!twName) {
            showToast(currentLang === 'en' ? "Enter primary tubewell name" : "प्राथमिक ट्यूबवेल का नाम दर्ज करें", "error");
            return;
        }
    }

    // Merge roles so same phone can be both owner and customer
    const userRef = doc(db, 'users', uid);
    const existingSnap = await getDoc(userRef);
    let roles = [userRole];
    let existingEmail = '';

    localStorage.setItem('user_roles', JSON.stringify(roles));

    if (existingSnap.exists()) {
        const d = existingSnap.data();
        const prev = Array.isArray(d.roles) ? d.roles : (d.role ? [d.role] : []);
        roles = Array.from(new Set(prev.concat([userRole])));
        existingEmail = d.email || '';
    }

    const userData = {
        name,
        village,
        phone,
        dob,
        email: existingEmail,
        role: userRole,
        roles: roles,
        updatedAt: safeServerTimestamp()
    };

    if (existingSnap.exists() && existingSnap.data().accountStatus === 'deleted') {
        // Fresh start after full soft-delete
        roles = [userRole];
        userData.accountStatus = 'active';
        userData.deletedAt = null;
    }


    if (!existingSnap.exists()) {
        userData.createdAt = safeServerTimestamp();
    }

    if (existingSnap.exists()) {
        await safeUpdateDoc(userRef, userData);
    } else {
        await safeSetDoc(userRef, userData);
    }

    localStorage.setItem('is_logged_in', 'true');
    localStorage.setItem('user_roles', JSON.stringify(roles));
    localStorage.setItem('user_role', userRole);
    localStorage.setItem('user_info', JSON.stringify({ name, village, phone, email: existingEmail, dob }));

    document.getElementById('basic-info-screen').classList.remove('active');
    document.getElementById('app-shell').style.display = 'block';

    document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + name;
    document.getElementById('profile-name-display').innerText = name;
    document.getElementById('edit-profile-name').value = name;
    document.getElementById('profile-business-display').innerText = village;
    document.getElementById('edit-profile-business').value = village;

    if (userRole === 'customer') {
        setupCustomerUI();
    } else {
        localStorage.setItem('owner_info', JSON.stringify({ name, village, phone, email: existingEmail }));
        const defaultTw = {
            name: twName,
            location: village,
            rate: twRate,
            status: 'stopped',
            currentCustomer: null,
            currentStartTime: null,
            ownerId: uid
        };
        // Only create tubewell if it does not already exist
        const twRef = doc(db, 'tubewells', uid + '_primary');
        const twSnap = await getDoc(twRef);
        if (!twSnap.exists()) {
            await safeSetDoc(twRef, defaultTw);
            localStorage.setItem('tubewell_data', JSON.stringify(defaultTw));
        } else {
            localStorage.setItem('tubewell_data', JSON.stringify(twSnap.data()));
        }
        setupOwnerUI();
    }
    isRegisterMode = false;
    showToast(currentLang === 'en' ? "Welcome!" : "स्वागत है!", "success");
});

function loadOwnerData() {
    const data = JSON.parse(localStorage.getItem('owner_info') || localStorage.getItem('user_info') || '{}');
    if (data.name) {
        document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + data.name;
        document.getElementById('profile-name-display').innerText = data.name;
        document.getElementById('edit-profile-name').value = data.name;
    }
    if (data.village) {
        document.getElementById('profile-business-display').innerText = data.village;
        document.getElementById('edit-profile-business').value = data.village;
    } else {
        const bd = document.getElementById('profile-business-display');
        if (bd) bd.innerText = '';
        const be = document.getElementById('edit-profile-business');
        if (be) be.value = '';
    }
    if (data.email) {
        const emailEl = document.getElementById('profile-email-display');
        if (emailEl) emailEl.innerText = data.email;
        const emailInput = document.getElementById('edit-profile-email');
        if (emailInput) emailInput.value = data.email;
    }
}

/* --- PROFILE EDIT --- */
window.toggleProfileEdit = function (show) {
    document.getElementById('profile-view-mode').style.display = show ? 'none' : 'block';
    document.getElementById('profile-edit-mode').style.display = show ? 'block' : 'none';
}

window.saveProfile = async function () {
    const name = document.getElementById('edit-profile-name').value.trim();
    const village = document.getElementById('edit-profile-business').value.trim();
    const email = (document.getElementById('edit-profile-email') || {}).value?.trim() || '';
    if (!name || !village) {
        showToast(currentLang === 'en' ? "Please fill all fields" : "सभी फील्ड भरें", "error");
        return;
    }
    const uid = localStorage.getItem('user_uid');
    await safeUpdateDoc(doc(db, 'users', uid), { name, village, email });
    const info = JSON.parse(localStorage.getItem('user_info') || '{}');
    info.name = name; info.village = village; info.email = email;
    localStorage.setItem('user_info', JSON.stringify(info));
    if (localStorage.getItem('user_role') === 'owner') {
        localStorage.setItem('owner_info', JSON.stringify(info));
    }
    localStorage.setItem('profile_name', name);
    localStorage.setItem('profile_village', village);
    document.getElementById('profile-name-display').innerText = name;
    document.querySelector('.greeting').innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + name;
    document.getElementById('profile-business-display').innerText = village;
    const emailEl = document.getElementById('profile-email-display');
    if (emailEl) emailEl.innerText = email || '';
    toggleProfileEdit(false);
    showToast(currentLang === 'en' ? "Profile Updated!" : "प्रोफाइल अपडेट हो गई!", "success");
}

window.deleteProfile = async function () {
    const uid = localStorage.getItem('user_uid');
    if (!uid) {
        logout();
        return;
    }

    // Load roles from server (fallback to local)
    let roles = JSON.parse(localStorage.getItem('user_roles') || '[]');
    try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
            const d = snap.data();
            roles = Array.isArray(d.roles)
                ? d.roles
                : (d.role ? [d.role] : roles);
        }
    } catch (e) {
        console.error(e);
    }

    const hasOwner = roles.includes('owner');
    const hasCustomer = roles.includes('customer');
    const currentRole = localStorage.getItem('user_role') || userRole;

    // Both roles → ask Customer | Owner | Both
    if (hasOwner && hasCustomer) {
        showDeleteRoleChooser(function (choice) {
            // choice: 'customer' | 'owner' | 'both'
            proceedSoftDelete(choice);
        });
        return;
    }

    // Only one role → simple confirm
    const onlyRole = hasOwner ? 'owner' : (hasCustomer ? 'customer' : currentRole);
    const label = onlyRole === 'owner'
        ? (currentLang === 'en' ? 'Owner' : 'मालिक')
        : (currentLang === 'en' ? 'Customer' : 'ग्राहक');

    showConfirmPopup(
        currentLang === 'en' ? 'Delete Account Access' : 'खाता एक्सेस हटाएं',
        currentLang === 'en'
            ? 'Remove your ' + label + ' access? History (Bahi / water) will be kept for records. You can register again later.'
            : 'अपना ' + label + ' एक्सेस हटाएं? इतिहास (बही / पानी) रिकॉर्ड के लिए रहेगा। बाद में फिर पंजीकरण कर सकते हैं।',
        currentLang === 'en' ? 'Delete' : 'हटाएं',
        currentLang === 'en' ? 'Cancel' : 'रद्द करें',
        function () { proceedSoftDelete(onlyRole); },
        null
    );
};

/** Custom chooser: Customer | Owner | Both | Cancel */
function showDeleteRoleChooser(onChoice) {
    let overlay = document.getElementById('delete-role-chooser');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'delete-role-chooser';
    overlay.className = 'modal-overlay active';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const tTitle = currentLang === 'en' ? 'Delete Account Access' : 'खाता एक्सेस हटाएं';
    const tMsg = currentLang === 'en'
        ? 'You have both Owner and Customer profiles. What should we remove? History (Bahi / water) is kept.'
        : 'आपके पास मालिक और ग्राहक दोनों प्रोफ़ाइल हैं। क्या हटाना है? इतिहास (बही / पानी) सुरक्षित रहेगा।';
    const tCust = currentLang === 'en' ? 'Customer only' : 'केवल ग्राहक';
    const tOwn = currentLang === 'en' ? 'Owner only' : 'केवल मालिक';
    const tBoth = currentLang === 'en' ? 'Both' : 'दोनों';
    const tCancel = currentLang === 'en' ? 'Cancel' : 'रद्द करें';

    overlay.innerHTML =
        '<div class="modal-content" style="max-width:360px;margin:auto;border-radius:16px;transform:none;">' +
        '<div class="modal-header"><h3>' + tTitle + '</h3></div>' +
        '<div class="modal-body">' +
        '<p style="font-size:15px;color:var(--text-secondary);margin-bottom:16px;line-height:1.45;">' + tMsg + '</p>' +
        '<button class="btn-primary" id="del-choice-customer" style="width:100%;margin-bottom:8px;">' + tCust + '</button>' +
        '<button class="btn-primary" id="del-choice-owner" style="width:100%;margin-bottom:8px;background:var(--ios-orange,#ff9500);">' + tOwn + '</button>' +
        '<button class="btn-primary" id="del-choice-both" style="width:100%;margin-bottom:8px;background:var(--ios-red);">' + tBoth + '</button>' +
        '<button class="btn-ghost" id="del-choice-cancel" style="width:100%;">' + tCancel + '</button>' +
        '</div></div>';

    document.body.appendChild(overlay);

    const close = function () { overlay.remove(); };
    document.getElementById('del-choice-customer').onclick = function () { close(); onChoice('customer'); };
    document.getElementById('del-choice-owner').onclick = function () { close(); onChoice('owner'); };
    document.getElementById('del-choice-both').onclick = function () { close(); onChoice('both'); };
    document.getElementById('del-choice-cancel').onclick = function () { close(); };
}

/**
 * Soft-delete: revoke access only.
 * choice: 'customer' | 'owner' | 'both'
 * Does NOT delete water_usage, payments, or Bahi history.
 */
async function proceedSoftDelete(choice) {
    const uid = localStorage.getItem('user_uid');
    const currentRole = localStorage.getItem('user_role') || userRole;

    if (!uid) {
        logout();
        return;
    }

    showToast(currentLang === 'en' ? 'Updating account...' : 'खाता अपडेट हो रहा है...', 'info');

    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
            logout();
            return;
        }

        const d = snap.data();
        let roles = Array.isArray(d.roles)
            ? d.roles.slice()
            : (d.role ? [d.role] : []);

        if (choice === 'customer') {
            roles = roles.filter(function (r) { return r !== 'customer'; });
        } else if (choice === 'owner') {
            roles = roles.filter(function (r) { return r !== 'owner'; });
        } else {
            // both
            roles = [];
        }

        const update = {
            roles: roles,
            role: roles[0] || '',
            updatedAt: safeServerTimestamp()
        };

        if (roles.length === 0) {
            update.accountStatus = 'deleted';
            update.deletedAt = safeServerTimestamp();
        } else {
            update.accountStatus = 'active';
        }

        await safeUpdateDoc(userRef, update);
        localStorage.setItem('user_roles', JSON.stringify(roles));

        // Optional: deactivate links for removed customer role (access only — keep water_usage)
        if (choice === 'customer' || choice === 'both') {
            try {
                const linksRef = collection(db, 'customer_links');
                const lq = query(linksRef, where('customerUid', '==', uid));
                const ls = await getDocs(lq);
                for (const docSnap of ls.docs) {
                    await safeUpdateDoc(doc(db, 'customer_links', docSnap.id), {
                        status: 'inactive',
                        unlinkedAt: safeServerTimestamp()
                    });
                }
                const reqRef = collection(db, 'link_requests');
                const rq = query(reqRef, where('customerUid', '==', uid), where('status', '==', 'pending'));
                const rs = await getDocs(rq);
                for (const docSnap of rs.docs) {
                    await safeUpdateDoc(doc(db, 'link_requests', docSnap.id), { status: 'cancelled' });
                }
            } catch (e) {
                console.error('Link cleanup', e);
            }
            localStorage.removeItem('customer_link');
            localStorage.removeItem('pending_request_owner');
        }

        // Optional: stop active queue for owner role (do not delete water_usage)
        if (choice === 'owner' || choice === 'both') {
            try {
                const queueRef = collection(db, 'queues');
                const qq = query(queueRef, where('ownerId', '==', uid));
                const qs = await getDocs(qq);
                for (const docSnap of qs.docs) {
                    await safeDeleteDoc(doc(db, 'queues', docSnap.id));
                }
                // Mark tubewell stopped — do NOT delete tubewell doc or water_usage
                const twRef = doc(db, 'tubewells', uid + '_primary');
                const twSnap = await getDoc(twRef);
                if (twSnap.exists()) {
                    await safeUpdateDoc(twRef, {
                        status: 'stopped',
                        currentCustomer: null,
                        currentStartTime: null,
                        ownerActive: false
                    });
                }
            } catch (e) {
                console.error('Owner cleanup', e);
            }
        }

        showToast(
            currentLang === 'en' ? 'Access removed. Records kept.' : 'एक्सेस हटा दिया गया। रिकॉर्ड सुरक्षित हैं।',
            'success'
        );

        // If they deleted the role they are using now, or both → logout
        if (choice === 'both' || choice === currentRole || roles.length === 0) {
            setTimeout(function () { logout(); }, 600);
        } else {
            // Still have the other role — switch UI if needed
            localStorage.setItem('user_role', roles[0]);
            if (roles[0] === 'owner') {
                loadOwnerData();
                setupOwnerUI();
            } else {
                setupCustomerUI();
            }
            if (typeof closeModal === 'function') closeModal('profile-modal');
        }
    } catch (e) {
        console.error('Soft delete failed:', e);
        showToast(currentLang === 'en' ? 'Could not update account' : 'खाता अपडेट नहीं हो सका', 'error');
    }
}

/* --- MODALS --- */

window.openHelpModal = function () {
    const body = document.getElementById('help-modal-body');
    const role = localStorage.getItem('user_role') || userRole || 'owner';
    if (currentLang === 'hi') {
        if (role === 'customer') {
            body.innerHTML = `
                <h4 style="color:var(--text); margin-bottom:8px;">ग्राहक के लिए</h4>
                <ol style="padding-left:18px; margin-bottom:16px;">
                    <li style="margin-bottom:8px;"><b>लिंक करें</b> — मालिक का 10 अंकों का मोबाइल नंबर डालकर अनुरोध भेजें। मालिक स्वीकार करे तो ट्यूबवेल जुड़ जाएगा।</li>
                    <li style="margin-bottom:8px;"><b>कतार</b> — मालिक आपको कतार में डाल सकता है। “मेरी कतार स्थिति” पर अपनी बारी देखें।</li>
                    <li style="margin-bottom:8px;"><b>पानी का उपयोग</b> — जब मालिक आपके नाम पर पानी शुरू/बंद करता है, घंटे और राशि अपने-आप “मेरा उपयोग” में दिखती है।</li>
                    <li style="margin-bottom:8px;"><b>भुगतान</b> — मालिक जब भुगतान दर्ज करता है, वह “भुगतान” टैब में दिखता है। बाकी रकम डैशबोर्ड पर दिखती है।</li>
                    <li style="margin-bottom:8px;"><b>कई मालिक</b> — आप एक से अधिक ट्यूबवेल मालिक से जुड़ सकते हैं।</li>
                </ol>
                <p style="font-size:13px; color:var(--ios-gray);">सभी रिकॉर्ड सर्वर पर सुरक्षित रहते हैं — फोन बदलने पर भी लॉगिन से डेटा वापस आ जाता है।</p>`;
        } else {
            body.innerHTML = `
                <h4 style="color:var(--text); margin-bottom:8px;">मालिक के लिए</h4>
                <ol style="padding-left:18px; margin-bottom:16px;">
                    <li style="margin-bottom:8px;"><b>ग्राहक जोड़ें</b> — नाम + फोन डालें, या ग्राहक के लिंक अनुरोध को स्वीकार करें।</li>
                    <li style="margin-bottom:8px;"><b>पानी शुरू/बंद</b> — होम पर “पानी शुरू” से ग्राहक चुनें, रेट सेट करें। बंद करने पर घंटे × रेट = बिल, बाकी भुगतान में दिखता है।</li>
                    <li style="margin-bottom:8px;"><b>पानी का हिसाब (मैनुअल)</b> — अगर पहले से पानी चल चुका हो तो समय डालकर रिकॉर्ड सेव करें।</li>
                    <li style="margin-bottom:8px;"><b>+ भुगतान</b> — ग्राहक विवरण में नकद/भुगतान दर्ज करें। इससे बही-खाता अपडेट होता है।</li>
                    <li style="margin-bottom:8px;"><b>कतार</b> — ग्राहक को कतार में डालें। “अगला” और कतार संख्या होम पर दिखती है।</li>
                    <li style="margin-bottom:8px;"><b>बही-खाता</b> — हर ग्राहक का पूरा लेजर (पानी + भुगतान) यहाँ सुरक्षित रहता है।</li>
                </ol>
                <p style="font-size:13px; color:var(--ios-gray);">ग्राहक का ऐप भी उसी रिकॉर्ड को लाइव देखता है — अलग से कुछ भेजने की जरूरत नहीं।</p>`;
        }
    } else {
        if (role === 'customer') {
            body.innerHTML = `
                <h4 style="color:var(--text); margin-bottom:8px;">For customers</h4>
                <ol style="padding-left:18px; margin-bottom:16px;">
                    <li style="margin-bottom:8px;"><b>Link</b> — Enter the owner’s 10-digit mobile and send a request. When they accept, the tubewell is linked.</li>
                    <li style="margin-bottom:8px;"><b>Queue</b> — Owner can put you in the queue. Check “My queue position” on My Usage.</li>
                    <li style="margin-bottom:8px;"><b>Water usage</b> — When the owner starts/stops water in your name, hours and amount appear automatically under My Usage.</li>
                    <li style="margin-bottom:8px;"><b>Payments</b> — When the owner records a payment, it shows under the Payments tab. Due amount is on your dashboard.</li>
                    <li style="margin-bottom:8px;"><b>Multiple owners</b> — You can link to more than one tubewell owner.</li>
                </ol>
                <p style="font-size:13px; color:var(--ios-gray);">All records are saved on the server — log in again on a new phone to get your data back.</p>`;
        } else {
            body.innerHTML = `
                <h4 style="color:var(--text); margin-bottom:8px;">For tubewell owners</h4>
                <ol style="padding-left:18px; margin-bottom:16px;">
                    <li style="margin-bottom:8px;"><b>Add customers</b> — Name + phone, or accept a link request from a customer.</li>
                    <li style="margin-bottom:8px;"><b>Start / Stop water</b> — On Home, Start water → pick customer → set rate. On Stop, hours × rate = bill and it goes to Pending payments. The customer sees the same record live.</li>
                    <li style="margin-bottom:8px;"><b>Paani Ka Hisab (manual)</b> — If water already ran, enter start/end time and save a record without using the live timer.</li>
                    <li style="margin-bottom:8px;"><b>+ Payment</b> — On a customer’s detail page, record cash/UPI received. This updates Bahi-khata for both of you.</li>
                    <li style="margin-bottom:8px;"><b>Queue</b> — Add customers to the queue. “Next in queue” and queue count show on Home.</li>
                    <li style="margin-bottom:8px;"><b>Bahi-khata</b> — Full ledger per customer (water + payments) stays here even if they unlink later.</li>
                </ol>
                <p style="font-size:13px; color:var(--ios-gray);">Customer app reads the same server records — no need to share bills separately.</p>`;
        }
    }
    openModal('help-modal');
};

window.openModal = function (id) {
    document.getElementById(id).classList.add('active');
    if (id === 'start-water-modal') {
        const rateEl = document.getElementById('start-water-rate');
        if (rateEl) {
            const tw = getTubewellData();
            rateEl.value = tw.rate || 150;
        }
    }
    if (id === 'profile-modal') {
        updateBecomeOwnerButton();
    }
};


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
        const ownerUid = localStorage.getItem('user_uid');
        const cust = getCustomerById(customerId) || {};
        const rate = getRate();
        const ownerInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
        const twLocal = getTubewellData();
        const payload = {
            business_id: ownerUid,
            customer_id: customerId,
            customer_uid: cust.customerUid || ('phone_' + (cust.phone || '')),
            customer_phone: cust.phone || '',
            customer_name: cust.name || '',
            start_time: timeStart.value,
            end_time: timeEnd.value,
            duration: duration,
            rate: rate,
            amount: amount,
            status: 'pending',
            type: 'water',
            date: today,
            created_at: safeServerTimestamp(),
            owner_name: ownerInfo.name || '',
            owner_phone: localStorage.getItem('user_phone') || '',
            tubewell_name: twLocal.name || 'Tubewell'
        };
        const docRef = await safeAddDoc(collection(db, "water_usage"), payload);

        // Save to localStorage for dashboard
        const history = getWaterHistory();
        history.push({
            id: docRef.id || ('local_' + Date.now()),
            customerId, customerUid: payload.customer_uid, customerPhone: payload.customer_phone,
            date: today, start: timeStart.value, end: timeEnd.value, duration, rate, amount,
            status: 'pending', type: 'water'
        });
        saveWaterHistory(history);

        const custHistory = JSON.parse(localStorage.getItem('customer_history') || '{}');
        if (!custHistory[customerId]) custHistory[customerId] = [];
        custHistory[customerId].push({ type: 'water', date: today, start: timeStart.value, end: timeEnd.value, duration, rate, amount, status: 'pending' });
        localStorage.setItem('customer_history', JSON.stringify(custHistory));

        if (!customerData[customerId]) customerData[customerId] = { name: cust.name || '', phone: cust.phone || '', history: [] };
        customerData[customerId].history.push({ type: 'water', date: today, start: timeStart.value, end: timeEnd.value, duration, rate, amount, status: 'pending' });

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

window.addNewTubewell = async function () {
    const name = document.getElementById('new-tw-name').value.trim();
    const location = document.getElementById('new-tw-location').value.trim();
    const rate = parseFloat(document.getElementById('new-tw-rate').value);
    if (!name || !location || !rate) {
        showToast(currentLang === 'en' ? "Please fill all fields" : "सभी फील्ड भरें", "error");
        return;
    }
    const ownerUid = localStorage.getItem('user_uid');
    const extras = JSON.parse(localStorage.getItem('tubewell_extras') || '[]');
    const newTw = { name, location, rate, createdAt: new Date().toISOString(), ownerId: ownerUid, status: 'stopped', currentCustomer: null, currentStartTime: null };
    extras.push(newTw);
    localStorage.setItem('tubewell_extras', JSON.stringify(extras));

    // Save to Firestore
    await safeSetDoc(doc(db, 'tubewells', ownerUid + '_extra_' + extras.length), newTw);

    renderTubewells();
    closeModal('add-tubewell-modal');
    document.getElementById('new-tw-name').value = '';
    document.getElementById('new-tw-location').value = '';
    document.getElementById('new-tw-rate').value = '150';
    showToast(currentLang === 'en' ? "Tubewell Added!" : "ट्यूबवेल जोड़ दिया गया!", "success");
}

/* --- CUSTOMER DETAIL VIEW --- */
window.currentCustomerId = null;

const customerData = {
};

window.openCustomerDetail = function (id) {
    window.currentCustomerId = id;
    const cust = customerData[id];
    if (!cust) {
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

    const waters = allHistory.filter(e => e.type === 'water');
    const pays = allHistory.filter(e => e.type === 'payment');
    const settled = getSettledWaterKeys(waters, pays);

    let totalDue = 0, totalPaid = 0, totalHours = 0, lastEntry = '-';

    historyList.innerHTML = allHistory.slice().reverse().map((entry, idx) => {
        if (entry.type === 'water') {
            totalHours += entry.duration || 0;
            if (idx === 0) lastEntry = entry.date;
            const isSettled = entry.status === 'paid' || settled.has(waterKey(entry));
            if (!isSettled) totalDue += entry.amount || 0;
            return '<div class="list-item"><div class="item-info"><h4>Water Usage</h4><p>' + entry.date + ' • ' + entry.start + ' - ' + entry.end + ' • ' + entry.duration + ' hrs</p></div><div style="text-align: right;"><div class="item-value ' + (isSettled ? 'text-green' : 'text-red') + '">₹' + entry.amount + '</div><span style="font-size: 11px; color: var(--ios-gray); text-transform: uppercase;">' + (isSettled ? 'paid' : 'pending') + '</span></div></div>';
        } else {
            totalPaid += entry.amount || 0;
            if (idx === 0) lastEntry = entry.date;
            const modeLabel = entry.mode || 'Cash';
            const notePart = entry.note ? ' · ' + entry.note : '';
            return '<div class="list-item"><div class="item-info"><h4>Payment · ' + modeLabel + '</h4><p' + entry.date + '</p>' + (entry.note ? '<p style="font-size:12px;color:var(--ios-gray);margin-top:2px;">' + entry.note + '</p>' : '') + '</div><div class="item-value text-green">-₹' + entry.amount + '</div></div>';
        }
    }).join('');

    document.getElementById('cust-total-due').innerText = '₹' + totalDue;
    document.getElementById('cust-total-paid').innerText = '₹' + totalPaid;
    document.getElementById('cust-total-hours').innerHTML = totalHours.toFixed(1) + ' <small>Hrs</small>';
    document.getElementById('cust-last-entry').innerText = lastEntry;
    showView('view-customer-detail');
};

window.showView = function (viewId) {
    views.forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    navItems.forEach(nav => nav.classList.remove('active'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.savePayment = async function () {
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const date = document.getElementById('payment-date').value;
    const mode = (document.getElementById('payment-mode') || {}).value || 'Cash';
    const note = document.getElementById('payment-note').value.trim();

    if (!amount || !date) {
        showToast(currentLang === 'en' ? "Enter amount and date" : "राशि और तारीख दर्ज करें", "error");
        return;
    }
    if (!window.currentCustomerId) return;

    const cust = getCustomerById(window.currentCustomerId) || customerData[window.currentCustomerId] || {};
    const ownerUid = localStorage.getItem('user_uid');

    try {
        await safeAddDoc(collection(db, 'water_usage'), {
            business_id: ownerUid,
            customer_id: window.currentCustomerId,
            customer_uid: cust.customerUid || ('phone_' + (cust.phone || '')),
            customer_phone: cust.phone || '',
            customer_name: cust.name || '',
            amount,
            mode: mode,
            note: note,
            status: 'paid',
            type: 'payment',
            date,
            created_at: safeServerTimestamp(),
            owner_name: (JSON.parse(localStorage.getItem('user_info') || '{}').name || ''),
            owner_phone: localStorage.getItem('user_phone') || '',
        });
    } catch (e) {
        console.error('Payment save FS failed', e);
        showToast(currentLang === 'en' ? "Save failed" : "सेव नहीं हुआ", "error");
        return;
    }

    await syncOwnerUsageFromServer();

    document.getElementById('payment-amount').value = '';
    document.getElementById('payment-note').value = '';
    const modeEl = document.getElementById('payment-mode');
    if (modeEl) modeEl.value = 'Cash';
    closeModal('payment-modal');
    openCustomerDetail(window.currentCustomerId);
    updateDashboardStats();
    renderPendingPayments();
    showToast(currentLang === 'en' ? "Payment Saved!" : "भुगतान सेव हो गया!", "success");
};

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
                <div style="position: relative;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span id="notif-dot-customers"
                        style="position: absolute; top: -4px; right: -4px; width: 8px; height: 8px; background: var(--ios-red); border-radius: 50%; display: none;"></span>
                </div>
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
            if (targetId === 'view-customers') {
                renderCustomers();
                renderLinkRequests();
            }
            if (targetId === 'view-bahi') renderBahiCustomers();
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
    const prb = document.getElementById('profile-role-badge');
    if (prb) {
        prb.innerText = currentLang === 'en' ? 'Owner' : 'मालिक';
        prb.style.background = 'rgba(0,122,255,0.1)';
        prb.style.color = 'var(--ios-blue)';
    }

    loadCustomerData();
    populateCustomerDropdowns();
    renderCustomers();
    renderStatusCard();
    loadDailyNote();
    renderQueue();
    if (typeof renderNextInQueue === 'function') renderNextInQueue();
    updateDashboardStats();
    renderPendingPayments();
    startOwnerListeners();
    renderLinkRequests();
    renderBahiCustomers();
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
            if (targetId === 'view-customer-usage' || targetId === 'view-my-payments') {
                if (typeof renderCustomerUsageDashboard === 'function') renderCustomerUsageDashboard();
            }
            if (targetId === 'view-my-tubewell' && typeof renderMyTubewell === 'function') renderMyTubewell();
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
    const prb = document.getElementById('profile-role-badge');
    if (prb) {
        prb.innerText = currentLang === 'en' ? 'Customer' : 'ग्राहक';
        prb.style.background = 'rgba(52,199,89,0.1)';
        prb.style.color = 'var(--ios-green)';
    }
    // Fill customer profile page + greeting
    const info = JSON.parse(localStorage.getItem('user_info') || '{}');
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val || '—'; };
    setTxt('cust-profile-name', info.name);
    setTxt('cust-profile-village', info.village);
    setTxt('cust-profile-phone', localStorage.getItem('user_phone') || info.phone);
    setTxt('cust-profile-email', info.email);
    setTxt('profile-name-display', info.name);
    setTxt('profile-business-display', info.village);
    setTxt('profile-email-display', info.email);

    const greetingEl = document.querySelector('.greeting');
    if (greetingEl) {
        greetingEl.innerText = (currentLang === 'en' ? 'Namaste, ' : 'नमस्ते, ') + (info.name || '');
    }

    renderCustomerLinkedTubewell().then(() => {
        renderCustomerQueuePosition();
        renderMyTubewell();
        if (typeof renderCustomerUsageDashboard === 'function') renderCustomerUsageDashboard();
    });

    // Check if there's a pending request and verify its status from Firestore
    const pending = JSON.parse(localStorage.getItem('pending_request_owner') || 'null');
    if (pending && pending.ownerUid) {
        const reqRef = collection(db, 'link_requests');
        const q = query(reqRef, where('ownerUid', '==', pending.ownerUid), where('customerUid', '==', localStorage.getItem('user_uid')));
        getDocs(q).then(snapshot => {
            if (!snapshot.empty) {
                const status = snapshot.docs[0].data().status;
                if (status === 'accepted') {
                    localStorage.setItem('customer_link', JSON.stringify({
                        ownerPhone: pending.ownerPhone,
                        ownerUid: pending.ownerUid,
                        tubewellId: 'primary',
                        linkedAt: new Date().toISOString()
                    }));
                    localStorage.removeItem('pending_request_owner');
                    renderCustomerLinkedTubewell();
                    showToast(currentLang === 'en' ? 'Request accepted!' : 'अनुरोध स्वीकार!', 'success');
                } else if (status === 'rejected') {
                    localStorage.setItem('pending_request_owner', JSON.stringify({ ...pending, status: 'rejected' }));
                    renderCustomerLinkedTubewell();
                    showToast(currentLang === 'en' ? 'Request rejected' : 'अनुरोध अस्वीकार', 'error');
                }
            }
        });
    }
    startCustomerListeners();
    updateBecomeOwnerButton();
}


window.becomeOwner = function () {
    showConfirmPopup(
        currentLang === 'en' ? 'Become Owner' : 'मालिक बनें',
        currentLang === 'en'
            ? "Switch to owner mode? Your customer data will be preserved."
            : "मालिक मोड में स्विच करें? आपका ग्राहक डेटा सुरक्षित रहेगा।",
        currentLang === 'en' ? 'Continue' : 'जारी रखें',
        currentLang === 'en' ? 'Cancel' : 'रद्द करें',
        () => {
            // Close profile modal first
            if (typeof closeModal === 'function') {
                closeModal('profile-modal');
            } else {
                const pm = document.getElementById('profile-modal');
                if (pm) pm.classList.remove('active');
            }

            userRole = 'owner';
            localStorage.setItem('user_role', 'owner');
            document.getElementById('app-shell').style.display = 'none';
            document.querySelectorAll('.main-view').forEach(v => v.classList.remove('active'));
            document.querySelectorAll('.customer-only').forEach(v => v.style.display = 'none');

            // Pre-fill name/village from existing customer profile
            const info = JSON.parse(localStorage.getItem('user_info') || '{}');
            const nameEl = document.getElementById('owner-name');
            const villageEl = document.getElementById('owner-village');
            if (nameEl) nameEl.value = info.name || '';
            if (villageEl) villageEl.value = info.village || '';

            const extra = document.getElementById('owner-extra-fields');
            if (extra) extra.style.display = 'block';

            document.getElementById('basic-info-screen').classList.add('active');
            showToast(
                currentLang === 'en' ? "Complete your owner profile" : "अपना मालिक प्रोफाइल पूरा करें",
                "info"
            );
        },
        null
    );
};


window.updateBecomeOwnerButton = async function () {
    const section = document.getElementById('become-owner-section');
    if (!section) return;

    const role = localStorage.getItem('user_role') || '';
    const isCustomer = role === 'customer';

    if (!isCustomer) {
        section.style.display = 'none';
        return;
    }

    let roles = JSON.parse(localStorage.getItem('user_roles') || '[]');

    // Prefer server roles (fixes first login after adding second role)
    try {
        const uid = localStorage.getItem('user_uid');
        if (uid) {
            const snap = await getDoc(doc(db, 'users', uid));
            if (snap.exists()) {
                const d = snap.data();
                roles = Array.isArray(d.roles)
                    ? d.roles
                    : (d.role ? [d.role] : roles);
                localStorage.setItem('user_roles', JSON.stringify(roles));
            }
        }
    } catch (e) {
        console.error('updateBecomeOwnerButton roles fetch', e);
    }

    const alreadyOwner = roles.includes('owner');
    section.style.display = alreadyOwner ? 'none' : 'block';
};


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
// Set max DOB to today
(function () {
    const dob = document.getElementById('login-dob');
    if (dob) dob.max = new Date().toISOString().split('T')[0];
})();
