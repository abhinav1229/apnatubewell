
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