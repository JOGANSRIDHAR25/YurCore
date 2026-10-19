import { SignJWT } from "jose";
import 'dotenv/config';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "12345678901234567890123456789012");

const payload = {
  id: "ca633755-068b-408b-a4a7-4b6bac84f591",
  email: "krishnan@meyveda.in",
  role: "doctor",
  name: "Dr. Krishnan"
};
const token = await new SignJWT(payload)
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('1h')
  .sign(JWT_SECRET);

const res = await fetch("http://localhost:3000/api/profile", {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    "Cookie": `token=${token}`
  },
  body: JSON.stringify({
    dob: "1990-10-10",
    gender: "Male",
    bloodGroup: "A+"
  })
});
console.log("PATCH /api/profile status:", res.status);
console.log(await res.text());

const res2 = await fetch("http://localhost:3000/api/auth/me", {
  headers: { "Cookie": `token=${token}` }
});
console.log("GET /api/auth/me status:", res2.status);
console.log(await res2.text());
