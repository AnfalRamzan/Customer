import { connectDB } from "./db";

export default async function handler(req,res){

const db = await connectDB();

const [customers] = await db.execute(
"SELECT COUNT(*) totalCustomers FROM customers"
);

const [amount] = await db.execute(
"SELECT SUM(due_amount) totalAmount FROM customers"
);

const [due] = await db.execute(
"SELECT SUM(remaining_due) totalDue FROM customers"
);

res.json({
success:true,
data:{
totalCustomers:customers[0].totalCustomers,
totalAmount:amount[0].totalAmount,
totalDue:due[0].totalDue
}
});

}