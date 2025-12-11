"use client";

export default function RankingButton({ computeAIRanking }: { computeAIRanking: () => void }) {
  return (
    <button
      onClick={computeAIRanking}
      className="rounded-2xl bg-blue-600 text-white px-4 py-2 hover:bg-blue-700"
      suppressHydrationWarning
    >
      Hitung Ranking AI
    </button>
  );
}
