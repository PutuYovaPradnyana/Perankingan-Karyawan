// app/api/insights/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const { ranked, weights } = await req.json();

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
Kamu adalah asisten HR yang ringkas dan to the point.
Berikan:
1) 5 rekomendasi praktis untuk optimasi kinerja.
2) 3 kandidat teratas beserta alasan singkat.
3) 3 risiko atau area perbaikan tim secara umum.

Bobot digunakan (total 1): ${JSON.stringify(weights)}
Top 10 ranking (nama, jabatan, departemen, aiScore, aiNote):
${JSON.stringify(ranked.slice(0, 10), null, 2)}
Tuliskan secara bullet, <= 120 kata.
    `.trim();

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ insights: text });
  } catch (e) {
    return NextResponse.json({ error: "Gagal mengambil insight AI" }, { status: 500 });
  }
}
