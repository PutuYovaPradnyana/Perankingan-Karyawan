"use client";

export default function GeminiButton({ askGeminiInsights }: { askGeminiInsights: () => void }) {
  return (
    <button
      onClick={askGeminiInsights}
      className="rounded-2xl bg-emerald-600 text-white px-4 py-2 hover:bg-emerald-700"
      suppressHydrationWarning
    >
      Minta Insight Gemini
    </button>
  );
}
