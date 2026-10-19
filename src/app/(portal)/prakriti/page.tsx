"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";

async function updatePrakriti(prakriti: string): Promise<void> {
  const response = await fetch("/api/profile", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prakriti }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Unable to save prakriti result");
  }
}

type Dosha = "Vata" | "Pitta" | "Kapha";

type Question = {
  id: number;
  text: string;
  options: {
    text: string;
    dosha: Dosha;
  }[];
};

const QUESTIONS: Question[] = [
  {
    id: 1,
    text: "How would you describe your body frame?",
    options: [
      { text: "Thin, bony, hard to gain weight", dosha: "Vata" },
      { text: "Medium build, muscular, easy to gain or lose weight", dosha: "Pitta" },
      { text: "Broad, solid, tend to gain weight easily", dosha: "Kapha" },
    ],
  },
  {
    id: 2,
    text: "What is your skin type like?",
    options: [
      { text: "Dry, rough, cool to touch", dosha: "Vata" },
      { text: "Warm, sensitive, prone to acne or freckles", dosha: "Pitta" },
      { text: "Thick, oily, cool and pale", dosha: "Kapha" },
    ],
  },
  {
    id: 3,
    text: "How is your digestion and appetite?",
    options: [
      { text: "Irregular, I get bloated easily", dosha: "Vata" },
      { text: "Strong and sharp, I cannot skip meals", dosha: "Pitta" },
      { text: "Slow and steady, I can easily skip meals", dosha: "Kapha" },
    ],
  },
  {
    id: 4,
    text: "What is your typical sleep pattern?",
    options: [
      { text: "Light, easily interrupted, wake up feeling tired", dosha: "Vata" },
      { text: "Sound but short, I need exactly 7 hours", dosha: "Pitta" },
      { text: "Deep and heavy, I find it hard to wake up", dosha: "Kapha" },
    ],
  },
  {
    id: 5,
    text: "How do you naturally respond to stress?",
    options: [
      { text: "I get anxious, worried, and overwhelmed", dosha: "Vata" },
      { text: "I become irritable, frustrated, or angry", dosha: "Pitta" },
      { text: "I become stubborn, withdrawn, or depressed", dosha: "Kapha" },
    ],
  },
  {
    id: 6,
    text: "Which weather do you dislike the most?",
    options: [
      { text: "Cold and dry weather", dosha: "Vata" },
      { text: "Hot and humid weather", dosha: "Pitta" },
      { text: "Cold and damp weather", dosha: "Kapha" },
    ],
  },
  {
    id: 7,
    text: "How would you describe your mind and thoughts?",
    options: [
      { text: "Active, creative, constantly jumping between ideas", dosha: "Vata" },
      { text: "Focused, logical, competitive, sharp", dosha: "Pitta" },
      { text: "Calm, steady, slow to grasp but never forgets", dosha: "Kapha" },
    ],
  },
  {
    id: 8,
    text: "How do you make decisions?",
    options: [
      { text: "I overthink and change my mind often", dosha: "Vata" },
      { text: "I make quick, confident, and firm decisions", dosha: "Pitta" },
      { text: "I take my time and prefer others to decide", dosha: "Kapha" },
    ],
  },
];

const DOSHA_DETAILS = {
  Vata: {
    title: "Vata Dosha (Air & Space)",
    color: "text-blue-500",
    bg: "bg-blue-50",
    description: "You are naturally creative, energetic, and adaptable. When in balance, you are joyful and enthusiastic. When out of balance, you may experience anxiety, dry skin, and irregular digestion.",
    diet: "Favor warm, cooked, nourishing foods with healthy fats. Avoid cold, raw, and dry foods like crackers or raw salads. Sweet, sour, and salty tastes balance Vata.",
    lifestyle: "Establish a strict daily routine. Practice gentle, grounding exercises like Hatha Yoga or Tai Chi. Avoid cold winds and excessive travel.",
  },
  Pitta: {
    title: "Pitta Dosha (Fire & Water)",
    color: "text-amber-500",
    bg: "bg-amber-50",
    description: "You are naturally intelligent, focused, and ambitious. When in balance, you are a great leader with strong digestion. When out of balance, you may experience anger, inflammation, or heartburn.",
    diet: "Favor cooling, heavy, and dry foods. Avoid spicy, sour, and fried foods. Sweet, bitter, and astringent tastes balance Pitta. Drink plenty of cool (not ice) water.",
    lifestyle: "Avoid overworking and excessive heat. Practice cooling exercises like swimming or gentle cycling. Take walks in nature and practice moderation.",
  },
  Kapha: {
    title: "Kapha Dosha (Earth & Water)",
    color: "text-herb-green",
    bg: "bg-herb-green/10",
    description: "You are naturally calm, loving, and grounded. When in balance, you have excellent endurance and a strong immune system. When out of balance, you may experience lethargy, weight gain, and stubbornness.",
    diet: "Favor warm, light, and dry foods. Avoid heavy, oily, sweet, and dairy products. Pungent, bitter, and astringent tastes balance Kapha.",
    lifestyle: "Stay highly active. Engage in vigorous exercises like running, aerobics, or Ashtanga Yoga. Seek new experiences to avoid getting stuck in a rut.",
  },
  Tridosha: {
    title: "Tridoshic (Vata-Pitta-Kapha)",
    color: "text-purple-500",
    bg: "bg-purple-50",
    description: "You have a rare balance of all three doshas. You embody the creativity of Vata, the intellect of Pitta, and the compassion of Kapha.",
    diet: "Follow a seasonal diet, adjusting your food intake based on the dominant weather and your current feeling of imbalance.",
    lifestyle: "Maintain a balanced lifestyle, adjusting your routine to counter whichever dosha feels slightly aggravated on a given day.",
  }
};

export default function PrakritiAssessmentPage() {
  const [step, setStep] = useState<"intro" | "quiz" | "calculating" | "result">("intro");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Dosha[]>([]);
  const [result, setResult] = useState<"Vata" | "Pitta" | "Kapha" | "Tridosha" | null>(null);
  const [saving, setSaving] = useState(false);

  const handleStart = () => {
    setStep("quiz");
    setCurrentQuestion(0);
    setAnswers([]);
  };

  const handleAnswer = (dosha: Dosha) => {
    const newAnswers = [...answers, dosha];
    if (currentQuestion < QUESTIONS.length - 1) {
      setAnswers(newAnswers);
      setCurrentQuestion(curr => curr + 1);
    } else {
      setAnswers(newAnswers);
      calculateResult(newAnswers);
    }
  };

  const calculateResult = (finalAnswers: Dosha[]) => {
    setStep("calculating");
    
    // Tally scores
    const counts = { Vata: 0, Pitta: 0, Kapha: 0 };
    finalAnswers.forEach(a => counts[a]++);
    
    setTimeout(() => {
      let finalDosha: "Vata" | "Pitta" | "Kapha" | "Tridosha" = "Vata";
      
      const maxScore = Math.max(counts.Vata, counts.Pitta, counts.Kapha);
      
      // Check for tridoshic (all very close)
      if (counts.Vata >= 2 && counts.Pitta >= 2 && counts.Kapha >= 2) {
        finalDosha = "Tridosha";
      } else if (counts.Vata === maxScore) finalDosha = "Vata";
      else if (counts.Pitta === maxScore) finalDosha = "Pitta";
      else finalDosha = "Kapha";

      setResult(finalDosha);
      setStep("result");
      saveResultToProfile(finalDosha);
    }, 2000);
  };

  const saveResultToProfile = async (dosha: string) => {
    try {
      await updatePrakriti(dosha);
    } catch (err) {
      console.error("Failed to save prakriti:", err);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-background">
      
      {/* Intro Step */}
      {step === "intro" && (
        <div className="max-w-2xl w-full bg-white rounded-3xl p-8 sm:p-12 text-center shadow-sm border border-border animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 mx-auto bg-herb-green/10 rounded-full flex items-center justify-center mb-6">
            <span className="text-3xl">🌿</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">Discover Your Prakriti</h1>
          <p className="text-muted-foreground mb-10 text-lg max-w-lg mx-auto">
            According to Ayurveda, your Prakriti is your unique physical and psychological constitution. Answer 8 simple questions to discover your dominant Dosha.
          </p>
          <button 
            onClick={handleStart}
            className="bg-herb-green text-white font-semibold text-lg px-8 py-4 rounded-xl hover:bg-herb-green/90 transition-all active:scale-95 shadow-md shadow-herb-green/20"
          >
            Start Assessment
          </button>
        </div>
      )}

      {/* Quiz Step */}
      {step === "quiz" && (
        <div className="max-w-xl w-full animate-in slide-in-from-right-8 fade-in duration-300">
          <div className="mb-8">
            <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground mb-3">
              <span>Question {currentQuestion + 1} of {QUESTIONS.length}</span>
              <span>{Math.round(((currentQuestion) / QUESTIONS.length) * 100)}%</span>
            </div>
            <div className="w-full h-2 bg-border rounded-full overflow-hidden">
              <div 
                className="h-full bg-herb-green transition-all duration-500 ease-out"
                style={{ width: `${((currentQuestion) / QUESTIONS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-sm border border-border">
            <h2 className="font-display text-2xl font-bold text-foreground mb-8 text-center leading-snug">
              {QUESTIONS[currentQuestion].text}
            </h2>
            <div className="space-y-3">
              {QUESTIONS[currentQuestion].options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(opt.dosha)}
                  className="w-full text-left p-5 rounded-2xl border-2 border-border hover:border-herb-green hover:bg-herb-green/5 transition-all font-medium text-foreground group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-6 h-6 rounded-full border-2 border-muted-foreground group-hover:border-herb-green flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-transparent group-hover:bg-herb-green transition-colors" />
                    </div>
                    {opt.text}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Calculating Step */}
      {step === "calculating" && (
        <div className="text-center animate-in fade-in duration-500">
          <div className="w-24 h-24 mx-auto mb-6 relative">
            <div className="absolute inset-0 border-4 border-herb-green/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-herb-green border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center text-3xl">✨</div>
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground">Analyzing your answers...</h2>
          <p className="text-muted-foreground mt-2">Consulting ancient Ayurvedic wisdom</p>
        </div>
      )}

      {/* Result Step */}
      {step === "result" && result && (
        <div className="max-w-2xl w-full animate-in slide-in-from-bottom-8 fade-in duration-700">
          <div className={cn("rounded-3xl p-8 sm:p-12 text-center shadow-sm border border-border", DOSHA_DETAILS[result].bg)}>
            <div className="inline-block px-4 py-1.5 rounded-full bg-white/60 text-sm font-semibold mb-6 shadow-sm">
              Assessment Complete
            </div>
            <h1 className={cn("font-display text-4xl sm:text-5xl font-bold mb-4", DOSHA_DETAILS[result].color)}>
              {DOSHA_DETAILS[result].title}
            </h1>
            <p className="text-foreground/80 text-lg leading-relaxed mb-10 max-w-lg mx-auto font-medium">
              {DOSHA_DETAILS[result].description}
            </p>

            <div className="grid sm:grid-cols-2 gap-4 text-left">
              <div className="bg-white/80 p-6 rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🥗</span>
                  <h3 className="font-bold text-foreground">Dietary Focus</h3>
                </div>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {DOSHA_DETAILS[result].diet}
                </p>
              </div>
              <div className="bg-white/80 p-6 rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🧘‍♀️</span>
                  <h3 className="font-bold text-foreground">Lifestyle</h3>
                </div>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {DOSHA_DETAILS[result].lifestyle}
                </p>
              </div>
            </div>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/discover" className="bg-white text-foreground font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-all shadow-sm border border-border">
                Explore Treatments
              </Link>
              <button onClick={handleStart} className="text-muted-foreground font-semibold hover:text-foreground transition-colors px-4 py-3">
                Retake Quiz
              </button>
            </div>
            
            <p className="text-xs text-muted-foreground mt-8">
              * This assessment is saved to your medical profile to help your practitioners personalize your care plan.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
