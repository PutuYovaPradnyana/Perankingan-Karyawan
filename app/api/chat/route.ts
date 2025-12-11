// app/api/gemini/route.ts
import { NextResponse } from "next/server";

type Employee = {
  nama: string;
  umur?: number;
  tempatTinggal?: string;
  jabatan?: string;
  departemen?: string;
  gaji?: number;
  tanggalMasuk?: string;
  status?: "Tetap" | "Kontrak";
  performanceHistory?: Array<{
    bulan: string;
    tahun: number;
    absensi: number;
    proyekSelesai: number;
    bonus?: number;
    skorKinerja?: number;
    catatanManajer?: string;
  }>;
  rank?: number;
};

type ReqBody = {
  employees: Employee[];
  year?: number;
};

export async function POST(request: Request) {
  try {
    const body: ReqBody = await request.json();
    const employees = body.employees || [];
    const year = body.year || new Date().getFullYear();

    if (!process.env.LLM_API_URL || !process.env.LLM_API_KEY) {
      return NextResponse.json(
        { error: "LLM_API_URL or LLM_API_KEY not configured on server." },
        { status: 500 }
      );
    }

    // Build a clear prompt asking LLM mengembalikan JSON yang mudah diparsing.
    const prompt = `
You are an HR coaching assistant. Given a list of employees with their rank (1 = best) and simple monthly performance numbers for a year (${year}), produce a concise motivating suggestion for each employee to help them improve next year.

Input: a JSON array "employees", each element has:
- nama (string)
- rank (number)  // 1 is highest performance
- departemen (string)
- gaji (number)
- performanceHistory: array of months with fields { bulan, tahun, absensi, proyekSelesai, skorKinerja }

Output (MUST be valid JSON): an object with key "suggestions" mapping names to a short suggestion string (max 2-3 sentences each). Example:
{
  "suggestions": {
    "Andi Pratama": "Saran singkat...",
    "Dika Saputra": "Saran singkat..."
  }
}

Guidelines:
- Tone: supportive and motivating. Mention one concrete improvement action per person (ex: "ikut mentoring", "prioritaskan quality over speed", "kurangi absen dengan ...").
- If rank is 1, congratulate and suggest stretch goals.
- If rank low, suggest concrete steps (training, pairing with senior, task prioritization).
- Keep each suggestion short (<= 40 words).
- Return only the JSON object (no extra commentary).
`;

    // Prepare payload to send to provider. We keep provider-agnostic:
    // Provider must accept { prompt } style; adapt LLM_API_URL to your provider.
    const payload = {
      prompt,
      employees,
      year,
      // hint for providers that support "max_tokens" or "temperature"
      max_tokens: 800,
      temperature: 0.7,
      // If your provider needs a different JSON schema, change below or set LLM_API_BODY_TEMPLATE in env.
    };

    // Optional: if you provided a custom body template as env, use it (string with ${...} replacement)
    let requestBody = payload;
    if (process.env.LLM_API_BODY_TEMPLATE) {
      // naive template: replace ${prompt} etc
      const tpl = process.env.LLM_API_BODY_TEMPLATE;
      // Very small templating only for common vars:
      requestBody = JSON.parse(
        tpl
          .replace(/\$\{prompt\}/g, JSON.stringify(prompt))
          .replace(/\$\{employees\}/g, JSON.stringify(employees))
          .replace(/\$\{year\}/g, JSON.stringify(year))
      );
    }

    const resp = await fetch(process.env.LLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: "LLM provider error", status: resp.status, body: text },
        { status: 502 }
      );
    }

    const respJson = await resp.json();

    // === Flexible extraction ===
    // Many LLM providers return text in different fields. Try to extract JSON from common places.
    let output: any = null;

    // If provider returned structured JSON directly
    if (respJson && typeof respJson === "object" && respJson.suggestions) {
      output = respJson;
    } else {
      // try to extract "text" or "output" fields
      const maybeText =
        (respJson?.choices && respJson.choices[0]?.text) ||
        (respJson?.choices && respJson.choices[0]?.message?.content) ||
        respJson?.output?.text ||
        respJson?.content ||
        respJson?.text ||
        JSON.stringify(respJson);

      // try parse possible JSON blob inside text
      const jsonMatch = (maybeText || "").toString().match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        try {
          output = JSON.parse(jsonMatch[1]);
        } catch (e) {
          // fallback: try to eval-like parse safely (not recommended) -> skip
          output = { raw: maybeText };
        }
      } else {
        output = { raw: maybeText };
      }
    }

    // If output doesn't contain suggestions, produce fallback: generate simple suggestions locally.
    if (!output || !output.suggestions) {
      // create simple fallback suggestions
      const suggestions: Record<string, string> = {};
      employees.forEach((emp) => {
        const rank = emp.rank ?? 99;
        if (rank === 1) suggestions[emp.nama] = "Bagus — terus pertahankan dan cari peluang mentoring junior serta pimpin satu proyek kecil tahun ini.";
        else if (rank <= 3) suggestions[emp.nama] = "Kinerja baik — fokuskan pada peningkatan komunikasi tim dan dokumentasi untuk naik ke level berikutnya.";
        else suggestions[emp.nama] = "Prioritaskan kehadiran dan ikuti pelatihan teknis; minta pairing dengan senior untuk meningkatkan kualitas kerja.";
      });
      return NextResponse.json({ suggestions });
    }

    // Return the suggestion object
    return NextResponse.json(output);
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
