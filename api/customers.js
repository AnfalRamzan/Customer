import { connectDB } from "./db";

export default async function handler(req,res){

const db = await connectDB();

if(req.method === "GET"){

const [rows] = await db.execute(
"SELECT * FROM customers ORDER BY id DESC"
);

res.json({
success:true,
data:rows
});

}

if(req.method === "POST"){

const data = req.body;

await db.execute(
`INSERT INTO customers 
(name,city,due_amount,remaining_due,phone,cnic,email,entry_date)
VALUES (?,?,?,?,?,?,?,?)`,
[
data.name,
data.city,
data.due_amount,
data.due_amount,
data.phone,
data.cnic,
data.email,
data.entry_date
]
);

res.json({success:true});

}

}