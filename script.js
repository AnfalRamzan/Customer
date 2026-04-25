// ============================================
// DATABASE SETUP (IndexedDB - No Hardcoded Data)
// ============================================

let db = null;
let currentFilter = 'all';
let currentSearchTerm = '';
let currentDeleteId = null;
let currentViewCustomer = null;

// Initialize Database
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('CustomerDueDB_PK', 2);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('customers')) {
                const customerStore = db.createObjectStore('customers', { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
                customerStore.createIndex('name', 'name');
                customerStore.createIndex('cnic', 'cnic');
                customerStore.createIndex('city', 'city');
                customerStore.createIndex('dueAmount', 'dueAmount');
                customerStore.createIndex('createdAt', 'createdAt');
            }
        };
    });
}

// ============================================
// CRUD OPERATIONS
// ============================================

async function getAllCustomers() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject('Database not initialized');
            return;
        }
        const transaction = db.transaction(['customers'], 'readonly');
        const store = transaction.objectStore('customers');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function addCustomer(customer) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['customers'], 'readwrite');
        const store = transaction.objectStore('customers');
        
        customer.createdAt = new Date().toISOString();
        customer.updatedAt = new Date().toISOString();
        
        const request = store.add(customer);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateCustomer(customer) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['customers'], 'readwrite');
        const store = transaction.objectStore('customers');
        
        customer.updatedAt = new Date().toISOString();
        
        const request = store.put(customer);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteCustomer(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['customers'], 'readwrite');
        const store = transaction.objectStore('customers');
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getCustomerById(id) {
    const customers = await getAllCustomers();
    return customers.find(c => c.id === id);
}

// ============================================
// UI RENDERING - Pakistani Rupees Format
// ============================================

function formatPKR(amount) {
    const num = parseInt(amount || 0);
    return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: 'PKR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num).replace('PKR', 'Rs');
}

function formatDate(dateString) {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-PK', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
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
    let customers = await getAllCustomers();
    
    // Sort by ID descending (newest first)
    customers.sort((a, b) => b.id - a.id);
    
    // Apply search
    if (currentSearchTerm) {
        const term = currentSearchTerm.toLowerCase();
        customers = customers.filter(c => 
            (c.id && c.id.toString().includes(term)) ||
            (c.name && c.name.toLowerCase().includes(term)) ||
            (c.cnic && c.cnic.toLowerCase().includes(term)) ||
            (c.city && c.city.toLowerCase().includes(term)) ||
            (c.address && c.address.toLowerCase().includes(term))
        );
    }
    
    // Apply filter
    if (currentFilter === 'due') {
        customers = customers.filter(c => (c.dueAmount || 0) > 0);
    } else if (currentFilter === 'cleared') {
        customers = customers.filter(c => (c.dueAmount || 0) === 0);
    }
    
    // Update stats
    const totalCustomers = customers.length;
    const totalAmount = customers.reduce((sum, c) => sum + (c.dueAmount || 0), 0);
    const totalDue = customers.reduce((sum, c) => sum + (c.dueAmount || 0), 0);
    
    document.getElementById('totalCustomers').textContent = totalCustomers;
    document.getElementById('totalAmount').textContent = formatPKR(totalAmount);
    document.getElementById('totalDue').textContent = formatPKR(totalDue);
    
    // Render table
    const tbody = document.getElementById('customersList');
    
    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell"><i class="fas fa-inbox"></i> No customers found</td></tr>';
        return;
    }
    
    tbody.innerHTML = customers.map(customer => `
        <tr class="${(customer.dueAmount || 0) > 0 ? 'due-row' : ''}" data-id="${customer.id}">
            <td class="customer-id-cell" onclick="viewCustomer(${customer.id})">#${customer.id}</td>
            <td onclick="viewCustomer(${customer.id})"><strong>${escapeHtml(customer.name || '—')}</strong></td>
            <td onclick="viewCustomer(${customer.id})">${escapeHtml(customer.cnic || '—')}</td>
            <td onclick="viewCustomer(${customer.id})">${escapeHtml(customer.city || '—')}</td>
            <td onclick="viewCustomer(${customer.id})" class="${(customer.dueAmount || 0) > 0 ? 'due-amount-value' : ''}">${formatPKR(customer.dueAmount || 0)}</td>
            <td class="action-buttons">
                <button class="action-btn edit-action" onclick="event.stopPropagation(); editCustomer(${customer.id})" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete-action" onclick="event.stopPropagation(); confirmDeleteCustomer(${customer.id}, '${escapeHtml(customer.name)}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ============================================
// VIEW CUSTOMER
// ============================================

window.viewCustomer = async function(id) {
    const customer = await getCustomerById(id);
    if (!customer) return;
    
    currentViewCustomer = customer;
    
    document.getElementById('viewName').textContent = customer.name || '—';
    document.getElementById('viewIdBadge').textContent = `ID #${customer.id}`;
    document.getElementById('viewCnic').textContent = customer.cnic || '—';
    
    let contact = '';
    if (customer.contactNo) contact += customer.contactNo;
    if (customer.cellNo) {
        if (contact) contact += ' / ';
        contact += customer.cellNo;
    }
    document.getElementById('viewContact').textContent = contact || '—';
    
    document.getElementById('viewEmail').textContent = customer.email || '—';
    document.getElementById('viewCo').textContent = customer.co || '—';
    document.getElementById('viewAddress').textContent = customer.address || '—';
    document.getElementById('viewColony').textContent = `${customer.colony || '—'} / ${customer.city || '—'}`;
    document.getElementById('viewEntryDate').textContent = formatDate(customer.entryDate);
    document.getElementById('viewDue').textContent = formatPKR(customer.dueAmount);
    
    if (customer.reason && customer.reason.trim()) {
        document.getElementById('viewReason').textContent = customer.reason;
        document.getElementById('reasonRow').style.display = 'flex';
    } else {
        document.getElementById('reasonRow').style.display = 'none';
    }
    
    document.getElementById('viewModal').style.display = 'flex';
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
    document.getElementById('customerModal').style.display = 'flex';
}

window.editCustomer = async function(id) {
    const customer = await getCustomerById(id);
    if (!customer) return;
    
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-user-edit"></i> Edit Customer #' + customer.id;
    document.getElementById('customerId').value = customer.id;
    document.getElementById('name').value = customer.name || '';
    document.getElementById('cnic').value = customer.cnic || '';
    document.getElementById('contactNo').value = customer.contactNo || '';
    document.getElementById('cellNo').value = customer.cellNo || '';
    document.getElementById('email').value = customer.email || '';
    document.getElementById('entryDate').value = customer.entryDate || '';
    document.getElementById('co').value = customer.co || '';
    document.getElementById('address').value = customer.address || '';
    document.getElementById('colony').value = customer.colony || '';
    document.getElementById('city').value = customer.city || '';
    document.getElementById('country').value = customer.country || 'Pakistan';
    document.getElementById('dueAmount').value = customer.dueAmount || 0;
    document.getElementById('reason').value = customer.reason || '';
    
    document.getElementById('customerModal').style.display = 'flex';
};

async function saveCustomer(event) {
    event.preventDefault();
    
    const customerId = document.getElementById('customerId').value;
    
    const customer = {
        name: document.getElementById('name').value.trim(),
        cnic: document.getElementById('cnic').value.trim(),
        contactNo: document.getElementById('contactNo').value.trim(),
        cellNo: document.getElementById('cellNo').value.trim(),
        email: document.getElementById('email').value.trim(),
        entryDate: document.getElementById('entryDate').value,
        co: document.getElementById('co').value.trim(),
        address: document.getElementById('address').value.trim(),
        colony: document.getElementById('colony').value.trim(),
        city: document.getElementById('city').value.trim(),
        country: document.getElementById('country').value.trim(),
        dueAmount: parseInt(document.getElementById('dueAmount').value) || 0,
        reason: document.getElementById('reason').value.trim()
    };
    
    // Validation
    if (!customer.name) {
        showToast('Please enter customer name', 'error');
        return;
    }
    if (!customer.city) {
        showToast('Please enter city', 'error');
        return;
    }
    if (!customer.entryDate) {
        showToast('Please enter entry date', 'error');
        return;
    }
    
    try {
        if (customerId) {
            customer.id = parseInt(customerId);
            await updateCustomer(customer);
            showToast('Customer updated successfully!', 'success');
        } else {
            const newId = await addCustomer(customer);
            showToast(`Customer added successfully! ID #${newId}`, 'success');
        }
        
        closeAllModals();
        await renderCustomers();
    } catch (error) {
        console.error(error);
        showToast('Error saving customer: ' + error.message, 'error');
    }
}

// ============================================
// DELETE CUSTOMER
// ============================================

window.confirmDeleteCustomer = function(id, name) {
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
        } catch (error) {
            showToast('Error deleting customer', 'error');
        }
        currentDeleteId = null;
        document.getElementById('deleteModal').style.display = 'none';
    }
}

// ============================================
// EXPORT TO EXCEL (CSV with PKR format)
// ============================================

async function exportToExcel() {
    const customers = await getAllCustomers();
    
    if (customers.length === 0) {
        showToast('No customers to export', 'error');
        return;
    }
    
    // Sort by ID
    customers.sort((a, b) => a.id - b.id);
    
    const excelData = customers.map(c => ({
        'ID #': c.id,
        'Customer Name': c.name,
        'CNIC': c.cnic,
        'Contact No': c.contactNo,
        'Cell No': c.cellNo,
        'Email': c.email,
        'Entry Date': c.entryDate,
        'C/O': c.co,
        'Address': c.address,
        'Colony': c.colony,
        'City': c.city,
        'Country': c.country,
        'Due Amount (PKR)': c.dueAmount,
        'Reason': c.reason,
        'Created At': c.createdAt,
        'Updated At': c.updatedAt
    }));
    
    const totalDue = customers.reduce((sum, c) => sum + (c.dueAmount || 0), 0);
    
    excelData.push({
        'ID #': '', 'Customer Name': '══════ TOTAL ══════', 'CNIC': '', 'Contact No': '', 'Cell No': '',
        'Email': '', 'Entry Date': '', 'C/O': '', 'Address': '', 'Colony': '',
        'City': '', 'Country': '', 'Due Amount (PKR)': totalDue, 'Reason': '',
        'Created At': '', 'Updated At': ''
    });
    
    const headers = Object.keys(excelData[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of excelData) {
        const values = headers.map(header => {
            let value = row[header] !== undefined && row[header] !== null ? row[header] : '';
            if (typeof value === 'string') {
                value = value.replace(/"/g, '""');
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    value = `"${value}"`;
                }
            }
            return value;
        });
        csvRows.push(values.join(','));
    }
    
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `customers_pkr_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast(`✅ Exported ${customers.length} customers to Excel!`, 'success');
}

// ============================================
// SEARCH & FILTER
// ============================================

function handleSearch() {
    currentSearchTerm = document.getElementById('searchInput').value;
    renderCustomers();
}

function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) {
            btn.classList.add('active');
        }
    });
    renderCustomers();
}

// ============================================
// MODAL & UI HELPERS
// ============================================

function closeAllModals() {
    document.getElementById('customerModal').style.display = 'none';
    document.getElementById('deleteModal').style.display = 'none';
    document.getElementById('viewModal').style.display = 'none';
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.backgroundColor = type === 'success' ? '#28a745' : '#dc3545';
    toast.style.display = 'block';
    
    setTimeout(() => {
        toast.style.display = 'none';
    }, 2500);
}

// ============================================
// INITIALIZE APP
// ============================================

async function init() {
    await initDatabase();
    await renderCustomers();
    
    // Event Listeners
    document.getElementById('showAddBtn').addEventListener('click', openAddModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeAllModals);
    document.getElementById('cancelFormBtn').addEventListener('click', closeAllModals);
    document.getElementById('customerForm').addEventListener('submit', saveCustomer);
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    document.getElementById('exportBtn').addEventListener('click', exportToExcel);
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
        document.getElementById('deleteModal').style.display = 'none';
    });
    document.getElementById('confirmDeleteBtn').addEventListener('click', executeDelete);
    document.getElementById('closeViewBtn').addEventListener('click', closeAllModals);
    document.getElementById('viewEditBtn').addEventListener('click', () => {
        if (currentViewCustomer) {
            closeAllModals();
            editCustomer(currentViewCustomer.id);
        }
    });
    
    // Close modal on overlay click
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeAllModals);
    }
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });
    
    // Close modals with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllModals();
    });
}

// Start the app
init();