const mysql = require('mysql2/promise');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function setupDatabase() {
    console.log('\n🔧 FinCollect Pro Database Setup\n');
    
    const config = await new Promise((resolve) => {
        rl.question('MySQL Host (default: localhost): ', (host) => {
            rl.question('MySQL Username (default: root): ', (user) => {
                rl.question('MySQL Password: ', (password) => {
                    resolve({ host: host || 'localhost', user: user || 'root', password });
                });
            });
        });
    });
    
    try {
        const connection = await mysql.createConnection({
            host: config.host,
            user: config.user,
            password: config.password
        });
        
        console.log('\n✅ Connected to MySQL');
        
        // Create database
        await connection.query('CREATE DATABASE IF NOT EXISTS fincollect_db');
        console.log('✅ Database "fincollect_db" created');
        
        await connection.query('USE fincollect_db');
        
        // Create tables
        const tables = `
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'user') NOT NULL,
                full_name VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS customers (
                id INT PRIMARY KEY AUTO_INCREMENT,
                customer_id VARCHAR(20) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                cnic VARCHAR(20),
                phone VARCHAR(20) NOT NULL,
                email VARCHAR(100),
                city VARCHAR(50) NOT NULL,
                due_amount DECIMAL(12,2) DEFAULT 0,
                total_paid DECIMAL(12,2) DEFAULT 0,
                remaining_due DECIMAL(12,2) DEFAULT 0,
                address TEXT,
                reference_name VARCHAR(100),
                reference_contact VARCHAR(20),
                promise_date DATE,
                business_co VARCHAR(100),
                colony VARCHAR(100),
                reason TEXT,
                photo_data LONGTEXT,
                bill_photo_data LONGTEXT,
                entry_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_name (name),
                INDEX idx_remaining_due (remaining_due),
                INDEX idx_phone (phone)
            );
            
            CREATE TABLE IF NOT EXISTS payments (
                id INT PRIMARY KEY AUTO_INCREMENT,
                customer_id INT NOT NULL,
                amount DECIMAL(12,2) NOT NULL,
                payment_date DATE NOT NULL,
                payment_method VARCHAR(50) DEFAULT 'Cash',
                reference_no VARCHAR(100),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
                INDEX idx_payment_date (payment_date)
            );
            
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(50),
                action VARCHAR(100),
                details TEXT,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_username (username)
            );
            
            CREATE OR REPLACE VIEW dashboard_stats AS
            SELECT 
                COUNT(*) as total_customers,
                SUM(due_amount) as total_original_due,
                SUM(remaining_due) as total_remaining_due,
                COUNT(CASE WHEN remaining_due > 0 THEN 1 END) as active_due_customers
            FROM customers;
        `;
        
        // Execute each statement separately
        const statements = tables.split(';').filter(s => s.trim());
        for (const statement of statements) {
            if (statement.trim()) {
                await connection.query(statement);
            }
        }
        
        console.log('✅ All tables created successfully');
        
        // Insert sample data
        await connection.query(`
            INSERT IGNORE INTO customers (customer_id, name, phone, city, due_amount, remaining_due, entry_date) VALUES
            ('CUST1001', 'Zara Traders', '03001234567', 'Karachi', 25000, 25000, CURDATE()),
            ('CUST1002', 'Kamran Associates', '03009998888', 'Rawalpindi', 47000, 47000, CURDATE()),
            ('CUST1003', 'Al-Madina Store', '03111223344', 'Lahore', 15000, 15000, CURDATE())
        `);
        
        console.log('✅ Sample data inserted');
        
        await connection.end();
        console.log('\n🎉 Database setup completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('   1. Update database password in server.js (line 22)');
        console.log('   2. Run: npm start');
        console.log('   3. Open: http://localhost:3000\n');
        
    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        console.log('\nPlease check your MySQL connection settings.\n');
    }
    
    rl.close();
}

setupDatabase();