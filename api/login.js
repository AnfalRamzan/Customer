import { connectDB } from "./db";

export default async function handler(req,res){

const db = await connectDB();

const {username,password} = req.body;

const [rows] = await db.execute(
"SELECT * FROM users WHERE username=? AND password=?",
[username,password]
);

if(rows.length){
res.json({
success:true,
token:"demo-token",
user:rows[0]
});
}else{
res.json({
success:false,
message:"Invalid login"
});
}

}