import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-analytics.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDoc, doc, setDoc, updateDoc, onSnapshot, query, where, getDocs, deleteDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
// Auth removed — phone + DOB verification used instead

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

async function resolveCustomerUid(phone) {
    if (!phone) return '';
    try {
        const snap = await getDocs(query(collection(db, 'users'), where('phone', '==', phone)));
        for (const d of snap.docs) {
            if (d.data().accountStatus !== 'deleted') return d.id;
        }
    } catch (e) { console.error('resolveCustomerUid', e); }
    return '';
}

window.logout = function () {
    stopListeners();
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
    localStorage.removeItem('daily_notes');
    cleanupCustomerData();
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


function formatDuration(hours) {
    const h = parseFloat(hours) || 0;
    if (h <= 0) return currentLang === 'en' ? '0 min' : '0 मिनट';

    const totalMin = Math.round(h * 60);
    if (totalMin < 1) {
        return currentLang === 'en' ? '< 1 min' : '< 1 मिनट';
    }

    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;

    if (currentLang === 'hi') {
        if (hrs === 0) return mins + ' मिनट';
        if (mins === 0) return hrs + ' घंटा';
        return hrs + ' घंटा ' + mins + ' मिनट';
    }

    if (hrs === 0) return mins + ' min';
    if (mins === 0) return hrs + (hrs === 1 ? ' hr' : ' hrs');
    return hrs + (hrs === 1 ? ' hr ' : ' hrs ') + mins + ' min';
}


function loadCustomerData() {
    const customers = getCustomers();
    const history = JSON.parse(localStorage.getItem('customer_history') || '{}');
    const bahiContacts = JSON.parse(localStorage.getItem('bahi_contacts') || '{}');

    customers.forEach(c => {
        customerData[c.id] = {
            name: c.name,
            phone: c.phone,
            customerUid: c.customerUid || '',
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
    // Only active, non-deleted customers for water / actions
    const customers = getCustomers().filter(c =>
        c.status !== 'removed' && c.accountDeleted !== true
    );

    const options = customers.map(c =>
        '<option value="' + c.id + '">' + c.name + '</option>'
    ).join('');

    const startSelect = document.getElementById('start-water-customer');
    if (startSelect) {
        startSelect.innerHTML =
            '<option value="">-- ' +
            (currentLang === 'en' ? 'Select customer' : 'ग्राहक चुनें') +
            ' --</option>' + options;
    }

    const waterSelect = document.getElementById('water-customer');
    const waterDisplay = document.getElementById('water-customer-display');
    const waterOptions = document.getElementById('water-customer-options');

    if (waterSelect) {
        if (customers.length > 0) {
            waterSelect.value = customers[0].id;
            if (waterDisplay) waterDisplay.innerText = customers[0].name;
            if (waterOptions) {
                waterOptions.innerHTML = customers.map(c =>
                    '<div class="custom-option ' + (c.id === customers[0].id ? 'selected' : '') +
                    '" data-value="' + c.id + '" onclick="selectOption(this)">' + c.name + '</div>'
                ).join('');
            }
        } else {
            waterSelect.value = '';
            if (waterDisplay) waterDisplay.innerText = currentLang === 'en' ? 'Select customer' : 'ग्राहक चुनें';
            if (waterOptions) waterOptions.innerHTML = '';
        }
    }
}

function waterKey(r) {
    return r.id || `${r.date}|${r.start || r.start_time || ''}|${r.amount}`;
}

/** Payments applied to water bills oldest-first. Returns { settled: Set, remainingCredit: number } */
function getSettledWaterKeys(waterList, paymentsList) {
    const totalPaid = (paymentsList || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    let creditLeft = totalPaid;
    const settled = new Set();
    const partial = new Map(); // key -> amount still due
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
        } else if (creditLeft > 0) {
            // Partial settlement
            partial.set(key, amt - creditLeft);
            creditLeft = 0;
        }
    });
    return { settled, partial, remainingCredit: creditLeft };
}


/** Comparable timestamp for an entry (ms). Prefer created_at, else date + time. */
function entryTimestamp(e) {
    if (!e) return 0;
    // Firestore Timestamp or ISO string
    if (e.created_at) {
        if (typeof e.created_at.toMillis === 'function') return e.created_at.toMillis();
        if (typeof e.created_at === 'number') return e.created_at;
        const t = Date.parse(e.created_at);
        if (!isNaN(t)) return t;
    }
    const date = e.date || '';
    const time = (e.start || e.start_time || e.end || e.end_time || '00:00') + '';
    const t = Date.parse(date + 'T' + (time.length <= 5 ? time + ':00' : time));
    return isNaN(t) ? 0 : t;
}

/** Newest first — for all list UIs */
function sortNewestFirst(arr) {
    return (arr || []).slice().sort((a, b) => entryTimestamp(b) - entryTimestamp(a));
}

/** Oldest first — for running balance / settlement only */
function sortOldestFirst(arr) {
    return (arr || []).slice().sort((a, b) => entryTimestamp(a) - entryTimestamp(b));
}

/* --- TUBEWELL STATUS --- */
window.renderStatusCard = async function () {
    const tw = getTubewellData();
    const status = tw.status || 'stopped';
    const badge = document.getElementById('status-badge');
    const occLine = document.getElementById('status-occupant-line');
    const timeLine = document.getElementById('status-time-line');
    const startTime = document.getElementById('status-start-time');
    const btnStart = document.getElementById('btn-start-water');
    const btnStop = document.getElementById('btn-stop-water');
    const btnMaint = document.getElementById('btn-maintenance');
    const btnExit = document.getElementById('btn-exit-maintenance');
    const btnPower = document.getElementById('btn-power-issue');
    const btnExitPower = document.getElementById('btn-exit-power');

    if (!badge) return;

    [btnStart, btnStop, btnMaint, btnExit, btnPower, btnExitPower].forEach(b => {
        if (b) b.style.display = 'none';
    });
    if (timeLine) timeLine.style.display = 'none';

    badge.className = 'status-badge ' + status;

    if (status === 'stopped') {
        // Available
        badge.innerText = locales[currentLang].statusStopped;
        if (occLine) {
            occLine.style.display = 'block';
            occLine.innerHTML = '<span data-i18n="notOccupied">' + locales[currentLang].notOccupied + '</span>';
        }
        if (btnStart) btnStart.style.display = 'block';
        if (btnMaint) btnMaint.style.display = 'block';
        if (btnPower) btnPower.style.display = 'block';
    } else if (status === 'running') {
        // Occupied
        badge.innerText = locales[currentLang].statusRunning;
        const cust = tw.currentCustomer ? getCustomerById(tw.currentCustomer) : null;
        let custName = cust ? cust.name : '-';

        // Fresh name from server
        if (cust && cust.customerUid) {
            try {
                const uDoc = await getDoc(doc(db, 'users', cust.customerUid));
                if (uDoc.exists() && uDoc.data().accountStatus !== 'deleted') {
                    custName = uDoc.data().name || custName;
                }
            } catch (e) { }
        }

        if (occLine) {
            occLine.style.display = 'block';
            occLine.innerHTML = '<span data-i18n="currentlyOccupiedBy">' + locales[currentLang].currentlyOccupiedBy +
                '</span>: <strong>' + custName + '</strong>';
        }
        if (timeLine) {
            timeLine.style.display = 'block';
            if (startTime) startTime.innerText = tw.currentStartTime || '-';
        }
        if (btnStop) btnStop.style.display = 'block';
    } else if (status === 'work_in_progress') {
        badge.innerText = locales[currentLang].statusWorkInProgress;
        if (occLine) {
            occLine.style.display = 'block';
            occLine.innerHTML = '<span>' + locales[currentLang].statusWorkInProgress + '</span>';
        }
        if (btnExit) btnExit.style.display = 'block';
    } else if (status === 'power_issue') {
        badge.innerText = locales[currentLang].statusPowerIssue || 'Power issue';
        if (occLine) {
            occLine.style.display = 'block';
            const who = tw.currentCustomer ? getCustomerById(tw.currentCustomer) : null;
            occLine.innerHTML = who
                ? (currentLang === 'en' ? 'Power issue · was: ' : 'बिजली समस्या · था: ') + '<strong>' + who.name + '</strong>'
                : (currentLang === 'en' ? 'Tubewell stopped due to power issue' : 'बिजली समस्या से बंद');
        }
        if (btnExitPower) btnExitPower.style.display = 'block';
        else if (btnExit) btnExit.style.display = 'block'; // fallback
    }
};

window.renderQueue = async function () {
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
        // Resolve fresh names from server
        const rows = await Promise.all(queue.map(async (entry, idx) => {
            const cust = getCustomerById(entry.customerId);
            let name = cust ? cust.name : 'Unknown';
            const phone = cust ? cust.phone : '';

            // Fresh name from server
            if (cust && cust.customerUid) {
                try {
                    const uDoc = await getDoc(doc(db, 'users', cust.customerUid));
                    if (uDoc.exists() && uDoc.data().accountStatus !== 'deleted') {
                        name = uDoc.data().name || name;
                    }
                } catch (e) { }
            }

            return { entry, idx, name, phone };
        }));

        container.innerHTML = rows.map(({ entry, idx, name, phone }) => {
            return '<div class="list-item"><div style="display:flex; align-items:center; gap:12px;"><span class="queue-num">' + (idx + 1) + '</span><div class="item-info"><h4>' + name + '</h4><p>' + phone + (idx === 0 ? ' · <span style="color:var(--ios-green);">' + (currentLang === 'en' ? 'Next' : 'अगला') + '</span>' : '') + '</p></div></div><button class="btn-small" onclick="removeFromQueue(\'' + entry.customerId + '\')">' + locales[currentLang].removeFromQueue + '</button></div>';
        }).join('');
    }
    renderNextInQueue();
}

window.renderNextInQueue = async function () {
    const el = document.getElementById('next-in-queue-section');
    if (!el) return;
    const queue = getQueue();
    if (queue.length === 0) {
        el.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p style="color:var(--ios-gray); font-size:14px;">' + (currentLang === 'en' ? 'No one waiting in queue' : 'कतार में कोई नहीं') + '</p></div></div>';
        return;
    }
    const entry = queue[0];
    const cust = getCustomerById(entry.customerId);
    let name = cust ? cust.name : 'Unknown';
    const phone = cust ? cust.phone : '';

    // Fresh name from server
    if (cust && cust.customerUid) {
        try {
            const uDoc = await getDoc(doc(db, 'users', cust.customerUid));
            if (uDoc.exists() && uDoc.data().accountStatus !== 'deleted') {
                name = uDoc.data().name || name;
            }
        } catch (e) { }
    }

    el.innerHTML = '<div class="list-item" style="background:rgba(0,122,255,0.06);"><div style="display:flex; align-items:center; gap:12px; width:100%;"><span class="queue-num">1</span><div class="item-info"><h4>' + name + '</h4><p>' + phone + ' · ' + (currentLang === 'en' ? 'Next in queue' : 'कतार में अगला') + '</p></div></div></div>';
}

window.addCustomerToQueue = async function (customerId) {
    const cCheck = getCustomerById(customerId);
    if (cCheck && cCheck.accountDeleted) {
        showToast(currentLang === 'en' ? 'Customer account deleted' : 'ग्राहक खाता हटाया गया', 'error');
        return;
    }

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

    const cCheck = getCustomerById(customerId);
    if (cCheck && cCheck.accountDeleted) {
        showToast(currentLang === 'en' ? 'Customer account deleted' : 'ग्राहक खाता हटाया गया', 'error');
        return;
    }

    const rateInput = document.getElementById('start-water-rate');
    const sessionRate = rateInput ? (parseFloat(rateInput.value) || 0) : 0;
    if (!sessionRate || sessionRate <= 0) {
        showToast(currentLang === 'en' ? 'Enter a valid rate' : 'सही रेट दर्ज करें', 'error');
        return;
    }

    const ownerUid = localStorage.getItem('user_uid');
    const twRef = doc(db, 'tubewells', ownerUid + '_primary');

    try {
        await runTransaction(db, async (transaction) => {
            const twDoc = await transaction.get(twRef);
            if (!twDoc.exists()) {
                throw new Error('Tubewell not found');
            }
            const tw = twDoc.data();

            if (tw.status === 'work_in_progress') {
                throw new Error('maintenance');
            }
            if (tw.status === 'power_issue') {
                throw new Error('power');
            }
            if (tw.status === 'running') {
                throw new Error('running');
            }

            const startTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

            transaction.update(twRef, {
                status: 'running',
                currentCustomer: customerId,
                currentCustomerUid: getCustomerById(customerId)?.customerUid || await resolveCustomerUid(getCustomerById(customerId)?.phone) || customerId,
                currentStartTime: startTime,
                currentStartDate: new Date().toISOString().split('T')[0],
                currentSessionRate: sessionRate
            });
        });

        // Remove from queue in Firestore (outside transaction — best effort)
        const queueRef = collection(db, 'queues');
        const q = query(queueRef, where('ownerId', '==', ownerUid), where('customerId', '==', customerId));
        const queueSnap = await getDocs(q);
        queueSnap.forEach(async (d) => { await safeDeleteDoc(doc(db, 'queues', d.id)); });

        // Update local
        const localTw = getTubewellData();
        localTw.status = 'running';
        localTw.currentCustomer = customerId;
        localTw.currentStartTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        localTw.currentStartDate = new Date().toISOString().split('T')[0];
        localTw.currentSessionRate = sessionRate;
        saveTubewellData(localTw);

        renderStatusCard();
        renderQueue();
        renderNextInQueue();
        closeModal('start-water-modal');
        showToast(currentLang === 'en' ? 'Water started @ ₹' + sessionRate + '/hr' : 'पानी शुरू @ ₹' + sessionRate + '/घंटा', 'success');

    } catch (err) {
        if (err.message === 'maintenance') {
            showToast(currentLang === 'en' ? 'Tubewell under maintenance' : 'ट्यूबवेल मरम्मत में है', 'error');
        } else if (err.message === 'power') {
            showToast(currentLang === 'en' ? 'Power issue — cannot start' : 'बिजली समस्या — शुरू नहीं कर सकते', 'error');
        } else if (err.message === 'running') {
            showToast(currentLang === 'en' ? 'Already occupied' : 'पहले से व्यस्त', 'error');
        } else {
            showToast(currentLang === 'en' ? 'Could not start water' : 'पानी शुरू नहीं हो सका', 'error');
            console.error('startWaterSession transaction failed', err);
        }
    }
};

window.stopWaterSession = async function () {
    const ownerUid = localStorage.getItem('user_uid');
    const twRef = doc(db, 'tubewells', ownerUid + '_primary');
    const twDoc = await getDoc(twRef);
    const tw = twDoc.data();

    if (tw.status !== 'running' || !tw.currentCustomer) return;

    const startTime = tw.currentStartTime;
    const startDate = tw.currentStartDate || new Date().toISOString().split('T')[0];
    const endTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const endDate = new Date().toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const startDateTime = new Date(startDate + 'T' + startTime);
    let endDateTime = new Date(endDate + 'T' + endTime);

    // If end time is earlier in the day than start time, assume same day ended next day (legacy) or use actual dates
    if (endDateTime < startDateTime && startDate === endDate) {
        endDateTime.setDate(endDateTime.getDate() + 1);
    }

    const durationMs = endDateTime - startDateTime;
    const duration = durationMs / (1000 * 60 * 60);
    const rate = tw.currentSessionRate || tw.rate || 150;
    const amount = Math.round(duration * rate);

    // Resolve customer identity for cross-device sync
    const cust = getCustomerById(tw.currentCustomer) || {};
    const customerUid = tw.currentCustomerUid || cust.customerUid || await resolveCustomerUid(cust.phone) || null;
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
        approval_status: 'awaiting_approval',
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
        id: usageRef.id,
        type: 'water',
        date: today,
        start: startTime,
        end: endTime,
        duration: parseFloat(duration.toFixed(2)),
        rate,
        amount,
        status: 'pending'
    });
    localStorage.setItem('customer_history', JSON.stringify(custHistory));
    if (!customerData[tw.currentCustomer]) {
        customerData[tw.currentCustomer] = {
            name: customerName,
            phone: customerPhone,
            history: []
        };
    }
    customerData[tw.currentCustomer].history.push({
        id: usageRef.id,
        type: 'water',
        date: today,
        start: startTime,
        end: endTime,
        duration: parseFloat(duration.toFixed(2)),
        rate,
        amount,
        status: 'pending'
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

window.setPowerIssueMode = async function (active) {
    const ownerUid = localStorage.getItem('user_uid');
    const twRef = doc(db, 'tubewells', ownerUid + '_primary');
    const twDoc = await getDoc(twRef);
    const tw = twDoc.data() || {};

    if (active) {
        // Power issue: can set even if occupied — motor can't run
        await safeUpdateDoc(twRef, {
            status: 'power_issue',
            // keep currentCustomer / start time for record if you want
            powerIssueAt: safeServerTimestamp()
        });
        const localTw = getTubewellData();
        localTw.status = 'power_issue';
        saveTubewellData(localTw);
        renderStatusCard();
        showToast(
            currentLang === 'en' ? 'Marked: Power issue' : 'बिजली समस्या चिह्नित',
            'info'
        );
    } else {
        // Power restored → Available (clear occupant if you prefer stop session first)
        await safeUpdateDoc(twRef, {
            status: 'stopped',
            currentCustomer: null,
            currentCustomerUid: null,
            currentStartTime: null,
            currentSessionRate: null
        });
        const localTw = getTubewellData();
        localTw.status = 'stopped';
        localTw.currentCustomer = null;
        localTw.currentStartTime = null;
        localTw.currentSessionRate = null;
        saveTubewellData(localTw);
        renderStatusCard();
        showToast(
            currentLang === 'en' ? 'Power restored — Available' : 'बिजली ठीक — उपलब्ध',
            'success'
        );
    }
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

    // Already in active local list (same phone)?
    const customers = getCustomers();
    if (customers.some(c => c.phone === phone && c.status !== 'removed')) {
        showToast(
            currentLang === 'en' ? 'Customer already in your list' : 'ग्राहक पहले से सूची में है',
            'info'
        );
        return;
    }

    // ----- Load ACTIVE user from users (by phone) -----
    let name = '';
    let customerUid = null;

    try {
        const userSnap = await getDocs(
            query(collection(db, 'users'), where('phone', '==', phone))
        );

        if (userSnap.empty) {
            showToast(
                currentLang === 'en'
                    ? 'This number is not registered in the app'
                    : 'यह नंबर ऐप में पंजीकृत नहीं है',
                'error'
            );
            return;
        }

        // Prefer an active account (not deleted)
        let uDoc = null;
        for (const d of userSnap.docs) {
            const data = d.data();
            if (data.accountStatus === 'deleted') continue;
            uDoc = d;
            break;
        }

        if (!uDoc) {
            showToast(
                currentLang === 'en'
                    ? 'This account has been deleted. Cannot add to contacts.'
                    : 'यह खाता हटा दिया गया है। संपर्क में नहीं जोड़ सकते।',
                'error'
            );
            return;
        }

        const uData = uDoc.data();
        customerUid = uDoc.id; // UNIQUE person id (phone_… or usr_…)
        name = (uData.name || '').trim();

        const roles = Array.isArray(uData.roles)
            ? uData.roles
            : (uData.role ? [uData.role] : []);

        if (!roles.includes('customer') && uData.role !== 'customer') {
            showToast(
                currentLang === 'en'
                    ? 'This user is not registered as a customer'
                    : 'यह उपयोगकर्ता ग्राहक के रूप में पंजीकृत नहीं है',
                'error'
            );
            return;
        }

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

    // ----- Reuse owner contact ONLY if same customerUid (same person) -----
    let id = null;

    try {
        const cSnap = await getDocs(
            query(
                collection(db, 'customers'),
                where('ownerId', '==', ownerUid),
                where('customerUid', '==', customerUid)
            )
        );
        if (!cSnap.empty) {
            const d = cSnap.docs[0];
            const data = d.data();
            id = data.id || d.id;
            if (data.name) name = data.name;
        }
    } catch (e) {
        console.error('lookup by customerUid', e);
    }

    // Local fallback by customerUid only (NOT by phone)
    if (!id) {
        const all = getCustomers().concat(
            Object.keys(JSON.parse(localStorage.getItem('bahi_contacts') || '{}')).map(cid => {
                const b = JSON.parse(localStorage.getItem('bahi_contacts') || '{}')[cid];
                return { id: cid, customerUid: b.customerUid, phone: b.phone, name: b.name };
            })
        );
        // from customers list in memory
        getCustomers().forEach(c => {
            if (!id && c.customerUid === customerUid) id = c.id;
        });
        Object.keys(customerData).forEach(cid => {
            // no customerUid on customerData — skip
        });
    }

    if (!id) {
        id = 'cust_' + Date.now();
    }

    // ----- Save active contact -----
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

    // Replace if same id already in list, else push
    const nextList = getCustomers().filter(c => c.id !== id && c.phone !== phone);
    nextList.push(newCust);
    saveCustomers(nextList);

    const historyMap = JSON.parse(localStorage.getItem('customer_history') || '{}');
    const prevHistory = (customerData[id] && customerData[id].history) || historyMap[id] || [];
    customerData[id] = { name: name, phone: phone, history: prevHistory };
    if (prevHistory.length) {
        historyMap[id] = prevHistory;
        localStorage.setItem('customer_history', JSON.stringify(historyMap));
    }

    const bahiContacts = JSON.parse(localStorage.getItem('bahi_contacts') || '{}');
    bahiContacts[id] = { id: id, name: name, phone: phone, customerUid: customerUid };
    localStorage.setItem('bahi_contacts', JSON.stringify(bahiContacts));

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

    try {
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

    async function getFreshName(customerUid, fallbackName) {
        if (!customerUid) return fallbackName;
        try {
            const uDoc = await getDoc(doc(db, 'users', customerUid));
            if (uDoc.exists() && uDoc.data().accountStatus !== 'deleted') {
                return uDoc.data().name || fallbackName;
            }
        } catch (e) { console.error('getFreshName', e); }
        return fallbackName;
    }

    function customerRowHtml(c, freshName) {
        const displayName = freshName || c.name || 'Customer';
        const deleted = c.accountDeleted === true;
        const badge = deleted
            ? ' <span style="font-size:11px;color:var(--ios-red);background:rgba(255,59,48,0.12);padding:2px 6px;border-radius:6px;">' +
            (currentLang === 'en' ? 'Deleted' : 'हटाया') + '</span>'
            : '';
        return '<div class="list-item">' +
            '<div class="item-info" style="flex:1;cursor:pointer;" onclick="openCustomerDetail(\'' + c.id + '\')">' +
            '<h4>' + displayName + badge + '</h4><p>' + (c.phone || '') + '</p></div>' +
            '<button class="btn-small" style="margin-right:8px;" onclick="removeCustomer(\'' + c.id + '\', event)">' +
            (currentLang === 'en' ? 'Remove' : 'हटाएं') +
            '</button>' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ios-gray)" stroke-width="2" onclick="openCustomerDetail(\'' + c.id + '\')"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
            '</div>';
    }

    // 1) Always fetch from Firestore first — server is source of truth
    let serverCustomers = [];
    try {
        const snapshot = await getDocs(
            query(collection(db, 'customers'), where('ownerId', '==', ownerUid))
        );
        snapshot.forEach(d => {
            const data = d.data();
            if (data.status === 'removed') return;
            serverCustomers.push({
                ...data,
                id: data.id || d.id,
                status: data.status || 'active'
            });
        });
    } catch (e) {
        console.error('renderCustomers FS fetch', e);
    }

    // 2) Resolve fresh names from users collection
    const rows = await Promise.all(serverCustomers.map(async c => {
        const freshName = await getFreshName(c.customerUid, c.name);
        return { c, freshName };
    }));

    // 3) Update localStorage with fresh names
    const updatedCustomers = rows.map(({ c, freshName }) => ({
        ...c,
        name: freshName
    }));
    saveCustomers(updatedCustomers);
    loadCustomerData();

    // 4) Render
    if (updatedCustomers.length === 0) {
        list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p data-i18n="noCustomers">' +
            locales[currentLang].noCustomers + '</p></div></div>';
    } else {
        list.innerHTML = rows.map(({ c, freshName }) => customerRowHtml(c, freshName)).join('');
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
    const customerUid = cust.customerUid || '';

    // Save to bahi_contacts BEFORE removing from active list
    const bahiContacts = JSON.parse(localStorage.getItem('bahi_contacts') || '{}');
    bahiContacts[customerId] = {
        id: customerId,
        name: name,
        phone: phone,
        customerUid: customerUid
    };
    localStorage.setItem('bahi_contacts', JSON.stringify(bahiContacts));

    // Ensure customerData has this entry for Bahi rendering
    if (!customerData[customerId]) {
        customerData[customerId] = { name: name, phone: phone, history: [] };
    } else {
        customerData[customerId].name = name;
        customerData[customerId].phone = phone;
        customerData[customerId].customerUid = customerUid;
    }

    // Remove from active list only
    saveCustomers(getCustomers().filter(c => c.id !== customerId && c.phone !== phone));

    // DB: mark removed — do NOT delete doc
    try {
        await safeUpdateDoc(doc(db, 'customers', customerId), {
            status: 'removed',
            removedAt: safeServerTimestamp(),
            name: name,
            phone: phone,
            customerUid: customerUid
        });
    } catch (e) {
        try {
            const snap = await getDocs(query(collection(db, 'customers'), where('ownerId', '==', ownerUid)));
            for (const d of snap.docs) {
                const data = d.data();
                if (d.id === customerId || data.id === customerId || (phone && data.phone === phone)) {
                    await safeUpdateDoc(doc(db, 'customers', d.id), {
                        status: 'removed',
                        removedAt: safeServerTimestamp(),
                        name: data.name || name,
                        phone: data.phone || phone,
                        customerUid: data.customerUid || customerUid
                    });
                }
            }
        } catch (e2) {
            console.error(e2);
        }
    }

    // Queue cleanup
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
    cleanupCustomerData();
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

    // Helper: get fresh name from users collection
    async function getFreshName(customerUid, fallbackName) {
        if (!customerUid) return fallbackName;
        try {
            const uDoc = await getDoc(doc(db, 'users', customerUid));
            if (uDoc.exists() && uDoc.data().accountStatus !== 'deleted') {
                return uDoc.data().name || fallbackName;
            }
        } catch (e) { }
        return fallbackName;
    }

    // From Firestore customers (including removed)
    try {
        const snap = await getDocs(query(collection(db, 'customers'), where('ownerId', '==', ownerUid)));
        snap.forEach(d => {
            const data = d.data();
            const id = data.id || d.id;
            byId[id] = {
                id: id,
                name: data.name || 'Customer',
                phone: data.phone || '',
                customerUid: data.customerUid || ''
            };
        });
    } catch (e) {
        console.error(e);
    }

    // Merge local history / water_history / bahi_contacts (backup)
    const active = getCustomers();
    active.forEach(c => {
        byId[c.id] = { id: c.id, name: c.name, phone: c.phone || '', customerUid: c.customerUid || '' };
    });
    const historyMap = JSON.parse(localStorage.getItem('customer_history') || '{}');
    const bahiContacts = JSON.parse(localStorage.getItem('bahi_contacts') || '{}');
    Object.keys(bahiContacts).forEach(cid => {
        if (!byId[cid]) {
            byId[cid] = {
                id: cid,
                name: bahiContacts[cid].name || 'Customer',
                phone: bahiContacts[cid].phone || '',
                customerUid: bahiContacts[cid].customerUid || ''
            };
        }
    });
    Object.keys(historyMap).forEach(cid => {
        if (historyMap[cid] && historyMap[cid].length && !byId[cid]) {
            const h = customerData[cid] || bahiContacts[cid] || {};
            byId[cid] = { id: cid, name: h.name || 'Customer', phone: h.phone || '' };
        }
    });

    // Fallback: resolve names from water_usage for customers with history but no customer doc
    try {
        const usageSnap = await getDocs(query(collection(db, 'water_usage'), where('business_id', '==', ownerUid)));
        usageSnap.forEach(d => {
            const data = d.data();
            const cid = data.customer_id;
            if (cid && !byId[cid] && data.customer_name) {
                byId[cid] = {
                    id: cid,
                    name: data.customer_name,
                    phone: data.customer_phone || '',
                    customerUid: data.customer_uid || ''
                };
            }
        });
    } catch (e) { console.error('water_usage name fallback', e); }

    const rows = Object.values(byId);
    if (rows.length === 0) {
        list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p data-i18n="noCustomers">' +
            locales[currentLang].noCustomers + '</p></div></div>';
        return;
    }

    // Resolve fresh names from users collection before rendering
    const rowsWithFreshNames = await Promise.all(rows.map(async c => {
        const freshName = await getFreshName(c.customerUid, c.name);
        return { ...c, name: freshName };
    }));

    list.innerHTML = rowsWithFreshNames.map(c =>
        '<div class="list-item" onclick="openBahiLedger(\'' + c.id + '\')">' +
        '<div class="item-info"><h4>' + (c.name || 'Customer') + '</h4><p>' + (c.phone || '') + '</p></div>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ios-gray)" stroke-width="2">' +
        '<polyline points="9 18 15 12 9 6"></polyline></svg></div>'
    ).join('');
};

window.openBahiLedger = async function (id) {
    const bahiContacts = JSON.parse(localStorage.getItem('bahi_contacts') || '{}');
    const historyMap = JSON.parse(localStorage.getItem('customer_history') || '{}');
    const active = getCustomers();
    const foundActive = active.find(c => c.id === id);

    // Build / restore customerData for this id (active, removed, or history-only)
    if (!customerData[id]) {
        customerData[id] = { name: 'Customer', phone: '', history: [] };
    }

    if (foundActive) {
        customerData[id].name = foundActive.name || customerData[id].name;
        customerData[id].phone = foundActive.phone || customerData[id].phone;
    } else if (bahiContacts[id]) {
        customerData[id].name = bahiContacts[id].name || customerData[id].name;
        customerData[id].phone = bahiContacts[id].phone || customerData[id].phone;
    }

    if (historyMap[id] && historyMap[id].length) {
        customerData[id].history = historyMap[id];
    }

    // If still no history, try server water_usage for this owner's contact id
    if (!customerData[id].history || customerData[id].history.length === 0) {
        try {
            const ownerUid = localStorage.getItem('user_uid');
            const snap = await getDocs(
                query(
                    collection(db, 'water_usage'),
                    where('business_id', '==', ownerUid),
                    where('customer_id', '==', id)
                )
            );
            const hist = [];
            snap.forEach(d => {
                const r = d.data();
                if (r.type === 'payment') {
                    hist.push({
                        id: d.id,
                        type: 'payment',
                        date: r.date,
                        amount: r.amount,
                        mode: r.mode || 'Cash',
                        note: r.note || ''
                    });
                } else {
                    hist.push({
                        id: d.id,
                        type: 'water',
                        date: r.date,
                        start: r.start_time,
                        end: r.end_time,
                        duration: r.duration,
                        rate: r.rate,
                        amount: r.amount,
                        status: r.status || 'pending'
                    });
                }
            });
            if (hist.length) {
                customerData[id].history = hist;
                historyMap[id] = hist;
                localStorage.setItem('customer_history', JSON.stringify(historyMap));
            }
        } catch (e) {
            console.error('openBahiLedger sync', e);
        }
    }

    // Name from FS customers if still generic
    if (!customerData[id].name || customerData[id].name === 'Customer') {
        try {
            const cDoc = await getDoc(doc(db, 'customers', id));
            if (cDoc.exists()) {
                const data = cDoc.data();
                customerData[id].name = data.name || customerData[id].name;
                customerData[id].phone = data.phone || customerData[id].phone;
            }
        } catch (e) { }
    }

    // Resolve fresh name from users collection first
    let displayName = customerData[id].name || 'Customer';
    const custEntry = getCustomerById(id) || {};
    if (custEntry.customerUid) {
        try {
            const uDoc = await getDoc(doc(db, 'users', custEntry.customerUid));
            if (uDoc.exists() && uDoc.data().accountStatus !== 'deleted') {
                displayName = uDoc.data().name || displayName;
                customerData[id].name = displayName;
            }
        } catch (e) { }
    }

    document.getElementById('bahi-ledger-name').innerText = displayName;
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

    // Oldest → newest for running balance only (copies, never mutates originals)
    const sorted = sortOldestFirst(history);

    let runningBalance = 0;
    const entriesWithBalance = sorted.map(entry => {
        if (entry.type === 'water') {
            runningBalance += parseFloat(entry.amount) || 0;
        } else {
            runningBalance -= parseFloat(entry.amount) || 0;
        }
        return { ...entry, _balance: runningBalance };
    });

    const displayOrder = entriesWithBalance.slice().reverse();

    const ledgerRows = displayOrder.map((entry, displayIndex) => {
        const totalEntries = displayOrder.length;
        const entryNum = totalEntries - displayIndex;
        const isWater = entry.type === 'water';
        const bal = entry._balance;

        let durationText = '';
        if (isWater) {
            const totalMinutes = Math.round((entry.duration || 0) * 60);
            const durHours = Math.floor(totalMinutes / 60);
            const durMins = totalMinutes % 60;
            if (currentLang === 'hi') {
                if (durHours > 0 && durMins > 0) durationText = durHours + ' घंटा ' + durMins + ' मिनट';
                else if (durHours > 0) durationText = durHours + ' घंटा';
                else durationText = durMins + ' मिनट';
            } else {
                if (durHours > 0 && durMins > 0) durationText = durHours + ' hr ' + durMins + ' min';
                else if (durHours > 0) durationText = durHours + (durHours === 1 ? ' hr' : ' hrs');
                else durationText = durMins + ' min';
            }
        }

        if (isWater) {
            // ==================== WATER BILL ENTRY ====================
            const statusLabel = entry.status === 'paid'
                ? (currentLang === 'en' ? '✅ Paid' : '✅ चुकाया')
                : (currentLang === 'en' ? '🔴 Pending' : '🔴 बाकी');
            const statusColor = entry.status === 'paid' ? '#34C759' : '#FF3B30';
            const statusBg = entry.status === 'paid' ? 'rgba(52,199,89,0.10)' : 'rgba(255,59,48,0.10)';

            return '<div class="list-item" style="flex-direction:column;align-items:stretch;gap:12px;padding:16px;border-left:4px solid #FF3B30;">' +

                // Header: Entry number + Status badge
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
                '<span style="font-size:12px;font-weight:600;color:var(--ios-gray);background:var(--bg);padding:4px 10px;border-radius:10px;">#' + entryNum + ' · ' + (currentLang === 'en' ? '💧 Water Bill' : '💧 पानी का बिल') + '</span>' +
                '<span style="font-size:13px;font-weight:700;color:' + statusColor + ';background:' + statusBg + ';padding:6px 14px;border-radius:20px;">' + statusLabel + '</span>' +
                '</div>' +

                // Big Amount
                '<div style="display:flex;align-items:center;justify-content:space-between;">' +
                '<div style="font-size:36px;font-weight:800;color:#FF3B30;letter-spacing:-1px;">₹' + (entry.amount || 0) + '</div>' +
                '<div style="text-align:right;">' +
                '<div style="font-size:13px;color:var(--ios-gray);font-weight:500;">' + (currentLang === 'en' ? 'You need to pay' : 'आपको देना है') + '</div>' +
                '</div>' +
                '</div>' +

                // Date
                '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="font-size:18px;">📅</span>' +
                '<span style="font-size:16px;font-weight:600;color:var(--text);">' + entry.date + '</span>' +
                '</div>' +

                // Time boxes
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div style="background:var(--bg);padding:12px;border-radius:12px;text-align:center;">' +
                '<div style="font-size:11px;color:var(--ios-gray);font-weight:600;text-transform:uppercase;margin-bottom:4px;">' + (currentLang === 'en' ? '▶️ Start' : '▶️ शुरू') + '</div>' +
                '<div style="font-size:22px;font-weight:700;color:var(--text);">' + (entry.start || '-') + '</div>' +
                '</div>' +
                '<div style="background:var(--bg);padding:12px;border-radius:12px;text-align:center;">' +
                '<div style="font-size:11px;color:var(--ios-gray);font-weight:600;text-transform:uppercase;margin-bottom:4px;">' + (currentLang === 'en' ? '⏹️ End' : '⏹️ बंद') + '</div>' +
                '<div style="font-size:22px;font-weight:700;color:var(--text);">' + (entry.end || '-') + '</div>' +
                '</div>' +
                '</div>' +

                // Duration
                '<div style="display:flex;align-items:center;gap:10px;background:var(--bg);padding:10px 14px;border-radius:10px;">' +
                '<span style="font-size:18px;">⏱️</span>' +
                '<span style="font-size:15px;font-weight:600;color:var(--ios-blue);">' + durationText + '</span>' +
                '<span style="font-size:12px;color:var(--ios-gray);margin-left:auto;">@ ₹' + (entry.rate || 0) + (currentLang === 'en' ? '/hr' : '/घंटा') + '</span>' +
                '</div>' +

                // Running balance footer
                '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px dashed var(--separator);">' +
                '<span style="font-size:12px;color:var(--ios-gray);font-weight:500;">' + (currentLang === 'en' ? 'Balance after this' : 'इसके बाद बाकी') + '</span>' +
                '<span style="font-size:16px;font-weight:700;color:' + (bal > 0 ? '#FF3B30' : (bal < 0 ? '#34C759' : 'var(--ios-gray)')) + ';">₹' + Math.abs(bal) + ' ' + (bal > 0 ? (currentLang === 'en' ? 'Due' : 'बाकी') : (bal < 0 ? (currentLang === 'en' ? 'Advance' : 'जमा') : (currentLang === 'en' ? 'Clear' : 'बराबर'))) + '</span>' +
                '</div>' +

                '</div>';

        } else {
            // ==================== PAYMENT ENTRY ====================
            const modeLabel = entry.mode || 'Cash';
            const modeEmoji = modeLabel === 'Cash' ? '💵' : (modeLabel === 'UPI' ? '📱' : '💳');

            return '<div class="list-item" style="flex-direction:column;align-items:stretch;gap:12px;padding:16px;border-left:4px solid #34C759;">' +

                // Header: Entry number + Payment badge
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
                '<span style="font-size:12px;font-weight:600;color:var(--ios-gray);background:var(--bg);padding:4px 10px;border-radius:10px;">#' + entryNum + ' · ' + modeEmoji + ' ' + (currentLang === 'en' ? 'Payment' : 'भुगतान') + '</span>' +
                '<span style="font-size:13px;font-weight:700;color:#34C759;background:rgba(52,199,89,0.10);padding:6px 14px;border-radius:20px;">' + (currentLang === 'en' ? '✅ Received' : '✅ प्राप्त') + '</span>' +
                '</div>' +

                // Big Amount (green = money coming in)
                '<div style="display:flex;align-items:center;justify-content:space-between;">' +
                '<div style="font-size:36px;font-weight:800;color:#34C759;letter-spacing:-1px;">₹' + (entry.amount || 0) + '</div>' +
                '<div style="text-align:right;">' +
                '<div style="font-size:13px;color:var(--ios-gray);font-weight:500;">' + (currentLang === 'en' ? 'You paid' : 'आपने दिया') + '</div>' +
                '</div>' +
                '</div>' +

                // Date
                '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="font-size:18px;">📅</span>' +
                '<span style="font-size:16px;font-weight:600;color:var(--text);">' + entry.date + '</span>' +
                '</div>' +

                // Mode + Note
                '<div style="display:flex;align-items:center;gap:10px;background:var(--bg);padding:10px 14px;border-radius:10px;">' +
                '<span style="font-size:16px;">' + modeEmoji + '</span>' +
                '<span style="font-size:15px;font-weight:600;color:var(--text);">' + modeLabel + '</span>' +
                (entry.note ? '<span style="font-size:13px;color:var(--ios-gray);margin-left:auto;">📝 ' + entry.note + '</span>' : '') +
                '</div>' +

                // Running balance footer
                '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px dashed var(--separator);">' +
                '<span style="font-size:12px;color:var(--ios-gray);font-weight:500;">' + (currentLang === 'en' ? 'Balance after this' : 'इसके बाद बाकी') + '</span>' +
                '<span style="font-size:16px;font-weight:700;color:' + (bal > 0 ? '#FF3B30' : (bal < 0 ? '#34C759' : 'var(--ios-gray)')) + ';">₹' + Math.abs(bal) + ' ' + (bal > 0 ? (currentLang === 'en' ? 'Due' : 'बाकी') : (bal < 0 ? (currentLang === 'en' ? 'Advance' : 'जमा') : (currentLang === 'en' ? 'Clear' : 'बराबर'))) + '</span>' +
                '</div>' +

                '</div>';
        }
    }).join('');

    list.innerHTML = ledgerRows;
    document.getElementById('bahi-total-due').innerText = '₹' + Math.round(netDue);
    document.getElementById('bahi-total-paid').innerText = '₹' + Math.round(allPaidAmt);
    document.getElementById('bahi-balance').innerText = '₹' + Math.round(Math.abs(finalBalance)) +
        (finalBalance > 0 ? (currentLang === 'en' ? ' Due' : ' बाकी') :
            finalBalance < 0 ? (currentLang === 'en' ? ' Advance' : ' जमा') : '');
    showView('view-bahi-ledger');
};

let dashboardPeriod = 'today';

window.onDashPeriodChange = function (period) {
    setDashboardPeriod(period);
};

window.setDashboardPeriod = function (period) {
    dashboardPeriod = period || 'today';

    const sel = document.getElementById('dash-period-select');
    if (sel && sel.value !== dashboardPeriod) sel.value = dashboardPeriod;

    const custom = document.getElementById('custom-date-range');
    if (custom) {
        custom.style.display = dashboardPeriod === 'custom' ? 'grid' : 'none';
    }

    if (dashboardPeriod === 'custom') {
        const from = document.getElementById('dash-from-date');
        const to = document.getElementById('dash-to-date');
        const today = new Date().toISOString().split('T')[0];
        if (from && !from.value) from.value = today;
        if (to && !to.value) to.value = today;
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

    // For settlement, use ONLY period payments against period water (scoped to selected period)
    const periodPaysTotal = periodPay.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    let creditLeft = periodPaysTotal;
    const sortedWater = periodWater.slice().sort((a, b) =>
        (a.date || '').localeCompare(b.date || '') ||
        ((a.start || a.start_time || '') + '').localeCompare((b.start || b.start_time || '') + '')
    );
    const settledKeys = new Set();
    sortedWater.forEach(e => {
        const amt = parseFloat(e.amount) || 0;
        const key = waterKey(e);
        if (creditLeft >= amt) {
            settledKeys.add(key);
            creditLeft -= amt;
        }
    });

    periodWater.forEach(e => {
        hours += e.duration || 0;
        revenue += e.amount || 0;
        if (!settledKeys.has(waterKey(e)) && e.status !== 'paid') {
            pending += e.amount || 0;
        }
    });

    periodPay.forEach(e => { received += e.amount || 0; });

    const hrsEl = document.getElementById('stat-hours');
    if (hrsEl) hrsEl.innerHTML = hours.toFixed(1) + ' <small data-i18n="hrs">' + locales[currentLang].hrs + '</small>';
    const revEl = document.getElementById('stat-revenue');
    if (revEl) revEl.innerText = '₹' + Math.round(revenue);
    const recEl = document.getElementById('stat-received');
    if (recEl) recEl.innerText = '₹' + Math.round(received);
    const penEl = document.getElementById('stat-pending');
    if (penEl) penEl.innerText = '₹' + Math.round(pending);
};

window.saveDailyNote = async function () {
    const role = localStorage.getItem('user_role');
    if (role !== 'owner') {
        showToast(currentLang === 'en' ? 'Only owners can send announcements' : 'केवल मालिक घोषणा भेज सकते हैं', 'error');
        return;
    }

    const input = document.getElementById('daily-note-input');
    if (!input) return;

    const note = input.value.trim();
    const ownerUid = localStorage.getItem('user_uid');
    if (!ownerUid) return;

    if (!note) {
        showToast(
            currentLang === 'en' ? 'Write something first' : 'पहले कुछ लिखें',
            'error'
        );
        return;
    }

    const payload = {
        ownerUid: ownerUid,
        message: note,
        updatedAt: safeServerTimestamp(),
        date: new Date().toISOString().split('T')[0]
    };

    try {
        await safeSetDoc(doc(db, 'announcements', ownerUid), payload);
        const today = payload.date;
        const notes = JSON.parse(localStorage.getItem('daily_notes') || '{}');
        notes[today] = note;
        localStorage.setItem('daily_notes', JSON.stringify(notes));

        showToast(
            currentLang === 'en' ? 'Announcement sent to customers' : 'ग्राहकों को घोषणा भेज दी गई',
            'success'
        );
    } catch (e) {
        console.error(e);
        showToast(
            currentLang === 'en' ? 'Failed to send' : 'भेजने में विफल',
            'error'
        );
    }
};

window.clearAnnouncement = async function () {
    const role = localStorage.getItem('user_role');
    if (role !== 'owner') {
        showToast(currentLang === 'en' ? 'Only owners can remove announcements' : 'केवल मालिक घोषणा हटा सकते हैं', 'error');
        return;
    }

    const ownerUid = localStorage.getItem('user_uid');
    if (!ownerUid) return;

    showConfirmPopup(
        currentLang === 'en' ? 'Remove announcement' : 'घोषणा हटाएं',
        currentLang === 'en'
            ? 'This will remove the announcement for all linked customers.'
            : 'यह सभी लिंक किए ग्राहकों से घोषणा हटा देगा।',
        currentLang === 'en' ? 'Remove' : 'हटाएं',
        currentLang === 'en' ? 'Cancel' : 'रद्द करें',
        async function () {
            try {
                await safeDeleteDoc(doc(db, 'announcements', ownerUid));
            } catch (e) {
                console.error(e);
            }

            const input = document.getElementById('daily-note-input');
            if (input) input.value = '';

            const today = new Date().toISOString().split('T')[0];
            const notes = JSON.parse(localStorage.getItem('daily_notes') || '{}');
            delete notes[today];
            localStorage.setItem('daily_notes', JSON.stringify(notes));

            showToast(
                currentLang === 'en' ? 'Announcement removed' : 'घोषणा हटा दी गई',
                'success'
            );
        },
        null
    );
};

async function loadDailyNote() {
    const input = document.getElementById('daily-note-input');
    if (!input) return;

    const ownerUid = localStorage.getItem('user_uid');
    const today = new Date().toISOString().split('T')[0];

    // Prefer server
    if (ownerUid) {
        try {
            const snap = await getDoc(doc(db, 'announcements', ownerUid));
            if (snap.exists()) {
                input.value = snap.data().message || '';
                return;
            }
        } catch (e) {
            console.error(e);
        }
    }

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
        // Deduplicate payments by id
        const seenIds = new Set();
        const pays = [];
        (custHistory[cid] || []).forEach(x => {
            if (x.type === 'payment' && !seenIds.has(x.id)) {
                seenIds.add(x.id);
                pays.push(x);
            }
        });
        history.forEach(h => {
            if (h.customerId === cid && h.type === 'payment' && !seenIds.has(h.id)) {
                seenIds.add(h.id);
                pays.push(h);
            }
        });

        const watersForCust = water.filter(w => w.customerId === cid);
        const { settled } = getSettledWaterKeys(watersForCust, pays);
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

    const link = JSON.parse(localStorage.getItem('customer_link') || 'null');
    const pending = JSON.parse(localStorage.getItem('pending_request_owner') || 'null');

    let firestoreLinks = [];
    if (!isMockMode && customerUid) {
        try {
            const snapshot = await getDocs(
                query(collection(db, 'customer_links'), where('customerUid', '==', customerUid))
            );
            snapshot.forEach(d => firestoreLinks.push(d.data()));
        } catch (e) {
            console.error('Fetch customer links failed:', e);
        }
    }

    if (firestoreLinks.length > 0 && !link) {
        const firstLink = firestoreLinks[0];
        localStorage.setItem('customer_link', JSON.stringify({
            ownerPhone: firstLink.ownerPhone,
            ownerUid: firstLink.ownerUid,
            ownerName: firstLink.ownerName || '',
            tubewellId: firstLink.tubewellId || 'primary',
            linkedAt: new Date().toISOString()
        }));
        return renderCustomerLinkedTubewell();
    }

    if (formDiv) formDiv.style.display = 'block';
    if (statusDiv) statusDiv.style.display = 'none';

    let summaryHtml = '';

    async function rowForLink(fl) {
        const ownerUid = fl.ownerUid;
        let ownerName = fl.ownerName || '';
        let ownerPhone = fl.ownerPhone || '';
        let twName = '';

        try {
            if (ownerUid) {
                const uDoc = await getDoc(doc(db, 'users', ownerUid));
                if (uDoc.exists()) {
                    ownerName = uDoc.data().name || ownerName;
                    ownerPhone = uDoc.data().phone || ownerPhone;
                }
                const twDoc = await getDoc(doc(db, 'tubewells', ownerUid + '_primary'));
                if (twDoc.exists()) {
                    twName = twDoc.data().name || '';
                }
            }
        } catch (e) { }

        const title = twName || ownerName || ownerPhone || 'Tubewell';
        const sub = [ownerName, ownerPhone].filter(Boolean).join(' · ');

        return '<div class="list-item" style="padding:8px 0; border-bottom:0.5px solid var(--separator);">' +
            '<div class="item-info">' +
            '<h4 style="font-size:14px;">' + title + '</h4>' +
            (sub ? '<p style="font-size:12px; color:var(--ios-gray);">' + sub + '</p>' : '') +
            '<p style="font-size:12px; color:var(--ios-green);">' +
            (currentLang === 'en' ? 'Linked' : 'जुड़ा हुआ') + '</p>' +
            '</div></div>';
    }

    if (firestoreLinks.length > 0) {
        const parts = [];
        for (const fl of firestoreLinks) {
            parts.push(await rowForLink(fl));
        }
        summaryHtml = parts.join('');
    } else if (link) {
        summaryHtml = await rowForLink(link);
    }

    if (pending && pending.status === 'pending') {
        summaryHtml += '<p style="color: var(--ios-orange); font-size: 13px; margin-top:6px;">' +
            (currentLang === 'en' ? 'Pending request to ' : 'लंबित अनुरोध: ') +
            (pending.ownerPhone || '') + '</p>';
        if (statusDiv) statusDiv.style.display = 'block';
    }
    if (pending && pending.status === 'rejected') {
        summaryHtml += '<p style="color: var(--ios-red); font-size: 13px; margin-top:6px;">' +
            (currentLang === 'en' ? 'Last request was rejected' : 'पिछला अनुरोध अस्वीकार') + '</p>';
        localStorage.removeItem('pending_request_owner');
    }
    if (!summaryHtml) {
        summaryHtml = '<p style="color: var(--ios-gray); font-size: 14px;">' +
            (currentLang === 'en'
                ? 'No tubewell linked yet. Enter owner phone below.'
                : 'अभी कोई ट्यूबवेल लिंक नहीं। नीचे मालिक का नंबर डालें।') +
            '</p>';
    }
    infoDiv.innerHTML = summaryHtml;
};

window.renderMyTubewell = async function () {
    const container = document.getElementById('my-tubewell-info');
    if (!container) return;

    const customerUid = localStorage.getItem('user_uid');
    if (!customerUid) {
        container.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p>' +
            (currentLang === 'en' ? 'Please login first.' : 'कृपया पहले लॉगिन करें।') +
            '</p></div></div>';
        return;
    }

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

    if (links.length === 0) {
        const localLink = JSON.parse(localStorage.getItem('customer_link') || 'null');
        if (localLink) links.push(localLink);
    }

    if (links.length === 0) {
        container.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p>' +
            (currentLang === 'en' ? 'No tubewell linked yet.' : 'अभी तक कोई ट्यूबवेल लिंक नहीं।') +
            '</p></div></div>';
        return;
    }

    let html = '';

    let myCustomerIds = {};
    if (!isMockMode) {
        try {
            const custRef = collection(db, 'customers');
            const cq = query(custRef, where('customerUid', '==', customerUid));
            const csnap = await getDocs(cq);
            csnap.forEach(d => {
                const data = d.data();
                myCustomerIds[data.ownerId] = data.id || d.id;
            });
        } catch (e) { }
    }

    for (const link of links) {
        const ownerUid = link.ownerUid || link.ownerId;
        if (!ownerUid) continue;

        let twData = {};
        let ownerName = link.ownerName || 'Owner';
        let ownerPhone = link.ownerPhone || '';

        if (!isMockMode) {
            try {
                const twDoc = await getDoc(doc(db, 'tubewells', ownerUid + '_primary'));
                if (twDoc.exists()) twData = twDoc.data();
            } catch (e) { }

            try {
                const ownerDoc = await getDoc(doc(db, 'users', ownerUid));
                if (ownerDoc.exists()) {
                    ownerName = ownerDoc.data().name || ownerName;
                    ownerPhone = ownerDoc.data().phone || ownerPhone;
                }
            } catch (e) { }
        }

        let announcement = '';
        try {
            const aSnap = await getDoc(doc(db, 'announcements', ownerUid));
            if (aSnap.exists() && aSnap.data().message) {
                announcement = aSnap.data().message;
            }
        } catch (e) { }

        const announcementBlock = announcement
            ? ('<div style="margin-top:8px;padding:12px;background:rgba(0,122,255,0.08);border-radius:10px;width:100%;">' +
                '<p style="font-size:12px;color:var(--ios-blue);margin-bottom:4px;font-weight:600;">' +
                (currentLang === 'en' ? 'Announcement' : 'घोषणा') + '</p>' +
                '<p style="font-size:14px;color:var(--text);">' + announcement + '</p></div>')
            : '';

        const st = twData.status || 'stopped';
        let statusText, statusColor, detailText;

        if (st === 'running') {
            statusText = locales[currentLang].statusRunning;
            statusColor = 'var(--ios-green)';
            detailText = currentLang === 'en' ? 'Water is running' : 'पानी चालू है';
        } else if (st === 'work_in_progress') {
            statusText = locales[currentLang].statusWorkInProgress;
            statusColor = '#FF9500';
            detailText = currentLang === 'en' ? 'Under maintenance' : 'मरम्मत में है';
        } else if (st === 'power_issue') {
            statusText = locales[currentLang].statusPowerIssue || 'Power issue';
            statusColor = '#FF9500';
            detailText = currentLang === 'en'
                ? 'Power issue — not available'
                : 'बिजली समस्या — उपलब्ध नहीं';
        } else {
            statusText = locales[currentLang].statusStopped;
            statusColor = 'var(--ios-gray)';
            detailText = currentLang === 'en' ? 'Available for use' : 'उपयोग के लिए उपलब्ध';
        }

        let occupantLine = '';
        if (st === 'running' && twData.currentCustomer) {
            const isMe = twData.currentCustomer === myCustomerIds[ownerUid];
            occupantLine =
                '<p style="font-size: 13px; color: var(--ios-gray); margin-top: 4px;">' +
                (isMe
                    ? (currentLang === 'en' ? 'Running for you' : 'आपके लिए चालू है')
                    : (currentLang === 'en' ? 'Currently in use by another customer' : 'वर्तमान में दूसरे ग्राहक द्वारा उपयोग में है')) +
                '</p>';
        }

        const mapLink = twData.mapLink || '';
        const mapBlock = mapLink
            ? ('<button class="btn-primary" style="width:100%;margin-top:8px;" onclick="openTubewellMap(\'' +
                String(mapLink).replace(/'/g, "\\'") + '\')">' +
                (currentLang === 'en' ? 'Open in Google Maps' : 'Google Maps में खोलें') +
                '</button>')
            : '';

        html +=
            '<div class="list-item" style="flex-direction: column; align-items: flex-start; gap: 8px;">' +
            '<div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">' +
            '<h4 style="font-size: 17px; font-weight: 600;">' + (twData.name || 'Tubewell') + '</h4>' +
            '<span class="status-badge ' + st + '">' + statusText + '</span>' +
            '</div>' +
            '<p style="color: var(--ios-gray); font-size: 14px;">' +
            ownerName +
            (ownerPhone ? ' · ' + ownerPhone : '') +
            (twData.location ? ' · ' + twData.location : '') +
            '</p>' +
            '<p style="color: var(--ios-gray); font-size: 14px;">Rate: ₹' + (twData.rate || 150) + '/hr</p>' +
            announcementBlock +
            '<div style="margin-top: 8px; padding: 12px; background: var(--bg); border-radius: 10px; width: 100%;">' +
            '<p style="font-size: 13px; color: var(--ios-gray); margin-bottom: 4px;">' +
            (currentLang === 'en' ? 'Current Status' : 'वर्तमान स्थिति') + '</p>' +
            '<p style="font-size: 15px; font-weight: 500; color: ' + statusColor + ';">' + detailText + '</p>' +
            occupantLine +
            '</div>' +
            '<button class="btn-ghost mt-2" onclick="unlinkTubewellByOwner(\'' + ownerUid + '\')" style="width:100%; color:var(--ios-red); font-size: 13px; padding: 8px;">' +
            (currentLang === 'en' ? 'Unlink this tubewell' : 'इस ट्यूबवेल को हटाएं') +
            '</button>' +
            mapBlock +
            '</div>';
    }

    container.innerHTML = html ||
        '<div class="list-item empty-state"><div class="item-info"><p>' +
        (currentLang === 'en' ? 'No tubewell linked yet.' : 'अभी तक कोई ट्यूबवेल लिंक नहीं।') +
        '</p></div></div>';
};

window.unlinkTubewellByOwner = function (ownerUid) {
    if (!ownerUid) return;
    showConfirmPopup(
        currentLang === 'en' ? 'Unlink tubewell' : 'ट्यूबवेल हटाएं',
        currentLang === 'en'
            ? 'Remove this link? Your old water history will still stay with the owner.'
            : 'यह लिंक हटाएं? पुराना पानी इतिहास मालिक के पास रहेगा।',
        currentLang === 'en' ? 'Unlink' : 'हटाएं',
        currentLang === 'en' ? 'Cancel' : 'रद्द करें',
        function () { proceedUnlinkTubewellByOwner(ownerUid); },
        null
    );
};

window.proceedUnlinkTubewellByOwner = async function (ownerUid) {
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
    const link = JSON.parse(localStorage.getItem('customer_link') || 'null');

    if (link && link.ownerUid) {
        // Remove customer_links
        try {
            const snap = await getDocs(
                query(
                    collection(db, 'customer_links'),
                    where('customerUid', '==', customerUid),
                    where('ownerUid', '==', link.ownerUid)
                )
            );
            for (const d of snap.docs) {
                await safeDeleteDoc(doc(db, 'customer_links', d.id));
            }
        } catch (e) {
            console.error(e);
        }

        // Soft-remove from owner's customers (keep Bahi)
        try {
            const csnap = await getDocs(
                query(
                    collection(db, 'customers'),
                    where('ownerId', '==', link.ownerUid),
                    where('customerUid', '==', customerUid)
                )
            );
            for (const d of csnap.docs) {
                const data = d.data();
                await safeUpdateDoc(doc(db, 'customers', d.id), {
                    status: 'removed',
                    removedAt: safeServerTimestamp(),
                    name: data.name || '',
                    phone: data.phone || ''
                });
            }
        } catch (e) {
            console.error('Soft-remove from owner customers failed', e);
        }

        // Cancel pending link requests
        try {
            const rsnap = await getDocs(
                query(
                    collection(db, 'link_requests'),
                    where('ownerUid', '==', link.ownerUid),
                    where('customerUid', '==', customerUid)
                )
            );
            for (const d of rsnap.docs) {
                await safeUpdateDoc(doc(db, 'link_requests', d.id), { status: 'rejected' });
            }
        } catch (e) {
            console.error(e);
        }
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
    const customerPhone = localStorage.getItem('user_phone');
    if (!customerUid && !customerPhone) {
        posEl.innerText = '-';
        return;
    }

    let position = -1;

    try {
        const lsnap = await getDocs(
            query(collection(db, 'customer_links'), where('customerUid', '==', customerUid))
        );

        for (const ld of lsnap.docs) {
            const ownerUid = ld.data().ownerUid;

            // Find my contact under this owner by customerUid (not phone)
            const csnap = await getDocs(
                query(
                    collection(db, 'customers'),
                    where('ownerId', '==', ownerUid),
                    where('customerUid', '==', customerUid)
                )
            );
            if (csnap.empty) continue;

            const myCustId = csnap.docs[0].data().id || csnap.docs[0].id;

            const qsnap = await getDocs(
                query(collection(db, 'queues'), where('ownerId', '==', ownerUid))
            );
            const entries = qsnap.docs.map(d => d.data()).sort((a, b) => {
                const ta = a.addedAt && a.addedAt.toMillis ? a.addedAt.toMillis() : 0;
                const tb = b.addedAt && b.addedAt.toMillis ? b.addedAt.toMillis() : 0;
                return ta - tb;
            });

            const idx = entries.findIndex(e => e.customerId === myCustId);
            if (idx >= 0) {
                position = idx;
                break;
            }
        }
    } catch (e) {
        console.error(e);
    }

    // Local fallback by customerUid or phone
    if (position < 0) {
        const queue = getQueue();
        const customerPhone = localStorage.getItem('user_phone');
        position = queue.findIndex(q => {
            const c = getCustomerById(q.customerId);
            return c && (c.customerUid === customerUid || (customerPhone && c.phone === customerPhone));
        });
    }

    if (position < 0) {
        posEl.innerText = '-';
        return;
    }
    if (position === 0) {
        posEl.innerHTML = '<span style="color:var(--ios-green); font-size:13px;">' +
            locales[currentLang].youAreNext + '</span>';
        return;
    }
    posEl.innerText = '#' + (position + 1);
};

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

let pendingAcceptLink = null;
let listenerUnsubs = [];

window.acceptLinkRequest = async function (requestId, customerUid, customerPhone, customerName) {
    const options = getOwnerTubewellOptions();

    if (options.length === 0) {
        // No tubewells at all — default to primary
        await finishAcceptLinkRequest(requestId, customerUid, customerPhone, customerName, 'primary');
        return;
    }

    if (options.length === 1) {
        await finishAcceptLinkRequest(requestId, customerUid, customerPhone, customerName, options[0].id);
        return;
    }

    // Multiple → ask which tubewell
    pendingAcceptLink = {
        requestId: requestId,
        customerUid: customerUid,
        customerPhone: customerPhone,
        customerName: customerName
    };

    const sel = document.getElementById('pick-tubewell-select');
    if (sel) {
        sel.innerHTML = options.map(function (o) {
            return '<option value="' + o.id + '">' + o.name + '</option>';
        }).join('');
    }
    openModal('pick-tubewell-modal');
};

window.confirmAcceptLinkWithTubewell = async function () {
    if (!pendingAcceptLink) return;
    const sel = document.getElementById('pick-tubewell-select');
    const tubewellId = (sel && sel.value) ? sel.value : 'primary';
    const p = pendingAcceptLink;
    pendingAcceptLink = null;
    closeModal('pick-tubewell-modal');
    await finishAcceptLinkRequest(
        p.requestId,
        p.customerUid,
        p.customerPhone,
        p.customerName,
        tubewellId
    );
};

async function finishAcceptLinkRequest(requestId, customerUid, customerPhone, customerName, tubewellId) {
    const ownerUid = localStorage.getItem('user_uid');
    const ownerPhone = localStorage.getItem('user_phone');
    const ownerInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    const twId = tubewellId || 'primary';

    await safeUpdateDoc(doc(db, 'link_requests', requestId), {
        status: 'accepted',
        tubewellId: twId
    });

    const twInfo = getTubewellDetailsById(twId);

    const custId = 'cust_' + Date.now();
    await safeSetDoc(doc(db, 'customers', custId), {
        id: custId,
        name: customerName || customerPhone,
        phone: customerPhone,
        customerUid: customerUid,
        tubewellId: twInfo.tubewellId,
        tubewellName: twInfo.tubewellName,
        ownerId: ownerUid,
        ownerPhone: ownerPhone,
        status: 'active',
        linkedAt: safeServerTimestamp()
    });

    await safeSetDoc(doc(db, 'customer_links', customerUid + '_' + ownerUid), {
        customerUid: customerUid,
        customerPhone: customerPhone,
        customerName: customerName || '',
        ownerUid: ownerUid,
        ownerPhone: ownerPhone,
        ownerName: ownerInfo.name || '',
        tubewellId: twInfo.tubewellId,
        tubewellName: twInfo.tubewellName,
        tubewellRate: twInfo.tubewellRate,
        tubewellLocation: twInfo.tubewellLocation,
        mapLink: twInfo.mapLink || '',
        status: 'linked',
        linkedAt: safeServerTimestamp()
    });

    await safeAddDoc(collection(db, 'notifications'), {
        toUid: customerUid,
        type: 'request_accepted',
        title: currentLang === 'en' ? 'Request accepted' : 'अनुरोध स्वीकार',
        body: locales[currentLang].requestAcceptedMsg,
        requestData: {
            ownerUid: ownerUid,
            ownerPhone: ownerPhone,
            tubewellId: twId
        },
        read: false,
        createdAt: safeServerTimestamp()
    });

    // Local customers list
    const customers = getCustomers();
    if (!customers.some(c => c.customerUid === customerUid || c.phone === customerPhone)) {
        customers.push({
            id: custId,
            name: customerName || customerPhone,
            phone: customerPhone,
            customerUid: customerUid,
            tubewellId: twId,
            ownerId: ownerUid,
            status: 'active'
        });
        saveCustomers(customers);
    }

    renderLinkRequests();
    renderCustomers();
    showToast(currentLang === 'en' ? 'Customer linked!' : 'ग्राहक जुड़ गया!', 'success');
}

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


function getTubewellDetailsById(tubewellId) {
    const primary = getTubewellData() || {};
    const extras = JSON.parse(localStorage.getItem('tubewell_extras') || '[]');
    const id = tubewellId || 'primary';

    if (id === 'primary') {
        return {
            tubewellId: 'primary',
            tubewellName: primary.name || 'Tubewell',
            tubewellRate: primary.rate || 150,
            tubewellLocation: primary.location || '',
            mapLink: primary.mapLink || ''
        };
    }

    const tw = extras.find(e => e.id === id) || {};
    return {
        tubewellId: id,
        tubewellName: tw.name || 'Tubewell',
        tubewellRate: tw.rate || 150,
        tubewellLocation: tw.location || '',
        mapLink: tw.mapLink || ''
    };
}

/* --- REAL-TIME LISTENERS --- */
let unsubTubewell = null;
let unsubQueue = null;
let unsubCustomers = null;

window.startOwnerListeners = function () {
    const ownerUid = localStorage.getItem('user_uid');
    if (!ownerUid || isMockMode) return;

    // Clear any existing
    stopListeners();

    // Tubewell
    const twRef = doc(db, 'tubewells', ownerUid + '_primary');
    unsubTubewell = onSnapshot(twRef, async (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            saveTubewellData(data);
            await renderStatusCard();
            renderTubewells();
        }
    });
    listenerUnsubs.push(unsubTubewell);

    // Queue
    const queueRef = collection(db, 'queues');
    const q = query(queueRef, where('ownerId', '==', ownerUid));
    unsubQueue = onSnapshot(q, (snapshot) => {
        const queue = [];
        snapshot.forEach(d => queue.push(d.data()));
        queue.sort((a, b) => a.addedAt?.toMillis?.() - b.addedAt?.toMillis?.() || 0);
        saveQueue(queue);
        renderQueue();
    });
    listenerUnsubs.push(unsubQueue);

    // Customers
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
    listenerUnsubs.push(unsubCustomers);

    // Link requests
    const reqRef = collection(db, 'link_requests');
    const rq = query(reqRef, where('ownerUid', '==', ownerUid), where('status', '==', 'pending'));
    const unsubReq = onSnapshot(rq, () => {
        renderLinkRequests();
    });
    listenerUnsubs.push(unsubReq);

    const uq = query(collection(db, 'water_usage'), where('business_id', '==', ownerUid));
    const unsubUsage = onSnapshot(uq, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'modified') {
                const data = change.doc.data();
                const entryId = change.doc.id;
                const history = getWaterHistory();
                const idx = history.findIndex(h => h.id === entryId);
                if (idx >= 0) {
                    history[idx].approval_status = data.approval_status;
                    history[idx].amount = data.amount;
                    history[idx].duration = data.duration;
                    history[idx].date = data.date;
                    history[idx].start = data.start_time;
                    history[idx].end = data.end_time;
                    history[idx].rate = data.rate;
                    saveWaterHistory(history);
                }
                const custHistory = JSON.parse(localStorage.getItem('customer_history') || '{}');
                Object.keys(custHistory).forEach(cid => {
                    const eidx = custHistory[cid].findIndex(e => e.id === entryId);
                    if (eidx >= 0) {
                        custHistory[cid][eidx].approval_status = data.approval_status;
                        custHistory[cid][eidx].amount = data.amount;
                        custHistory[cid][eidx].duration = data.duration;
                        custHistory[cid][eidx].date = data.date;
                        custHistory[cid][eidx].start = data.start_time;
                        custHistory[cid][eidx].end = data.end_time;
                        custHistory[cid][eidx].rate = data.rate;
                    }
                });
                localStorage.setItem('customer_history', JSON.stringify(custHistory));
                Object.keys(customerData).forEach(cid => {
                    const ch = customerData[cid].history || [];
                    const eidx = ch.findIndex(e => e.id === entryId);
                    if (eidx >= 0) {
                        ch[eidx].approval_status = data.approval_status;
                        ch[eidx].amount = data.amount;
                        ch[eidx].duration = data.duration;
                        ch[eidx].date = data.date;
                        ch[eidx].start = data.start_time;
                        ch[eidx].end = data.end_time;
                        ch[eidx].rate = data.rate;
                    }
                });
            }
        });
        syncOwnerUsageFromServer();
        updateDashboardStats();
        renderPendingPayments();
        if (window.currentCustomerId && document.getElementById('view-customer-detail').classList.contains('active')) {
            renderCustomerDetailUI(window.currentCustomerId);
        }
    });
    listenerUnsubs.push(unsubUsage);
    syncOwnerUsageFromServer();
};

window.renderCustomerDetailUI = function (id) {
    window.currentCustomerId = id;
    const listCust = getCustomerById(id) || {};
    let displayName = listCust.name || (customerData[id] && customerData[id].name) || 'Customer';
    const accountDeleted = listCust.accountDeleted === true;
    if (listCust.customerUid) {
        getDoc(doc(db, 'users', listCust.customerUid)).then(uDoc => {
            if (uDoc.exists() && uDoc.data().accountStatus !== 'deleted') {
                displayName = uDoc.data().name || displayName;
                if (customerData[id]) customerData[id].name = displayName;
            }
        }).catch(() => { });
    }
    const detailView = document.getElementById('view-customer-detail');
    if (detailView) {
        const btns = detailView.querySelectorAll('button');
        btns.forEach(btn => {
            const t = (btn.innerText || btn.textContent || '').toLowerCase();
            const isAction = t.indexOf('payment') >= 0 || t.indexOf('water') >= 0 || t.indexOf('queue') >= 0 ||
                t.indexOf('भुगतान') >= 0 || t.indexOf('पानी') >= 0 || t.indexOf('कतार') >= 0;
            if (isAction) {
                btn.disabled = accountDeleted;
                btn.style.opacity = accountDeleted ? '0.45' : '1';
                btn.style.pointerEvents = accountDeleted ? 'none' : '';
            }
        });
        let ban = document.getElementById('cust-deleted-banner');
        if (accountDeleted) {
            if (!ban) {
                ban = document.createElement('div');
                ban.id = 'cust-deleted-banner';
                ban.style.cssText = 'padding:10px 12px;margin-bottom:12px;border-radius:10px;background:rgba(255,59,48,0.12);color:var(--ios-red);font-size:13px;';
                const nameEl = document.getElementById('customer-detail-name');
                if (nameEl && nameEl.parentNode) nameEl.parentNode.insertBefore(ban, nameEl.nextSibling);
            }
            ban.innerText = currentLang === 'en' ? 'This customer deleted their account. \n History only can be visible. Other actions are disabled.' : 'इस ग्राहक ने खाता हटा दिया है। केवल इतिहास — कार्य बंद।';
            ban.style.display = 'block';
        } else if (ban) ban.style.display = 'none';
    }
    const cust = customerData[id];
    if (!cust) {
        const customers = getCustomers();
        const found = customers.find(c => c.id === id);
        if (found) customerData[id] = { name: found.name, phone: found.phone, history: [] };
        else return;
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
    const { settled, partial } = getSettledWaterKeys(waters, pays);
    let totalDue = 0, totalPaid = 0, totalHours = 0, lastEntry = '-';
    historyList.innerHTML = allHistory.slice().reverse().map((entry, idx) => {
        if (entry.type === 'water') {
            totalHours += entry.duration || 0;
            if (idx === 0) lastEntry = entry.date;
            const wkey = waterKey(entry);
            const isSettled = entry.status === 'paid' || settled.has(wkey);
            const partialDue = partial.get(wkey) || 0;
            if (!isSettled) totalDue += entry.amount || 0;
            const displayAmount = partialDue > 0 ? partialDue : entry.amount;
            const approvalStatus = entry.approval_status || 'awaiting_approval';
            let approvalBadge = '';
            let editButton = '';
            if (approvalStatus === 'awaiting_approval') {
                approvalBadge = '<span style="font-size:11px;color:var(--ios-orange);background:rgba(255,149,0,0.12);padding:2px 8px;border-radius:6px;margin-left:8px;">' + (currentLang === 'en' ? 'Waiting for customer approval' : 'ग्राहक की स्वीकृति का इंतजार') + '</span>';
                editButton = '<button class="btn-small" style="margin-top:6px;background:var(--ios-blue);" onclick="openEditWaterModal(\'' + (entry.id || '') + '\')">' + (currentLang === 'en' ? 'Edit' : 'एडिट') + '</button>';
            } else if (approvalStatus === 'approved') {
                approvalBadge = '<span style="font-size:11px;color:var(--ios-green);background:rgba(52,199,89,0.12);padding:2px 8px;border-radius:6px;margin-left:8px;">' + (currentLang === 'en' ? 'Approved' : 'स्वीकृत') + '</span>';
            } else if (approvalStatus === 'rejected') {
                approvalBadge = '<span style="font-size:11px;color:var(--ios-red);background:rgba(255,59,48,0.12);padding:2px 8px;border-radius:6px;margin-left:8px;">' + (currentLang === 'en' ? 'Customer Rejected' : 'ग्राहक ने अस्वीकार किया') + '</span>';
                editButton = '<button class="btn-small" style="margin-top:6px;background:var(--ios-blue);" onclick="openEditWaterModal(\'' + (entry.id || '') + '\')">' + (currentLang === 'en' ? 'Edit' : 'एडिट') + '</button>';
            }
            const statusLabel = isSettled ? 'paid' : (partialDue > 0 ? 'partial' : 'pending');
            const statusColor = isSettled ? 'text-green' : (partialDue > 0 ? 'text-orange' : 'text-red');
            return '<div class="list-item" style="flex-direction:column;align-items:flex-start;gap:6px;">' +
                '<div style="display:flex;justify-content:space-between;width:100%;">' +
                '<div class="item-info">' +
                '<h4>Water Usage' + approvalBadge + '</h4>' +
                '<p>' + entry.date + ' • ' + entry.start + ' - ' + entry.end + ' • ' + entry.duration + ' hrs</p>' +
                '</div>' +
                '<div style="text-align:right;">' +
                '<div class="item-value ' + statusColor + '">₹' + displayAmount + '</div>' +
                '<span style="font-size: 11px; color: var(--ios-gray); text-transform: uppercase;">' + statusLabel + '</span>' +
                '</div>' +
                '</div>' +
                editButton +
                '</div>';
        } else {
            totalPaid += entry.amount || 0;
            if (idx === 0) lastEntry = entry.date;
            const modeLabel = entry.mode || 'Cash';
            return '<div class="list-item"><div class="item-info"><h4>Payment · ' + modeLabel + '</h4><p>' + entry.date + '</p>' + (entry.note ? '<p style="font-size:12px;color:var(--ios-gray);margin-top:2px;">' + entry.note + '</p>' : '') + '</div><div class="item-value text-green">-₹' + entry.amount + '</div></div>';
        }
    }).join('');
    document.getElementById('cust-total-due').innerText = '₹' + totalDue;
    document.getElementById('cust-total-paid').innerText = '₹' + totalPaid;
    document.getElementById('cust-total-hours').innerHTML = totalHours.toFixed(1) + ' <small>Hrs</small>';
    document.getElementById('cust-last-entry').innerText = lastEntry;
    showView('view-customer-detail');
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
                    records.push({ id: d.id, ...d.data(), });
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
            list.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p>' +
                (currentLang === 'en' ? 'No usage yet' : 'अभी कोई उपयोग नहीं') + '</p></div></div>';
        } else {
            // Apply payments against water (oldest first)
            let creditLeft = totalPaid;
            const waterSortedAsc = sortOldestFirst(water);
            const { settled: settledIds, partial: partialIds } = getSettledWaterKeys(waterSortedAsc, payments);

            const waterNewest = sortNewestFirst(water);

            Promise.all(waterNewest.map(async r => {
                const { ownerName, twName } = await getOwnerAndTubewell(r.business_id);
                const wkey = waterKey(r);
                const isSettled = r.status === 'paid' || settledIds.has(wkey);
                const isPartial = partialIds.has(wkey);
                return { r, ownerName, twName, isSettled, isPartial, ownerId: r.business_id };
            })).then(rows => {
                const currentList = document.getElementById('customer-usage-list');
                if (!currentList || !currentList.isConnected || currentList !== list) return;

                if (rows.length === 0) {
                    currentList.innerHTML = '<div class="list-item empty-state"><div class="item-info"><p>' + (currentLang === 'en' ? 'No usage yet' : 'अभी कोई उपयोग नहीं') + '</p></div></div>';
                    return;
                }

                const byOwner = {};
                rows.forEach(row => {
                    const key = row.ownerId || 'unknown';
                    if (!byOwner[key]) byOwner[key] = { ownerName: row.ownerName, twName: row.twName, records: [] };
                    byOwner[key].records.push(row);
                });

                currentList.innerHTML = Object.entries(byOwner).map(([oid, grp]) => {
                    const header = '<div style="padding: 10px 16px; background: var(--bg); font-size: 13px; font-weight: 600; color: var(--ios-blue); border-bottom: 0.5px solid var(--separator);">' +
                        (grp.twName || 'Tubewell') + ' · ' + (grp.ownerName || 'Owner') + '</div>';

                    const items = grp.records.map(({ r, isSettled, isPartial }) => {
                        const approvalStatus = r.approval_status || 'awaiting_approval';
                        let approvalBadge = '';
                        let actionButtons = '';

                        if (approvalStatus === 'awaiting_approval') {
                            approvalBadge = '<span style="font-size:11px;color:var(--ios-orange);background:rgba(255,149,0,0.12);padding:2px 8px;border-radius:6px;">' +
                                (currentLang === 'en' ? 'Awaiting your approval' : 'आपकी स्वीकृति का इंतजार') + '</span>';
                            actionButtons = '<div style="display:flex;gap:8px;margin-top:8px;">' +
                                '<button class="btn-small" style="background:var(--ios-green);flex:1;" onclick="approveWaterEntry(\'' + r.id + '\')">' +
                                (currentLang === 'en' ? 'Approve' : 'स्वीकार करें') + '</button>' +
                                '<button class="btn-small" style="background:var(--ios-red);flex:1;" onclick="rejectWaterEntry(\'' + r.id + '\')">' +
                                (currentLang === 'en' ? 'Mistake' : 'गलती') + '</button>' +
                                '</div>';
                        } else if (approvalStatus === 'approved') {
                            approvalBadge = '<span style="font-size:11px;color:var(--ios-green);background:rgba(52,199,89,0.12);padding:2px 8px;border-radius:6px;">' +
                                (currentLang === 'en' ? 'Approved' : 'स्वीकृत') + '</span>';
                        } else if (approvalStatus === 'rejected') {
                            approvalBadge = '<span style="font-size:11px;color:var(--ios-red);background:rgba(255,59,48,0.12);padding:2px 8px;border-radius:6px;">' +
                                (currentLang === 'en' ? 'You rejected — owner can edit' : 'आपने अस्वीकार किया — मालिक एडिट कर सकता है') + '</span>';
                        }

                        let st;
                        if (isSettled) {
                            st = '<span style="font-size:11px;color:var(--ios-green);">PAID</span>';
                        } else if (isPartial) {
                            st = '<span style="font-size:11px;color:var(--ios-orange);">PARTIAL</span>';
                        } else {
                            st = '<span style="font-size:11px;color:var(--ios-red);">PENDING</span>';
                        }

                        return '<div class="list-item" style="flex-direction:column;align-items:flex-start;gap:4px;">' +
                            '<div style="display:flex;justify-content:space-between;width:100%;">' +
                            '<div class="item-info">' +
                            '<h4>' + (currentLang === 'en' ? 'Water' : 'पानी') + '</h4>' +
                            '<p>' + (r.date || '') + ' · ' + (r.start_time || '') + ' - ' + (r.end_time || '') +
                            ' · ' + (r.duration || 0) + ' hrs</p>' +
                            '</div>' +
                            '<div style="text-align:right;">' +
                            '<div class="item-value ' + (isSettled ? 'text-green' : (isPartial ? 'text-orange' : 'text-red')) + '">₹' + (r.amount || 0) +
                            '</div>' + st + '</div>' +
                            '</div>' +
                            '<div style="width:100%;">' + approvalBadge + '</div>' +
                            actionButtons +
                            '</div>';
                    }).join('');

                    return header + items;
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
                const currentPayList = document.getElementById('customer-payments-list');
                if (!currentPayList || !currentPayList.isConnected || currentPayList !== payList) return;

                currentPayList.innerHTML = rows.map(({ r, ownerLabel }) => {
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

window.approveWaterEntry = async function (entryId) {
    try {
        await safeUpdateDoc(doc(db, 'water_usage', entryId), {
            approval_status: 'approved',
            customer_approved_at: safeServerTimestamp()
        });
        showToast(currentLang === 'en' ? 'Approved' : 'स्वीकृत', 'success');
        renderCustomerUsageDashboard();
    } catch (e) {
        console.error('approveWaterEntry failed', e);
        showToast(currentLang === 'en' ? 'Failed to approve' : 'स्वीकृत करने में विफल', 'error');
    }
};

window.rejectWaterEntry = async function (entryId) {
    try {
        await safeUpdateDoc(doc(db, 'water_usage', entryId), {
            approval_status: 'rejected',
            customer_rejected_at: safeServerTimestamp()
        });
        showToast(currentLang === 'en' ? 'Marked as mistake' : 'गलती के रूप में चिह्नित', 'info');
        renderCustomerUsageDashboard();
    } catch (e) {
        console.error('rejectWaterEntry failed', e);
        showToast(currentLang === 'en' ? 'Failed to reject' : 'अस्वीकार करने में विफल', 'error');
    }
};


window.openPaymentModal = function (customerId) {
    if (!customerId) {
        showToast(currentLang === 'en' ? 'Select a customer first' : 'पहले ग्राहक चुनें', 'error');
        return;
    }
    window.currentCustomerId = customerId;
    openModal('payment-modal');
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
            const createdAt = r.created_at || null;
            if (r.type === 'water' || (!r.type && r.duration != null)) {
                const row = {
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
                    approval_status: r.approval_status || 'awaiting_approval',
                    type: 'water',
                    created_at: createdAt
                };
                history.push(row);
                if (!custHistory[cid]) custHistory[cid] = [];
                custHistory[cid].push({
                    id: d.id,
                    type: 'water',
                    date: r.date,
                    start: r.start_time,
                    end: r.end_time,
                    duration: r.duration,
                    rate: r.rate,
                    amount: r.amount,
                    status: r.status || 'pending',
                    approval_status: r.approval_status || 'awaiting_approval',
                    created_at: createdAt
                });
            } else if (r.type === 'payment') {
                if (!custHistory[cid]) custHistory[cid] = [];
                custHistory[cid].push({
                    id: d.id,
                    type: 'payment',
                    date: r.date,
                    amount: r.amount,
                    mode: r.mode || (r.note === 'Cash' || r.note === 'UPI' || r.note === 'Online' || r.note === 'Bank' ? r.note : 'Cash'),
                    note: r.note || '',
                    created_at: createdAt
                });
            }
        });

        // Stable order in storage: oldest → newest (push order for future local pushes)
        history.sort((a, b) => entryTimestamp(a) - entryTimestamp(b));
        Object.keys(custHistory).forEach(cid => {
            custHistory[cid].sort((a, b) => entryTimestamp(a) - entryTimestamp(b));
        });

        saveWaterHistory(history);
        localStorage.setItem('customer_history', JSON.stringify(custHistory));
        Object.keys(custHistory).forEach(cid => {
            if (!customerData[cid]) {
                const c = getCustomerById(cid);
                customerData[cid] = { name: c ? c.name : '', phone: c ? c.phone : '', history: [] };
            }
            // Replace history array only — do not mutate individual old entry objects in place
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
    listenerUnsubs.forEach(function (unsub) {
        if (typeof unsub === 'function') unsub();
    });
    listenerUnsubs = [];
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
        todaySummary: "Summary", waterUsed: "Water Used", revenue: "Revenue", received: "Received", pending: "Pending",
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
        statusRunning: "Occupied",
        statusStopped: "Available",
        statusWorkInProgress: "Maintenance",
        statusPowerIssue: "Power issue",
        powerIssue: "Power issue",
        exitPowerIssue: "Power restored",
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
        notesReminder: "Announcement",
        saveNote: "Save Note",
        noNotes: "No notes for today",
        announcement: "Announcement",
        sendAnnouncement: "Send",
        removeAnnouncement: "Remove",
        editTubewell: "Edit Tubewell",
        linkedTubewell: "Linked Tubewell",
        myQueuePosition: "My Queue Position",
        becomeOwner: "Become an Owner",
        saving: "Saving...",
        errorSavingData: "Error saving data.",
        map: "Map",
        primary: "PRIMARY",
        active: "ACTIVE",
        cash: "Cash",
        paid: "paid",
        pending: "pending",
        partial: "partial",
        water: "Water",
        waterUsage: "Water Usage",
        paymentCash: "Payment · Cash",
        to: "To:",
        noUsageYet: "No usage yet",
        noPaymentsYet: "No payments yet",
        pleaseLoginFirst: "Please login first.",
        noTubewellLinked: "No tubewell linked yet.",
        openInGoogleMaps: "Open in Google Maps",
        powerRestored: "Power restored — Available",
        powerIssueMarked: "Marked: Power issue",
        maintenanceModeOn: "Maintenance mode on",
        maintenanceModeOff: "Maintenance mode off",
        stoppedDuration: "Stopped. Duration: ",
        hours: " hrs · ₹",
        addedToQueue: "Added to queue",
        removedFromQueue: "Removed from queue",
        alreadyInQueue: "Already in queue",
        selectCustomer: "Select a customer",
        customerAccountDeleted: "Customer account deleted",
        enterValidRate: "Enter a valid rate",
        tubewellUnderMaintenance: "Tubewell under maintenance",
        powerIssueCannotStart: "Power issue — cannot start",
        alreadyOccupied: "Already occupied",
        waterStarted: "Water started @ ₹",
        perHour: "/hr",
        enterValidPhone: "Enter valid 10-digit phone",
        enterDOB: "Please enter Date of Birth",
        enterAllFields: "Please fill all fields",
        enterTubewellName: "Enter primary tubewell name",
        welcomeBack: "Welcome back!",
        wrongDOB: "Wrong Date of Birth. Please check details.",
        accountDeleted: "Account deleted",
        accountDeletedMsg: "This account was deleted. Do you want to register again with this number?",
        registerAgain: "Register again",
        accountExists: "Account already exists",
        accountExistsMsg: "You already have an {0} account. Do you want to also create a {1} profile with the same details?",
        yesCreate: "Yes, create",
        accountNotFound: "Account not found",
        accountNotFoundMsg: "This account does not exist. Do you want to register yourself?",
        createNew: "Create new",
        correctDetails: "Correct Details",
        confirmDetails: "Confirm details and tap Register",
        loginCancelled: "Login cancelled",
        pleaseCorrectDetails: "Please correct your details",
        nameVillageFilled: "Name & village filled. Confirm and save.",
        welcome: "Welcome!",
        profileUpdated: "Profile Updated!",
        enterName: "Enter name",
        enterValidRate: "Enter valid rate",
        tubewellUpdated: "Tubewell updated",
        tubewellAdded: "Tubewell Added!",
        recordSaved: "Record Saved!",
        paymentSaved: "Payment Saved!",
        enterAmountDate: "Enter amount and date",
        validAmount: "Enter valid amount",
        noCustomerSelected: "No customer selected",
        customerNotFound: "Customer not found",
        ownerNotFound: "Owner not found",
        notRegisteredAsOwner: "This number is not registered as an Owner",
        cannotLinkOwnNumber: "You cannot link to your own number",
        alreadyLinked: "Already linked",
        alreadyRequested: "Already requested",
        requestSent: "Request sent! Check My Tubewell section.",
        unlinkConfirm: "Remove this link? Your old water history will still stay with the owner.",
        unlinked: "Unlinked",
        requestAccepted: "Request accepted!",
        requestRejected: "Request rejected",
        onlyOwnersAnnounce: "Only owners can send announcements",
        onlyOwnersRemoveAnnounce: "Only owners can remove announcements",
        announceRemoved: "Announcement removed",
        announceSent: "Announcement sent to customers",
        writeSomething: "Write something first",
        failedToSend: "Failed to send",
        updatingAccount: "Updating account...",
        accessRemoved: "Access removed. Records kept.",
        couldNotUpdateAccount: "Could not update account",
        completeOwnerProfile: "Complete your owner profile",
        switchToOwner: "Switch to owner mode? Your customer data will be preserved.",
        continue: "Continue",
        customerOnly: "Customer only",
        ownerOnly: "Owner only",
        both: "Both",
        removeAccess: "Remove access",
        historyKept: "History (Bahi / water) is kept.",
        whatToRemove: "What should we remove?",
        deleteRoleTitle: "Delete Account Access",
        tubewellNotFound: "Tubewell not found",
        removeTubewellConfirm: "Remove this tubewell? Customers will be unlinked. Water history will be kept.",
        tubewellRemoved: "Tubewell removed. Customers unlinked. History kept.",
        noEntriesYet: "No entries yet.",
        totalHours: "Total Hours",
        lastEntry: "Last Entry",
        addPayment: "+ Add Payment",
        addWater: "+ Water",
        addQueue: "+ Queue",
        history: "History",
        myUsage: "My Water Usage",
        usageHistory: "Usage History",
        myPayments: "My Payments",
        quickTips: "Quick tips",
        linkTubewellTip: "Link a tubewell",
        linkTubewellDesc: "Go to My Usage → enter owner phone to request link.",
        checkQueueTip: "Check your queue",
        checkQueueDesc: "Your position shows on My Usage when you are in queue.",
        paymentsTip: "Payments",
        paymentsDesc: "See due and paid amounts under Payments tab.",
        phone: "Phone",
        email: "Email",
        linked: "Linked",
        unlinkThisTubewell: "Unlink this tubewell",
        currentStatus: "Current Status",
        availableForUse: "Available for use",
        underMaintenance: "Under maintenance",
        powerIssueNotAvailable: "Power issue — not available",
        runningForYou: "Running for you",
        inUseByOther: "Currently in use by another customer",
        due: "Due",
        paid: "Paid",
        hoursSmall: "Hrs",
        next: "Next",
        nextInQueueLabel: "Next in queue",
        noOneWaiting: "No one waiting in queue",
        selectCustomerFirst: "Select a customer first",
        enterAmount: "Enter amount",
        enterDate: "Enter date",
        paymentMode: "Payment mode",
        noteOptional: "Note (optional)",
        shortNote: "Short note",
        savePayment: "Save Payment",
        ownerPhone: "Owner phone number",
        sendRequest: "Send request",
        noTubewellLinkedYet: "No tubewell linked yet. Enter owner phone below.",
        waitingForApproval: "Waiting for owner approval",
        newLinkRequest: "New link request",
        wantsToConnect: " wants to connect",
        linkToWhichTubewell: "Link to which tubewell?",
        confirmLink: "Confirm link",
        tubewell: "Tubewell",
        owner: "Owner",
        unknownOwner: "Unknown owner",
        unknown: "Unknown",
        softDeleteFailed: "Soft delete failed:",
        removeAnnouncement: "Remove announcement",
        announceRemoveConfirm: "This will remove the announcement for all linked customers.",
        payment: "Payment",
        waterBill: "Water Bill",
        from: "From",
        to: "To",
        period: "Period",
        custom: "Custom",
        today: "Today",
        thisMonth: "This Month",
        thisYear: "This Year",
        select: "Select",
        allRecordsKept: "All records are saved on the server — log in again on a new phone to get your data back.",
        forOwners: "For tubewell owners",
        forCustomers: "For customers",
        step1Owner: "Add customers",
        step1OwnerDesc: "Name + phone, or accept a link request from a customer.",
        step2Owner: "Start / Stop water",
        step2OwnerDesc: "On Home, Start water → pick customer → set rate. On Stop, hours × rate = bill and it goes to Pending payments. The customer sees the same record live.",
        step3Owner: "Paani Ka Hisab (manual)",
        step3OwnerDesc: "If water already ran, enter start/end time and save a record without using the live timer.",
        step4Owner: "+ Payment",
        step4OwnerDesc: "On a customer's detail page, record cash/UPI received. This updates Bahi-khata for both of you.",
        step5Owner: "Queue",
        step5OwnerDesc: "Add customers to the queue. \"Next in queue\" and queue count show on Home.",
        step6Owner: "Bahi-khata",
        step6OwnerDesc: "Full ledger per customer (water + payments) stays here even if they unlink later.",
        step1Customer: "Link",
        step1CustomerDesc: "Enter the owner's 10-digit mobile and send a request. When they accept, the tubewell is linked.",
        step2Customer: "Queue",
        step2CustomerDesc: "Owner can put you in the queue. Check \"My queue position\" on My Usage.",
        step3Customer: "Water usage",
        step3CustomerDesc: "When the owner starts/stops water in your name, hours and amount appear automatically under My Usage.",
        step4Customer: "Payments",
        step4CustomerDesc: "When the owner records a payment, it shows under the Payments tab. Due amount is on your dashboard.",
        step5Customer: "Multiple owners",
        step5CustomerDesc: "You can link to more than one tubewell owner.",
        searchCustomer: "Search customer...",
        selectTubewellOption: "Select tubewell",
        primaryTubewell: "Primary Tubewell",
        googleMapsLink: "Google Maps link (optional)",
        villageAddress: "Village / address",
        removeTubewell: "Remove tubewell",
        save: "Save",
        enterValid10Digit: "Enter valid 10-digit phone",
        userNotRegistered: "This number is not registered in the app",
        accountDeletedCannotAdd: "This account has been deleted. Cannot add to contacts.",
        userNotCustomer: "This user is not registered as a customer",
        userHasNoName: "User has no name on profile",
        couldNotVerify: "Could not verify number",
        customerAdded: "Customer added: ",
        removedFromList: "Removed from list. Bahi kept.",
        enterValid10DigitOwner: "Enter valid 10-digit phone",
        enterDOBError: "Please enter Date of Birth",
        enterValid10DigitLogin: "Enter valid 10 digit number",
        enterAllFieldsError: "Please fill all fields",
        enterTubewellNameError: "Enter primary tubewell name",
        welcomeBackMsg: "Welcome back!",
        wrongDOBError: "Wrong Date of Birth. Please check details.",
        accountDeletedOffer: "This account was deleted. Do you want to register again with this number?",
        registerAgainBtn: "Register again",
        accountExistsMsg: "You already have an {0} account. Do you want to also create a {1} profile with the same details?",
        yesCreateBtn: "Yes, create",
        accountNotFoundMsg: "This account does not exist. Do you want to register yourself?",
        createNewBtn: "Create new",
        correctDetailsBtn: "Correct Details",
        confirmDetailsMsg: "Confirm details and tap Register",
        loginCancelledMsg: "Login cancelled",
        correctDetailsMsg: "Please correct your details",
        nameVillageFilledMsg: "Name & village filled. Confirm and save.",
        welcomeMsg: "Welcome!",
        profileUpdatedMsg: "Profile Updated!",
        enterNameError: "Enter name",
        enterValidRateError: "Enter valid rate",
        tubewellUpdatedMsg: "Tubewell updated",
        tubewellAddedMsg: "Tubewell Added!",
        recordSavedMsg: "Record Saved!",
        paymentSavedMsg: "Payment Saved!",
        enterAmountDateError: "Enter amount and date",
        validAmountError: "Enter valid amount",
        noCustomerSelectedError: "No customer selected",
        ownerNotFoundError: "Owner not found",
        notRegisteredOwnerError: "This number is not registered as an Owner",
        cannotLinkOwnError: "You cannot link to your own number",
        alreadyLinkedError: "Already linked",
        alreadyRequestedError: "Already requested",
        requestSentMsg: "Request sent! Check My Tubewell section.",
        unlinkConfirmMsg: "Remove this link? Your old water history will still stay with the owner.",
        unlinkedMsg: "Unlinked",
        requestAcceptedMsg: "Request accepted!",
        requestRejectedMsg: "Request rejected",
        onlyOwnersSendError: "Only owners can send announcements",
        onlyOwnersRemoveError: "Only owners can remove announcements",
        announceRemovedMsg: "Announcement removed",
        announceSentMsg: "Announcement sent to customers",
        writeSomethingError: "Write something first",
        failedToSendError: "Failed to send",
        updatingAccountMsg: "Updating account...",
        accessRemovedMsg: "Access removed. Records kept.",
        couldNotUpdateError: "Could not update account",
        completeOwnerProfileMsg: "Complete your owner profile",
        switchToOwnerMsg: "Switch to owner mode? Your customer data will be preserved.",
        continueBtn: "Continue",
        customerOnlyBtn: "Customer only",
        ownerOnlyBtn: "Owner only",
        bothBtn: "Both",
        removeAccessBtn: "Remove access",
        historyKeptMsg: "History (Bahi / water) is kept.",
        whatToRemoveMsg: "What should we remove?",
        deleteRoleTitleMsg: "Delete Account Access",
        tubewellNotFoundError: "Tubewell not found",
        removeTubewellConfirmMsg: "Remove this tubewell? Customers will be unlinked. Water history will be kept.",
        tubewellRemovedMsg: "Tubewell removed. Customers unlinked. History kept.",
        noEntriesYetMsg: "No entries yet.",
        totalHoursLabel: "Total Hours",
        lastEntryLabel: "Last Entry",
        addPaymentBtn: "+ Add Payment",
        addWaterBtn: "+ Water",
        addQueueBtn: "+ Queue",
        historyLabel: "History",
        myUsageLabel: "My Water Usage",
        usageHistoryLabel: "Usage History",
        myPaymentsLabel: "My Payments",
        quickTipsLabel: "Quick tips",
        linkTubewellTipTitle: "Link a tubewell",
        linkTubewellTipDesc: "Go to My Usage → enter owner phone to request link.",
        checkQueueTipTitle: "Check your queue",
        checkQueueTipDesc: "Your position shows on My Usage when you are in queue.",
        paymentsTipTitle: "Payments",
        paymentsTipDesc: "See due and paid amounts under Payments tab.",
        phoneLabel: "Phone",
        emailLabel: "Email",
        linkedLabel: "Linked",
        unlinkThisTubewellBtn: "Unlink this tubewell",
        currentStatusLabel: "Current Status",
        availableForUseMsg: "Available for use",
        underMaintenanceMsg: "Under maintenance",
        powerIssueNotAvailableMsg: "Power issue — not available",
        runningForYouMsg: "Running for you",
        inUseByOtherMsg: "Currently in use by another customer",
        dueLabel: "Due",
        paidLabel: "Paid",
        hoursSmallLabel: "Hrs",
        nextLabel: "Next",
        nextInQueueLabelMsg: "Next in queue",
        noOneWaitingMsg: "No one waiting in queue",
        selectCustomerFirstError: "Select a customer first",
        enterAmountPlaceholder: "Enter amount",
        enterDateLabel: "Enter date",
        paymentModeLabel: "Payment mode",
        noteOptionalLabel: "Note (optional)",
        shortNotePlaceholder: "Short note",
        savePaymentBtn: "Save Payment",
        ownerPhoneLabel: "Owner phone number",
        sendRequestBtn: "Send request",
        noTubewellLinkedYetMsg: "No tubewell linked yet. Enter owner phone below.",
        waitingForApprovalMsg: "Waiting for owner approval",
        newLinkRequestMsg: "New link request",
        wantsToConnectMsg: " wants to connect",
        linkToWhichTubewellMsg: "Link to which tubewell?",
        confirmLinkBtn: "Confirm link",
        tubewellLabel: "Tubewell",
        ownerLabel: "Owner",
        unknownOwnerMsg: "Unknown owner",
        unknownLabel: "Unknown",
        softDeleteFailedMsg: "Soft delete failed:",
        removeAnnouncementMsg: "Remove announcement",
        announceRemoveConfirmMsg: "This will remove the announcement for all linked customers.",
        paymentLabel: "Payment",
        waterBillLabel: "Water Bill",
        fromLabel: "From",
        toLabel: "To",
        periodLabel: "Period",
        customLabel: "Custom",
        todayLabel: "Today",
        thisMonthLabel: "This Month",
        thisYearLabel: "This Year",
        selectLabel: "Select",
        allRecordsKeptMsg: "All records are saved on the server — log in again on a new phone to get your data back.",
        forOwnersLabel: "For tubewell owners",
        forCustomersLabel: "For customers",
        step1OwnerTitle: "Add customers",
        step1OwnerDesc: "Name + phone, or accept a link request from a customer.",
        step2OwnerTitle: "Start / Stop water",
        step2OwnerDesc: "On Home, Start water → pick customer → set rate. On Stop, hours × rate = bill and it goes to Pending payments. The customer sees the same record live.",
        step3OwnerTitle: "Paani Ka Hisab (manual)",
        step3OwnerDesc: "If water already ran, enter start/end time and save a record without using the live timer.",
        step4OwnerTitle: "+ Payment",
        step4OwnerDesc: "On a customer's detail page, record cash/UPI received. This updates Bahi-khata for both of you.",
        step5OwnerTitle: "Queue",
        step5OwnerDesc: "Add customers to the queue. \"Next in queue\" and queue count show on Home.",
        step6OwnerTitle: "Bahi-khata",
        step6OwnerDesc: "Full ledger per customer (water + payments) stays here even if they unlink later.",
        step1CustomerTitle: "Link",
        step1CustomerDesc: "Enter the owner's 10-digit mobile and send a request. When they accept, the tubewell is linked.",
        step2CustomerTitle: "Queue",
        step2CustomerDesc: "Owner can put you in the queue. Check \"My queue position\" on My Usage.",
        step3CustomerTitle: "Water usage",
        step3CustomerDesc: "When the owner starts/stops water in your name, hours and amount appear automatically under My Usage.",
        step4CustomerTitle: "Payments",
        step4CustomerDesc: "When the owner records a payment, it shows under the Payments tab. Due amount is on your dashboard.",
        step5CustomerTitle: "Multiple owners",
        step5CustomerDesc: "You can link to more than one tubewell owner.",
        searchCustomerPlaceholder: "Search customer...",
        selectTubewellOptionLabel: "Select tubewell",
        primaryTubewellLabel: "Primary Tubewell",
        googleMapsLinkLabel: "Google Maps link (optional)",
        villageAddressLabel: "Village / address",
        removeTubewellLabel: "Remove tubewell",
        saveLabel: "Save",
        enterValid10DigitMsg: "Enter valid 10-digit phone",
        userNotRegisteredMsg: "This number is not registered in the app",
        accountDeletedCannotAddMsg: "This account has been deleted. Cannot add to contacts.",
        userNotCustomerMsg: "This user is not registered as a customer",
        userHasNoNameMsg: "User has no name on profile",
        couldNotVerifyMsg: "Could not verify number",
        customerAddedMsg: "Customer added: ",
        removedFromListMsg: "Removed from list. Bahi kept.",
        enterValid10DigitOwnerMsg: "Enter valid 10-digit phone",
        enterDOBErrorMsg: "Please enter Date of Birth",
        enterValid10DigitLoginMsg: "Enter valid 10 digit number",
        enterAllFieldsErrorMsg: "Please fill all fields",
        enterTubewellNameErrorMsg: "Enter primary tubewell name",
        welcomeBackMsg2: "Welcome back!",
        wrongDOBErrorMsg: "Wrong Date of Birth. Please check details.",
        accountDeletedOfferMsg: "This account was deleted. Do you want to register again with this number?",
        registerAgainBtn2: "Register again",
        accountExistsMsg2: "You already have an {0} account. Do you want to also create a {1} profile with the same details?",
        yesCreateBtn2: "Yes, create",
        accountNotFoundMsg2: "This account does not exist. Do you want to register yourself?",
        createNewBtn2: "Create new",
        correctDetailsBtn2: "Correct Details",
        confirmDetailsMsg2: "Confirm details and tap Register",
        loginCancelledMsg2: "Login cancelled",
        correctDetailsMsg2: "Please correct your details",
        nameVillageFilledMsg2: "Name & village filled. Confirm and save.",
        welcomeMsg2: "Welcome!",
        profileUpdatedMsg2: "Profile Updated!",
        enterNameError2: "Enter name",
        enterValidRateError2: "Enter valid rate",
        tubewellUpdatedMsg2: "Tubewell updated",
        tubewellAddedMsg2: "Tubewell Added!",
        recordSavedMsg2: "Record Saved!",
        paymentSavedMsg2: "Payment Saved!",
        enterAmountDateError2: "Enter amount and date",
        validAmountError2: "Enter valid amount",
        noCustomerSelectedError2: "No customer selected",
        ownerNotFoundError2: "Owner not found",
        notRegisteredOwnerError2: "This number is not registered as an Owner",
        cannotLinkOwnError2: "You cannot link to your own number",
        alreadyLinkedError2: "Already linked",
        alreadyRequestedError2: "Already requested",
        requestSentMsg2: "Request sent! Check My Tubewell section.",
        unlinkConfirmMsg2: "Remove this link? Your old water history will still stay with the owner.",
        unlinkedMsg2: "Unlinked",
        requestAcceptedMsg2: "Request accepted!",
        requestRejectedMsg2: "Request rejected",
        onlyOwnersSendError2: "Only owners can send announcements",
        onlyOwnersRemoveError2: "Only owners can remove announcements",
        announceRemovedMsg2: "Announcement removed",
        announceSentMsg2: "Announcement sent to customers",
        writeSomethingError2: "Write something first",
        failedToSendError2: "Failed to send",
        updatingAccountMsg2: "Updating account...",
        accessRemovedMsg2: "Access removed. Records kept.",
        couldNotUpdateError2: "Could not update account",
        completeOwnerProfileMsg2: "Complete your owner profile",
        switchToOwnerMsg2: "Switch to owner mode? Your customer data will be preserved.",
        continueBtn2: "Continue",
        customerOnlyBtn2: "Customer only",
        ownerOnlyBtn2: "Owner only",
        bothBtn2: "Both",
        removeAccessBtn2: "Remove access",
        historyKeptMsg2: "History (Bahi / water) is kept.",
        whatToRemoveMsg2: "What should we remove?",
        deleteRoleTitleMsg2: "Delete Account Access",
        tubewellNotFoundError2: "Tubewell not found",
        removeTubewellConfirmMsg2: "Remove this tubewell? Customers will be unlinked. Water history will be kept.",
        tubewellRemovedMsg2: "Tubewell removed. Customers unlinked. History kept.",
        noEntriesYetMsg2: "No entries yet.",
        totalHoursLabel2: "Total Hours",
        lastEntryLabel2: "Last Entry",
        addPaymentBtn2: "+ Add Payment",
        addWaterBtn2: "+ Water",
        addQueueBtn2: "+ Queue",
        historyLabel2: "History",
        myUsageLabel2: "My Water Usage",
        usageHistoryLabel2: "Usage History",
        myPaymentsLabel2: "My Payments",
        quickTipsLabel2: "Quick tips",
        linkTubewellTipTitle2: "Link a tubewell",
        linkTubewellTipDesc2: "Go to My Usage → enter owner phone to request link.",
        checkQueueTipTitle2: "Check your queue",
        checkQueueTipDesc2: "Your position shows on My Usage when you are in queue.",
        paymentsTipTitle2: "Payments",
        paymentsTipDesc2: "See due and paid amounts under Payments tab.",
        phoneLabel2: "Phone",
        emailLabel2: "Email",
        linkedLabel2: "Linked",
        unlinkThisTubewellBtn2: "Unlink this tubewell",
        currentStatusLabel2: "Current Status",
        availableForUseMsg2: "Available for use",
        underMaintenanceMsg2: "Under maintenance",
        powerIssueNotAvailableMsg2: "Power issue — not available",
        runningForYouMsg2: "Running for you",
        inUseByOtherMsg2: "Currently in use by another customer",
        dueLabel2: "Due",
        paidLabel2: "Paid",
        hoursSmallLabel2: "Hrs",
        nextLabel2: "Next",
        nextInQueueLabelMsg2: "Next in queue",
        noOneWaitingMsg2: "No one waiting in queue",
        selectCustomerFirstError2: "Select a customer first",
        enterAmountPlaceholder2: "Enter amount",
        enterDateLabel2: "Enter date",
        paymentModeLabel2: "Payment mode",
        noteOptionalLabel2: "Note (optional)",
        shortNotePlaceholder2: "Short note",
        savePaymentBtn2: "Save Payment",
        ownerPhoneLabel2: "Owner phone number",
        sendRequestBtn2: "Send request",
        noTubewellLinkedYetMsg2: "No tubewell linked yet. Enter owner phone below.",
        waitingForApprovalMsg2: "Waiting for owner approval",
        newLinkRequestMsg2: "New link request",
        wantsToConnectMsg2: " wants to connect",
        linkToWhichTubewellMsg2: "Link to which tubewell?",
        confirmLinkBtn2: "Confirm link",
        tubewellLabel2: "Tubewell",
        ownerLabel2: "Owner",
        unknownOwnerMsg2: "Unknown owner",
        unknownLabel2: "Unknown",
        softDeleteFailedMsg2: "Soft delete failed:",
        removeAnnouncementMsg2: "Remove announcement",
        announceRemoveConfirmMsg2: "This will remove the announcement for all linked customers.",
        paymentLabel2: "Payment",
        waterBillLabel2: "Water Bill",
        fromLabel2: "From",
        toLabel2: "To",
        periodLabel2: "Period",
        customLabel2: "Custom",
        todayLabel2: "Today",
        thisMonthLabel2: "This Month",
        thisYearLabel2: "This Year",
        selectLabel2: "Select",
        allRecordsKeptMsg2: "All records are saved on the server — log in again on a new phone to get your data back.",
        forOwnersLabel2: "For tubewell owners",
        forCustomersLabel2: "For customers",
        step1OwnerTitle2: "Add customers",
        step1OwnerDesc2: "Name + phone, or accept a link request from a customer.",
        step2OwnerTitle2: "Start / Stop water",
        step2OwnerDesc2: "On Home, Start water → pick customer → set rate. On Stop, hours × rate = bill and it goes to Pending payments. The customer sees the same record live.",
        step3OwnerTitle2: "Paani Ka Hisab (manual)",
        step3OwnerDesc2: "If water already ran, enter start/end time and save a record without using the live timer.",
        step4OwnerTitle2: "+ Payment",
        step4OwnerDesc2: "On a customer's detail page, record cash/UPI received. This updates Bahi-khata for both of you.",
        step5OwnerTitle2: "Queue",
        step5OwnerDesc2: "Add customers to the queue. \"Next in queue\" and queue count show on Home.",
        step6OwnerTitle2: "Bahi-khata",
        step6OwnerDesc2: "Full ledger per customer (water + payments) stays here even if they unlink later.",
        step1CustomerTitle2: "Link",
        step1CustomerDesc2: "Enter the owner's 10-digit mobile and send a request. When they accept, the tubewell is linked.",
        step2CustomerTitle2: "Queue",
        step2CustomerDesc2: "Owner can put you in the queue. Check \"My queue position\" on My Usage.",
        step3CustomerTitle2: "Water usage",
        step3CustomerDesc2: "When the owner starts/stops water in your name, hours and amount appear automatically under My Usage.",
        step4CustomerTitle2: "Payments",
        step4CustomerDesc2: "When the owner records a payment, it shows under the Payments tab. Due amount is on your dashboard.",
        step5CustomerTitle2: "Multiple owners",
        step5CustomerDesc2: "You can link to more than one tubewell owner.",
        searchCustomerPlaceholder2: "Search customer...",
        selectTubewellOptionLabel2: "Select tubewell",
        primaryTubewellLabel2: "Primary Tubewell",
        googleMapsLinkLabel2: "Google Maps link (optional)",
        villageAddressLabel2: "Village / address",
        removeTubewellLabel2: "Remove tubewell",
        saveLabel2: "Save"
    },
    hi: {
        appTitle: "अपना ट्यूबवेल",
        appSubtitle: "खेत के पानी का पूरा हिसाब, अब मोबाइल पर।",
        mobileNumber: "मोबाइल नंबर", login: "OTP भेजें", enterOtp: "OTP दर्ज करें", verifyLogin: "वेरिफाई और लॉगिन करें",
        ownerAccount: "मालिक खाता", greeting: "नमस्ते, राम भाई",
        todaySummary: "सारांश", waterUsed: "पानी लगा", revenue: "कुल कमाई", received: "प्राप्त हुआ", pending: "बाकी",
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
        statusRunning: "व्यस्त",
        statusStopped: "उपलब्ध",
        statusWorkInProgress: "मरम्मत",
        statusPowerIssue: "बिजली समस्या",
        powerIssue: "बिजली समस्या",
        exitPowerIssue: "बिजली ठीक",
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
        notesReminder: "घोषणा",
        saveNote: "नोट सेव करें",
        noNotes: "आज कोई नोट नहीं",
        announcement: "घोषणा",
        sendAnnouncement: "भेजें",
        removeAnnouncement: "हटाएं",
        editTubewell: "ट्यूबवेल एडिट करें",
        linkedTubewell: "जुड़ा हुआ ट्यूबवेल",
        myQueuePosition: "मेरी कतार में स्थिति",
        becomeOwner: "मालिक बनें",
        saving: "सेव हो रहा है...",
        errorSavingData: "डेटा सेव करने में त्रुटि।",
        map: "Map",
        primary: "PRIMARY",
        active: "ACTIVE",
        cash: "नकद",
        paid: "चुकाया",
        pending: "बाकी",
        partial: "आंशिक",
        water: "पानी",
        waterUsage: "पानी का उपयोग",
        paymentCash: "भुगतान · नकद",
        to: "को:",
        noUsageYet: "अभी कोई उपयोग नहीं",
        noPaymentsYet: "अभी कोई भुगतान नहीं",
        pleaseLoginFirst: "कृपया पहले लॉगिन करें।",
        noTubewellLinked: "अभी तक कोई ट्यूबवेल लिंक नहीं।",
        openInGoogleMaps: "Google Maps में खोलें",
        powerRestored: "बिजली ठीक — उपलब्ध",
        powerIssueMarked: "बिजली समस्या चिह्नित",
        maintenanceModeOn: "मरम्मत मोड चालू",
        maintenanceModeOff: "मरम्मत मोड बंद",
        stoppedDuration: "बंद. समय: ",
        hours: " घंटे · ₹",
        addedToQueue: "कतार में जोड़ दिया गया",
        removedFromQueue: "कतार से हटा दिया गया",
        alreadyInQueue: "पहले से कतार में है",
        selectCustomer: "ग्राहक चुनें",
        customerAccountDeleted: "ग्राहक खाता हटाया गया",
        enterValidRate: "सही रेट दर्ज करें",
        tubewellUnderMaintenance: "ट्यूबवेल मरम्मत में है",
        powerIssueCannotStart: "बिजली समस्या — शुरू नहीं कर सकते",
        alreadyOccupied: "पहले से व्यस्त",
        waterStarted: "पानी शुरू @ ₹",
        perHour: "/घंटा",
        enterValidPhone: "सही 10 अंकों का फोन दर्ज करें",
        enterDOB: "कृपया जन्म तिथि दर्ज करें",
        enterAllFields: "सभी फील्ड भरें",
        enterTubewellName: "प्राथमिक ट्यूबवेल का नाम दर्ज करें",
        welcomeBack: "वापसी का स्वागत है!",
        wrongDOB: "गलत जन्म तिथि। कृपया विवरण जांचें।",
        accountDeleted: "खाता हटाया गया",
        accountDeletedMsg: "यह खाता हटा दिया गया था। क्या आप इसी नंबर से फिर पंजीकरण करना चाहते हैं?",
        registerAgain: "फिर पंजीकरण",
        accountExists: "खाता पहले से मौजूद है",
        accountExistsMsg: "आपके पास पहले से {0} खाता है। क्या आप उन्हीं विवरणों से {1} प्रोफ़ाइल भी बनाना चाहते हैं?",
        yesCreate: "हाँ, बनाएं",
        accountNotFound: "खाता नहीं मिला",
        accountNotFoundMsg: "यह खाता मौजूद नहीं है। क्या आप पंजीकरण करना चाहते हैं?",
        createNew: "नया बनाएं",
        correctDetails: "विवरण सही करें",
        confirmDetails: "विवरण की पुष्टि करें और पंजीकरण पर टैप करें",
        loginCancelled: "लॉगिन रद्द",
        pleaseCorrectDetails: "कृपया अपना विवरण सही करें",
        nameVillageFilled: "नाम और गाँव भर दिए गए। पुष्टि करके सेव करें।",
        welcome: "स्वागत है!",
        profileUpdated: "प्रोफाइल अपडेट हो गई!",
        enterName: "नाम दर्ज करें",
        enterValidRate: "सही रेट दर्ज करें",
        tubewellUpdated: "ट्यूबवेल अपडेट हो गया",
        tubewellAdded: "ट्यूबवेल जोड़ दिया गया!",
        recordSaved: "हिसाब सेव हो गया!",
        paymentSaved: "भुगतान सेव हो गया!",
        enterAmountDate: "राशि और तारीख दर्ज करें",
        validAmount: "सही राशि दर्ज करें",
        noCustomerSelected: "कोई ग्राहक नहीं चुना",
        customerNotFound: "ग्राहक नहीं मिला",
        ownerNotFound: "मालिक नहीं मिला",
        notRegisteredAsOwner: "यह नंबर मालिक के रूप में पंजीकृत नहीं है",
        cannotLinkOwnNumber: "आप अपने नंबर से लिंक नहीं कर सकते",
        alreadyLinked: "पहले से जुड़ा हुआ है",
        alreadyRequested: "अनुरोध पहले से भेजा गया है",
        requestSent: "अनुरोध भेज दिया गया! मेरा ट्यूबवेल सेक्शन देखें।",
        unlinkConfirm: "यह लिंक हटाएं? पुराना पानी इतिहास मालिक के पास रहेगा।",
        unlinked: "हटा दिया गया",
        requestAccepted: "अनुरोध स्वीकार!",
        requestRejected: "अनुरोध अस्वीकार",
        onlyOwnersAnnounce: "केवल मालिक घोषणा भेज सकते हैं",
        onlyOwnersRemoveAnnounce: "केवल मालिक घोषणा हटा सकते हैं",
        announceRemoved: "घोषणा हटा दी गई",
        announceSent: "ग्राहकों को घोषणा भेज दी गई",
        writeSomething: "पहले कुछ लिखें",
        failedToSend: "भेजने में विफल",
        updatingAccount: "खाता अपडेट हो रहा है...",
        accessRemoved: "एक्सेस हटा दिया गया। रिकॉर्ड सुरक्षित हैं।",
        couldNotUpdateAccount: "खाता अपडेट नहीं हो सका",
        completeOwnerProfile: "अपना मालिक प्रोफाइल पूरा करें",
        switchToOwner: "मालिक मोड में स्विच करें? आपका ग्राहक डेटा सुरक्षित रहेगा।",
        continue: "जारी रखें",
        customerOnly: "केवल ग्राहक",
        ownerOnly: "केवल मालिक",
        both: "दोनों",
        removeAccess: "एक्सेस हटाएं",
        historyKept: "इतिहास (बही / पानी) सुरक्षित रहेगा।",
        whatToRemove: "क्या हटाना है?",
        deleteRoleTitle: "खाता एक्सेस हटाएं",
        tubewellNotFound: "ट्यूबवेल नहीं मिला",
        removeTubewellConfirm: "यह ट्यूबवेल हटाएं? ग्राहक अनलिंक होंगे। पानी का इतिहास रहेगा।",
        tubewellRemoved: "ट्यूबवेल हटाया। ग्राहक अनलिंक। इतिहास सुरक्षित।",
        noEntriesYet: "अभी तक कोई एंट्री नहीं।",
        totalHours: "कुल घंटे",
        lastEntry: "आखिरी एंट्री",
        addPayment: "+ भुगतान जोड़ें",
        addWater: "+ पानी",
        addQueue: "+ कतार",
        history: "इतिहास",
        myUsage: "मेरा पानी उपयोग",
        usageHistory: "उपयोग इतिहास",
        myPayments: "मेरे भुगतान",
        quickTips: "त्वरित सुझाव",
        linkTubewellTip: "ट्यूबवेल लिंक करें",
        linkTubewellDesc: "मेरा उपयोग → मालिक का नंबर डालकर अनुरोध भेजें।",
        checkQueueTip: "अपनी कतार देखें",
        checkQueueDesc: "जब आप कतार में हों तो मेरा उपयोग पर आपकी स्थिति दिखती है।",
        paymentsTip: "भुगतान",
        paymentsDesc: "भुगतान टैब के तहत बाकी और चुकाई गई राशि देखें।",
        phone: "फोन",
        email: "ईमेल",
        linked: "जुड़ा हुआ",
        unlinkThisTubewell: "इस ट्यूबवेल को हटाएं",
        currentStatus: "वर्तमान स्थिति",
        availableForUse: "उपयोग के लिए उपलब्ध",
        underMaintenance: "मरम्मत में है",
        powerIssueNotAvailable: "बिजली समस्या — उपलब्ध नहीं",
        runningForYou: "आपके लिए चालू है",
        inUseByOther: "वर्तमान में दूसरे ग्राहक द्वारा उपयोग में है",
        due: "बाकी",
        paid: "चुकाया",
        hoursSmall: "घंटे",
        next: "अगला",
        nextInQueueLabel: "कतार में अगला",
        noOneWaiting: "कतार में कोई नहीं",
        selectCustomerFirst: "पहले ग्राहक चुनें",
        enterAmount: "राशि दर्ज करें",
        enterDate: "तारीख दर्ज करें",
        paymentMode: "भुगतान का तरीका",
        noteOptional: "नोट (वैकल्पिक)",
        shortNote: "छोटा नोट",
        savePayment: "भुगतान सेव करें",
        ownerPhone: "मालिक का फोन नंबर",
        sendRequest: "अनुरोध भेजें",
        noTubewellLinkedYet: "अभी तक कोई ट्यूबवेल लिंक नहीं। नीचे मालिक का नंबर डालें।",
        waitingForApproval: "मालिक की स्वीकृति का इंतजार",
        newLinkRequest: "नया लिंक अनुरोध",
        wantsToConnect: " जुड़ना चाहता है",
        linkToWhichTubewell: "किस ट्यूबवेल से लिंक करें?",
        confirmLink: "लिंक की पुष्टि करें",
        tubewell: "ट्यूबवेल",
        owner: "मालिक",
        unknownOwner: "अज्ञात मालिक",
        unknown: "अज्ञात",
        softDeleteFailed: "सॉफ्ट डिलीट विफल:",
        removeAnnouncement: "घोषणा हटाएं",
        announceRemoveConfirm: "यह सभी लिंक किए ग्राहकों से घोषणा हटा देगा।",
        payment: "भुगतान",
        waterBill: "पानी का बिल",
        from: "से",
        to: "तक",
        period: "अवधि",
        custom: "कस्टम",
        today: "आज",
        thisMonth: "इस महीने",
        thisYear: "इस साल",
        select: "चुनें",
        allRecordsKept: "सभी रिकॉर्ड सर्वर पर सुरक्षित रहते हैं — नए फोन पर फिर से लॉगिन करने से डेटा वापस मिल जाता है।",
        forOwners: "ट्यूबवेल मालिकों के लिए",
        forCustomers: "ग्राहकों के लिए",
        step1Owner: "ग्राहक जोड़ें",
        step1OwnerDesc: "नाम + फोन डालें, या ग्राहक के लिंक अनुरोध को स्वीकार करें।",
        step2Owner: "पानी शुरू/बंद",
        step2OwnerDesc: "होम पर, पानी शुरू → ग्राहक चुनें → रेट सेट करें। बंद करने पर घंटे × रेट = बिल, बाकी भुगतान में दिखता है। ग्राहक लाइव वही रिकॉर्ड देखता है।",
        step3Owner: "पानी का हिसाब (मैनुअल)",
        step3OwnerDesc: "अगर पहले से पानी चल चुका हो तो समय डालकर रिकॉर्ड सेव करें।",
        step4Owner: "+ भुगतान",
        step4OwnerDesc: "ग्राहक विवरण में नकद/यूपीआई भुगतान दर्ज करें। इससे बही-खाता अपडेट होता है।",
        step5Owner: "कतार",
        step5OwnerDesc: "ग्राहक को कतार में डालें। \"अगला\" और कतार संख्या होम पर दिखती है।",
        step6Owner: "बही-खाता",
        step6OwnerDesc: "हर ग्राहक का पूरा लेजर (पानी + भुगतान) यहाँ सुरक्षित रहता है।",
        step1Customer: "लिंक करें",
        step1CustomerDesc: "मालिक का 10 अंकों का मोबाइल डालकर अनुरोध भेजें। मालिक स्वीकार करे तो ट्यूबवेल जुड़ जाएगा।",
        step2Customer: "कतार",
        step2CustomerDesc: "मालिक आपको कतार में डाल सकता है। \"मेरी कतार स्थिति\" पर अपनी बारी देखें।",
        step3Customer: "पानी का उपयोग",
        step3CustomerDesc: "जब मालिक आपके नाम पर पानी शुरू/बंद करता है, घंटे और राशि अपने-आप \"मेरा उपयोग\" में दिखती है।",
        step4Customer: "भुगतान",
        step4CustomerDesc: "मालिक जब भुगतान दर्ज करता है, वह \"भुगतान\" टैब में दिखता है। बाकी रकम डैशबोर्ड पर दिखती है।",
        step5Customer: "कई मालिक",
        step5CustomerDesc: "आप एक से अधिक ट्यूबवेल मालिक से जुड़ सकते हैं।",
        searchCustomer: "ग्राहक खोजें...",
        selectTubewellOption: "ट्यूबवेल चुनें",
        primaryTubewell: "प्राथमिक ट्यूबवेल",
        googleMapsLink: "Google Maps लिंक (वैकल्पिक)",
        villageAddress: "गांव / पता",
        removeTubewell: "ट्यूबवेल हटाएं",
        save: "सेव करें",
        enterValid10Digit: "सही 10 अंकों का फोन दर्ज करें",
        userNotRegistered: "यह नंबर ऐप में पंजीकृत नहीं है",
        accountDeletedCannotAdd: "यह खाता हटा दिया गया है। संपर्क में नहीं जोड़ सकते।",
        userNotCustomer: "यह उपयोगकर्ता ग्राहक के रूप में पंजीकृत नहीं है",
        userHasNoName: "प्रोफ़ाइल पर नाम नहीं है",
        couldNotVerify: "नंबर जाँच नहीं हो सका",
        customerAdded: "ग्राहक जोड़ा: ",
        removedFromList: "सूची से हटाया। बही सुरक्षित।",
        enterValid10DigitOwner: "सही 10 अंकों का फोन दर्ज करें",
        enterDOBError: "कृपया जन्म तिथि दर्ज करें",
        enterValid10DigitLogin: "सही 10 अंकों का नंबर दर्ज करें",
        enterAllFieldsError: "सभी फील्ड भरें",
        enterTubewellNameError: "प्राथमिक ट्यूबवेल का नाम दर्ज करें",
        welcomeBackMsg: "वापसी का स्वागत है!",
        wrongDOBError: "गलत जन्म तिथि। कृपया विवरण जांचें।",
        accountDeletedOffer: "यह खाता हटा दिया गया था। क्या आप इसी नंबर से फिर पंजीकरण करना चाहते हैं?",
        registerAgainBtn: "फिर पंजीकरण",
        accountExistsMsg: "आपके पास पहले से {0} खाता है। क्या आप उन्हीं विवरणों से {1} प्रोफ़ाइल भी बनाना चाहते हैं?",
        yesCreateBtn: "हाँ, बनाएं",
        accountNotFoundMsg: "यह खाता मौजूद नहीं है। क्या आप पंजीकरण करना चाहते हैं?",
        createNewBtn: "नया बनाएं",
        correctDetailsBtn: "विवरण सही करें",
        confirmDetailsMsg: "विवरण की पुष्टि करें और पंजीकरण पर टैप करें",
        loginCancelledMsg: "लॉगिन रद्द",
        correctDetailsMsg: "कृपया अपना विवरण सही करें",
        nameVillageFilledMsg: "नाम और गाँव भर दिए गए। पुष्टि करके सेव करें।",
        welcomeMsg: "स्वागत है!",
        profileUpdatedMsg: "प्रोफाइल अपडेट हो गई!",
        enterNameError: "नाम दर्ज करें",
        enterValidRateError: "सही रेट दर्ज करें",
        tubewellUpdatedMsg: "ट्यूबवेल अपडेट हो गया",
        tubewellAddedMsg: "ट्यूबवेल जोड़ दिया गया!",
        recordSavedMsg: "हिसाब सेव हो गया!",
        paymentSavedMsg: "भुगतान सेव हो गया!",
        enterAmountDateError: "राशि और तारीख दर्ज करें",
        validAmountError: "सही राशि दर्ज करें",
        noCustomerSelectedError: "कोई ग्राहक नहीं चुना",
        ownerNotFoundError: "मालिक नहीं मिला",
        notRegisteredOwnerError: "यह नंबर मालिक के रूप में पंजीकृत नहीं है",
        cannotLinkOwnError: "आप अपने नंबर से लिंक नहीं कर सकते",
        alreadyLinkedError: "पहले से जुड़ा हुआ है",
        alreadyRequestedError: "अनुरोध पहले से भेजा गया है",
        requestSentMsg: "अनुरोध भेज दिया गया! मेरा ट्यूबवेल सेक्शन देखें।",
        unlinkConfirmMsg: "यह लिंक हटाएं? पुराना पानी इतिहास मालिक के पास रहेगा।",
        unlinkedMsg: "हटा दिया गया",
        requestAcceptedMsg: "अनुरोध स्वीकार!",
        requestRejectedMsg: "अनुरोध अस्वीकार",
        onlyOwnersSendError: "केवल मालिक घोषणा भेज सकते हैं",
        onlyOwnersRemoveError: "केवल मालिक घोषणा हटा सकते हैं",
        announceRemovedMsg: "घोषणा हटा दी गई",
        announceSentMsg: "ग्राहकों को घोषणा भेज दी गई",
        writeSomethingError: "पहले कुछ लिखें",
        failedToSendError: "भेजने में विफल",
        updatingAccountMsg: "खाता अपडेट हो रहा है...",
        accessRemovedMsg: "एक्सेस हटा दिया गया। रिकॉर्ड सुरक्षित हैं।",
        couldNotUpdateError: "खाता अपडेट नहीं हो सका",
        completeOwnerProfileMsg: "अपना मालिक प्रोफाइल पूरा करें",
        switchToOwnerMsg: "मालिक मोड में स्विच करें? आपका ग्राहक डेटा सुरक्षित रहेगा।",
        continueBtn: "जारी रखें",
        customerOnlyBtn: "केवल ग्राहक",
        ownerOnlyBtn: "केवल मालिक",
        bothBtn: "दोनों",
        removeAccessBtn: "एक्सेस हटाएं",
        historyKeptMsg: "इतिहास (बही / पानी) सुरक्षित रहेगा।",
        whatToRemoveMsg: "क्या हटाना है?",
        deleteRoleTitleMsg: "खाता एक्सेस हटाएं",
        tubewellNotFoundError: "ट्यूबवेल नहीं मिला",
        removeTubewellConfirmMsg: "यह ट्यूबवेल हटाएं? ग्राहक अनलिंक होंगे। पानी का इतिहास रहेगा।",
        tubewellRemovedMsg: "ट्यूबवेल हटाया। ग्राहक अनलिंक। इतिहास सुरक्षित।",
        noEntriesYetMsg: "अभी तक कोई एंट्री नहीं।",
        totalHoursLabel: "कुल घंटे",
        lastEntryLabel: "आखिरी एंट्री",
        addPaymentBtn: "+ भुगतान जोड़ें",
        addWaterBtn: "+ पानी",
        addQueueBtn: "+ कतार",
        historyLabel: "इतिहास",
        myUsageLabel: "मेरा पानी उपयोग",
        usageHistoryLabel: "उपयोग इतिहास",
        myPaymentsLabel: "मेरे भुगतान",
        quickTipsLabel: "त्वरित सुझाव",
        linkTubewellTipTitle: "ट्यूबवेल लिंक करें",
        linkTubewellDesc: "मेरा उपयोग → मालिक का नंबर डालकर अनुरोध भेजें।",
        checkQueueTipTitle: "अपनी कतार देखें",
        checkQueueDesc: "जब आप कतार में हों तो मेरा उपयोग पर आपकी स्थिति दिखती है।",
        paymentsTipTitle: "भुगतान",
        paymentsTipDesc: "भुगतान टैब के तहत बाकी और चुकाई गई राशि देखें।",
        phoneLabel: "फोन",
        emailLabel: "ईमेल",
        linkedLabel: "जुड़ा हुआ",
        unlinkThisTubewellBtn: "इस ट्यूबवेल को हटाएं",
        currentStatusLabel: "वर्तमान स्थिति",
        availableForUseMsg: "उपयोग के लिए उपलब्ध",
        underMaintenanceMsg: "मरम्मत में है",
        powerIssueNotAvailableMsg: "बिजली समस्या — उपलब्ध नहीं",
        runningForYouMsg: "आपके लिए चालू है",
        inUseByOtherMsg: "वर्तमान में दूसरे ग्राहक द्वारा उपयोग में है",
        dueLabel: "बाकी",
        paidLabel: "चुकाया",
        hoursSmallLabel: "घंटे",
        nextLabel: "अगला",
        nextInQueueLabelMsg: "कतार में अगला",
        noOneWaitingMsg: "कतार में कोई नहीं",
        selectCustomerFirstError: "पहले ग्राहक चुनें",
        enterAmountPlaceholder: "राशि दर्ज करें",
        enterDateLabel: "तारीख दर्ज करें",
        paymentModeLabel: "भुगतान का तरीका",
        noteOptionalLabel: "नोट (वैकल्पिक)",
        shortNotePlaceholder: "छोटा नोट",
        savePaymentBtn: "भुगतान सेव करें",
        ownerPhoneLabel: "मालिक का फोन नंबर",
        sendRequestBtn: "अनुरोध भेजें",
        noTubewellLinkedYetMsg: "अभी तक कोई ट्यूबवेल लिंक नहीं। नीचे मालिक का नंबर डालें।",
        waitingForApprovalMsg: "मालिक की स्वीकृति का इंतजार",
        newLinkRequestMsg: "नया लिंक अनुरोध",
        wantsToConnectMsg: " जुड़ना चाहता है",
        linkToWhichTubewellMsg: "किस ट्यूबवेल से लिंक करें?",
        confirmLinkBtn: "लिंक की पुष्टि करें",
        tubewellLabel: "ट्यूबवेल",
        ownerLabel: "मालिक",
        unknownOwnerMsg: "अज्ञात मालिक",
        unknownLabel: "अज्ञात",
        softDeleteFailedMsg: "सॉफ्ट डिलीट विफल:",
        removeAnnouncementMsg: "घोषणा हटाएं",
        announceRemoveConfirmMsg: "यह सभी लिंक किए ग्राहकों से घोषणा हटा देगा।",
        paymentLabel: "भुगतान",
        waterBillLabel: "पानी का बिल",
        fromLabel: "से",
        toLabel: "तक",
        periodLabel: "अवधि",
        customLabel: "कस्टम",
        todayLabel: "आज",
        thisMonthLabel: "इस महीने",
        thisYearLabel: "इस साल",
        selectLabel: "चुनें",
        accountDeletedCannotAddMsg: "यह खाता हटा दिया गया है। संपर्क में नहीं जोड़ सकते।",
        accountDeletedOfferMsg: "यह खाता हटा दिया गया था। क्या आप इसी नंबर से फिर पंजीकरण करना चाहते हैं?",
        checkQueueTipDesc: "जब आप कतार में हों तो मेरा उपयोग पर आपकी स्थिति दिखती है।",
        couldNotVerifyMsg: "नंबर की जाँच नहीं हो सकी",
        customerAddedMsg: "ग्राहक जोड़ा: ",
        enterAllFieldsErrorMsg: "सभी फील्ड भरें",
        enterDOBErrorMsg: "कृपया जन्म तिथि दर्ज करें",
        enterTubewellNameErrorMsg: "प्राथमिक ट्यूबवेल का नाम दर्ज करें",
        enterValid10DigitLoginMsg: "सही 10 अंकों का नंबर दर्ज करें",
        enterValid10DigitMsg: "सही 10 अंकों का फोन दर्ज करें",
        enterValid10DigitOwnerMsg: "सही 10 अंकों का फोन दर्ज करें",

        forCustomersLabel: "ग्राहकों के लिए",
        forOwnersLabel: "ट्यूबवेल मालिकों के लिए",

        googleMapsLinkLabel: "Google Maps लिंक (वैकल्पिक)",
        linkTubewellTipDesc: "मेरा उपयोग → मालिक का नंबर डालकर अनुरोध भेजें।",

        primaryTubewellLabel: "प्राथमिक ट्यूबवेल",
        removeTubewellLabel: "ट्यूबवेल हटाएं",
        removedFromListMsg: "सूची से हटा दिया गया। बही सुरक्षित है।",
        saveLabel: "सेव करें",

        searchCustomerPlaceholder: "ग्राहक खोजें...",
        selectTubewellOptionLabel: "ट्यूबवेल चुनें",

        step1CustomerTitle: "लिंक करें",
        step1OwnerTitle: "ग्राहक जोड़ें",

        step2CustomerTitle: "कतार",
        step2OwnerTitle: "पानी शुरू / बंद",

        step3CustomerTitle: "पानी का उपयोग",
        step3OwnerTitle: "पानी का हिसाब (मैनुअल)",

        step4CustomerTitle: "भुगतान",
        step4OwnerTitle: "+ भुगतान",

        step5CustomerTitle: "कई मालिक",
        step5OwnerTitle: "कतार",

        step6OwnerTitle: "बही-खाता",

        userHasNoNameMsg: "प्रोफ़ाइल पर उपयोगकर्ता का नाम नहीं है",
        userNotCustomerMsg: "यह उपयोगकर्ता ग्राहक के रूप में पंजीकृत नहीं है",
        userNotRegisteredMsg: "यह नंबर ऐप में पंजीकृत नहीं है",

        villageAddressLabel: "गांव / पता",
        wrongDOBErrorMsg: "गलत जन्म तिथि। कृपया विवरण जांचें।",
        allRecordsKeptMsg: "सभी रिकॉर्ड सर्वर पर सुरक्षित रहते हैं — नए फोन पर फिर से लॉगिन करने से आपका डेटा वापस मिल जाएगा।",

        welcomeBackMsg2: "वापसी का स्वागत है!",
        registerAgainBtn2: "फिर से पंजीकरण करें",
        accountExistsMsg2: "आपके पास पहले से {0} खाता है। क्या आप उन्हीं विवरणों से {1} प्रोफ़ाइल भी बनाना चाहते हैं?",
        yesCreateBtn2: "हाँ, बनाएं",
        accountNotFoundMsg2: "यह खाता मौजूद नहीं है। क्या आप अपना पंजीकरण करना चाहते हैं?",
        createNewBtn2: "नया बनाएं",
        correctDetailsBtn2: "विवरण सही करें",
        confirmDetailsMsg2: "विवरण की पुष्टि करें और पंजीकरण पर टैप करें",
        loginCancelledMsg2: "लॉगिन रद्द किया गया",
        correctDetailsMsg2: "कृपया अपना विवरण सही करें",
        nameVillageFilledMsg2: "नाम और गाँव भर दिए गए हैं। पुष्टि करके सेव करें।",
        welcomeMsg2: "स्वागत है!",
        profileUpdatedMsg2: "प्रोफाइल अपडेट हो गई!",
        enterNameError2: "नाम दर्ज करें",
        enterValidRateError2: "सही रेट दर्ज करें",
        tubewellUpdatedMsg2: "ट्यूबवेल अपडेट हो गया",
        tubewellAddedMsg2: "ट्यूबवेल जोड़ दिया गया!",
        recordSavedMsg2: "हिसाब सेव हो गया!",
        paymentSavedMsg2: "भुगतान सेव हो गया!",
        enterAmountDateError2: "राशि और तारीख दर्ज करें",
        validAmountError2: "सही राशि दर्ज करें",
        noCustomerSelectedError2: "कोई ग्राहक नहीं चुना गया",
        ownerNotFoundError2: "मालिक नहीं मिला",
        notRegisteredOwnerError2: "यह नंबर मालिक के रूप में पंजीकृत नहीं है",
        cannotLinkOwnError2: "आप अपने नंबर से लिंक नहीं कर सकते",
        alreadyLinkedError2: "पहले से जुड़ा हुआ है",
        alreadyRequestedError2: "अनुरोध पहले से भेजा जा चुका है",
        requestSentMsg2: "अनुरोध भेज दिया गया! मेरा ट्यूबवेल सेक्शन देखें।",
        unlinkConfirmMsg2: "यह लिंक हटाएं? आपका पुराना पानी का इतिहास मालिक के पास सुरक्षित रहेगा।",
        unlinkedMsg2: "लिंक हटा दिया गया",
        requestAcceptedMsg2: "अनुरोध स्वीकार किया गया!",
        requestRejectedMsg2: "अनुरोध अस्वीकार किया गया",
        onlyOwnersSendError2: "केवल मालिक ही घोषणा भेज सकते हैं",
        onlyOwnersRemoveError2: "केवल मालिक ही घोषणा हटा सकते हैं",
        announceRemovedMsg2: "घोषणा हटा दी गई",
        announceSentMsg2: "ग्राहकों को घोषणा भेज दी गई",
        writeSomethingError2: "पहले कुछ लिखें",
        failedToSendError2: "भेजने में विफल",
        updatingAccountMsg2: "खाता अपडेट हो रहा है...",
        accessRemovedMsg2: "एक्सेस हटा दिया गया। रिकॉर्ड सुरक्षित हैं।",
        couldNotUpdateError2: "खाता अपडेट नहीं हो सका",
        completeOwnerProfileMsg2: "अपना मालिक प्रोफाइल पूरा करें",
        switchToOwnerMsg2: "मालिक मोड में स्विच करें? आपका ग्राहक डेटा सुरक्षित रहेगा।",
        continueBtn2: "जारी रखें",
        customerOnlyBtn2: "केवल ग्राहक",
        ownerOnlyBtn2: "केवल मालिक",
        bothBtn2: "दोनों",
        removeAccessBtn2: "एक्सेस हटाएं",
        historyKeptMsg2: "इतिहास (बही / पानी) सुरक्षित रहेगा।",
        whatToRemoveMsg2: "क्या हटाना है?",
        deleteRoleTitleMsg2: "खाता एक्सेस हटाएं",
        tubewellNotFoundError2: "ट्यूबवेल नहीं मिला",
        removeTubewellConfirmMsg2: "यह ट्यूबवेल हटाएं? ग्राहक अनलिंक हो जाएंगे। पानी का इतिहास सुरक्षित रहेगा।",
        tubewellRemovedMsg2: "ट्यूबवेल हटा दिया गया। ग्राहक अनलिंक हो गए। इतिहास सुरक्षित है।",
        noEntriesYetMsg2: "अभी तक कोई एंट्री नहीं।",
        totalHoursLabel2: "कुल घंटे",
        lastEntryLabel2: "आखिरी एंट्री",
        addPaymentBtn2: "+ भुगतान जोड़ें",
        addWaterBtn2: "+ पानी",
        addQueueBtn2: "+ कतार",
        historyLabel2: "इतिहास",
        myUsageLabel2: "मेरा पानी उपयोग",
        usageHistoryLabel2: "उपयोग इतिहास",
        myPaymentsLabel2: "मेरे भुगतान",
        quickTipsLabel2: "त्वरित सुझाव",
        linkTubewellTipTitle2: "ट्यूबवेल लिंक करें",
        linkTubewellTipDesc2: "मेरा उपयोग → मालिक का नंबर डालकर लिंक अनुरोध भेजें।",
        checkQueueTipTitle2: "अपनी कतार देखें",
        checkQueueTipDesc2: "जब आप कतार में हों तो मेरा उपयोग में आपकी स्थिति दिखाई देती है।",
        paymentsTipTitle2: "भुगतान",
        paymentsTipDesc2: "भुगतान टैब के तहत बाकी और चुकाई गई राशि देखें।",
        phoneLabel2: "फोन",
        emailLabel2: "ईमेल",
        linkedLabel2: "जुड़ा हुआ",
        unlinkThisTubewellBtn2: "इस ट्यूबवेल को अनलिंक करें",
        currentStatusLabel2: "वर्तमान स्थिति",
        availableForUseMsg2: "उपयोग के लिए उपलब्ध",
        underMaintenanceMsg2: "मरम्मत में है",
        powerIssueNotAvailableMsg2: "बिजली समस्या — उपलब्ध नहीं",
        runningForYouMsg2: "आपके लिए चालू है",
        inUseByOtherMsg2: "वर्तमान में दूसरे ग्राहक द्वारा उपयोग में है",
        dueLabel2: "बाकी",
        paidLabel2: "चुकाया गया",
        hoursSmallLabel2: "घंटे",
        nextLabel2: "अगला",
        nextInQueueLabelMsg2: "कतार में अगला",
        noOneWaitingMsg2: "कतार में कोई इंतजार नहीं कर रहा",
        selectCustomerFirstError2: "पहले ग्राहक चुनें",
        enterAmountPlaceholder2: "राशि दर्ज करें",
        enterDateLabel2: "तारीख दर्ज करें",
        paymentModeLabel2: "भुगतान का तरीका",
        noteOptionalLabel2: "नोट (वैकल्पिक)",
        shortNotePlaceholder2: "छोटा नोट",
        savePaymentBtn2: "भुगतान सेव करें",
        ownerPhoneLabel2: "मालिक का फोन नंबर",
        sendRequestBtn2: "अनुरोध भेजें",
        noTubewellLinkedYetMsg2: "अभी तक कोई ट्यूबवेल लिंक नहीं है। नीचे मालिक का नंबर डालें।",
        waitingForApprovalMsg2: "मालिक की स्वीकृति का इंतजार",
        newLinkRequestMsg2: "नया लिंक अनुरोध",
        wantsToConnectMsg2: " जुड़ना चाहता है",
        linkToWhichTubewellMsg2: "किस ट्यूबवेल से लिंक करें?",
        confirmLinkBtn2: "लिंक की पुष्टि करें",
        tubewellLabel2: "ट्यूबवेल",
        ownerLabel2: "मालिक",
        unknownOwnerMsg2: "अज्ञात मालिक",
        unknownLabel2: "अज्ञात",
        softDeleteFailedMsg2: "सॉफ्ट डिलीट विफल:",
        removeAnnouncementMsg2: "घोषणा हटाएं",
        announceRemoveConfirmMsg2: "यह सभी लिंक किए गए ग्राहकों के लिए घोषणा हटा देगा।",
        paymentLabel2: "भुगतान",
        waterBillLabel2: "पानी का बिल",
        fromLabel2: "से",
        toLabel2: "तक",
        periodLabel2: "अवधि",
        customLabel2: "कस्टम",
        todayLabel2: "आज",
        thisMonthLabel2: "इस महीने",
        thisYearLabel2: "इस साल",
        selectLabel2: "चुनें",
        allRecordsKeptMsg2: "सभी रिकॉर्ड सर्वर पर सुरक्षित रहते हैं — नए फोन पर फिर से लॉगिन करने से आपका डेटा वापस मिल जाएगा।",
        forOwnersLabel2: "ट्यूबवेल मालिकों के लिए",
        forCustomersLabel2: "ग्राहकों के लिए",
        step1OwnerTitle2: "ग्राहक जोड़ें",
        step1OwnerDesc2: "नाम + फोन डालें, या ग्राहक के लिंक अनुरोध को स्वीकार करें।",
        step2OwnerTitle2: "पानी शुरू / बंद करें",
        step2OwnerDesc2: "होम पर, पानी शुरू करें → ग्राहक चुनें → रेट सेट करें। बंद करने पर घंटे × रेट = बिल, जो बाकी भुगतान में दिखता है। ग्राहक वही रिकॉर्ड लाइव देखता है।",
        step3OwnerTitle2: "पानी का हिसाब (मैनुअल)",
        step3OwnerDesc2: "अगर पहले से पानी चल चुका हो तो शुरू और बंद होने का समय डालकर लाइव टाइमर के बिना रिकॉर्ड सेव करें।",
        step4OwnerTitle2: "+ भुगतान",
        step4OwnerDesc2: "ग्राहक के विवरण पेज पर नकद/यूपीआई प्राप्त भुगतान दर्ज करें। इससे आप दोनों की बही-खाता अपडेट होती है।",
        step5OwnerTitle2: "कतार",
        step5OwnerDesc2: "ग्राहकों को कतार में जोड़ें। \"कतार में अगला\" और कतार की संख्या होम पर दिखाई देती है।",
        step6OwnerTitle2: "बही-खाता",
        step6OwnerDesc2: "हर ग्राहक की पूरी बही (पानी + भुगतान) यहाँ सुरक्षित रहती है, भले ही वे बाद में अनलिंक हो जाएं।",
        step1CustomerTitle2: "लिंक करें",
        step1CustomerDesc2: "मालिक का 10 अंकों का मोबाइल नंबर डालकर अनुरोध भेजें। मालिक के स्वीकार करने पर ट्यूबवेल लिंक हो जाएगा।",
        step2CustomerTitle2: "कतार",
        step2CustomerDesc2: "मालिक आपको कतार में डाल सकता है। मेरा उपयोग में \"मेरी कतार में स्थिति\" देखें।",
        step3CustomerTitle2: "पानी का उपयोग",
        step3CustomerDesc2: "जब मालिक आपके नाम पर पानी शुरू/बंद करता है, तो घंटे और राशि अपने-आप मेरा उपयोग में दिखाई देती है।",
        step4CustomerTitle2: "भुगतान",
        step4CustomerDesc2: "जब मालिक भुगतान दर्ज करता है, तो वह भुगतान टैब में दिखाई देता है। बाकी राशि आपके डैशबोर्ड पर दिखाई देती है।",
        step5CustomerTitle2: "कई मालिक",
        step5CustomerDesc2: "आप एक से अधिक ट्यूबवेल मालिकों से लिंक कर सकते हैं।",
        searchCustomerPlaceholder2: "ग्राहक खोजें...",
        selectTubewellOptionLabel2: "ट्यूबवेल चुनें",
        primaryTubewellLabel2: "प्राथमिक ट्यूबवेल",
        googleMapsLinkLabel2: "Google Maps लिंक (वैकल्पिक)",
        villageAddressLabel2: "गांव / पता",
        removeTubewellLabel2: "ट्यूबवेल हटाएं",
        saveLabel2: "सेव करें",
    }
}

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

    localStorage.setItem('user_phone', phoneInput);
    localStorage.setItem('user_role', userRole);
    localStorage.setItem('user_dob', dobInput);

    // REGISTER MODE: create a NEW unique uid (do not reuse phone_)
    if (isRegisterMode) {
        const newUid = 'usr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        localStorage.setItem('user_uid', newUid);

        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('basic-info-screen').classList.add('active');
        const extra = document.getElementById('owner-extra-fields');
        if (extra) extra.style.display = userRole === 'owner' ? 'block' : 'none';
        return;
    }

    // LOGIN MODE: find ACTIVE user by phone (query), not fixed phone_ id
    try {
        const snap = await getDocs(query(collection(db, 'users'), where('phone', '==', phoneInput)));

        // Pick active docs (not deleted)
        const activeDocs = snap.docs.filter(d => d.data().accountStatus !== 'deleted');

        // If only deleted accounts exist → offer re-register (new uid later)
        if (snap.size > 0 && activeDocs.length === 0) {
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

        if (activeDocs.length > 0) {
            // Prefer exact DOB match; else first active
            let userDoc = activeDocs.find(d => d.data().dob === dobInput) || activeDocs[0];
            const existingUser = userDoc.data();
            const uid = userDoc.id; // REAL unique id (phone_… or usr_…)

            localStorage.setItem('user_uid', uid);

            if (existingUser.dob && existingUser.dob !== dobInput) {
                showToast(currentLang === 'en' ? "Wrong Date of Birth. Please check details." : "गलत जन्म तिथि। कृपया विवरण जांचें।", "error");
                return;
            }

            const existingRoles = Array.isArray(existingUser.roles)
                ? existingUser.roles
                : (existingUser.role ? [existingUser.role] : []);

            // CASE A: role exists → login
            if (existingRoles.includes(userRole)) {
                // Server-validated login — DOB and phone matched in Firestore
                localStorage.setItem('is_logged_in', 'true');
                localStorage.setItem('session_verified_at', new Date().toISOString());
                localStorage.setItem('user_role', userRole);
                localStorage.setItem('user_roles', JSON.stringify(existingRoles));
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

                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('login-screen').classList.remove('active');
                document.getElementById('app-shell').style.display = 'block';

                if (userRole === 'customer') setupCustomerUI();
                else {
                    loadOwnerData();
                    setupOwnerUI();
                }
                showToast(currentLang === 'en' ? "Welcome back!" : "वापसी का स्वागत है!", "success");
                return;
            }

            // CASE B: add other role on SAME uid (same person)
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
                    // Keep SAME uid — same person adding role
                    localStorage.setItem('user_uid', uid);
                    localStorage.setItem('user_role', userRole);
                    document.getElementById('owner-name').value = existingUser.name || '';
                    document.getElementById('owner-village').value = existingUser.village || '';
                    const extra = document.getElementById('owner-extra-fields');
                    if (extra) extra.style.display = userRole === 'owner' ? 'block' : 'none';
                    document.getElementById('login-screen').style.display = 'none';
                    document.getElementById('login-screen').classList.remove('active');
                    document.getElementById('basic-info-screen').classList.add('active');
                    showToast(
                        currentLang === 'en' ? 'Name & village filled. Confirm and save.' : 'नाम और गाँव भर दिए गए। पुष्टि करके सेव करें।',
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

    // No user at all → register new
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

            // Mark this person as account-deleted on every owner's customers list
            try {
                const custQ = query(
                    collection(db, 'customers'),
                    where('customerUid', '==', uid)
                );
                const custSnap = await getDocs(custQ);
                for (const docSnap of custSnap.docs) {
                    await safeUpdateDoc(doc(db, 'customers', docSnap.id), {
                        accountDeleted: true,
                        accountDeletedAt: safeServerTimestamp()
                    });
                }
            } catch (e) {
                console.error('Mark accountDeleted on customers', e);
            }
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
        populateCustomerDropdowns();
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
        const cCheck = getCustomerById(customerId);

        if (cCheck && cCheck.accountDeleted) {
            showToast(currentLang === 'en' ? 'Customer account deleted' : 'ग्राहक खाता हटाया गया', 'error');
            return;
        }

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
            customer_uid: cust.customerUid || '',
            customer_phone: cust.phone || '',
            customer_name: cust.name || '',
            start_time: timeStart.value,
            end_time: timeEnd.value,
            duration: duration,
            rate: rate,
            amount: amount,
            status: 'pending',
            approval_status: 'awaiting_approval',
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
        custHistory[customerId].push({
            id: docRef.id,
            type: 'water',
            date: today,
            start: timeStart.value,
            end: timeEnd.value,
            duration,
            rate,
            amount,
            status: 'pending'
        });
        localStorage.setItem('customer_history', JSON.stringify(custHistory));

        if (!customerData[customerId]) customerData[customerId] = { name: cust.name || '', phone: cust.phone || '', history: [] };
        customerData[customerId].history.push({
            id: docRef.id,
            type: 'water',
            date: today,
            start: timeStart.value,
            end: timeEnd.value,
            duration,
            rate,
            amount,
            status: 'pending'
        });

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
    if (!list) return;

    const primary = getTubewellData();
    const extras = JSON.parse(localStorage.getItem('tubewell_extras') || '[]');
    const all = (primary.name && !primary.removed) ? [{ ...primary, id: 'primary' }].concat(extras) : extras;

    const twSelect = document.getElementById('new-customer-tubewell');
    if (twSelect) {
        twSelect.innerHTML = all.map(function (tw) {
            return '<option value="' + (tw.id || 'primary') + '">' + (tw.name || '') + '</option>';
        }).join('');
    }

    if (all.length === 0) {
        list.innerHTML = '<div class="list-item"><div class="item-info"><p style="color: var(--ios-gray);">' +
            (locales[currentLang].noTubewells || 'No tubewells') + '</p></div></div>';
        return;
    }

    list.innerHTML = all.map(function (tw) {
        const st = tw.status || 'stopped';
        let statusText;
        let statusColor;

        if (st === 'running') {
            statusText = '● ' + locales[currentLang].statusRunning;
            statusColor = 'var(--ios-green)';
        } else if (st === 'work_in_progress') {
            statusText = '● ' + locales[currentLang].statusWorkInProgress;
            statusColor = '#FF9500';
        } else if (st === 'power_issue') {
            statusText = '● ' + (locales[currentLang].statusPowerIssue || 'Power issue');
            statusColor = '#FF9500';
        } else {
            statusText = '● ' + locales[currentLang].statusStopped;
            statusColor = 'var(--ios-gray)';
        }

        const key = tw.id || 'primary';

        const mapBtn = tw.mapLink
            ? '<button class="btn-small" style="margin-top: 5px;" onclick="event.stopPropagation(); openTubewellMap(\'' +
            String(tw.mapLink).replace(/'/g, "\\'") + '\')">Map</button>'
            : '';

        return '<div class="list-item" style="cursor:pointer;" onclick="openEditTubewell(\'' + key + '\')">' +
            '<div class="item-info"><h4>' + (tw.name || '') + '</h4>' +
            '<p>' + (tw.location || '') + ' • ₹' + (tw.rate || '') + '/hr</p>' +
            '<p style="font-size:12px; color:' + statusColor + '; margin-top:2px;">' + statusText + '<p>' + mapBtn + '</p>' + '</p></div>' +
            '<span class="role-badge">' + (key === 'primary' ? 'PRIMARY' : 'ACTIVE') + '</span></div>';
    }).join('');
}

window.openTubewellMap = function (url) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
};

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
    const twId = 'extra_' + Date.now();
    const newTw = {
        id: twId,
        name,
        location,
        rate,
        createdAt: new Date().toISOString(),
        ownerId: ownerUid,
        status: 'stopped',
        currentCustomer: null,
        currentStartTime: null
    };
    extras.push(newTw);
    localStorage.setItem('tubewell_extras', JSON.stringify(extras));

    await safeSetDoc(doc(db, 'tubewells', ownerUid + '_' + twId), newTw);

    renderTubewells();
    closeModal('add-tubewell-modal');
    document.getElementById('new-tw-name').value = '';
    document.getElementById('new-tw-location').value = '';
    document.getElementById('new-tw-rate').value = '150';
    showToast(currentLang === 'en' ? "Tubewell Added!" : "ट्यूबवेल जोड़ दिया गया!", "success");
}

function getOwnerTubewellOptions() {
    const primary = getTubewellData() || {};
    const extras = JSON.parse(localStorage.getItem('tubewell_extras') || '[]');
    const list = [];

    if (primary.name && !primary.removed) {
        list.push({ id: 'primary', name: primary.name || 'Primary' });
    }
    extras.forEach(function (tw) {
        if (tw && tw.name && tw.id) {
            list.push({ id: tw.id, name: tw.name });
        }
    });

    if (list.length === 0) {
        list.push({ id: 'primary', name: primary.name || 'Primary' });
    }
    return list;
}

/* --- CUSTOMER DETAIL VIEW --- */
window.currentCustomerId = null;

const customerData = {
};

function cleanupCustomerData() {
    const activeIds = new Set(getCustomers().map(c => c.id));
    const historyMap = JSON.parse(localStorage.getItem('customer_history') || '{}');
    const bahiContacts = JSON.parse(localStorage.getItem('bahi_contacts') || '{}');

    Object.keys(customerData).forEach(cid => {
        // Keep if active customer
        if (activeIds.has(cid)) return;
        // Keep if has history
        if (historyMap[cid] && historyMap[cid].length > 0) return;
        // Keep if in bahi contacts
        if (bahiContacts[cid]) return;
        // Safe to delete
        delete customerData[cid];
    });
}

window.openCustomerDetail = async function (id) {
    window.currentCustomerId = id;
    const listCust = getCustomerById(id) || {};
    let displayName = listCust.name || (customerData[id] && customerData[id].name) || 'Customer';
    const accountDeleted = listCust.accountDeleted === true;

    if (listCust.customerUid) {
        try {
            const uDoc = await getDoc(doc(db, 'users', listCust.customerUid));
            if (uDoc.exists() && uDoc.data().accountStatus !== 'deleted') {
                displayName = uDoc.data().name || displayName;
                if (customerData[id]) customerData[id].name = displayName;
            }
        } catch (e) { }
    }

    const detailView = document.getElementById('view-customer-detail');
    if (detailView) {
        const btns = detailView.querySelectorAll('button');
        btns.forEach(btn => {
            const t = (btn.innerText || btn.textContent || '').toLowerCase();
            const isAction = t.indexOf('payment') >= 0 || t.indexOf('water') >= 0 || t.indexOf('queue') >= 0 ||
                t.indexOf('भुगतान') >= 0 || t.indexOf('पानी') >= 0 || t.indexOf('कतार') >= 0;
            if (isAction) {
                btn.disabled = accountDeleted;
                btn.style.opacity = accountDeleted ? '0.45' : '1';
                btn.style.pointerEvents = accountDeleted ? 'none' : '';
            }
        });
        let ban = document.getElementById('cust-deleted-banner');
        if (accountDeleted) {
            if (!ban) {
                ban = document.createElement('div');
                ban.id = 'cust-deleted-banner';
                ban.style.cssText = 'padding:10px 12px;margin-bottom:12px;border-radius:10px;background:rgba(255,59,48,0.12);color:var(--ios-red);font-size:13px;';
                const nameEl = document.getElementById('customer-detail-name');
                if (nameEl && nameEl.parentNode) nameEl.parentNode.insertBefore(ban, nameEl.nextSibling);
            }
            ban.innerText = currentLang === 'en'
                ? 'This customer deleted their account. \n History only can be visible. Other actions are disabled.'
                : 'इस ग्राहक ने खाता हटा दिया है। केवल इतिहास — कार्य बंद।';
            ban.style.display = 'block';
        } else if (ban) {
            ban.style.display = 'none';
        }
    }

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

    // Sync from server to get latest approval_status
    await syncOwnerUsageFromServer();

    const historyList = document.getElementById('customer-history-list');
    // Newest at top by time added (created_at / date+time) — never rely on array order alone
    const sortedHistory = sortNewestFirst(customerData[id].history || []);

    document.getElementById('customer-detail-name').innerText = customerData[id].name;

    if (sortedHistory.length === 0) {
        historyList.innerHTML = '<div class="list-item"><div class="item-info"><p style="color: var(--ios-gray);">No entries yet.</p></div></div>';
        document.getElementById('cust-total-due').innerText = '₹0';
        document.getElementById('cust-total-paid').innerText = '₹0';
        document.getElementById('cust-total-hours').innerHTML = '0 <small>Hrs</small>';
        document.getElementById('cust-last-entry').innerText = '-';
        showView('view-customer-detail');
        return;
    }

    // Settlement uses oldest-first (accounting only). Does NOT write back into entry objects.
    const waters = sortOldestFirst(sortedHistory.filter(e => e.type === 'water'));
    const pays = sortedHistory.filter(e => e.type === 'payment');
    const { settled, partial } = getSettledWaterKeys(waters, pays);

    let totalDue = 0, totalPaid = 0, totalHours = 0, lastEntry = '-';

    historyList.innerHTML = sortedHistory.map((entry, idx) => {
        if (entry.type === 'water') {
            totalHours += entry.duration || 0;
            if (idx === 0) lastEntry = entry.date;
            const wkey = waterKey(entry);
            const isSettled = entry.status === 'paid' || settled.has(wkey);
            const partialDue = partial.get(wkey) || 0;
            if (!isSettled) totalDue += entry.amount || 0;
            // display only — original entry.amount / duration / rate stay untouched
            const displayAmount = partialDue > 0 ? partialDue : entry.amount;
            const approvalStatus = entry.approval_status || 'awaiting_approval';
            // --- VILLAGE-FRIENDLY STATUS BADGES ---
            let statusBadgeHtml = '';
            let editButton = '';
            let statusBannerColor = '';
            let statusBannerText = '';

            if (approvalStatus === 'awaiting_approval') {
                statusBannerColor = '#FF9500';
                statusBannerText = currentLang === 'en' ? '⏳ Waiting for customer approval' : '⏳ ग्राहक की स्वीकृति का इंतजार';
                statusBadgeHtml = '<span style="display:inline-block;font-size:13px;font-weight:600;color:#FF9500;background:rgba(255,149,0,0.10);padding:6px 14px;border-radius:20px;">' + statusBannerText + '</span>';
                editButton = '<button class="btn-small" style="margin-top:10px;padding:10px 20px;font-size:15px;background:var(--ios-blue);" onclick="openEditWaterModal(\'' + (entry.id || '') + '\')">' + (currentLang === 'en' ? '✏️ Edit Entry' : '✏️ एडिट करें') + '</button>';
            } else if (approvalStatus === 'approved') {
                statusBannerColor = '#34C759';
                statusBannerText = currentLang === 'en' ? '✅ Approved by customer' : '✅ ग्राहक ने स्वीकार किया';
                statusBadgeHtml = '<span style="display:inline-block;font-size:13px;font-weight:600;color:#34C759;background:rgba(52,199,89,0.10);padding:6px 14px;border-radius:20px;">' + statusBannerText + '</span>';
            } else if (approvalStatus === 'rejected') {
                statusBannerColor = '#FF3B30';
                statusBannerText = currentLang === 'en' ? '❌ Customer rejected — please edit' : '❌ ग्राहक ने अस्वीकार किया — एडिट करें';
                statusBadgeHtml = '<span style="display:inline-block;font-size:13px;font-weight:600;color:#FF3B30;background:rgba(255,59,48,0.10);padding:6px 14px;border-radius:20px;">' + statusBannerText + '</span>';
                editButton = '<button class="btn-small" style="margin-top:10px;padding:10px 20px;font-size:15px;background:var(--ios-blue);" onclick="openEditWaterModal(\'' + (entry.id || '') + '\')">' + (currentLang === 'en' ? '✏️ Edit Entry' : '✏️ एडिट करें') + '</button>';
            }

            // --- PAYMENT STATUS (Big visual) ---
            const statusLabel = isSettled ? 'PAID' : (partialDue > 0 ? 'PARTIAL' : 'PENDING');
            const statusColor = isSettled ? '#34C759' : (partialDue > 0 ? '#FF9500' : '#FF3B30');
            const statusBg = isSettled ? 'rgba(52,199,89,0.10)' : (partialDue > 0 ? 'rgba(255,149,0,0.10)' : 'rgba(255,59,48,0.10)');

            // --- FORMAT DURATION AS HOURS + MINUTES (not decimal) ---
            const totalMinutes = Math.round((entry.duration || 0) * 60);
            const durHours = Math.floor(totalMinutes / 60);
            const durMins = totalMinutes % 60;
            let durationText = '';
            if (currentLang === 'hi') {
                if (durHours > 0 && durMins > 0) durationText = durHours + ' घंटा ' + durMins + ' मिनट';
                else if (durHours > 0) durationText = durHours + ' घंटा';
                else durationText = durMins + ' मिनट';
            } else {
                if (durHours > 0 && durMins > 0) durationText = durHours + ' hr ' + durMins + ' min';
                else if (durHours > 0) durationText = durHours + (durHours === 1 ? ' hr' : ' hrs');
                else durationText = durMins + ' min';
            }

            // --- VILLAGE-FRIENDLY CARD LAYOUT ---
            return '<div class="list-item" style="flex-direction:column;align-items:stretch;gap:12px;padding:16px;">' +

                // ROW 1: Header with type + approval badge
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
                '<h4 style="font-size:18px;font-weight:700;color:var(--text);">' + (currentLang === 'en' ? '💧 Water Usage' : '💧 पानी का उपयोग') + '</h4>' +
                statusBadgeHtml +
                '</div>' +

                // ROW 2: Big amount + payment status (most important!)
                '<div style="display:flex;align-items:center;justify-content:space-between;background:' + statusBg + ';padding:14px 16px;border-radius:14px;">' +
                '<div>' +
                '<div style="font-size:32px;font-weight:800;color:' + statusColor + ';letter-spacing:-0.5px;">₹' + displayAmount + '</div>' +
                '<div style="font-size:13px;color:' + statusColor + ';font-weight:600;margin-top:2px;text-transform:uppercase;">' + statusLabel + '</div>' +
                '</div>' +
                '<div style="text-align:right;">' +
                '<div style="font-size:14px;color:var(--ios-gray);font-weight:500;">' + (currentLang === 'en' ? 'Total Bill' : 'कुल बिल') + '</div>' +
                '</div>' +
                '</div>' +

                // ROW 3: Date (standalone, easy to read)
                '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="font-size:20px;">📅</span>' +
                '<span style="font-size:16px;font-weight:600;color:var(--text);">' + entry.date + '</span>' +
                '</div>' +

                // ROW 4: Time details with clear labels
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div style="background:var(--bg);padding:12px;border-radius:12px;">' +
                '<div style="font-size:12px;color:var(--ios-gray);font-weight:500;text-transform:uppercase;margin-bottom:4px;">' + (currentLang === 'en' ? '▶️ Started' : '▶️ शुरू') + '</div>' +
                '<div style="font-size:20px;font-weight:700;color:var(--text);">' + entry.start + '</div>' +
                '</div>' +
                '<div style="background:var(--bg);padding:12px;border-radius:12px;">' +
                '<div style="font-size:12px;color:var(--ios-gray);font-weight:500;text-transform:uppercase;margin-bottom:4px;">' + (currentLang === 'en' ? '⏹️ Ended' : '⏹️ बंद') + '</div>' +
                '<div style="font-size:20px;font-weight:700;color:var(--text);">' + entry.end + '</div>' +
                '</div>' +
                '</div>' +

                // ROW 5: Duration (standalone, farmer-friendly)
                '<div style="display:flex;align-items:center;gap:10px;background:var(--bg);padding:12px 16px;border-radius:12px;">' +
                '<span style="font-size:20px;">⏱️</span>' +
                '<div>' +
                '<div style="font-size:12px;color:var(--ios-gray);font-weight:500;">' + (currentLang === 'en' ? 'Total Time' : 'कुल समय') + '</div>' +
                '<div style="font-size:18px;font-weight:700;color:var(--ios-blue);">' + durationText + '</div>' +
                '</div>' +
                '</div>' +

                // ROW 6: Rate info (small, secondary)
                '<div style="font-size:13px;color:var(--ios-gray);padding-left:4px;">' +
                '₹' + (entry.rate || 0) + (currentLang === 'en' ? '/hour rate' : '/घंटे का रेट') +
                '</div>' +

                // ROW 7: Edit button (if needed)
                editButton +

                '</div>';
        } else {
            totalPaid += entry.amount || 0;
            if (idx === 0) lastEntry = entry.date;
            const modeLabel = entry.mode || 'Cash';
            const modeEmoji = modeLabel === 'Cash' ? '💵' : (modeLabel === 'UPI' ? '📱' : '💳');
            return '<div class="list-item" style="flex-direction:column;align-items:stretch;gap:10px;padding:16px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<h4 style="font-size:18px;font-weight:700;">' + modeEmoji + ' ' + (currentLang === 'en' ? 'Payment Received' : 'भुगतान प्राप्त') + '</h4>' +
                '<span style="display:inline-block;font-size:13px;font-weight:600;color:#34C759;background:rgba(52,199,89,0.10);padding:6px 14px;border-radius:20px;">' + (currentLang === 'en' ? '✅ Paid' : '✅ चुकाया') + '</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(52,199,89,0.08);padding:14px 16px;border-radius:14px;">' +
                '<div style="font-size:32px;font-weight:800;color:#34C759;letter-spacing:-0.5px;">₹' + entry.amount + '</div>' +
                '<div style="text-align:right;">' +
                '<div style="font-size:14px;color:var(--ios-gray);font-weight:500;">' + modeLabel + '</div>' +
                '</div>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="font-size:20px;">📅</span>' +
                '<span style="font-size:16px;font-weight:600;">' + entry.date + '</span>' +
                '</div>' +
                (entry.note ? '<div style="font-size:14px;color:var(--ios-gray);background:var(--bg);padding:10px 14px;border-radius:10px;">📝 ' + entry.note + '</div>' : '') +
                '</div>';
        }
    }).join('');

    document.getElementById('cust-total-due').innerText = '₹' + Math.round(totalDue);
    document.getElementById('cust-total-paid').innerText = '₹' + Math.round(totalPaid);
    document.getElementById('cust-total-hours').innerHTML = totalHours.toFixed(1) + ' <small>Hrs</small>';
    document.getElementById('cust-last-entry').innerText = lastEntry;
    showView('view-customer-detail');
};

window.openEditWaterModal = async function (entryId) {
    if (!entryId) {
        showToast(
            currentLang === 'en' ? 'Entry not found' : 'एंट्री नहीं मिली',
            'error'
        );
        return;
    }

    let entry = null;

    // -------------------------------------------------
    // 1. First check owner's local water history
    // -------------------------------------------------
    const waterHistory = getWaterHistory();

    entry = waterHistory.find(
        h => String(h.id) === String(entryId)
    );

    // -------------------------------------------------
    // 2. If not found, check current customer's history
    // -------------------------------------------------
    if (!entry && window.currentCustomerId) {
        const cust = customerData[window.currentCustomerId];

        if (cust && Array.isArray(cust.history)) {
            entry = cust.history.find(
                h => String(h.id) === String(entryId)
            );
        }
    }

    // -------------------------------------------------
    // 3. If still not found, check customer_history
    // -------------------------------------------------
    if (!entry) {
        const customerHistory = JSON.parse(
            localStorage.getItem('customer_history') || '{}'
        );

        for (const cid of Object.keys(customerHistory)) {
            const history = customerHistory[cid];

            if (!Array.isArray(history)) continue;

            const found = history.find(
                h => String(h.id) === String(entryId)
            );

            if (found) {
                entry = found;
                break;
            }
        }
    }

    // -------------------------------------------------
    // 4. Final source of truth: Firestore
    // -------------------------------------------------
    if (!entry) {
        try {
            const usageDoc = await getDoc(
                doc(db, 'water_usage', entryId)
            );

            if (usageDoc.exists()) {
                const data = usageDoc.data();

                entry = {
                    id: usageDoc.id,
                    type: 'water',
                    date: data.date || '',
                    start: data.start_time || '',
                    end: data.end_time || '',
                    duration: data.duration || 0,
                    rate: data.rate || 0,
                    amount: data.amount || 0,
                    status: data.status || 'pending',
                    approval_status:
                        data.approval_status || 'awaiting_approval'
                };
            }
        } catch (error) {
            console.error(
                'openEditWaterModal Firestore lookup failed:',
                error
            );
        }
    }

    // -------------------------------------------------
    // 5. Still not found = genuinely missing
    // -------------------------------------------------
    if (!entry) {
        console.error(
            'Water usage entry not found:',
            entryId
        );

        showToast(
            currentLang === 'en'
                ? 'Entry not found'
                : 'एंट्री नहीं मिली',
            'error'
        );

        return;
    }

    // -------------------------------------------------
    // 6. Fill edit modal
    // -------------------------------------------------
    const idEl = document.getElementById('edit-water-id');
    const dateEl = document.getElementById('edit-water-date');
    const startEl = document.getElementById('edit-water-start');
    const endEl = document.getElementById('edit-water-end');
    const durationEl = document.getElementById('edit-water-duration');
    const rateEl = document.getElementById('edit-water-rate');
    const amountEl = document.getElementById('edit-water-amount');

    if (idEl) idEl.value = entryId;
    if (dateEl) dateEl.value = entry.date || '';
    if (startEl) startEl.value = entry.start || entry.start_time || '';
    if (endEl) endEl.value = entry.end || entry.end_time || '';
    if (durationEl) durationEl.value = entry.duration || '';
    if (rateEl) rateEl.value = entry.rate || '';

    if (amountEl) {
        amountEl.innerText = '₹' + (entry.amount || 0);
    }

    openModal('edit-water-modal');
};
window.calculateEditWater = function () {
    const duration = parseFloat(document.getElementById('edit-water-duration').value) || 0;
    const rate = parseFloat(document.getElementById('edit-water-rate').value) || 0;
    const amount = Math.round(duration * rate);
    document.getElementById('edit-water-amount').innerText = '₹' + amount;
};

window.saveEditWater = async function () {
    const entryId = document.getElementById('edit-water-id').value;
    if (!entryId) return;

    const date = document.getElementById('edit-water-date').value;
    const start = document.getElementById('edit-water-start').value;
    const end = document.getElementById('edit-water-end').value;
    const duration = parseFloat(document.getElementById('edit-water-duration').value) || 0;
    const rate = parseFloat(document.getElementById('edit-water-rate').value) || 0;
    const amount = Math.round(duration * rate);

    if (!date || !start || !end || duration <= 0 || rate <= 0) {
        showToast(currentLang === 'en' ? 'Please fill all fields correctly' : 'सभी फील्ड सही भरें', 'error');
        return;
    }

    try {
        // Update in Firestore
        await safeUpdateDoc(doc(db, 'water_usage', entryId), {
            date: date,
            start_time: start,
            end_time: end,
            duration: duration,
            rate: rate,
            amount: amount,
            approval_status: 'awaiting_approval',
            edited_at: safeServerTimestamp(),
            edited_by: localStorage.getItem('user_uid')
        });

        // Update local history
        const history = getWaterHistory();
        const idx = history.findIndex(h => h.id === entryId);
        if (idx >= 0) {
            history[idx].date = date;
            history[idx].start = start;
            history[idx].end = end;
            history[idx].duration = duration;
            history[idx].rate = rate;
            history[idx].amount = amount;
            history[idx].approval_status = 'awaiting_approval';
            saveWaterHistory(history);
        }

        // Update customer history
        const custHistory = JSON.parse(localStorage.getItem('customer_history') || '{}');
        Object.keys(custHistory).forEach(cid => {
            const eidx = custHistory[cid].findIndex(e => e.id === entryId);
            if (eidx >= 0) {
                custHistory[cid][eidx].date = date;
                custHistory[cid][eidx].start = start;
                custHistory[cid][eidx].end = end;
                custHistory[cid][eidx].duration = duration;
                custHistory[cid][eidx].rate = rate;
                custHistory[cid][eidx].amount = amount;
                custHistory[cid][eidx].approval_status = 'awaiting_approval';
            }
        });
        localStorage.setItem('customer_history', JSON.stringify(custHistory));

        if (customerData[window.currentCustomerId]) {
            const ch = customerData[window.currentCustomerId].history || [];
            const eidx = ch.findIndex(e => e.id === entryId);
            if (eidx >= 0) {
                ch[eidx].date = date;
                ch[eidx].start = start;
                ch[eidx].end = end;
                ch[eidx].duration = duration;
                ch[eidx].rate = rate;
                ch[eidx].amount = amount;
                ch[eidx].approval_status = 'awaiting_approval';
            }
        }

        closeModal('edit-water-modal');
        openCustomerDetail(window.currentCustomerId);
        updateDashboardStats();
        renderPendingPayments();
        showToast(currentLang === 'en' ? 'Updated and sent for approval' : 'अपडेट करके स्वीकृति के लिए भेजा गया', 'success');

    } catch (e) {
        console.error('saveEditWater failed', e);
        showToast(currentLang === 'en' ? 'Update failed' : 'अपडेट विफल', 'error');
    }
};

window.showView = function (viewId) {
    views.forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    navItems.forEach(nav => nav.classList.remove('active'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.savePayment = async function () {
    if (!window.currentCustomerId) {
        showToast(currentLang === 'en' ? 'No customer selected' : 'कोई ग्राहक नहीं चुना', 'error');
        return;
    }

    const amount = parseFloat(document.getElementById('payment-amount').value);
    const date = document.getElementById('payment-date').value;
    const mode = (document.getElementById('payment-mode') || {}).value || 'Cash';
    const note = document.getElementById('payment-note').value.trim();

    if (!amount || !date) {
        showToast(currentLang === 'en' ? "Enter amount and date" : "राशि और तारीख दर्ज करें", "error");
        return;
    }
    if (amount <= 0) {
        showToast(currentLang === 'en' ? "Enter valid amount" : "सही राशि दर्ज करें", "error");
        return;
    }

    const cCheck = getCustomerById(window.currentCustomerId);
    if (cCheck && cCheck.accountDeleted) {
        showToast(currentLang === 'en' ? 'Customer account deleted' : 'ग्राहक खाता हटाया गया', 'error');
        return;
    }

    const cust = getCustomerById(window.currentCustomerId) || customerData[window.currentCustomerId] || {};
    const ownerUid = localStorage.getItem('user_uid');

    try {
        await safeAddDoc(collection(db, 'water_usage'), {
            business_id: ownerUid,
            customer_id: window.currentCustomerId,
            customer_uid: cust.customerUid || '',
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

window.openEditTubewell = function (key) {
    let tw = {};
    if (key === 'primary') {
        tw = getTubewellData() || {};
    } else {
        const extras = JSON.parse(localStorage.getItem('tubewell_extras') || '[]');
        tw = extras.find(e => e.id === key) || {};
    }

    document.getElementById('edit-tw-key').value = key;
    document.getElementById('edit-tw-name').value = tw.name || '';
    document.getElementById('edit-tw-rate').value = tw.rate != null ? tw.rate : 150;
    document.getElementById('edit-tw-location').value = tw.location || '';

    const mapEl = document.getElementById('edit-tw-map');
    if (mapEl) mapEl.value = tw.mapLink || tw.googleMap || '';

    openModal('edit-tubewell-modal');
};

window.saveEditTubewell = async function () {
    const key = document.getElementById('edit-tw-key').value || 'primary';
    const name = document.getElementById('edit-tw-name').value.trim();
    const rate = parseFloat(document.getElementById('edit-tw-rate').value) || 0;
    const location = document.getElementById('edit-tw-location').value.trim();
    const mapLink = (document.getElementById('edit-tw-map') || {}).value.trim() || '';

    if (!name) {
        showToast(currentLang === 'en' ? 'Enter name' : 'नाम दर्ज करें', 'error');
        return;
    }
    if (!rate || rate <= 0) {
        showToast(currentLang === 'en' ? 'Enter valid rate' : 'सही रेट दर्ज करें', 'error');
        return;
    }

    const ownerUid = localStorage.getItem('user_uid');

    if (key === 'primary') {
        const tw = getTubewellData() || {};
        tw.name = name;
        tw.rate = rate;
        tw.location = location;
        tw.mapLink = mapLink;
        saveTubewellData(tw);

        try {
            await safeUpdateDoc(doc(db, 'tubewells', ownerUid + '_primary'), {
                name: name,
                rate: rate,
                location: location,
                mapLink: mapLink
            });
        } catch (e) {
            try {
                await safeSetDoc(doc(db, 'tubewells', ownerUid + '_primary'), {
                    ...tw,
                    ownerId: ownerUid,
                    name: name,
                    rate: rate,
                    location: location
                });
            } catch (e2) {
                console.error(e2);
            }
        }
    } else {
        const extras = JSON.parse(localStorage.getItem('tubewell_extras') || '[]');
        const idx = extras.findIndex(e => e.id === key);
        if (idx < 0) {
            showToast(currentLang === 'en' ? 'Tubewell not found' : 'ट्यूबवेल नहीं मिला', 'error');
            return;
        }
        extras[idx].name = name;
        extras[idx].rate = rate;
        extras[idx].location = location;
        extras[idx].mapLink = mapLink;
        localStorage.setItem('tubewell_extras', JSON.stringify(extras));

        try {
            await safeUpdateDoc(doc(db, 'tubewells', ownerUid + '_' + key), {
                name: name,
                rate: rate,
                location: location,
                mapLink: mapLink
            });
        } catch (e) { console.error('extra tw update', e); }
    }

    closeModal('edit-tubewell-modal');
    renderTubewells();
    if (typeof renderStatusCard === 'function') renderStatusCard();
    showToast(currentLang === 'en' ? 'Tubewell updated' : 'ट्यूबवेल अपडेट हो गया', 'success');
};

window.removeTubewellFromEdit = function () {
    const key = (document.getElementById('edit-tw-key') || {}).value || 'primary';
    showConfirmPopup(
        currentLang === 'en' ? 'Remove tubewell' : 'ट्यूबवेल हटाएं',
        currentLang === 'en'
            ? 'Remove this tubewell? Customers will be unlinked. Water history will be kept.'
            : 'यह ट्यूबवेल हटाएं? ग्राहक अनलिंक होंगे। पानी का इतिहास रहेगा।',
        currentLang === 'en' ? 'Remove' : 'हटाएं',
        currentLang === 'en' ? 'Cancel' : 'रद्द करें',
        function () { proceedRemoveTubewell(key); },
        null
    );
};

async function proceedRemoveTubewell(key) {
    const ownerUid = localStorage.getItem('user_uid');
    if (!ownerUid) return;

    try {
        if (key === 'primary') {
            const tw = getTubewellData() || {};
            const cleared = {
                name: '',
                location: '',
                rate: tw.rate || 150,
                mapLink: '',
                status: 'stopped',
                currentCustomer: null,
                currentStartTime: null,
                ownerActive: false,
                removed: true
            };
            saveTubewellData(cleared);

            try {
                await safeUpdateDoc(doc(db, 'tubewells', ownerUid + '_primary'), {
                    name: '',
                    location: '',
                    mapLink: '',
                    status: 'stopped',
                    currentCustomer: null,
                    currentCustomerUid: null,
                    currentStartTime: null,
                    ownerActive: false,
                    removed: true,
                    removedAt: safeServerTimestamp()
                });
            } catch (e) {
                console.error(e);
            }
        } else {
            const extras = JSON.parse(localStorage.getItem('tubewell_extras') || '[]');
            const filtered = extras.filter(e => e.id !== key);
            localStorage.setItem('tubewell_extras', JSON.stringify(filtered));

            try {
                await safeUpdateDoc(doc(db, 'tubewells', ownerUid + '_' + key), {
                    removed: true,
                    removedAt: safeServerTimestamp()
                });
            } catch (e) { console.error('extra tw remove', e); }
        }

        // Unlink all customers of this owner (keep water_usage)
        const linksSnap = await getDocs(
            query(collection(db, 'customer_links'), where('ownerUid', '==', ownerUid))
        );
        for (const d of linksSnap.docs) {
            await safeDeleteDoc(doc(db, 'customer_links', d.id));
        }

        // Soft-remove active customer contacts for this owner
        const custSnap = await getDocs(
            query(collection(db, 'customers'), where('ownerId', '==', ownerUid))
        );
        for (const d of custSnap.docs) {
            const data = d.data();
            if (data.status === 'removed') continue;
            await safeUpdateDoc(doc(db, 'customers', d.id), {
                status: 'removed',
                removedAt: safeServerTimestamp()
            });
        }

        // Clear queues for this owner
        const qSnap = await getDocs(
            query(collection(db, 'queues'), where('ownerId', '==', ownerUid))
        );
        for (const d of qSnap.docs) {
            await safeDeleteDoc(doc(db, 'queues', d.id));
        }

        // Local owner lists
        saveCustomers([]);
        saveQueue([]);
        localStorage.removeItem('customers');

    } catch (e) {
        console.error('proceedRemoveTubewell', e);
    }

    closeModal('edit-tubewell-modal');
    renderTubewells();
    if (typeof renderStatusCard === 'function') renderStatusCard();
    if (typeof renderCustomers === 'function') renderCustomers();
    if (typeof renderBahiCustomers === 'function') renderBahiCustomers();

    showToast(
        currentLang === 'en'
            ? 'Tubewell removed. Customers unlinked. History kept.'
            : 'ट्यूबवेल हटाया। ग्राहक अनलिंक। इतिहास सुरक्षित।',
        'success'
    );
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
// Set max DOB to today
(function () {
    const dob = document.getElementById('login-dob');
    if (dob) dob.max = new Date().toISOString().split('T')[0];
})();





/* ═══════════════════════════════════════════════════════════════
   DEVELOPER ONLY — DATABASE CLEANUP UTILITY
   Run from browser console: devClearDatabase('your-phone-number')
   ═══════════════════════════════════════════════════════════════ */

window.devClearDatabase = async function (developerPhone) {
    // ── GUARD: Only you can run this ──
    const ALLOWED_DEV_PHONE = '7985381362'; // ←←← CHANGE THIS TO YOUR REAL PHONE NUMBER

    if (!developerPhone || developerPhone !== ALLOWED_DEV_PHONE) {
        console.error('❌ ACCESS DENIED: Invalid or missing developer phone.');
        console.error('   Usage: devClearDatabase("your-10-digit-phone")');
        return { success: false, error: 'Unauthorized' };
    }

    // ── DOUBLE CONFIRM via console ──
    console.log('%c⚠️  DATABASE WIPE REQUESTED', 'color: #FF3B30; font-size: 16px; font-weight: bold;');
    console.log('%cThis will PERMANENTLY DELETE all data from Firestore:', 'color: #FF9500; font-size: 13px;');
    console.log('  • users (except your account)');
    console.log('  • tubewells');
    console.log('  • customers');
    console.log('  • water_usage');
    console.log('  • queues');
    console.log('  • link_requests');
    console.log('  • customer_links');
    console.log('  • notifications');
    console.log('  • announcements');
    console.log('%cTo confirm, run: devClearDatabaseConfirm("' + developerPhone + '")', 'color: #007AFF; font-size: 13px; font-weight: bold;');

    // Store intent temporarily
    window._devClearPending = true;
    window._devClearPhone = developerPhone;

    return { success: false, status: 'pending_confirmation', message: 'Call devClearDatabaseConfirm() to proceed' };
};

window.devClearDatabaseConfirm = async function (developerPhone) {
    const ALLOWED_DEV_PHONE = '7985381362'; // ←←← SAME PHONE NUMBER AS ABOVE

    // ── Validate confirmation ──
    if (!window._devClearPending || developerPhone !== ALLOWED_DEV_PHONE || developerPhone !== window._devClearPhone) {
        console.error('❌ No pending wipe request or phone mismatch. Run devClearDatabase() first.');
        return { success: false, error: 'No pending confirmation' };
    }

    console.log('%c🧹 STARTING DATABASE WIPE...', 'color: #FF3B30; font-size: 14px; font-weight: bold;');

    const results = {
        collections: {},
        localStorageCleared: false,
        errors: []
    };

    // ── Helper: delete all docs in a collection ──
    async function wipeCollection(collectionName, whereClause) {
        try {
            let q;
            if (whereClause) {
                q = query(collection(db, collectionName), whereClause);
            } else {
                q = query(collection(db, collectionName));
            }
            const snap = await getDocs(q);
            let count = 0;
            const batchDeletions = [];
            snap.forEach(d => {
                batchDeletions.push(safeDeleteDoc(doc(db, collectionName, d.id)));
                count++;
            });
            await Promise.all(batchDeletions);
            results.collections[collectionName] = { deleted: count, error: null };
            console.log('  ✅ ' + collectionName + ': deleted ' + count + ' docs');
            return count;
        } catch (e) {
            results.collections[collectionName] = { deleted: 0, error: e.message };
            results.errors.push({ collection: collectionName, error: e.message });
            console.error('  ❌ ' + collectionName + ' failed:', e.message);
            return 0;
        }
    }

    // ── 1. WATER USAGE (biggest collection first) ──
    await wipeCollection('water_usage');

    // ── 2. QUEUES ──
    await wipeCollection('queues');

    // ── 3. CUSTOMERS ──
    await wipeCollection('customers');

    // ── 4. CUSTOMER LINKS ──
    await wipeCollection('customer_links');

    // ── 5. LINK REQUESTS ──
    await wipeCollection('link_requests');

    // ── 6. NOTIFICATIONS ──
    await wipeCollection('notifications');

    // ── 7. ANNOUNCEMENTS ──
    await wipeCollection('announcements');

    // ── 8. TUBEWELLS (except keep structure if you want) ──
    await wipeCollection('tubewells');

    // ── 9. USERS (delete ALL except your dev account) ──
    try {
        const usersSnap = await getDocs(query(collection(db, 'users')));
        let userCount = 0;
        const userDeletions = [];
        usersSnap.forEach(d => {
            const data = d.data();
            // Skip your own account
            if (data.phone === ALLOWED_DEV_PHONE) {
                console.log('  👤 Skipping your account: ' + d.id);
                return;
            }
            userDeletions.push(safeDeleteDoc(doc(db, 'users', d.id)));
            userCount++;
        });
        await Promise.all(userDeletions);
        results.collections['users'] = { deleted: userCount, error: null };
        console.log('  ✅ users: deleted ' + userCount + ' accounts (kept yours)');
    } catch (e) {
        results.collections['users'] = { deleted: 0, error: e.message };
        results.errors.push({ collection: 'users', error: e.message });
        console.error('  ❌ users failed:', e.message);
    }

    // ── 10. CLEAR LOCALSTORAGE (except theme/lang preferences) ──
    try {
        const keepKeys = ['theme', 'app_lang'];
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!keepKeys.includes(key)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        results.localStorageCleared = true;
        console.log('  ✅ localStorage: cleared ' + keysToRemove.length + ' keys (kept theme, lang)');
    } catch (e) {
        results.errors.push({ collection: 'localStorage', error: e.message });
        console.error('  ❌ localStorage clear failed:', e.message);
    }

    // ── Reset pending flag ──
    window._devClearPending = false;
    window._devClearPhone = null;

    // ── Final report ──
    const totalDeleted = Object.values(results.collections).reduce((sum, c) => sum + (c.deleted || 0), 0);

    console.log('%c═══════════════════════════════════════', 'color: #34C759;');
    console.log('%c✅ WIPE COMPLETE', 'color: #34C759; font-size: 16px; font-weight: bold;');
    console.log('Total documents deleted: ' + totalDeleted);
    console.log('Errors: ' + results.errors.length);
    if (results.errors.length > 0) {
        console.log('%cErrors:', 'color: #FF3B30;');
        results.errors.forEach(e => console.log('  • ' + e.collection + ': ' + e.error));
    }
    console.log('%c═══════════════════════════════════════', 'color: #34C759;');
    console.log('%c🔄 Reload the page to see clean state.', 'color: #007AFF; font-size: 13px;');

    return { success: true, results: results, totalDeleted: totalDeleted };
};

/* ── Quick helper: just check what's in the DB (safe, no delete) ── */
window.devCheckDatabase = async function () {
    const collections = ['users', 'tubewells', 'customers', 'water_usage', 'queues', 'link_requests', 'customer_links', 'notifications', 'announcements'];
    const report = {};

    console.log('%c📊 DATABASE REPORT', 'color: #007AFF; font-size: 14px; font-weight: bold;');

    for (const col of collections) {
        try {
            const snap = await getDocs(query(collection(db, col)));
            report[col] = snap.size;
            const color = snap.size > 100 ? '#FF3B30' : (snap.size > 10 ? '#FF9500' : '#34C759');
            console.log('%c  ' + col + ': ' + snap.size + ' docs', 'color: ' + color + ';');
        } catch (e) {
            report[col] = 'error: ' + e.message;
            console.log('%c  ' + col + ': ERROR - ' + e.message, 'color: #FF3B30;');
        }
    }

    console.log('%cLocalStorage keys: ' + localStorage.length, 'color: var(--ios-gray);');
    for (let i = 0; i < Math.min(localStorage.length, 20); i++) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key);
        const preview = val.length > 50 ? val.substring(0, 50) + '...' : val;
        console.log('  • ' + key + ' = ' + preview);
    }

    return report;
};

console.log('%c🔧 Dev tools loaded: devCheckDatabase() | devClearDatabase(\"your-phone\")', 'color: #007AFF; font-size: 11px;');