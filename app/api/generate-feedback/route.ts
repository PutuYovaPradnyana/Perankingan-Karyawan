// app/api/generate-feedback/route.ts

// @ts-nocheck
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    // --- Validasi API Key ---
    if (!GEMINI_API_KEY) {
      console.error("[SERVER ERROR] GEMINI_API_KEY tidak ditemukan!");
      return NextResponse.json(
        { error: "Error 401: API Key tidak ditemukan. Cek .env.local dan restart server." },
        { status: 401 }
      );
    }

    console.log(`[SERVER DEBUG] API Key Awal: ${GEMINI_API_KEY.substring(0, 5)}...`); 

    // Inisialisasi GoogleGenAI
    const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    const { employees } = await request.json();

    if (!employees || employees.length === 0) {
      return NextResponse.json(
        { error: "Payload karyawan kosong." },
        { status: 400 }
      );
    }

    // Format data karyawan menjadi string untuk prompt
    const employeeList = employees.map((e: any) => {
      const score = Number(e.aiScore);
      return `Rank: ${e.rank}, Nama: ${e.nama}, Jabatan: ${e.jabatan}, Skor AI: ${!isNaN(score) ? score.toFixed(1) : 'N/A'}`;
    }).join('\n');

    const prompt = `Anda adalah seorang HR Analyst. Berikan catatan singkat, padat, dan profesional (Maksimal 2 kalimat) untuk setiap karyawan berdasarkan ranking dan skor mereka. Fokus pada area yang perlu ditingkatkan (misalnya, 'Perlu fokus meningkatkan produktivitas proyek' jika skor rendah) atau pujian (misalnya, 'Performa stabil dan konsisten' jika skor tinggi).

DATA KARYAWAN:\n
${employeeList}

OUTPUT FORMAT:
Hanya kembalikan array JSON yang berisi objek { nama: string, catatan: string }. Jangan tambahkan teks lain.

CONTOH OUTPUT:
[
  { "nama": "Andi Pratama", "catatan": "Performa luar biasa. Rekomendasi kenaikan jabatan dalam 6 bulan." },
  { "nama": "Dika Saputra", "catatan": "Skor berada di bawah rata-rata. Perlu fokus meningkatkan penyelesaian proyek." }
]
`;

    // Panggil generateContent dengan JSON Mode
    const result = await genAI.models.generateContent({ 
        model: "gemini-2.5-flash", // Model cepat
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        nama: { type: "STRING" },
                        catatan: { type: "STRING" },
                    },
                    required: ["nama", "catatan"]
                }
            }
        }
    }) as GenerateContentResponse; 

    const jsonString = result.text.trim(); 
    let parsedFeedback;

    try {
        parsedFeedback = JSON.parse(jsonString);
    } catch (e) {
        console.error("[SERVER ERROR] Gagal Parse JSON dari Gemini:", e);
        return NextResponse.json(
            { error: `Error 500: Gagal memproses respon AI. Respon AI tidak valid. Raw response: ${jsonString.substring(0, 100)}...` },
            { status: 500 }
        );
    }
    
    console.log("✅ [SERVER] SUKSES: Feedback per karyawan diterima dan diproses.");

    return NextResponse.json({ feedback: parsedFeedback });

  } catch (error: any) {
    // --- Penanganan Error Kredensial & Jaringan ---
    console.error("[SERVER FATAL ERROR] Kesalahan saat memanggil Gemini API:", error.message);
    
    let errorMessage = "Terjadi kesalahan server yang tidak diketahui.";
    
    if (error.message.includes("API key") || error.message.includes("invalid key") || error.message.includes("403")) {
        errorMessage = "Error Kredensial 🔑: API Key TIDAK VALID, atau API belum diaktifkan/billing belum disiapkan.";
    } else if (error.message.includes("timeout") || error.message.includes("network")) {
        errorMessage = "Error Koneksi 🌐: Terjadi masalah jaringan atau timeout saat menghubungi server Google.";
    } else {
        errorMessage = error.message; 
    }

    return NextResponse.json(
      { error: `Kesalahan API AI: ${errorMessage}` },
      { status: 500 }
    );
  }
}