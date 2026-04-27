import mysql from "mysql2/promise";

export async function connectDB() {
  return await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root123",
    database: "customer_due_db"
  });
}