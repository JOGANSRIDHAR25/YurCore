import "server-only";

/**
 * Practitioner-reviewed reference notes injected into every AI Assistant
 * system prompt.
 *
 * STATUS: DRAFT — starter content only, pending review and sign-off by a
 * YurCore panel Vaidya before the pilot goes live. Keep entries short,
 * general and non-prescriptive (no doses, no disease-specific treatment).
 * Each added line costs input tokens on every request, so keep the whole
 * block well under ~1,500 words.
 */
export const AYURVEDA_REFERENCE_NOTES = `
- Tridosha: Vata (space + air; movement, dry/light/cold), Pitta (fire + water; transformation, hot/sharp), Kapha (earth + water; structure, heavy/stable/cool). Health is a balanced state of doshas, agni, dhatus and malas with a contented mind and senses.
- Prakriti is one's constitution from birth; Vikriti is the current state of imbalance. Assessing either needs a qualified Vaidya — the assistant should not determine anyone's prakriti or vikriti.
- Agni (digestive fire) is central: eat freshly cooked, warm meals at regular times, eat when truly hungry, avoid overeating and heavy food late at night.
- Dinacharya (daily routine), general guidance: wake early, attend to natural urges without suppressing them, oral hygiene including tongue cleaning, regular physical activity suited to one's strength, a regular bath, regular meal and sleep times.
- Ritucharya (seasonal routine): adapt diet and routine to the season; e.g. lighter, cooling choices in hot weather and warmer, more nourishing choices in cold weather.
- Nidra (sleep) is one of the three pillars of life (with Ahara — diet — and Brahmacharya — regulated conduct). Consistent sleep timing and a calm evening routine are generally helpful.
- Panchakarma and other Shodhana (purification) therapies must only be done under the supervision of a qualified Vaidya after individual assessment.
- Herbs and formulations can interact with modern medicines and may be unsuitable in pregnancy, breastfeeding, childhood, older age or chronic disease. Always refer to a qualified Vaidya before starting any.
- Rasayana refers to rejuvenative therapy and conduct (Achara Rasayana: truthfulness, calm, compassion, moderation) as well as specific preparations prescribed by a Vaidya.
`.trim();
