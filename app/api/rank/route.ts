// pages/api/generate-notes.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// helper: konversi "3 tahun" -> 3
function parseMasaKerja(mk: string): number {
  if (mk == null) return 0;
  const num = parseFloat(String(mk).replace(",", "."));
  return isNaN(num) ? 0 : num;
}

/** fallback local note generator (variatif sesuai data) */
function generateFallbackNotes(ranking: any[]) {
  return ranking.map((e: any) => {
    return {
      nama: e.nama,
      catatan: `${e.nama} ada di peringkat ${e.rank} dengan absensi ${e.absensi} kali, gaji Rp${e.gaji}, dan masa kerja ${e.masaKerja}. Evaluasi detail tidak tersedia karena AI gagal, mohon review manual.`
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employees } = body;

    if (!employees || !Array.isArray(employees)) {
      return NextResponse.json({ error: "Data karyawan tidak valid" }, { status: 400 });
    }

    // ================== PERHITUNGAN RANKING ==================
    const maxGaji = Math.max(...employees.map((e: any) => Number(e.gaji) || 0), 1);
    const maxAbsensi = Math.max(...employees.map((e: any) => Number(e.absensi) || 0), 1);
    const maxMasaKerja = Math.max(...employees.map((e: any) => parseMasaKerja(e.masaKerja)), 1);

    const ranking = employees
      .map((e: any) => {
        const masaKerjaNum = parseMasaKerja(e.masaKerja);

        const skorGaji = 1 - (Number(e.gaji) || 0) / maxGaji; // lebih kecil gaji -> lebih baik (cost-aware)
        const skorAbsensi = 1 - (Number(e.absensi) || 0) / maxAbsensi; // semakin kecil absensi semakin baik
        const skorUmur = e.umur >= 25 && e.umur <= 40 ? 1 : e.umur < 25 ? 0.7 : 0.5;
        const skorMasaKerja = masaKerjaNum / maxMasaKerja;

        const total = skorGaji * 0.4 + skorAbsensi * 0.3 + skorUmur * 0.15 + skorMasaKerja * 0.15;

        return {
          nama: e.nama,
          departemen: e.departemen,
          gaji: Number(e.gaji) || 0,
          absensi: Number(e.absensi) || 0,
          masaKerja: e.masaKerja,
          umur: e.umur,
          score: Number(total.toFixed(4)),
        };
      })
      .sort((a: any, b: any) => b.score - a.score)
      .map((e: any, i: number) => ({ ...e, rank: i + 1 }));

    // ================== CEK GEMINI API KEY ==================
    const API_KEY = process.env.GEMINI_API_KEY?.trim();
    if (!API_KEY) {
      const fallbackNotes = generateFallbackNotes(ranking);
      const rankingWithNotes = ranking.map((r: any) => {
        const note = fallbackNotes.find((n: any) => n.nama === r.nama);
        return { ...r, catatan: note?.catatan || "Evaluasi otomatis tidak tersedia (API key tidak diset)." };
      });

      return NextResponse.json({
        ranking: rankingWithNotes,
        warning: "GEMINI_API_KEY tidak ditemukan. Menggunakan fallback heuristik lokal.",
      });
    }

    // ================== PROMPT GEMINI ==================
    const prompt = `
Anda adalah HRD profesional. Buat catatan evaluasi kinerja singkat dan UNIK untuk setiap karyawan di bawah ini.

⚠️ Aturan:
- Catatan HARUS berbeda untuk tiap karyawan (tidak boleh ada kalimat yang sama persis).
- Sertakan faktor spesifik: absensi, gaji, umur, masa kerja, serta posisi ranking.
- Jika absensi tinggi, sebutkan bulan (misal "sering absen di bulan Agustus").
- Jika gaji tinggi namun performa kurang, tulis bahwa kontribusi harus ditingkatkan.
- Jika masa kerja masih baru, beri catatan adaptasi.
- Jika peringkat rendah, beri rekomendasi coaching/mentoring.
- Jika peringkat tinggi, beri apresiasi dan motivasi.

Format output HARUS berupa JSON array valid:
[
  { "nama": "Andi", "catatan": "Andi menduduki peringkat 1 dengan absensi rendah. Perlu diberi tanggung jawab baru." },
  { "nama": "Budi", "catatan": "Budi ada di peringkat 5, dengan absensi 7 kali. Perlu lebih disiplin." }
]

Berikut data karyawan:
${JSON.stringify(ranking, null, 2)}
`.trim();

    let notes: any[] = [];
    let geminiWarning: string | null = null;

    try {
      const genAI = new GoogleGenerativeAI(API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.5, // supaya variasi lebih hidup
        },
      });

      const result = await model.generateContent(prompt);
      const responseText = typeof result?.response?.text === "function"
        ? result.response.text()
        : String(result?.response ?? "");

      const cleanedText = responseText
        .replace(/^\s*```(?:json)?\s*/, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      let geminiResponse: any = null;
      try {
        geminiResponse = JSON.parse(cleanedText);
      } catch {
        const match = cleanedText.match(/\[[\s\S]*\]/);
        if (match) {
          geminiResponse = JSON.parse(match[0]);
        }
      }

      if (Array.isArray(geminiResponse) && geminiResponse.length > 0) {
        notes = geminiResponse;
      } else {
        notes = generateFallbackNotes(ranking);
        geminiWarning = "Respon Gemini kosong/tidak valid — fallback heuristik digunakan.";
      }
    } catch (err: any) {
      console.error("GEMINI ERROR:", err);
      notes = generateFallbackNotes(ranking);
      geminiWarning = `Gemini API error: ${String(err?.message || err)}`;
    }

    // ================== MERGE CATATAN KE RANKING ==================
    const rankingWithNotes = ranking.map((r: any) => {
      const note = notes.find((n: any) => String(n.nama).trim() === String(r.nama).trim());
      return {
        ...r,
        catatan: note?.catatan || "Evaluasi otomatis tidak tersedia.",
      };
    });

    const responsePayload: any = { ranking: rankingWithNotes };
    if (geminiWarning) responsePayload.warning = geminiWarning;

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error("Unhandled server error in generate-notes:", err);
    return NextResponse.json({ error: "Terjadi error pada server", detail: String(err?.message || err) }, { status: 500 });
  }
}
