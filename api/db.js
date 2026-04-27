import mysql from "mysql2/promise";

export async function connectDB() {
  try {
    return await mysql.createConnection({
      host: "YOUR_ONLINE_DB_HOST",
      user: "YOUR_USER",
      password: "YOUR_PASSWORD",
      database: "customer_due_db"
    });
  } catch (err) {
    console.log("DB ERROR:", err);
    throw err;
  }
}