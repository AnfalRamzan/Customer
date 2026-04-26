const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { pool, testConnection } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'customer-due-secret-key-2024';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. Please login.' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
};

// Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const [users] = await pool.query('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
        
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const user = users[0];
        const isValid = await bcrypt.compare(password, user.password);
        
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, fullName: user.full_name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all customers
app.get('/api/customers', authenticateToken, async (req, res) => {
    try {
        const { search, filter, city } = req.query;
        let query = `SELECT c.*, COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = c.id), 0) as total_paid_amount FROM customers c`;
        let params = [];
        let conditions = [];
        
        if (search && search.trim()) {
            conditions.push('(c.name LIKE ? OR c.cnic LIKE ? OR c.city LIKE ? OR c.address LIKE ? OR c.phone LIKE ? OR CAST(c.id AS CHAR) LIKE ? OR c.reference_name LIKE ?)');
            const sp = `%${search}%`;
            params.push(sp, sp, sp, sp, sp, sp, sp);
        }
        
        if (city && city !== 'all') {
            conditions.push('c.city = ?');
            params.push(city);
        }
        
        if (filter === 'due') {
            conditions.push('c.remaining_due > 0');
        } else if (filter === 'cleared') {
            conditions.push('c.remaining_due = 0');
        }
        
        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        query += ' GROUP BY c.id ORDER BY c.id DESC';
        
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single customer
app.get('/api/customers/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Customer not found' });
        
        const [payments] = await pool.query('SELECT * FROM payments WHERE customer_id = ? ORDER BY payment_date DESC', [req.params.id]);
        
        res.json({ success: true, data: { ...rows[0], payments } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add customer (Admin only)
app.post('/api/customers', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { name, cnic, phone, email, entryDate, co, address, colony, city, country, dueAmount, reason, photoDataUrl, billPhotoDataUrl, promiseDate, referenceName, referenceContact } = req.body;
        
        const [result] = await pool.query(
            `INSERT INTO customers (name, cnic, phone, email, entry_date, co, address, colony, city, country, due_amount, remaining_due, reason, photo_data, bill_photo_data, promise_date, reference_name, reference_contact, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, cnic, phone, email, entryDate, co, address, colony, city, country || 'Pakistan', dueAmount || 0, dueAmount || 0, reason, photoDataUrl, billPhotoDataUrl, promiseDate, referenceName, referenceContact, dueAmount > 0 ? 'pending' : 'paid']
        );
        
        if (promiseDate) {
            await pool.query(`INSERT INTO reminders (customer_id, reminder_date, reminder_type, message) VALUES (?, ?, 'payment', ?)`, [result.insertId, promiseDate, `Payment reminder: ${name} - Due: PKR ${dueAmount}`]);
        }
        
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update customer (Admin only)
app.put('/api/customers/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { name, cnic, phone, email, entryDate, co, address, colony, city, country, dueAmount, reason, photoDataUrl, billPhotoDataUrl, promiseDate, referenceName, referenceContact } = req.body;
        
        await pool.query(
            `UPDATE customers SET name=?, cnic=?, phone=?, email=?, entry_date=?, co=?, address=?, colony=?, city=?, country=?, due_amount=?, reason=?, photo_data=?, bill_photo_data=?, promise_date=?, reference_name=?, reference_contact=? WHERE id=?`,
            [name, cnic, phone, email, entryDate, co, address, colony, city, country, dueAmount, reason, photoDataUrl, billPhotoDataUrl, promiseDate, referenceName, referenceContact, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete customer (Admin only)
app.delete('/api/customers/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM customers WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Receive payment
app.post('/api/payments', authenticateToken, async (req, res) => {
    try {
        const { customerId, amount, paymentDate, paymentMethod, referenceNo, notes } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid payment amount' });
        }
        
        const [customer] = await pool.query('SELECT name, due_amount, total_paid, remaining_due FROM customers WHERE id = ?', [customerId]);
        if (!customer.length) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        
        const newTotalPaid = (customer[0].total_paid || 0) + amount;
        const newRemainingDue = (customer[0].due_amount || 0) - newTotalPaid;
        
        await pool.query(`INSERT INTO payments (customer_id, amount, payment_date, payment_method, reference_no, notes, received_by) VALUES (?, ?, ?, ?, ?, ?, ?)`, [customerId, amount, paymentDate, paymentMethod, referenceNo, notes, req.user.id]);
        
        await pool.query(`UPDATE customers SET total_paid = ?, remaining_due = ?, last_payment_date = ?, status = CASE WHEN ? <= 0 THEN 'paid' WHEN ? > 0 AND ? < due_amount THEN 'partial' ELSE 'pending' END WHERE id = ?`, [newTotalPaid, newRemainingDue, paymentDate, newRemainingDue, newRemainingDue, newRemainingDue, customerId]);
        
        res.json({ success: true, newRemainingDue });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get today's collections
app.get('/api/today-collections', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const [rows] = await pool.query(`SELECT p.*, c.name as customer_name, c.city, u.full_name as received_by_name FROM payments p JOIN customers c ON p.customer_id = c.id LEFT JOIN users u ON p.received_by = u.id WHERE p.payment_date = ? ORDER BY p.created_at DESC`, [today]);
        const [total] = await pool.query('SELECT SUM(amount) as total FROM payments WHERE payment_date = ?', [today]);
        res.json({ success: true, data: rows, total: total[0].total || 0 });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get today's reminders
app.get('/api/reminders/today', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const [rows] = await pool.query(`SELECT r.*, c.name as customer_name, c.phone, c.remaining_due, c.due_amount FROM reminders r JOIN customers c ON r.customer_id = c.id WHERE r.reminder_date <= ? AND r.is_sent = FALSE AND c.remaining_due > 0 ORDER BY r.reminder_date ASC`, [today]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark reminder as sent
app.put('/api/reminders/:id/sent', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE reminders SET is_sent = TRUE, sent_at = NOW() WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get stats
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const [total] = await pool.query('SELECT COUNT(*) as count FROM customers');
        const [due] = await pool.query('SELECT SUM(remaining_due) as total FROM customers');
        const [todayCollection] = await pool.query('SELECT SUM(amount) as total FROM payments WHERE payment_date = CURDATE()');
        const [reminders] = await pool.query('SELECT COUNT(*) as count FROM reminders WHERE reminder_date <= CURDATE() AND is_sent = FALSE');
        const [cities] = await pool.query('SELECT DISTINCT city FROM customers WHERE city IS NOT NULL AND city != "" ORDER BY city');
        
        res.json({ success: true, data: { totalCustomers: total[0].count || 0, totalAmount: due[0].total || 0, totalDue: due[0].total || 0, todayCollection: todayCollection[0].total || 0, pendingReminders: reminders[0].count || 0, cities: cities.map(c => c.city) } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Export data
app.get('/api/export', authenticateToken, async (req, res) => {
    try {
        const { search, filter, city } = req.query;
        let query = `SELECT * FROM customers`;
        let params = [];
        let conditions = [];
        
        if (search && search.trim()) {
            conditions.push('(name LIKE ? OR cnic LIKE ? OR city LIKE ? OR phone LIKE ? OR reference_name LIKE ?)');
            const sp = `%${search}%`;
            params.push(sp, sp, sp, sp, sp);
        }
        
        if (city && city !== 'all') {
            conditions.push('city = ?');
            params.push(city);
        }
        
        if (filter === 'due') {
            conditions.push('remaining_due > 0');
        } else if (filter === 'cleared') {
            conditions.push('remaining_due = 0');
        }
        
        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY id DESC';
        
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Server is running' });
});

// Start server
async function start() {
    console.log('\n========================================');
    console.log('🚀 CUSTOMER DUE MANAGEMENT SYSTEM');
    console.log('========================================\n');
    
    const connected = await testConnection();
    
    if (connected) {
        app.listen(PORT, () => {
            console.log(`✅ Server running on http://localhost:${PORT}`);
            console.log('\n📋 Login Credentials:');
            console.log('   👑 Admin:  admin / admin123');
            console.log('   👤 User:   user / user123');
            console.log('\n========================================\n');
        });
    } else {
        console.log('❌ Cannot start server. Database connection failed.');
        process.exit(1);
    }
}

start();