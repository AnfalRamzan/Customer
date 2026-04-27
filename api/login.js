import { connectDB } from "./db";

export default async function handler(req, res) {
  try {
    const db = await connectDB();

    const { username, password } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM users WHERE username=? AND password=?",
      [username, password]
    );

    if (rows.length > 0) {
      return res.json({ success: true, user: rows[0] });
    }

    return res.json({ success: false, message: "Invalid credentials" });

  } catch (error) {
    console.log("API ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}