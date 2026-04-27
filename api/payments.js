import { connectDB } from "./db";

export default async function handler(req, res) {

const db = await connectDB();

try {

if (req.method === "POST") {

const {
customerId,
amount,
paymentDate,
paymentMethod,
referenceNo,
notes
} = req.body;

// 1. Insert payment record
await db.execute(
`INSERT INTO payments 
(customer_id, amount, payment_date, payment_method, reference_no, notes)
VALUES (?, ?, ?, ?, ?, ?)`,
[customerId, amount, paymentDate, paymentMethod, referenceNo, notes]
);

// 2. Update customer (paid + remaining update)
await db.execute(
`UPDATE customers 
SET total_paid = total_paid + ?, 
remaining_due = remaining_due - ?
WHERE id = ?`,
[amount, amount, customerId]
);

return res.json({
success: true,
message: "Payment added successfully"
});
}

res.status(405).json({ message: "Method Not Allowed" });

} catch (error) {
console.error(error);
res.status(500).json({
success: false,
message: error.message
});
}

}