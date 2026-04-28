require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Database connection pool - Optimized for Railway
let pool;

// Get database configuration from environment variables (Railway friendly)
const dbConfig = {
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'fincollect_db',
    port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 60000,
    idleTimeoutMillis: 30000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

console.log('📊 Database Config:', {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    port: dbConfig.port
});

// Initialize database connection
async function initDatabase() {
    try {
        pool = mysql.createPool(dbConfig);
        // Test connection
        const connection = await pool.getConnection();
        console.log('✅ MySQL Database connected successfully!');
        console.log('📊 Database:', dbConfig.database);
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.log('\n📌 Please ensure:');
        console.log('   1. MySQL is running');
        console.log('   2. Database "fincollect_db" exists');
        console.log('   3. Credentials are correct');
        console.log('\n⚠️  Starting in demo mode with localStorage fallback...');
        return false;
    }
}

// ============ API ROUTES ============

// Get all customers
app.get('/api/customers', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ success: false, error: 'Database not connected', fallback: true });
        }
        const [rows] = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get filtered customers
app.get('/api/customers/filter', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ success: false, error: 'Database not connected', fallback: true });
        }
        const { search, status } = req.query;
        let query = 'SELECT * FROM customers WHERE 1=1';
        let params = [];
        
        if (search) {
            query += ' AND (name LIKE ? OR phone LIKE ? OR cnic LIKE ? OR city LIKE ? OR reference_name LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }
        
        if (status === 'due') {
            query += ' AND remaining_due > 0';
        } else if (status === 'cleared') {
            query += ' AND remaining_due = 0';
        }
        
        query += ' ORDER BY created_at DESC';
        
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add new customer
app.post('/api/customers', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ success: false, error: 'Database not connected', fallback: true });
        }
        const customerData = req.body;
        
        const [result] = await pool.query(
            `INSERT INTO customers (customer_id, name, cnic, phone, email, city, due_amount, 
             total_paid, remaining_due, address, reference_name, reference_contact, 
             promise_date, business_co, colony, reason, photo_data, bill_photo_data, entry_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                `CUST${Date.now()}`,
                customerData.name,
                customerData.cnic || null,
                customerData.phone,
                customerData.email || null,
                customerData.city,
                customerData.dueAmount || 0,
                0,
                customerData.dueAmount || 0,
                customerData.address || null,
                customerData.referenceName || null,
                customerData.referenceContact || null,
                customerData.promiseDate || null,
                customerData.co || null,
                customerData.colony || null,
                customerData.reason || null,
                customerData.photoData || null,
                customerData.billPhotoData || null,
                new Date().toISOString().split('T')[0]
            ]
        );
        
        res.json({ success: true, message: 'Customer added successfully', id: result.insertId });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update customer
app.put('/api/customers/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ success: false, error: 'Database not connected', fallback: true });
        }
        const customerId = req.params.id;
        const customerData = req.body;
        
        await pool.query(
            `UPDATE customers SET 
             name = ?, cnic = ?, phone = ?, email = ?, city = ?, due_amount = ?,
             address = ?, reference_name = ?, reference_contact = ?, promise_date = ?,
             business_co = ?, colony = ?, reason = ?, photo_data = ?, bill_photo_data = ?
             WHERE id = ?`,
            [
                customerData.name,
                customerData.cnic || null,
                customerData.phone,
                customerData.email || null,
                customerData.city,
                customerData.dueAmount || 0,
                customerData.address || null,
                customerData.referenceName || null,
                customerData.referenceContact || null,
                customerData.promiseDate || null,
                customerData.co || null,
                customerData.colony || null,
                customerData.reason || null,
                customerData.photoData || null,
                customerData.billPhotoData || null,
                customerId
            ]
        );
        
        await pool.query(
            `UPDATE customers SET remaining_due = due_amount - total_paid WHERE id = ?`,
            [customerId]
        );
        
        res.json({ success: true, message: 'Customer updated successfully' });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete customer
app.delete('/api/customers/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ success: false, error: 'Database not connected', fallback: true });
        }
        await pool.query('DELETE FROM customers WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Customer deleted successfully' });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add payment
app.post('/api/payments', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ success: false, error: 'Database not connected', fallback: true });
        }
        const { customerId, amount, date, method } = req.body;
        
        await pool.query(
            `INSERT INTO payments (customer_id, amount, payment_date, payment_method) 
             VALUES (?, ?, ?, ?)`,
            [customerId, amount, date, method || 'Cash']
        );
        
        await pool.query(
            `UPDATE customers SET total_paid = total_paid + ?, 
             remaining_due = GREATEST(remaining_due - ?, 0) 
             WHERE id = ?`,
            [amount, amount, customerId]
        );
        
        res.json({ success: true, message: 'Payment recorded successfully' });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get payments
app.get('/api/payments', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ success: false, error: 'Database not connected', fallback: true });
        }
        const { customerId, date } = req.query;
        let query = `
            SELECT p.*, c.name as customer_name 
            FROM payments p 
            JOIN customers c ON p.customer_id = c.id 
            WHERE 1=1
        `;
        let params = [];
        
        if (customerId) {
            query += ' AND p.customer_id = ?';
            params.push(customerId);
        }
        
        if (date) {
            query += ' AND p.payment_date = ?';
            params.push(date);
        }
        
        query += ' ORDER BY p.payment_date DESC';
        
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get dashboard statistics
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ success: false, error: 'Database not connected', fallback: true });
        }
        const [stats] = await pool.query('SELECT COUNT(*) as total_customers, SUM(due_amount) as total_original_due, SUM(remaining_due) as total_remaining_due FROM customers');
        const [todayPayments] = await pool.query(
            'SELECT SUM(amount) as total FROM payments WHERE payment_date = CURDATE()'
        );
        
        res.json({
            success: true,
            data: {
                totalCustomers: stats[0]?.total_customers || 0,
                totalOriginalDue: stats[0]?.total_original_due || 0,
                totalRemainingDue: stats[0]?.total_remaining_due || 0,
                todayCollection: todayPayments[0]?.total || 0
            }
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get overdue reminders
app.get('/api/reminders/overdue', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ success: false, error: 'Database not connected', fallback: true });
        }
        const [rows] = await pool.query(
            `SELECT * FROM customers 
             WHERE remaining_due > 0 
             AND promise_date <= CURDATE() 
             LIMIT 10`
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: pool ? 'connected' : 'disconnected'
    });
});

// Serve main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
async function startServer() {
    const dbConnected = await initDatabase();
    
    app.listen(PORT, () => {
        console.log(`\n🚀 Server running at: http://localhost:${PORT}`);
        console.log(`📊 Database Status: ${dbConnected ? 'CONNECTED ✅' : 'DISCONNECTED (Demo Mode) ⚠️'}`);
        console.log(`📊 FinCollect Pro is ready!\n`);
    });
}

// For Vercel/Railway serverless
if (require.main === module) {
    startServer();
}

module.exports = app;