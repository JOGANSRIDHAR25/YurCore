// Seed script — run with: node db/run-seed.mjs
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://uyehbeuajztztvnmbyvt.supabase.co',
  'sb_publishable_yD5tj8OFxL4KERbrzr1HsA_rCrdAtIr'
);

async function seed() {
  console.log('🌱 Seeding YurCore database...\n');

  // 1. Users
  console.log('→ Inserting users...');
  const { error: usersErr } = await supabase.from('users').upsert([
    { id: 'a0000000-0000-0000-0000-000000000001', mobile: '+919876543210', email: 'aditi.shastri@meyveda.in', role: 'practitioner' },
    { id: 'a0000000-0000-0000-0000-000000000002', mobile: '+919876543211', email: 'ramesh.iyer@meyveda.in', role: 'practitioner' },
    { id: 'a0000000-0000-0000-0000-000000000003', mobile: '+919876543212', email: 'farah.khan@meyveda.in', role: 'practitioner' },
    { id: 'a0000000-0000-0000-0000-000000000004', mobile: '+919876543213', email: 'priya.menon@meyveda.in', role: 'practitioner' },
    { id: 'b0000000-0000-0000-0000-000000000001', mobile: '+919000000001', email: 'demo.patient@meyveda.in', role: 'patient' },
  ], { onConflict: 'id' });
  if (usersErr) { console.error('  ✗ Users:', usersErr.message); return; }
  console.log('  ✓ Users inserted');

  // 2. Practitioners
  console.log('→ Inserting practitioners...');
  const { error: pracErr } = await supabase.from('practitioners').upsert([
    {
      id: 'doc-0001-0000-0000-000000000001',
      user_id: 'a0000000-0000-0000-0000-000000000001',
      full_name: 'Dr. Aditi Shastri', gender: 'female',
      bio: 'Senior Ayurvedic Physician specialising in Panchakarma detoxification and chronic joint management. Combines classical Ayurvedic methodology with evidence-informed clinical practice.',
      languages: ['English', 'Hindi', 'Kannada'],
      disciplines: ['Ayurveda'],
      specializations: ['Panchakarma & Chronic Joint Care'],
      qualifications: ['BAMS', 'MD Ayurveda', 'PG Panchakarma'],
      experience_years: 15,
      hpr_id: 'HPR-4902-8822', hpr_verified: true, verification_status: 'verified',
      rating_avg: 4.90, rating_count: 1284, consultation_count: 3200,
      base_video_fee: 69900, base_clinic_fee: 99900,
    },
    {
      id: 'doc-0002-0000-0000-000000000002',
      user_id: 'a0000000-0000-0000-0000-000000000002',
      full_name: 'Dr. Ramesh Iyer', gender: 'male',
      bio: 'Specialising in Agni (digestive fire) restoration, Agnimandya management, and metabolic correction through classical herbal formulations.',
      languages: ['English', 'Tamil', 'Telugu'],
      disciplines: ['Ayurveda'],
      specializations: ['Digestive Disorders & Metabolism'],
      qualifications: ['BAMS', 'PG Kaya Chikitsa'],
      experience_years: 11,
      hpr_id: 'HPR-3712-5500', hpr_verified: true, verification_status: 'verified',
      rating_avg: 4.70, rating_count: 876, consultation_count: 2100,
      base_video_fee: 49900, base_clinic_fee: 0,
    },
    {
      id: 'doc-0003-0000-0000-000000000003',
      user_id: 'a0000000-0000-0000-0000-000000000003',
      full_name: 'Dr. Farah Khan', gender: 'female',
      bio: 'Expert in Mizaj-based diagnosis and humoral balance correction through Unani pharmacopoeia including Majoon, Sharbat, and Khamira formulations.',
      languages: ['English', 'Urdu', 'Hindi'],
      disciplines: ['Unani'],
      specializations: ['Unani Internal Medicine'],
      qualifications: ['BUMS', 'MD Unani Medicine'],
      experience_years: 9,
      hpr_id: 'HPR-6601-2290', hpr_verified: true, verification_status: 'verified',
      rating_avg: 4.80, rating_count: 542, consultation_count: 1500,
      base_video_fee: 59900, base_clinic_fee: 79900,
    },
    {
      id: 'doc-0004-0000-0000-000000000004',
      user_id: 'a0000000-0000-0000-0000-000000000004',
      full_name: 'Dr. Priya Menon', gender: 'female',
      bio: 'Certified therapeutic yoga specialist offering evidence-based yoga protocols for spinal disorders, stress management, and chronic pain rehabilitation.',
      languages: ['English', 'Malayalam', 'Tamil'],
      disciplines: ['Yoga'],
      specializations: ['Yoga Therapy & Spine Rehabilitation'],
      qualifications: ['BSc Yoga', 'PGDY', 'PGDYT'],
      experience_years: 7,
      hpr_id: 'HPR-8810-4430', hpr_verified: true, verification_status: 'verified',
      rating_avg: 4.90, rating_count: 398, consultation_count: 1200,
      base_video_fee: 39900, base_clinic_fee: 0,
    },
  ], { onConflict: 'id' });
  if (pracErr) { console.error('  ✗ Practitioners:', pracErr.message); return; }
  console.log('  ✓ Practitioners inserted');

  // 3. Demo patient
  console.log('→ Inserting demo patient...');
  const { error: patErr } = await supabase.from('patients').upsert([{
    id: 'pat-0001-0000-0000-000000000001',
    user_id: 'b0000000-0000-0000-0000-000000000001',
    full_name: 'Demo Patient',
    date_of_birth: '1990-06-15',
    gender: 'male',
    city: 'Bangalore',
    pin_code: '560001',
    prakriti: 'Vata-Pitta',
  }], { onConflict: 'id' });
  if (patErr) { console.error('  ✗ Patient:', patErr.message); return; }
  console.log('  ✓ Demo patient inserted');

  // 4. Dinacharya tasks
  const today = new Date().toISOString().split('T')[0];
  console.log('→ Inserting dinacharya tasks...');
  const { error: taskErr } = await supabase.from('dinacharya_tasks').upsert([
    { id: 'dt-0001', patient_id: 'pat-0001-0000-0000-000000000001', title: 'Oil Pulling (Kavala)', description: 'Swish 1 tbsp sesame oil for 10–15 mins', category: 'mindfulness', scheduled_date: today, scheduled_time: '06:00', done: true },
    { id: 'dt-0002', patient_id: 'pat-0001-0000-0000-000000000001', title: 'Warm Water with Lemon', description: 'Ignite digestive fire (Agni)', category: 'diet', scheduled_date: today, scheduled_time: '06:30', done: true },
    { id: 'dt-0003', patient_id: 'pat-0001-0000-0000-000000000001', title: 'Pranayama — 15 mins', description: 'Nadi Shodhana & Bhramari breathing', category: 'exercise', scheduled_date: today, scheduled_time: '07:00', done: false },
    { id: 'dt-0004', patient_id: 'pat-0001-0000-0000-000000000001', title: 'Morning Medication', description: 'Ashwagandha Churna — 1 tsp with warm milk', category: 'medicine', scheduled_date: today, scheduled_time: '08:00', done: false },
    { id: 'dt-0005', patient_id: 'pat-0001-0000-0000-000000000001', title: 'Sattvic Lunch', description: 'Light Pitta-balancing meal, avoid raw foods', category: 'diet', scheduled_date: today, scheduled_time: '13:00', done: false },
    { id: 'dt-0006', patient_id: 'pat-0001-0000-0000-000000000001', title: 'Evening Medication', description: 'Triphala — 1 tsp with warm water', category: 'medicine', scheduled_date: today, scheduled_time: '20:00', done: false },
  ], { onConflict: 'id' });
  if (taskErr) { console.error('  ✗ Tasks:', taskErr.message); return; }
  console.log('  ✓ Dinacharya tasks inserted');

  // 5. Health records
  console.log('→ Inserting health records...');
  const { error: recErr } = await supabase.from('health_records').upsert([
    { id: 'hr-0001', patient_id: 'pat-0001-0000-0000-000000000001', record_type: 'consultation', title: 'Ayurveda Consultation', doctor_name: 'Dr. Aditi Shastri', discipline: 'Ayurveda', summary: 'Vata-Pitta imbalance. Prescribed Ashwagandha & Triphala regimen.', record_date: '2024-05-28' },
    { id: 'hr-0002', patient_id: 'pat-0001-0000-0000-000000000001', record_type: 'prescription', title: 'Digital Prescription', doctor_name: 'Dr. Aditi Shastri', discipline: 'Ayurveda', summary: 'Ashwagandha Churna · Triphala Churna · Brahmi Ghee', record_date: '2024-05-28' },
    { id: 'hr-0003', patient_id: 'pat-0001-0000-0000-000000000001', record_type: 'consultation', title: 'Yoga Therapy Session', doctor_name: 'Dr. Priya Menon', discipline: 'Yoga', summary: 'Spine protocol initiated. 3-month corrective yoga plan created.', record_date: '2024-04-15' },
    { id: 'hr-0004', patient_id: 'pat-0001-0000-0000-000000000001', record_type: 'lab', title: 'Prakriti Assessment', discipline: 'Ayurveda', summary: 'Prakriti: Vata-Pitta dominant. Recommendations documented.', record_date: '2024-03-10' },
    { id: 'hr-0005', patient_id: 'pat-0001-0000-0000-000000000001', record_type: 'tracker', title: 'Digestion Tracking Report', summary: '30-day tracking: Bloating reduced by 68%. Energy improved.', record_date: '2024-02-20' },
  ], { onConflict: 'id' });
  if (recErr) { console.error('  ✗ Records:', recErr.message); return; }
  console.log('  ✓ Health records inserted');

  console.log('\n🎉 Seed complete! All demo data has been inserted.');
}

seed().catch(console.error);
