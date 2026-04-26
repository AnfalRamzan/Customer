// ============================================
// API CONFIGURATION - AUTO DETECT BACKEND
// ============================================

// Automatically find backend server
async function findBackendServer() {
    // Get current frontend host and port
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    
    // First, try same port as frontend (if backend served from same origin)
    if (currentPort) {
        try {
            const testUrl = `${window.location.protocol}//${currentHost}:${currentPort}/api/health`;
            console.log('Testing:', testUrl);
            const response = await fetch(testUrl, { 
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            if (response.ok) {
                console.log('✅ Backend found on port:', currentPort);
                return `${window.location.protocol}//${currentHost}:${currentPort}/api`;
            }
        } catch (e) {
            console.log('No backend on port:', currentPort);
        }
    }
    
    // Try common ports in order
    const portsToTry = [3000, 5000, 8080, 3001, 4000, 8000, 9000];
    
    for (const port of portsToTry) {
        try {
            const testUrl = `${window.location.protocol}//${currentHost}:${port}/api/health`;
            console.log('Testing port:', port);
            
            // Set timeout to avoid long waits
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            
            const response = await fetch(testUrl, { 
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                console.log('✅ Backend found on port:', port);
                return `${window.location.protocol}//${currentHost}:${port}/api`;
            }
        } catch (e) {
            console.log('No backend on port:', port);
        }
    }
    
    // If on localhost and nothing found, try default
    if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
        return 'http://localhost:3000/api';
    }
    
    // For production, use same origin
    return `${window.location.protocol}//${currentHost}/api`;
}

let API_URL = '';

// Initialize API URL
async function initApiUrl() {
    API_URL = await findBackendServer();
    console.log('🎯 Using API URL:', API_URL);
    return API_URL;
}

let currentFilter = 'all';
let currentSearchTerm = '';
let currentDeleteId = null;
let currentViewCustomer = null;
let currentPhotoDataUrl = null;
let currentBillPhotoDataUrl = null;
let currentUser = null;
let currentZoomScale = 1;
let recognition = null;
let isListening = false;
let searchTimeout = null;

// ============================================
// AUTH CHECK
// ============================================

function checkAuth() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (!token || !userStr) {
        window.location.href = 'login.html';
        return false;
    }
    
    currentUser = JSON.parse(userStr);
    
    if (currentUser.role !== 'admin') {
        const adminActions = document.getElementById('adminActions');
        if (adminActions) adminActions.style.display = 'none';
    }
    
    return true;
}

function getAuthHeader() {
    return {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    };
}

// ============================================
// VOICE SEARCH
// ============================================

function initVoiceSearch() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.style.display = 'none';
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = function() {
        isListening = true;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) {
            micBtn.classList.add('listening');
            micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        }
        showToast('Listening... Please speak now', 'info');
    };
    
    recognition.onend = function() {
        isListening = false;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) {
            micBtn.classList.remove('listening');
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    };
    
    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = transcript;
            handleSearch();
            showToast(`Searching for: "${transcript}"`, 'success');
        }
    };
    
    recognition.onerror = function(event) {
        let errorMessage = 'Voice recognition failed. Please try again.';
        if (event.error === 'no-speech') errorMessage = 'No speech detected. Please try again.';
        else if (event.error === 'audio-capture') errorMessage = 'No microphone found. Please check your microphone.';
        else if (event.error === 'not-allowed') errorMessage = 'Microphone access denied. Please allow microphone access.';
        showToast(errorMessage, 'error');
        const micBtn = document.getElementById('micBtn');
        if (micBtn) {
            micBtn.classList.remove('listening');
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
        isListening = false;
    };
}

function startVoiceSearch() {
    if (recognition && !isListening) {
        try {
            recognition.start();
        } catch (e) {
            console.log('Recognition already started');
        }
    } else if (recognition && isListening) {
        recognition.stop();
    } else {
        showToast('Voice search is not supported in your browser', 'error');
    }
}

// ============================================
// API CALLS
// ============================================

async function apiCall(endpoint, options = {}) {
    if (!API_URL) {
        await initApiUrl();
    }
    
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader(),
                ...options.headers
            },
            ...options
        });
        
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
            throw new Error('Session expired. Please login again.');
        }
        
        const data = await response.json();
        if (!data.success) throw new Error(data.message);
        return data;
    } catch (error) {
        console.error('API Error:', error);
        showToast(error.message, 'error');
        throw error;
    }
}

async function getAllCustomers() {
    let url = '/customers';
    const params = [];
    if (currentSearchTerm) params.push(`search=${encodeURIComponent(currentSearchTerm)}`);
    if (currentFilter !== 'all') params.push(`filter=${currentFilter}`);
    if (params.length) url += `?${params.join('&')}`;
    
    const result = await apiCall(url);
    return result.data || [];
}

async function getCustomerById(id) {
    const result = await apiCall(`/customers/${id}`);
    return result.data;
}

async function addCustomer(customer) {
    const result = await apiCall('/customers', {
        method: 'POST',
        body: JSON.stringify(customer)
    });
    return result.id;
}

async function updateCustomer(id, customer) {
    await apiCall(`/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(customer)
    });
}

async function deleteCustomer(id) {
    await apiCall(`/customers/${id}`, {
        method: 'DELETE'
    });
}

async function getStats() {
    const result = await apiCall('/stats');
    return result.data;
}

async function getTodayReminders() {
    const result = await apiCall('/reminders/today');
    return result.data || [];
}

async function getTodayCollections() {
    const result = await apiCall('/today-collections');
    return { data: result.data || [], total: result.total || 0 };
}

async function receivePayment(customerId, amount, paymentDate, paymentMethod, referenceNo, notes) {
    const result = await apiCall('/payments', {
        method: 'POST',
        body: JSON.stringify({ customerId, amount, paymentDate, paymentMethod, referenceNo, notes })
    });
    return result;
}

async function markReminderSent(reminderId) {
    await apiCall(`/reminders/${reminderId}/sent`, { method: 'PUT' });
}

async function exportData(filtered = false) {
    try {
        let url = '/export';
        if (filtered) {
            const params = [];
            if (currentSearchTerm) params.push(`search=${encodeURIComponent(currentSearchTerm)}`);
            if (currentFilter !== 'all') params.push(`filter=${currentFilter}`);
            if (params.length) url += `?${params.join('&')}`;
        }
        
        const response = await fetch(`${API_URL}${url}`, { headers: getAuthHeader() });
        const result = await response.json();
        
        if (!result.success || !result.data.length) {
            showToast('No data available to export', 'error');
            return;
        }
        
        const customers = result.data;
        const headers = ['ID', 'Name', 'CNIC', 'Phone', 'Email', 'Entry Date', 'C/O', 'Address', 'Colony', 'City', 'Country', 'Due Amount', 'Paid Amount', 'Remaining Due', 'Reference Name', 'Reference Contact', 'Reason'];
        
        const csvRows = [headers.join(',')];
        
        for (const c of customers) {
            const row = headers.map(header => {
                let value = '';
                switch(header) {
                    case 'ID': value = c.id; break;
                    case 'Name': value = c.name; break;
                    case 'CNIC': value = c.cnic || ''; break;
                    case 'Phone': value = c.phone || ''; break;
                    case 'Email': value = c.email || ''; break;
                    case 'Entry Date': value = c.entry_date || ''; break;
                    case 'C/O': value = c.co || ''; break;
                    case 'Address': value = c.address || ''; break;
                    case 'Colony': value = c.colony || ''; break;
                    case 'City': value = c.city || ''; break;
                    case 'Country': value = c.country || ''; break;
                    case 'Due Amount': value = c.due_amount; break;
                    case 'Paid Amount': value = c.total_paid || 0; break;
                    case 'Remaining Due': value = c.remaining_due || 0; break;
                    case 'Reference Name': value = c.reference_name || ''; break;
                    case 'Reference Contact': value = c.reference_contact || ''; break;
                    case 'Reason': value = c.reason || ''; break;
                }
                if (typeof value === 'string') {
                    value = value.replace(/"/g, '""');
                    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                        value = `"${value}"`;
                    }
                }
                return value;
            });
            csvRows.push(row.join(','));
        }
        
        const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url_blob = URL.createObjectURL(blob);
        link.href = url_blob;
        const today = new Date().toISOString().split('T')[0];
        link.setAttribute('download', `customers_${filtered ? 'filtered_' : 'all_'}_${today}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url_blob);
        
        showToast(`Successfully exported ${customers.length} customers!`, 'success');
    } catch (error) {
        showToast('Export failed: ' + error.message, 'error');
    }
}

async function importCustomers(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const content = e.target.result;
            const lines = content.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            
            let successCount = 0;
            let errorCount = 0;
            
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                
                const values = lines[i].split(',');
                const customer = {};
                
                headers.forEach((header, index) => {
                    if (values[index]) customer[header] = values[index].trim();
                });
                
                if (customer.name && customer.city) {
                    try {
                        await addCustomer({
                            name: customer.name,
                            phone: customer.phone || '',
                            cnic: customer.cnic || '',
                            city: customer.city,
                            address: customer.address || '',
                            dueAmount: parseFloat(customer.due_amount) || 0,
                            referenceName: customer.reference_name || '',
                            entryDate: new Date().toISOString().split('T')[0],
                            country: 'Pakistan',
                            reason: '',
                            photoDataUrl: null,
                            billPhotoDataUrl: null,
                            promiseDate: '',
                            referenceContact: '',
                            co: '',
                            colony: '',
                            email: ''
                        });
                        successCount++;
                    } catch (error) {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            }
            resolve({ successCount, errorCount });
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// ============================================
// UI RENDERING
// ============================================

function formatPKR(amount) {
    const num = parseFloat(amount || 0);
    return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: 'PKR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
}

function formatDate(dateString) {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-PK');
    } catch {
        return dateString;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

async function renderCustomers() {
    try {
        showLoading(true);
        const customers = await getAllCustomers();
        const stats = await getStats();
        
        document.getElementById('totalCustomers').textContent = stats.totalCustomers || 0;
        document.getElementById('totalAmount').textContent = formatPKR(stats.totalAmount || 0);
        document.getElementById('totalDue').textContent = formatPKR(stats.totalDue || 0);
        
        const tbody = document.getElementById('customersList');
        const searchTerm = document.getElementById('searchInput').value.trim();
        
        if (!customers.length) {
            if (searchTerm) {
                tbody.innerHTML = `<tr><td colspan="8" class="loading-cell"><i class="fas fa-search"></i> No customers found matching "${escapeHtml(searchTerm)}"</td></tr>`;
            } else {
                tbody.innerHTML = '<tr><td colspan="8" class="loading-cell"><i class="fas fa-inbox"></i> No customers found</td></tr>';
            }
            return;
        }
        
        const isAdmin = currentUser && currentUser.role === 'admin';
        
        tbody.innerHTML = customers.map(customer => `
            <tr class="${(parseFloat(customer.remaining_due) || 0) > 0 ? 'due-row' : ''}" data-id="${customer.id}">
                <td onclick="viewCustomer(${customer.id})">
                    ${customer.photo_data ? `<img src="${customer.photo_data}" class="photo-thumb" alt="Photo" onclick="event.stopPropagation(); openZoomModal('${customer.photo_data}')">` : `<i class="fas fa-user-circle no-photo-icon"></i>`}
                </td>
                <td onclick="viewCustomer(${customer.id})">#${customer.id}</td>
                <td onclick="viewCustomer(${customer.id})"><strong>${escapeHtml(customer.name || '—')}</strong></td>
                <td onclick="viewCustomer(${customer.id})">${escapeHtml(customer.cnic || '—')}</td>
                <td onclick="viewCustomer(${customer.id})">${escapeHtml(customer.city || '—')}</td>
                <td onclick="viewCustomer(${customer.id})">${escapeHtml(customer.reference_name || '—')}</td>
                <td onclick="viewCustomer(${customer.id})" class="${(parseFloat(customer.remaining_due) || 0) > 0 ? 'due-amount-value' : ''}">
                    ${formatPKR(customer.remaining_due || 0)}
                </td>
                <td class="action-buttons">
                    <button class="action-btn receive-action" onclick="event.stopPropagation(); openPaymentModal(${customer.id}, '${escapeHtml(customer.name)}', ${customer.remaining_due || 0})" title="Receive Payment">
                        <i class="fas fa-money-bill-wave"></i>
                    </button>
                    ${isAdmin ? `
                        <button class="action-btn edit-action" onclick="event.stopPropagation(); editCustomer(${customer.id})" title="Edit"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete-action" onclick="event.stopPropagation(); confirmDeleteCustomer(${customer.id}, '${escapeHtml(customer.name)}')" title="Delete"><i class="fas fa-trash"></i></button>
                    ` : ''}
                </td>
              </tr>
        `).join('');
        
        if (searchTerm && customers.length > 0 && customers.length !== stats.totalCustomers) {
            showToast(`Found ${customers.length} customer(s) matching "${escapeHtml(searchTerm)}"`, 'info');
        }
    } catch (error) {
        console.error(error);
        showToast('Failed to load customers', 'error');
    } finally {
        showLoading(false);
    }
}

function showLoading(show) {
    const tbody = document.getElementById('customersList');
    if (show && (!tbody.children.length || tbody.children[0].textContent.includes('No customers'))) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-cell"><i class="fas fa-spinner fa-spin"></i> Loading customers...</td></tr>';
    }
}

// ============================================
// SEARCH FUNCTION
// ============================================

function handleSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    
    const searchInput = document.getElementById('searchInput');
    const newSearchTerm = searchInput.value.trim();
    
    if (newSearchTerm === currentSearchTerm && currentSearchTerm !== '') return;
    
    const tbody = document.getElementById('customersList');
    tbody.innerHTML = '<tr><td colspan="8" class="loading-cell"><i class="fas fa-spinner fa-spin"></i> Searching...</td></tr>';
    
    searchTimeout = setTimeout(async () => {
        currentSearchTerm = newSearchTerm;
        await renderCustomers();
    }, 300);
}

function setupSearchEvents() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', handleSearch);
    
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (searchTimeout) clearTimeout(searchTimeout);
            currentSearchTerm = searchInput.value.trim();
            renderCustomers();
        }
    });
    
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            currentSearchTerm = '';
            renderCustomers();
            showToast('Search cleared', 'info');
        }
    });
}

function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) btn.classList.add('active');
    });
    renderCustomers();
}

// ============================================
// REMINDERS
// ============================================

async function loadReminders() {
    try {
        const reminders = await getTodayReminders();
        const reminderList = document.getElementById('reminderList');
        const reminderCountSpan = document.getElementById('reminderCount');
        
        if (reminders && reminders.length > 0) {
            reminderCountSpan.textContent = reminders.length;
            reminderList.innerHTML = reminders.map(r => `
                <div class="reminder-item ${r.is_sent ? 'sent' : ''}">
                    <div class="reminder-icon"><i class="fas fa-bell"></i></div>
                    <div class="reminder-info">
                        <div class="reminder-customer">${escapeHtml(r.customer_name)}</div>
                        <div class="reminder-message">${escapeHtml(r.message || 'Payment reminder')}</div>
                        <div class="reminder-due">Due: ${formatPKR(r.remaining_due)}</div>
                        <div class="reminder-phone"><i class="fas fa-phone"></i> ${r.phone || 'No phone'}</div>
                    </div>
                    <button class="reminder-action-btn" onclick="markReminderAsSent(${r.id})"><i class="fas fa-check"></i> Mark Done</button>
                </div>
            `).join('');
        } else {
            reminderCountSpan.textContent = '0';
            reminderList.innerHTML = '<div class="collection-empty"><i class="fas fa-bell-slash"></i> No pending reminders</div>';
        }
    } catch (error) {
        console.error('Error loading reminders:', error);
    }
}

window.markReminderAsSent = async function(reminderId) {
    try {
        await markReminderSent(reminderId);
        showToast('Reminder marked as completed', 'success');
        await loadReminders();
        await renderCustomers();
    } catch (error) {
        showToast('Failed to update reminder: ' + error.message, 'error');
    }
};

// ============================================
// COLLECTIONS
// ============================================

async function loadTodayCollections() {
    try {
        const { data, total } = await getTodayCollections();
        const collectionList = document.getElementById('todayCollectionList');
        const collectionTotal = document.getElementById('todayCollectionTotal');
        
        const today = new Date().toISOString().split('T')[0];
        const paymentDateInput = document.getElementById('paymentDate');
        if (paymentDateInput && !paymentDateInput.value) paymentDateInput.value = today;
        
        collectionTotal.textContent = formatPKR(total);
        
        if (data && data.length > 0) {
            collectionList.innerHTML = data.map(p => `
                <div class="collection-item">
                    <div class="collection-info">
                        <span class="collection-customer">${escapeHtml(p.customer_name)}</span>
                        <span class="collection-amount">${formatPKR(p.amount)}</span>
                    </div>
                    <div class="collection-details">
                        <span><i class="fas fa-money-bill"></i> ${p.payment_method}</span>
                        <span><i class="fas fa-user"></i> ${p.received_by_name || 'System'}</span>
                    </div>
                </div>
            `).join('');
        } else {
            collectionList.innerHTML = '<div class="collection-empty"><i class="fas fa-wallet"></i> No collections today</div>';
        }
    } catch (error) {
        console.error('Error loading collections:', error);
    }
}

// ============================================
// PAYMENT MODAL
// ============================================

let currentPaymentCustomerId = null;
let currentPaymentCustomerName = null;
let currentPaymentDue = 0;

window.openPaymentModal = function(customerId, customerName, dueAmount) {
    currentPaymentCustomerId = customerId;
    currentPaymentCustomerName = customerName;
    currentPaymentDue = dueAmount;
    
    document.getElementById('paymentCustomerName').textContent = customerName;
    document.getElementById('paymentDueAmount').textContent = formatPKR(dueAmount);
    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentAmount').max = dueAmount;
    document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('paymentMethod').value = 'cash';
    document.getElementById('paymentReference').value = '';
    document.getElementById('paymentNotes').value = '';
    
    document.getElementById('paymentModal').style.display = 'flex';
};

async function submitPayment() {
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const paymentDate = document.getElementById('paymentDate').value;
    const paymentMethod = document.getElementById('paymentMethod').value;
    const referenceNo = document.getElementById('paymentReference').value;
    const notes = document.getElementById('paymentNotes').value;
    
    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }
    if (amount > currentPaymentDue) {
        showToast(`Amount cannot exceed remaining due of ${formatPKR(currentPaymentDue)}`, 'error');
        return;
    }
    
    try {
        await receivePayment(currentPaymentCustomerId, amount, paymentDate, paymentMethod, referenceNo, notes);
        showToast(`Successfully received ${formatPKR(amount)} from ${currentPaymentCustomerName}`, 'success');
        closePaymentModal();
        await renderCustomers();
        await loadTodayCollections();
        await loadReminders();
    } catch (error) {
        showToast('Payment failed: ' + error.message, 'error');
    }
}

function closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
    currentPaymentCustomerId = null;
}

// ============================================
// VIEW CUSTOMER
// ============================================

window.viewCustomer = async function(id) {
    try {
        const customer = await getCustomerById(id);
        if (!customer) return;
        currentViewCustomer = customer;
        
        document.getElementById('viewName').textContent = customer.name || '—';
        document.getElementById('viewIdBadge').textContent = `ID #${customer.id}`;
        document.getElementById('viewCnic').textContent = customer.cnic || '—';
        document.getElementById('viewPhone').textContent = customer.phone || '—';
        document.getElementById('viewEmail').textContent = customer.email || '—';
        document.getElementById('viewCo').textContent = customer.co || '—';
        document.getElementById('viewAddress').textContent = customer.address || '—';
        document.getElementById('viewColony').textContent = `${customer.colony || '—'} / ${customer.city || '—'}`;
        document.getElementById('viewReference').textContent = customer.reference_name || '—';
        document.getElementById('viewEntryDate').textContent = formatDate(customer.entry_date);
        document.getElementById('viewDue').textContent = formatPKR(customer.due_amount);
        document.getElementById('viewRemainingDue').textContent = formatPKR(customer.remaining_due || 0);
        document.getElementById('viewTotalPaid').textContent = formatPKR(customer.total_paid || 0);
        
        const viewImg = document.getElementById('viewPhotoImg');
        const viewPlaceholder = document.getElementById('viewPhotoPlaceholder');
        if (customer.photo_data) {
            viewImg.src = customer.photo_data;
            viewImg.style.display = 'block';
            viewPlaceholder.style.display = 'none';
        } else {
            viewImg.style.display = 'none';
            viewPlaceholder.style.display = 'flex';
        }
        
        const viewBillImg = document.getElementById('viewBillPhotoImg');
        const viewBillPlaceholder = document.getElementById('viewBillPhotoPlaceholder');
        if (customer.bill_photo_data) {
            viewBillImg.src = customer.bill_photo_data;
            viewBillImg.style.display = 'block';
            viewBillPlaceholder.style.display = 'none';
        } else {
            viewBillImg.style.display = 'none';
            viewBillPlaceholder.style.display = 'flex';
        }
        
        document.getElementById('viewModal').style.display = 'flex';
    } catch (error) {
        showToast('Error loading customer details', 'error');
    }
};

// ============================================
// ADD/EDIT CUSTOMER
// ============================================

function openAddModal() {
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-user-plus"></i> Add Customer';
    document.getElementById('customerId').value = '';
    document.getElementById('customerForm').reset();
    document.getElementById('country').value = 'Pakistan';
    document.getElementById('dueAmount').value = '0';
    document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
    
    currentPhotoDataUrl = null;
    currentBillPhotoDataUrl = null;
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('photoPlaceholder').style.display = 'flex';
    document.getElementById('billPhotoPreview').style.display = 'none';
    document.getElementById('billPhotoPlaceholder').style.display = 'flex';
    if (document.getElementById('photoInput')) document.getElementById('photoInput').value = '';
    if (document.getElementById('billPhotoInput')) document.getElementById('billPhotoInput').value = '';
    
    document.getElementById('customerModal').style.display = 'flex';
}

window.editCustomer = async function(id) {
    if (currentUser && currentUser.role !== 'admin') {
        showToast('Only admin can edit customers', 'error');
        return;
    }
    
    try {
        const customer = await getCustomerById(id);
        if (!customer) return;
        
        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-user-edit"></i> Edit Customer #' + customer.id;
        document.getElementById('customerId').value = customer.id;
        document.getElementById('name').value = customer.name || '';
        document.getElementById('cnic').value = customer.cnic || '';
        document.getElementById('phone').value = customer.phone || '';
        document.getElementById('email').value = customer.email || '';
        document.getElementById('entryDate').value = customer.entry_date || '';
        document.getElementById('co').value = customer.co || '';
        document.getElementById('address').value = customer.address || '';
        document.getElementById('colony').value = customer.colony || '';
        document.getElementById('city').value = customer.city || '';
        document.getElementById('country').value = customer.country || 'Pakistan';
        document.getElementById('dueAmount').value = customer.due_amount || 0;
        document.getElementById('reason').value = customer.reason || '';
        document.getElementById('promiseDate').value = customer.promise_date || '';
        document.getElementById('referenceName').value = customer.reference_name || '';
        document.getElementById('referenceContact').value = customer.reference_contact || '';
        
        currentPhotoDataUrl = customer.photo_data || null;
        if (currentPhotoDataUrl) {
            document.getElementById('photoPreview').src = currentPhotoDataUrl;
            document.getElementById('photoPreview').style.display = 'block';
            document.getElementById('photoPlaceholder').style.display = 'none';
        } else {
            document.getElementById('photoPreview').style.display = 'none';
            document.getElementById('photoPlaceholder').style.display = 'flex';
        }
        
        currentBillPhotoDataUrl = customer.bill_photo_data || null;
        if (currentBillPhotoDataUrl) {
            document.getElementById('billPhotoPreview').src = currentBillPhotoDataUrl;
            document.getElementById('billPhotoPreview').style.display = 'block';
            document.getElementById('billPhotoPlaceholder').style.display = 'none';
        } else {
            document.getElementById('billPhotoPreview').style.display = 'none';
            document.getElementById('billPhotoPlaceholder').style.display = 'flex';
        }
        
        document.getElementById('customerModal').style.display = 'flex';
    } catch (error) {
        showToast('Error loading customer data', 'error');
    }
};

function setupPhotoUpload() {
    const photoInput = document.getElementById('photoInput');
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    
    if (photoInput) {
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                showToast('Photo size must be less than 2MB', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                currentPhotoDataUrl = ev.target.result;
                document.getElementById('photoPreview').src = currentPhotoDataUrl;
                document.getElementById('photoPreview').style.display = 'block';
                document.getElementById('photoPlaceholder').style.display = 'none';
            };
            reader.readAsDataURL(file);
        });
    }
    
    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', () => {
            currentPhotoDataUrl = null;
            document.getElementById('photoPreview').style.display = 'none';
            document.getElementById('photoPlaceholder').style.display = 'flex';
            document.getElementById('photoPreview').src = '';
            if (photoInput) photoInput.value = '';
            showToast('Customer photo removed', 'success');
        });
    }
    
    const billPhotoInput = document.getElementById('billPhotoInput');
    const removeBillPhotoBtn = document.getElementById('removeBillPhotoBtn');
    
    if (billPhotoInput) {
        billPhotoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                showToast('Bill photo size must be less than 2MB', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                currentBillPhotoDataUrl = ev.target.result;
                document.getElementById('billPhotoPreview').src = currentBillPhotoDataUrl;
                document.getElementById('billPhotoPreview').style.display = 'block';
                document.getElementById('billPhotoPlaceholder').style.display = 'none';
            };
            reader.readAsDataURL(file);
        });
    }
    
    if (removeBillPhotoBtn) {
        removeBillPhotoBtn.addEventListener('click', () => {
            currentBillPhotoDataUrl = null;
            document.getElementById('billPhotoPreview').style.display = 'none';
            document.getElementById('billPhotoPlaceholder').style.display = 'flex';
            document.getElementById('billPhotoPreview').src = '';
            if (billPhotoInput) billPhotoInput.value = '';
            showToast('Bill photo removed', 'success');
        });
    }
}

async function saveCustomer(event) {
    event.preventDefault();
    
    const customerId = document.getElementById('customerId').value;
    const customer = {
        name: document.getElementById('name').value.trim(),
        cnic: document.getElementById('cnic').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        email: document.getElementById('email').value.trim(),
        entryDate: document.getElementById('entryDate').value,
        co: document.getElementById('co').value.trim(),
        address: document.getElementById('address').value.trim(),
        colony: document.getElementById('colony').value.trim(),
        city: document.getElementById('city').value.trim(),
        country: document.getElementById('country').value.trim(),
        dueAmount: parseInt(document.getElementById('dueAmount').value) || 0,
        reason: document.getElementById('reason').value.trim(),
        photoDataUrl: currentPhotoDataUrl,
        billPhotoDataUrl: currentBillPhotoDataUrl,
        promiseDate: document.getElementById('promiseDate').value,
        referenceName: document.getElementById('referenceName').value.trim(),
        referenceContact: document.getElementById('referenceContact').value.trim()
    };
    
    if (!customer.name) { showToast('Please enter customer name', 'error'); return; }
    if (!customer.city) { showToast('Please enter city', 'error'); return; }
    if (!customer.entryDate) { showToast('Please enter entry date', 'error'); return; }
    
    try {
        if (customerId) {
            if (currentUser.role !== 'admin') {
                showToast('Only admin can edit customers', 'error');
                return;
            }
            await updateCustomer(customerId, customer);
            showToast('Customer updated successfully!', 'success');
        } else {
            await addCustomer(customer);
            showToast('Customer added successfully!', 'success');
        }
        
        closeAllModals();
        await renderCustomers();
        await loadReminders();
        await loadTodayCollections();
    } catch (error) {
        showToast('Error saving customer: ' + error.message, 'error');
    }
}

// ============================================
// DELETE CUSTOMER
// ============================================

window.confirmDeleteCustomer = function(id, name) {
    if (currentUser && currentUser.role !== 'admin') {
        showToast('Only admin can delete customers', 'error');
        return;
    }
    currentDeleteId = id;
    document.getElementById('deleteCustomerName').textContent = name;
    document.getElementById('deleteModal').style.display = 'flex';
};

async function executeDelete() {
    if (currentDeleteId) {
        try {
            await deleteCustomer(currentDeleteId);
            showToast('Customer deleted successfully!', 'success');
            await renderCustomers();
            await loadReminders();
            await loadTodayCollections();
        } catch (error) {
            showToast('Error deleting customer', 'error');
        }
        currentDeleteId = null;
        document.getElementById('deleteModal').style.display = 'none';
    }
}

// ============================================
// ZOOM FUNCTIONS
// ============================================

function openZoomModal(imageSrc) {
    if (!imageSrc) return;
    currentZoomScale = 1;
    const zoomImg = document.getElementById('zoomImage');
    zoomImg.src = imageSrc;
    zoomImg.style.transform = `scale(${currentZoomScale})`;
    document.getElementById('zoomModal').style.display = 'flex';
}

function closeZoomModal() {
    document.getElementById('zoomModal').style.display = 'none';
}

function zoomIn() {
    currentZoomScale = Math.min(currentZoomScale + 0.2, 3);
    document.getElementById('zoomImage').style.transform = `scale(${currentZoomScale})`;
}

function zoomOut() {
    currentZoomScale = Math.max(currentZoomScale - 0.2, 0.5);
    document.getElementById('zoomImage').style.transform = `scale(${currentZoomScale})`;
}

function resetZoom() {
    currentZoomScale = 1;
    document.getElementById('zoomImage').style.transform = `scale(1)`;
}

// ============================================
// MODAL HELPERS
// ============================================

function closeAllModals() {
    document.getElementById('customerModal').style.display = 'none';
    document.getElementById('deleteModal').style.display = 'none';
    document.getElementById('viewModal').style.display = 'none';
    document.getElementById('paymentModal').style.display = 'none';
    document.getElementById('zoomModal').style.display = 'none';
    document.getElementById('importModal').style.display = 'none';
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.backgroundColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8';
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// ============================================
// AUTO REFRESH
// ============================================

function startAutoRefresh() {
    setInterval(() => {
        renderCustomers();
        loadTodayCollections();
        loadReminders();
    }, 30000);
}

// ============================================
// INITIALIZE APP
// ============================================

async function init() {
    // First, find the backend server
    await initApiUrl();
    
    if (!checkAuth()) return;
    
    const userInfo = document.getElementById('userInfo');
    if (userInfo && currentUser) {
        userInfo.innerHTML = `
            <i class="fas fa-user-circle"></i>
            <span>${escapeHtml(currentUser.fullName)}</span>
            <span class="role-badge ${currentUser.role}">${currentUser.role}</span>
            <button onclick="logout()" class="logout-btn"><i class="fas fa-sign-out-alt"></i></button>
        `;
    }
    
    await renderCustomers();
    await loadTodayCollections();
    await loadReminders();
    setupPhotoUpload();
    startAutoRefresh();
    initVoiceSearch();
    setupSearchEvents();
    
    document.getElementById('showAddBtn')?.addEventListener('click', openAddModal);
    document.getElementById('closeModalBtn')?.addEventListener('click', closeAllModals);
    document.getElementById('cancelFormBtn')?.addEventListener('click', closeAllModals);
    document.getElementById('customerForm')?.addEventListener('submit', saveCustomer);
    document.getElementById('micBtn')?.addEventListener('click', startVoiceSearch);
    document.getElementById('exportAllBtn')?.addEventListener('click', () => exportData(false));
    document.getElementById('exportFilteredBtn')?.addEventListener('click', () => exportData(true));
    document.getElementById('importBtn')?.addEventListener('click', () => {
        document.getElementById('importModal').style.display = 'flex';
    });
    document.getElementById('closeImportBtn')?.addEventListener('click', () => {
        document.getElementById('importModal').style.display = 'none';
    });
    document.getElementById('cancelImportBtn')?.addEventListener('click', () => {
        document.getElementById('importModal').style.display = 'none';
    });
    document.getElementById('confirmImportBtn')?.addEventListener('click', async () => {
        const fileInput = document.getElementById('importFile');
        const file = fileInput.files[0];
        if (!file) {
            showToast('Please select a file to import', 'error');
            return;
        }
        showToast('Importing customers...', 'info');
        const { successCount, errorCount } = await importCustomers(file);
        showToast(`Successfully imported ${successCount} customers. Failed: ${errorCount}`, successCount > 0 ? 'success' : 'error');
        document.getElementById('importModal').style.display = 'none';
        fileInput.value = '';
        await renderCustomers();
        await loadReminders();
    });
    document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => {
        document.getElementById('deleteModal').style.display = 'none';
    });
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', executeDelete);
    document.getElementById('closeViewBtn')?.addEventListener('click', closeAllModals);
    document.getElementById('viewEditBtn')?.addEventListener('click', () => {
        if (currentViewCustomer) {
            closeAllModals();
            editCustomer(currentViewCustomer.id);
        }
    });
    document.getElementById('closePaymentBtn')?.addEventListener('click', closePaymentModal);
    document.getElementById('cancelPaymentBtn')?.addEventListener('click', closePaymentModal);
    document.getElementById('submitPaymentBtn')?.addEventListener('click', submitPayment);
    document.querySelector('.delete-modal-overlay')?.addEventListener('click', () => {
        document.getElementById('deleteModal').style.display = 'none';
    });
    document.querySelector('.zoom-modal-overlay')?.addEventListener('click', closeZoomModal);
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllModals();
    });
}

// Make functions global
window.openZoomModal = openZoomModal;
window.closeZoomModal = closeZoomModal;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.resetZoom = resetZoom;
window.viewCustomer = viewCustomer;
window.editCustomer = editCustomer;
window.confirmDeleteCustomer = confirmDeleteCustomer;
window.openPaymentModal = openPaymentModal;
window.markReminderAsSent = markReminderAsSent;

// Start the app
init();