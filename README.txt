=====================================
CUSTOMER DUE MANAGEMENT SYSTEM
=====================================

REQUIREMENTS:
1. Node.js (v14 or higher)
   Download: https://nodejs.org/
   
2. MySQL (v8 or higher)
   Download: https://dev.mysql.com/downloads/

INSTALLATION STEPS:

STEP 1: Install MySQL
- Download MySQL Installer
- Choose "Developer Default"
- Set root password: (MUST BE SIMPLE, e.g., root123)
- Remember this password!

STEP 2: Setup Database
- Open Command Prompt as Administrator
- Navigate to backend folder: cd backend
- Run: node setup-db.js
- Enter your MySQL password when asked

STEP 3: Install Backend Dependencies
- In backend folder, run: npm install

STEP 4: Start Backend Server
- Run: npm run dev
- Keep this window open!

STEP 5: Open Application
- Double-click on frontend/index.html
- OR use Live Server in VS Code

HOW TO USE:
1. Add Customer: Click "Add Customer" button
2. View Details: Click on any customer row
3. Edit: Click Edit button (pencil icon)
4. Delete: Click Delete button (trash icon)
5. Search: Type in search box
6. Filter: Use "Has Due" or "Cleared" buttons
7. Export: Click "Export Excel" button

DEFAULT LOGIN (if applicable):
- No login required

TROUBLESHOOTING:
1. "Cannot connect to database":
   - Check MySQL is running (services.msc)
   - Verify password in backend/.env file

2. "Port 5000 already in use":
   - Change PORT in .env file to 5001, 8080, etc.
   - Also update API_URL in frontend/script.js

3. Images not saving:
   - Maximum size 2MB
   - Supported: JPEG, PNG, GIF

SUPPORT:
Created by: [Your Name]
Contact: [Your Email]

=====================================