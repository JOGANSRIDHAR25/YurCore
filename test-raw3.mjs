import 'dotenv/config';
const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/otp`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'apikey': process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ email: 'new-user-test-2@meyveda.in' })
});
console.log(res.status, await res.text());
