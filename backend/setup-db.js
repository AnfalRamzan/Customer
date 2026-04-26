const mysql = require('mysql2');
const fs = require('fs');
const readline = require('readline');
const bcrypt = require('bcryptjs');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║     CUSTOMER DUE MANAGEMENT SYSTEM - DATABASE SETUP     ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

rl.question('📌 Enter MySQL root password (press Enter if none): ', async (password) => {
    console.log('\n🔌 Connecting to MySQL...');
    
    const connection = mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: password,
        multipleStatements: true
    });
    
    connection.connect(async (err) => {
        if (err) {
            console.error('\n❌ Connection failed:', err.message);
            console.log('\n💡 Troubleshooting:');
            console.log('   1. Make sure MySQL is installed');
            console.log('   2. Start MySQL service:');
            console.log('      - Windows: net start MySQL');
            console.log('      - Mac: brew services start mysql');
            console.log('      - Linux: sudo systemctl start mysql');
            console.log('   3. Check your password\n');
            rl.close();
            return;
        }
        
        console.log('✅ Connected to MySQL successfully!\n');
        console.log('📦 Creating database and tables...\n');
        
        // Hash passwords
        const adminHash = await bcrypt.hash('admin123', 10);
        const userHash = await bcrypt.hash('user123', 10);
        
        const sqlSetup = `
            -- Drop existing database if exists
            DROP DATABASE IF EXISTS customer_due_db;
            
            -- Create fresh database
            CREATE DATABASE customer_due_db;
            USE customer_due_db;

            -- ==================== USERS TABLE ====================
            CREATE TABLE users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                role ENUM('admin', 'user') DEFAULT 'user',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_username (username),
                INDEX idx_role (role)
            );

            -- ==================== CUSTOMERS TABLE ====================
            CREATE TABLE customers (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                cnic VARCHAR(50),
                phone VARCHAR(50),
                email VARCHAR(255),
                entry_date DATE,
                co VARCHAR(255),
                address TEXT,
                colony VARCHAR(255),
                city VARCHAR(100) NOT NULL,
                country VARCHAR(100) DEFAULT 'Pakistan',
                due_amount DECIMAL(15,2) DEFAULT 0,
                total_paid DECIMAL(15,2) DEFAULT 0,
                remaining_due DECIMAL(15,2) DEFAULT 0,
                last_payment_date DATE,
                reason TEXT,
                photo_data LONGTEXT,
                bill_photo_data LONGTEXT,
                promise_date DATE,
                reference_name VARCHAR(255),
                reference_contact VARCHAR(50),
                status ENUM('pending', 'partial', 'paid', 'overdue') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_name (name),
                INDEX idx_cnic (cnic),
                INDEX idx_phone (phone),
                INDEX idx_city (city),
                INDEX idx_status (status),
                INDEX idx_reference (reference_name),
                INDEX idx_promise_date (promise_date),
                INDEX idx_remaining_due (remaining_due)
            );

            -- ==================== PAYMENTS TABLE ====================
            CREATE TABLE payments (
                id INT PRIMARY KEY AUTO_INCREMENT,
                customer_id INT NOT NULL,
                amount DECIMAL(15,2) NOT NULL,
                payment_date DATE NOT NULL,
                payment_method ENUM('cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'other') DEFAULT 'cash',
                reference_no VARCHAR(100),
                notes TEXT,
                received_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
                FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_customer (customer_id),
                INDEX idx_date (payment_date),
                INDEX idx_received_by (received_by)
            );

            -- ==================== REMINDERS/ALARMS TABLE ====================
            CREATE TABLE reminders (
                id INT PRIMARY KEY AUTO_INCREMENT,
                customer_id INT NOT NULL,
                reminder_date DATE NOT NULL,
                reminder_type ENUM('payment', 'followup') DEFAULT 'payment',
                message TEXT,
                is_sent BOOLEAN DEFAULT FALSE,
                sent_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
                INDEX idx_reminder_date (reminder_date),
                INDEX idx_is_sent (is_sent),
                INDEX idx_customer_reminder (customer_id, reminder_date)
            );

            -- ==================== ACTIVITY LOGS TABLE ====================
            CREATE TABLE activity_logs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT,
                action VARCHAR(50),
                customer_id INT,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
                INDEX idx_user (user_id),
                INDEX idx_action (action),
                INDEX idx_created_at (created_at)
            );

            -- ==================== INSERT USERS ====================
            INSERT INTO users (username, password, full_name, role) VALUES 
            ('admin', '${adminHash}', 'System Administrator', 'admin'),
            ('user', '${userHash}', 'Payment Receiver', 'user');

            -- ==================== SAMPLE CUSTOMERS ====================
            INSERT INTO customers (name, cnic, phone, city, due_amount, remaining_due, entry_date, address, status) VALUES
            ('Muhammad Ali', '12345-1234567-1', '0300 1234567', 'Faisalabad', 25000, 25000, CURDATE(), 'Main Street, Faisalabad', 'pending'),
            ('Ahmed Khan', '12345-7654321-2', '0312 7654321', 'Lahore', 15000, 15000, CURDATE(), 'Garden Town, Lahore', 'pending'),
            ('Sara Ahmed', '12345-9876543-3', '0333 9876543', 'Karachi', 0, 0, CURDATE(), 'Clifton, Karachi', 'paid'),
            ('Bilal Hassan', '12345-5555555-5', '0345 5555555', 'Islamabad', 50000, 50000, CURDATE(), 'F-10 Markaz, Islamabad', 'pending'),
            ('Fatima Zahra', '12345-4444444-4', '0321 4444444', 'Multan', 10000, 10000, CURDATE(), 'Cantt Area, Multan', 'pending'),
            ('Umar Farooq', '12345-3333333-3', '0301 3333333', 'Rawalpindi', 35000, 35000, CURDATE(), 'Saddar, Rawalpindi', 'pending'),
            ('Ayesha Khan', '12345-2222222-2', '0311 2222222', 'Peshawar', 20000, 20000, CURDATE(), 'University Road, Peshawar', 'pending');

            -- ==================== SAMPLE REMINDERS ====================
            INSERT INTO reminders (customer_id, reminder_date, reminder_type, message) VALUES
            (1, DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'payment', 'Payment reminder for Muhammad Ali - Due: PKR 25,000'),
            (2, DATE_ADD(CURDATE(), INTERVAL 5 DAY), 'payment', 'Payment reminder for Ahmed Khan - Due: PKR 15,000'),
            (4, DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'payment', 'Payment reminder for Bilal Hassan - Due: PKR 50,000'),
            (6, DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'payment', 'Payment reminder for Umar Farooq - Due: PKR 35,000');

            -- ==================== VERIFY SETUP ====================
            SELECT '✅ DATABASE SETUP COMPLETE!' as Status;
            SELECT COUNT(*) as Total_Users FROM users;
            SELECT COUNT(*) as Total_Customers FROM customers;
            SELECT COUNT(*) as Total_Reminders FROM reminders;
            
            -- Show user credentials
            SELECT username, full_name, role FROM users;
        `;
        
        connection.query(sqlSetup, (err, results) => {
            if (err) {
                console.error('❌ Setup failed:', err.message);
                connection.end();
                rl.close();
                return;
            }
            
            console.log('✅ Database created: customer_due_db');
            console.log('✅ Users table created');
            console.log('✅ Customers table created');
            console.log('✅ Payments table created');
            console.log('✅ Reminders table created');
            console.log('✅ Activity logs table created');
            console.log('✅ Sample data inserted\n');
            
            // Create .env file
            const envContent = `# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=${password}
DB_NAME=customer_due_db

# Server Configuration
PORT=5000

# JWT Secret
JWT_SECRET=customer_due_secret_key_2024_secure
`;
            
            fs.writeFileSync('.env', envContent);
            console.log('✅ .env file created\n');
            
            console.log('╔══════════════════════════════════════════════════════════╗');
            console.log('║                    SETUP COMPLETE!                        ║');
            console.log('╚══════════════════════════════════════════════════════════╝\n');
            
            console.log('📋 LOGIN CREDENTIALS:');
            console.log('   ┌─────────────────────────────────────────────────────┐');
            console.log('   │  👑 ADMIN (Full Access)                             │');
            console.log('   │     Username: admin                                 │');
            console.log('   │     Password: admin123                              │');
            console.log('   ├─────────────────────────────────────────────────────┤');
            console.log('   │  👤 USER (Payment Collection Only)                  │');
            console.log('   │     Username: user                                  │');
            console.log('   │     Password: user123                               │');
            console.log('   └─────────────────────────────────────────────────────┘\n');
            
            console.log('🚀 NEXT STEPS:');
            console.log('   1️⃣  Run: npm install');
            console.log('   2️⃣  Run: npm run dev');
            console.log('   3️⃣  Open frontend/login.html in browser\n');
            
            console.log('💡 USER PERMISSIONS:');
            console.log('   ✓ Admin: Add/Edit/Delete customers, Receive payments, View reports, Export data');
            console.log('   ✓ User:  Receive payments, View customers, View reminders\n');
            
            connection.end();
            rl.close();
        });
    });
});