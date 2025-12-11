// app/page.tsx

// @ts-nocheck
"use client";

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown, PlusCircle, MinusCircle, Upload, Download } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import * as Papa from "papaparse";

// --- TYPE DEFINITIONS ---
export type MonthlyPerformance = {
  bulan: string;
  tahun: number;
  absensi: number;
  proyekSelesai: number;
  skorKinerja: number; // skala 1-5
  catatanManajer: string;
};

export type Employee = {
  nama: string;
  umur: number;
  tempatTinggal: string;
  jabatan: string;
  departemen: string;
  gaji: number;
  tanggalMasuk: string;
  status: "Tetap" | "Kontrak" | "Freelance";
  performanceHistory: MonthlyPerformance[];

  // Data hasil kalkulasi/AI
  rank?: number;
  catatan?: string;
  totalProyekSelesai?: number;
  avgSkorKinerja?: number;
};

type FileInputState = {
  id: number;
  file: File | null;
};

// --- KONSTANTA & UTILITY ---
const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const NORM_MONTHS: Record<string, string> = {
  "jan": "januari", "feb": "februari", "mar": "maret", "apr": "april",
  "mei": "mei", "jun": "juni", "jul": "juli", "agu": "agustus",
  "sep": "september", "okt": "oktober", "nov": "november", "des": "desember"
};

const RANKING_WEIGHTS = {
  AVG_SKOR: 10,
  TOTAL_PROYEK: 2,
  TOTAL_ABSEN: -5,
  MASA_KERJA_TAHUN: 1.5,
  UMUR: 0.1,
};

// Helper untuk data default
const createFullYearPerformance = (base: { absensi: number, proyek: number, skor: number }): MonthlyPerformance[] => {
  return MONTHS.map(month => ({
    bulan: month,
    tahun: 2025,
    absensi: base.absensi,
    proyekSelesai: base.proyek,
    skorKinerja: base.skor,
    catatanManajer: "Kinerja standar.",
  }));
};

const createDefaultEmployees = (): Employee[] => [
  {
    nama: "Yova Pradnyana",
    umur: 28,
    tempatTinggal: "Jakarta",
    jabatan: "Software Engineer",
    departemen: "IT",
    gaji: 9000000,
    tanggalMasuk: "2022-08-15",
    status: "Tetap",
    performanceHistory: createFullYearPerformance({ absensi: 1, proyek: 1, skor: 4.5 }),
    rank: 1,
    catatan: "Kinerja Sangat Baik. Fokus mempertahankan Rank tertinggi.",
    totalProyekSelesai: 12,
    avgSkorKinerja: 4.5,
  },
];

// Format Rupiah
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

// Utility helpers
function normalizeHeader(h: string) {
  let normalized = (h || "").toString().trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_()]/g, "");

  const projMonthMatch = normalized.match(/proyek_selesai_\((.*?)\)/);
  if (projMonthMatch) {
    const shortMonth = projMonthMatch[1].toLowerCase();
    const fullMonth = NORM_MONTHS[shortMonth] || shortMonth;
    normalized = `proyek_selesai_${fullMonth}`;
  }

  const absensiMonthMatch = normalized.match(/absensi_(.*)/);
  if (absensiMonthMatch && MONTHS.map(m => m.toLowerCase()).includes(absensiMonthMatch[1].replace(/_2025/g, ''))) {
     normalized = absensiMonthMatch[0].replace(/_2025/g, '');
  }

  normalized = normalized.replace(/_2025/g, "");

  return normalized;
}

function monthNameToIndex(raw: string) {
  if (!raw) return -1;
  const s = raw.toString().trim().toLowerCase();
  for (let i = 0; i < MONTHS.length; i++) {
    if (MONTHS[i].toLowerCase() === s) return i;
  }
  const engMap: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  for (const k in engMap) if (s.includes(k)) return engMap[k];
  return -1;
}

const calculateMasaKerjaInYears = (tanggalMasuk: string): number => {
  const start = new Date(tanggalMasuk);
  const now = new Date();
  if (isNaN(start.getTime())) return 0;
  const diffTime = now.getTime() - start.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24 * 365.25);
  return diffDays > 0 ? diffDays : 0;
};

// --- KOMPONEN (StatCard, PerformanceDetail, Th) ---
function StatCard({ title, value, subtitle, small = false }: { title: string, value: string | number, subtitle?: string, small?: boolean }) {
  const isLoaded = value !== "-";
  return (
    <div className={`p-3 bg-white border border-slate-200 rounded-lg shadow-sm ${small ? "text-sm" : "text-base"}`}>
      <p className="text-slate-800 font-medium truncate mb-1">{title}</p>
      <div className="flex items-baseline">
        <div className={`font-bold ${small ? "text-xl" : "text-2xl"} text-slate-900 tabular-nums`}>
          {isLoaded ? value : <div className="w-3/a h-6 bg-slate-200 rounded animate-pulse"></div>}
        </div>
        {subtitle && (
          <div className="text-xs text-slate-700 ml-1">
            {isLoaded ? subtitle : <div className="w-1/4 h-3 bg-slate-200 rounded animate-pulse"></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function PerformanceDetail({
  history,
  gaji,
  totalProyekSelesai,
  avgSkorKinerja,
}: {
  history: MonthlyPerformance[];
  gaji: number;
  totalProyekSelesai: number;
  avgSkorKinerja: number;
}) {
  const totalHistorySkor = history.reduce((s, p) => s + (p.skorKinerja || 0), 0);
  const totalValidEntries = history.filter(p => p.skorKinerja > 0).length;

  const avgSkor = avgSkorKinerja > 0
    ? avgSkorKinerja
    : (totalValidEntries > 0 ? (totalHistorySkor / totalValidEntries) : 0);

  const totalProyek = totalProyekSelesai;
  const totalAbsen = history.reduce((s, p) => s + (p.absensi || 0), 0);

  return (
    <div className="p-6 bg-slate-50 border-t border-slate-200">
      <h3 className="text-base font-semibold text-slate-900 mb-3 border-b pb-2">Detail Performa Tahunan (Ringkasan)</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <StatCard title="Gaji Pokok (Bulan)" value={currency.format(gaji)} small />
        <StatCard title="Rata-rata Skor" value={avgSkor.toFixed(2)} subtitle="/ 10.0" small />
        <StatCard title="Total Proyek" value={totalProyek} subtitle="selesai" small />
        <StatCard title="Total Absensi" value={totalAbsen} subtitle="hari/tahun" small />
      </div>

      <h4 className="text-sm font-semibold text-slate-900 mt-4 mb-2">Riwayat Performa Bulanan</h4>
      <div className="overflow-x-auto rounded-lg border border-slate-300">
        <table className="min-w-full table-fixed text-xs text-slate-900">
          <thead className="bg-slate-200">
            <tr className="text-left">
              <th className="px-3 py-2 w-1/4">Bulan</th>
              <th className="px-3 py-2 w-1/4">Absensi (Hari)</th>
              <th className="px-3 py-2 w-1/4">Proyek Selesai</th>
              <th className="px-3 py-2 w-1/4">Skor Kinerja</th>
            </tr>
          </thead>
          <tbody>
            {history
              .filter(p => p.bulan && MONTHS.includes(p.bulan))
              .sort((a, b) => monthNameToIndex(a.bulan) - monthNameToIndex(b.bulan))
              .map((p, index) => (
                <tr key={index} className="border-t border-slate-200 hover:bg-white">
                  <td className="px-3 py-2 font-medium">{p.bulan}</td>
                  <td className="px-3 py-2 tabular-nums">{p.absensi}</td>
                  <td className="px-3 py-2 tabular-nums font-semibold">{p.proyekSelesai}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {p.skorKinerja > 0 ? p.skorKinerja.toFixed(1) : "-"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- KOMPONEN UTAMA PAGE ---
export default function Page() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof Employee>("rank");
  const [sortAsc, setSortAsc] = useState(true);
  const [aiNotes, setAiNotes] = useState("Aplikasi siap! Silakan **Impor CSV** data Anda, atau klik **'Reset Data'** untuk memuat data demo.");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [fileInputs, setFileInputs] = useState<FileInputState[]>([]);
  const [perPage, setPerPage] = useState(10);

  const handleRowClick = (nama: string) => {
    setExpandedRow(expandedRow === nama ? null : nama);
  };

  const calculateMasaKerja = (tanggalMasuk: string) => {
    const start = new Date(tanggalMasuk);
    const now = new Date();
    if (isNaN(start.getTime())) return "-";
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    if (years < 0) return "Baru masuk";
    if (years === 0 && months === 0) return "Baru masuk";

    return `${years} tahun ${months} bulan`;
  };

  const normalizeEmployees = (list: Employee[]) =>
    list.map((e) => ({
      ...e,
      umur: Number(e.umur) || 0,
      gaji: Number(e.gaji) || 0,
      totalProyekSelesai: Number(e.totalProyekSelesai) || 0,
      avgSkorKinerja: Number(e.avgSkorKinerja) || 0,
      performanceHistory: (e.performanceHistory || []).map((p) => ({
        ...p,
        tahun: Number(p.tahun) || 2025,
        absensi: Number(p.absensi) || 0,
        proyekSelesai: Number(p.proyekSelesai) || 0,
        skorKinerja: Number(p.skorKinerja) || 0,
        catatanManajer: p.catatanManajer ?? "",
        bulan: p.bulan ?? "",
      })),
    }));

  const safeEmployees = useMemo(() => normalizeEmployees(employees), [employees]);

  const filtered = useMemo(() => {
    return safeEmployees.filter((e) =>
      [e.nama, e.tempatTinggal, e.jabatan, e.departemen].some((field) =>
        (field ?? "").toLowerCase().includes(query.toLowerCase())
      )
    );
  }, [query, safeEmployees]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "rank" && (a.rank !== undefined && b.rank !== undefined)) {
        return sortAsc ? (a.rank as number) - (b.rank as number) : (b.rank as number) - (a.rank as number);
      }

      const valA = a[sortKey];
      const valB = b[sortKey];

      if (typeof valA === "number" && typeof valB === "number")
        return sortAsc ? (valA as number) - (b.rank as number) : (valB as number) - (valA as number);

      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [filtered, sortKey, sortAsc]);

  const maxPage = Math.max(1, Math.ceil(sorted.length / perPage));
  const paginated = sorted.slice((page - 1) * perPage, page * perPage);

  const totalGaji = filtered.reduce((acc, e) => acc + (e.gaji || 0), 0);
  const totalAbsensiTahunan = filtered.reduce((acc, e) => {
    const totalAbsenKaryawan = e.performanceHistory.reduce((sum, p) => sum + (p.absensi || 0), 0);
    return acc + totalAbsenKaryawan;
  }, 0);

  const avgAbsensi = filtered.length > 0 ? Math.round(totalAbsensiTahunan / filtered.length) : 0;

  const downloadCsv = (data: Employee[]) => {
    const header = "nama,umur,tempatTinggal,jabatan,departemen,gaji,tanggalMasuk,status,rank_ai,catatan_ai,total_proyek_selesai,avg_skor_kinerja," +
                   MONTHS.map(m => `absensi_${m.toLowerCase()}`).join(',');

    const projHeaders = MONTHS.map(m => `proyek_selesai_${m.substring(0, 3).toLowerCase()}`).join(',');

    const finalHeader = `${header},${projHeaders}`;

    const rows = data.map(e => {
      const historyMap = new Map(e.performanceHistory.map(p => [p.bulan, p]));
      const absensiData = MONTHS.map(m => historyMap.get(m)?.absensi ?? 0).join(',');
      const proyekData = MONTHS.map(m => historyMap.get(m)?.proyekSelesai ?? 0).join(',');

      return [
        e.nama, e.umur, e.tempatTinggal, e.jabatan, e.departemen, e.gaji, e.tanggalMasuk, e.status,
        e.rank ?? '-',
        `${(e.catatan ?? "").replace(/"/g,'')}`,
        e.totalProyekSelesai ?? 0,
        e.avgSkorKinerja ?? 0,
        absensiData,
        proyekData
      ].join(',');
    });

    const csv = [finalHeader, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "karyawan_perankingan_detail.csv";
    a.click();
  };

  // Helper untuk memproses hasil parse CSV
  const processCsvResults = (results: any): Employee[] => {
    const rows: any[] = results.data as any[];
    if (!rows || rows.length === 0) {
      return [];
    }
    const empMap = new Map<string, Employee>();

    // Helper lokal: normalisasi skor
    const scoreFromProyek = (totalProyek: number, monthsCount = 12) => {
      const rata = monthsCount > 0 ? totalProyek / monthsCount : 0;
      const skor = 2.5 + Math.min(1.5, (rata / 4) * 1.5);
      return Math.max(2.5, Math.min(5.0, skor));
    };

    rows.forEach((raw) => {
      const nama = (raw.nama || raw.name || "").toString().trim();
      if (!nama) return;

      let avgSkorKinerja = Number(raw.avg_skor_kinerja || raw.avgSkorKinerja || raw.avg_skor || 0) || 0;
      let calculatedTotalProyek = 0;
      
      // Jika skor belum ada, hitung skor berdasarkan total proyek yang ada di CSV (jika ada)
      if (avgSkorKinerja === 0) {
          const totalProyekDariKolom = Number(raw.proyek_selesai_2025 || raw.total_proyek_selesai || 0) || 0;
          if (totalProyekDariKolom > 0) {
              avgSkorKinerja = scoreFromProyek(totalProyekDariKolom, 12);
          } else {
              // Default/fallback score
              avgSkorKinerja = Math.round((Math.random() * 1.8 + 3.0) * 100) / 100;
          }
      }
      avgSkorKinerja = Math.round(Number(avgSkorKinerja) * 100) / 100;

      const performanceHistory: MonthlyPerformance[] = MONTHS.map((month) => {
        const normalizedMonth = month.toLowerCase();
        const normalizedHeaderAbsensi = `absensi_${normalizedMonth}`;
        const absensi = Number(raw[normalizedHeaderAbsensi] || raw[`absensi_${normalizedMonth}_2025`] || 0) || 0;
        const normalizedHeaderProyekShort = `proyek_selesai_${normalizedMonth.substring(0, 3)}`;
        let proyekSelesaiBulanan = Number(raw[normalizedHeaderProyekShort] || 0) || 0;
        if (!proyekSelesaiBulanan) {
          const altHeaderProyek = `proyek_selesai_${normalizedMonth}`;
          proyekSelesaiBulanan = Number(raw[altHeaderProyek] || 0) || 0;
        }
        calculatedTotalProyek += proyekSelesaiBulanan;
        
        // Cek apakah bulan ini memiliki data input (absensi atau proyek)
        const hasDataForMonth = (absensi > 0 || proyekSelesaiBulanan > 0);

        return {
          bulan: month,
          tahun: Number(raw.tahun) || 2025,
          absensi: absensi,
          proyekSelesai: proyekSelesaiBulanan,
          // FIX UTAMA: Skor Kinerja bulanan hanya diisi jika ada data input, jika tidak, harus 0.
          skorKinerja: hasDataForMonth ? avgSkorKinerja : 0, 
          catatanManajer: raw.catatanManajer || "",
        } as MonthlyPerformance;
      });

      const totalProyekDariKolom = Number(raw.proyek_selesai_2025 || raw.total_proyek_selesai || 0) || 0;
      // Gunakan total yang paling besar/sesuai
      const finalTotalProyek = Math.max(totalProyekDariKolom, calculatedTotalProyek);

      // Pastikan avgSkorKinerja diperbarui berdasarkan data yang baru diproses
      const existingSkorSum = performanceHistory.reduce((s, p) => s + (Number(p.skorKinerja) || 0), 0);
      const existingSkorCount = performanceHistory.reduce((c, p) => c + (p.skorKinerja ? 1 : 0), 0);

      if (existingSkorCount > 0) {
        avgSkorKinerja = existingSkorSum / existingSkorCount;
      } else if (finalTotalProyek > 0) {
        avgSkorKinerja = scoreFromProyek(finalTotalProyek, 12);
      }
      avgSkorKinerja = Math.round(Number(avgSkorKinerja) * 100) / 100;


      if (!empMap.has(nama)) {
        const umur = Number(raw.umur || raw.age) || 0;
        const tempatTinggal = (raw.tempattinggal || raw.kotatinggal || raw.city || "") as string;
        const jabatan = (raw.jabatan || raw.posisi || raw.position || "") as string;
        const departemen = (raw.departemen || raw.department || "General") as string;
        const gaji = Number(raw.gaji || raw.salary) || 0;
        let tanggalMasuk = raw.tanggalmasuk || raw.join_date || "";
        const masaKerjaRaw = raw.masakerja || raw.masakerja_tahun || "";
        if (!tanggalMasuk && masaKerjaRaw) {
          const masaKerjaMatch = masaKerjaRaw.match(/(\d+)\s*tahun/i);
          if (masaKerjaMatch) {
            const years = parseInt(masaKerjaMatch[1]);
            const now = new Date();
            const joinDate = new Date(now.getFullYear() - years, now.getMonth(), now.getDate());
            tanggalMasuk = joinDate.toISOString().split('T')[0];
          }
        }
        if (!tanggalMasuk) tanggalMasuk = new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0];
        const statusRaw = (raw.status || "").toString().toLowerCase();
        let finalStatus: "Tetap" | "Kontrak" | "Freelance";
        if (statusRaw.includes("tetap")) {
          finalStatus = "Tetap";
        } else if (statusRaw.includes("freelance")) {
          finalStatus = "Freelance";
        } else {
          finalStatus = "Kontrak";
        }
        empMap.set(nama, {
          nama, umur, tempatTinggal, jabatan, departemen, gaji, tanggalMasuk,
          status: finalStatus,
          performanceHistory: performanceHistory,
          totalProyekSelesai: finalTotalProyek,
          avgSkorKinerja: avgSkorKinerja,
        } as Employee);
      }
    });
    return normalizeEmployees(Array.from(empMap.values()));
  };
  
  // Helper untuk membaca file sebagai Promise
  const parseFileAsPromise = (file: File): Promise<Employee[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: any) => normalizeHeader(h || ""),
        complete: (results: any) => {
          const parsedEmployees = processCsvResults(results);
          resolve(parsedEmployees);
        },
        error: (err: any) => {
          console.error("CSV parse error:", err);
          let errorMessage = "Terjadi kesalahan saat membaca CSV.";
          if (err && err.code === "UndetectableDelimiter") {
            errorMessage += "\nPastikan file menggunakan koma (,) sebagai pemisah, bukan titik koma (;).";
          }
          setAiNotes(errorMessage);
          reject(new Error(errorMessage));
        }
      });
    });
  };

  // Fungsi ini HANYA untuk "Import CSV (Ganti)"
  const handleImportReplace = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAiNotes("Memproses impor CSV untuk MENGGANTI data...");
    setIsLoadingAi(true);
    try {
      const newEmployees = await parseFileAsPromise(file);
      setEmployees(newEmployees);
      setPage(1);
      setAiNotes(`CSV berhasil **MENGGANTI** data (${newEmployees.length} karyawan). Data proyek dan performa sudah dimuat. Silakan Hitung Ranking.`);
    } catch (error) {
      // setAiNotes sudah di-handle di dalam parseFileAsPromise
    } finally {
      setIsLoadingAi(false);
      // Reset input file
      event.target.value = '';
    }
  };

  // --- FUNGSI PERBAIKAN UTAMA: Helper function untuk menggabungkan data karyawan ---
  const mergeEmployeeData = (baseMap: Map<string, Employee>, newEmp: Employee) => {
    const nama = newEmp.nama;

    // Pisahkan data dasar dari data kalkulasi/riwayat
    const { 
      performanceHistory: newPerfHistory, 
      ...newBaseData 
    } = newEmp;

    if (baseMap.has(nama)) {
      // --- KARYAWAN SUDAH ADA (Update) ---
      const oldEmp = baseMap.get(nama)!;
      
      // 1. Buat Peta riwayat LAMA (key: bulan)
      const combinedHistoryMap = new Map(oldEmp.performanceHistory.map(p => [p.bulan, p]));
      
      // 2. Timpa/tambahkan dengan riwayat BARU (dari file Jan, Feb, dst.)
      newPerfHistory.forEach(newPerf => {
        // PERBAIKAN: Cek apakah entri performa baru ini punya data input
        // (absensi atau proyekSelesai > 0). Hentikan pengecekan skorKinerja.
        const newHasData = (newPerf.absensi > 0 || newPerf.proyekSelesai > 0);
        
        // Hanya perbarui peta jika entri baru MEMILIKI DATA INPUT.
        if (newHasData) {
          combinedHistoryMap.set(newPerf.bulan, newPerf);
        }
      });

      // 3. Ubah Peta gabungan kembali ke Array
      const combinedHistory = Array.from(combinedHistoryMap.values());
      
      // 4. Hitung ulang total/avg berdasarkan data gabungan yang valid
      const combinedTotalProyek = combinedHistory.reduce((s, p) => s + (p.proyekSelesai || 0), 0);
      const combinedSkorSum = combinedHistory.reduce((s, p) => s + (p.skorKinerja || 0), 0);
      // Valid entries adalah entri yang memiliki skor (skor > 0 hanya ada jika ada data input)
      const validSkorEntries = combinedHistory.filter(p => p.skorKinerja > 0).length;
      
      const combinedAvgSkor = validSkorEntries > 0
        ? combinedSkorSum / validSkorEntries
        : 0;

      // 5. Buat objek karyawan yang sudah di-update
      const updatedEmp = {
        ...oldEmp,       // Mulai dengan data lama
        ...newBaseData,  // Timpa dengan data dasar baru (gaji, status, dll.)
        performanceHistory: combinedHistory, // Gunakan riwayat gabungan
        // Gunakan total & avg yang baru dihitung ulang
        totalProyekSelesai: combinedTotalProyek, 
        avgSkorKinerja: Math.round(combinedAvgSkor * 100) / 100,
      };
      baseMap.set(nama, updatedEmp);

    } else {
      // --- KARYAWAN BARU (Tambah) ---
      baseMap.set(nama, newEmp); 
    }
  };

  // Fungsi ini untuk "Proses File Tambahan" (Append)
  const handleProcessAppend = async () => {
    const filesToProcess = fileInputs.filter(f => f.file !== null).map(f => f.file!);
    if (filesToProcess.length === 0) {
      setAiNotes("Tidak ada file tambahan yang dipilih untuk diproses.");
      return;
    }

    setAiNotes(`Memproses ${filesToProcess.length} file untuk DITAMBAHKAN...`);
    setIsLoadingAi(true);

    try {
      // 1. Dapatkan data yang sudah ada di state
      const existingEmployeeMap = new Map(safeEmployees.map(e => [e.nama, e]));

      // 2. Parse semua file baru
      const parsedDataArrays = await Promise.all(filesToProcess.map(parseFileAsPromise));

      // 3. Gabungkan semua data file baru ke dalam data yang sudah ada
      //    Loop per file (Jan, Feb, ...)
      for (const employeeArray of parsedDataArrays) { 
        // Loop per karyawan di file tsb
        for (const newEmp of employeeArray) { 
          mergeEmployeeData(existingEmployeeMap, newEmp);
        }
      }

      // 4. Set state dengan data yang sudah digabung total
      const combinedEmployees = normalizeEmployees(Array.from(existingEmployeeMap.values()));
      setEmployees(combinedEmployees);
      
      setPage(1);
      setAiNotes(`Berhasil **MENAMBAH** data dari ${filesToProcess.length} file.\nTotal karyawan sekarang: ${combinedEmployees.length}. Silakan Hitung Ranking.`);
      
    } catch (error) {
      console.error("Gagal memproses file tambahan:", error);
      // setAiNotes sudah di-handle di dalam parseFileAsPromise
    } finally {
      // --- PERBAIKAN UI: Selalu kosongkan antrean setelah proses ---
      setIsLoadingAi(false);
      setFileInputs([]); 
    }
  };


  async function computeAIRanking() {
    if (employees.length === 0) {
      setAiNotes("Tidak ada data karyawan untuk diranking. Silakan impor data terlebih dahulu.");
      return;
    }
    setIsLoadingAi(true);
    setAiNotes("Menghitung ranking dan **Menghubungi Gemini AI** untuk catatan... 🚀");

    const ranked = employees
      .map((e) => {
        // Hitung ulang avgSkor berdasarkan performanceHistory yang sudah digabung
        const validScores = e.performanceHistory.filter(p => p.skorKinerja > 0);
        const avgSkor = validScores.length > 0 ? validScores.reduce((s, p) => s + (p.skorKinerja || 0), 0) / validScores.length : 0;
        
        const totalProyek = e.totalProyekSelesai || 0;
        const totalAbsen = e.performanceHistory.reduce((s, p) => s + (p.absensi || 0), 0);
        const masaKerjaYears = calculateMasaKerjaInYears(e.tanggalMasuk);

        const score =
          (avgSkor * RANKING_WEIGHTS.AVG_SKOR) +
          (totalProyek * RANKING_WEIGHTS.TOTAL_PROYEK) +
          (totalAbsen * RANKING_WEIGHTS.TOTAL_ABSEN) +
          (masaKerjaYears * RANKING_WEIGHTS.MASA_KERJA_TAHUN) +
          (e.umur * RANKING_WEIGHTS.UMUR);

        return {
          ...e,
          aiScore: score,
          avgSkorKinerja: avgSkor,
          totalAbsen: totalAbsen
        } as any;
      })
      .sort((a: any, b: any) => b.aiScore - a.aiScore);

    const employeesForApi = ranked.map((e: any, i: number) => ({
      ...e,
      rank: i + 1,
      aiScore: e.aiScore,
      totalAbsen: e.totalAbsen,
      avgSkorKinerja: e.avgSkorKinerja,
    }));

    let finalEmployees = employeesForApi.map(({ aiScore, totalAbsen, ...rest }: any, i: number) => ({
      ...rest,
      catatan: `Skor AI: ${aiScore.toFixed(1)} / Rank: ${i + 1}`,
    })) as Employee[];

    try {
      setAiNotes("Menghubungi Gemini AI... Harap tunggu (ini dapat memakan waktu beberapa detik).");

      const response = await fetch('/api/generate-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: employeesForApi }),
      });

      const result = await response.json();

      if (response.ok && result.feedback && Array.isArray(result.feedback)) {
        const aiFeedbackMap = new Map(
          (result.feedback as Array<{ nama: string; catatan: string }>).map(f => [f.nama, f.catatan])
        );

        finalEmployees = finalEmployees.map(emp => ({
          ...emp,
          catatan: aiFeedbackMap.get(emp.nama) || emp.catatan,
        }));

        setAiNotes(`Catatan AI per karyawan berhasil dibuat oleh Gemini (${aiFeedbackMap.size} catatan). ✅`);
      } else {
        console.error("API Route Error:", result.error || "Unknown error");
        setAiNotes(`Gagal memuat catatan dari Gemini AI. Menggunakan catatan skor default. Detail: ${result.error || "Cek console browser."}`);
      }
    } catch (error: any) {
      console.error("Fetch Error:", error);
      setAiNotes(`Gagal terhubung ke API Route. Menggunakan catatan skor default. Detail: ${error.message}`);
    } finally {
      setEmployees(finalEmployees);
      setIsLoadingAi(false);
    }
  }

  const handleResetData = () => {
    setEmployees(createDefaultEmployees());
    setAiNotes("Data demo telah dimuat. Silakan klik 'Hitung Ranking' untuk memulai analisis.");
    setQuery("");
    setPage(1);
    setSortKey("rank");
    setSortAsc(true);
    setExpandedRow(null);
  };

  function Th({ field, label }: { field: keyof Employee; label: string }) {
    return (
      <th
        className="px-4 py-3 cursor-pointer select-none text-slate-900"
        onClick={() => {
          if (sortKey === field) setSortAsc(!sortAsc);
          else {
            setSortKey(field);
            setSortAsc(true);
          }
        }}
      >
        <div className="flex items-center gap-1">
          {label}
          {sortKey === field &&
            (sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
        </div>
      </th>
    );
  }

  // Data Chart
  const dataGaji = Object.values(
    filtered.reduce((acc: any, e) => {
      acc[e.departemen] = acc[e.departemen] || { name: e.departemen, total: 0 };
      acc[e.departemen].total += e.gaji || 0;
      return acc;
    }, {})
  );

  const dataDepartemen = Object.entries(
    filtered.reduce((acc: any, e) => {
      acc[e.departemen] = (acc[e.departemen] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const dataAbsensiByMonth = useMemo(() => {
    const totalsByMonth: Record<string, number> = {};
    MONTHS.forEach((m) => (totalsByMonth[m] = 0));

    if (safeEmployees.length === 0) {
      return MONTHS.map((m) => ({ name: m, absensi: 0 }));
    }

    safeEmployees.forEach((emp) => {
      emp.performanceHistory.forEach((p) => {
        const mIndex = monthNameToIndex(p.bulan || "");
        const mKey = mIndex >= 0 ? MONTHS[mIndex] : (p.bulan || "");
        if (!mKey || !MONTHS.includes(mKey)) return;
        totalsByMonth[mKey] += Number(p.absensi || 0);
      });
    });
    const totalEmployees = safeEmployees.length || 1;
    const data = MONTHS.map((m) => {
      const avg = totalsByMonth[m] / totalEmployees;
      const finalVal = Math.round(avg);
      return { name: m, absensi: finalVal };
    });

    return data;
  }, [safeEmployees]);

  const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#ef4444"];

  const gajiFormatter = (value: number): string => (value / 1000000).toFixed(1) + "Jt";
  
  // Handler untuk tombol-tombol input file dinamis
  const handleAddFileInput = () => {
    setFileInputs((current) => [...current, { id: Date.now(), file: null }]);
  };

  const handleRemoveFileInput = (id: number) => {
    setFileInputs((current) => current.filter((input) => input.id !== id));
  };

  const handleFileChange = (id: number, file: File | null) => {
    setFileInputs((current) =>
      current.map((input) =>
        input.id === id ? { ...input, file: file } : input
      )
    );
  };
  
  const renderActionButtons = (isInitialState: boolean) => (
    <>
      <div className="flex justify-start gap-2 mb-3 flex-wrap">
        <button
          onClick={() => {
            // Memicu input file tersembunyi untuk 'replace'
            document.getElementById('csv-replace-input')?.click();
          }}
          className="rounded-lg border border-slate-300 bg-white text-slate-700 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs font-medium flex items-center gap-1"
        >
          <Upload size={14} /> Import CSV (Data Karyawan)
        </button>
        
        {/* Tombol yang disembunyikan di tampilan awal */}
        {!isInitialState && (
          <>
            <button
              onClick={handleAddFileInput}
              className="rounded-lg border border-green-500 bg-green-500 text-white px-3 py-1.5 hover:bg-green-600 active:scale-[.99] text-xs font-medium flex items-center gap-1"
            >
              <PlusCircle size={14} /> Tambah Data Baru
            </button>

            <button
              onClick={handleResetData}
              className="rounded-lg border border-red-500 bg-white text-red-600 px-3 py-1.5 hover:bg-red-50 active:scale-[.99] text-xs font-medium"
            >
              Reset Data
            </button>
            <button
              onClick={() => downloadCsv(filtered)}
              disabled={safeEmployees.length === 0} 
              className="rounded-lg border border-slate-300 bg-white text-slate-700 px-3 py-1.5 hover:bg-slate-50 active:scale-[.99] text-xs font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={computeAIRanking}
              disabled={isLoadingAi || safeEmployees.length === 0}
              className="rounded-lg border-blue-500 bg-blue-500 text-white px-3 py-1.5 hover:bg-blue-600 cursor-pointer text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingAi ? "Memproses AI..." : "Hitung Ranking & Catatan AI"}
            </button>
          </>
        )}
      </div>

      {/* Input file tersembunyi HANYA untuk "Ganti" */}
      <input
        type="file"
        id="csv-replace-input"
        accept=".csv"
        onChange={handleImportReplace}
        className="hidden"
      />
    </>
  );

  // ====== RENDER ======
  const isInitialState = safeEmployees.length === 0 && fileInputs.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/80 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h1 className="text-lg md:text-2xl font-semibold tracking-tight text-slate-900">
            📊 Dashboard Perankingan Karyawan
          </h1>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <input
              value={query}
              onChange={(e) => {
                setPage(1);
                setQuery(e.target.value);
              }}
              placeholder="Cari nama, kota, jabatan..."
              className="w-full md:w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 text-slate-800 placeholder-slate-400"
            />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-4">

        {safeEmployees.length > 0 ? (
          <React.Fragment>
            {/* Analytics Section */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <StatCard
                title="Total Karyawan"
                value={filtered.length}
                subtitle={`dari ${safeEmployees.length} total`}
              />
              <StatCard
                title="Total Gaji (Bulan)"
                value={currency.format(totalGaji)}
              />
              <StatCard
                title="Rata-rata Absensi"
                value={avgAbsensi}
                subtitle="hari/tahun (dibulatkan)"
              />
            </section>

            {/* Charts Section */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Chart 1: Gaji per Departemen */}
              <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-200 lg:col-span-2">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  Total Pengeluaran Gaji per Departemen
                </h2>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataGaji} margin={{ top: 15, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#64748b" interval={0} tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(value) => (value / 1000000).toFixed(0) + "Jt"} stroke="#64748b" />
                      <Tooltip formatter={(value) => [currency.format(value as any), "Gaji Total"]} />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                      <Bar dataKey="total" fill="#2563eb" name="Gaji Total">
                        <LabelList
                          dataKey="total"
                          position="top"
                          formatter={gajiFormatter as any}
                          style={{ fill: '#475569', fontSize: 10 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Proporsi Karyawan per Departemen */}
              <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  Proporsi Karyawan per Departemen
                </h2>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dataDepartemen}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        labelLine={false}
                        label={false}
                        fill={COLORS[0]}
                      >
                        {dataDepartemen.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [value, name]} />
                      <Legend iconType="circle" layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Chart 3: Tren Absensi Bulanan */}
            <section className="bg-white p-4 rounded-xl shadow-lg border border-slate-200 mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Rata-rata Absensi Bulanan Karyawan
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dataAbsensiByMonth} margin={{ top: 15, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" interval={0} tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" domain={[0, 'dataMax + 1']} tickFormatter={(value) => Math.round(value as any).toString()} />
                    <Tooltip
                      formatter={(value) => [Math.round(value as any), "Absensi (Hari)"]}
                      labelFormatter={(label) => `Bulan: ${label}`}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                    <Bar dataKey="absensi" fill="#f59e0b" name="Rata-rata Absensi">
                      <LabelList
                        dataKey="absensi"
                        position="top"
                        formatter={(value: any) => Math.round(value).toString()}
                        style={{ fill: '#475569', fontSize: 10 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {aiNotes && (
              <div
                className={`mb-4 p-4 rounded-xl text-sm whitespace-pre-wrap leading-relaxed ${
                    aiNotes.includes("Error") || aiNotes.includes("Gagal") ? "bg-red-50 text-red-700 border border-red-300" : "bg-slate-100 text-slate-900 border border-slate-300"
                }`}
                dangerouslySetInnerHTML={{ __html: aiNotes.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
              />
            )}
            
            {/* RENDER TOMBOL LENGKAP SAAT DATA ADA */}
            {renderActionButtons(false)} 

            {/* Render baris input file dinamis */}
            {fileInputs.length > 0 && (
              <div className="p-4 bg-slate-100 rounded-lg mb-4 border border-slate-300">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">
                  Antrean File untuk Ditambahkan:
                </h3>
                <div className="space-y-2">
                  {fileInputs.map((input, index) => (
                    <div key={input.id} className="flex items-center gap-2">
                      <label className="flex-1">
                        <span className="sr-only">Pilih file {index + 1}</span>
                        <input
                          type="file"
                          accept=".csv"
                          onChange={(e) => handleFileChange(input.id, e.target.files ? e.target.files[0] : null)}
                          className="text-xs text-slate-700 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 w-full"
                        />
                      </label>
                      <button
                        onClick={() => handleRemoveFileInput(input.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <MinusCircle size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleProcessAppend}
                  disabled={isLoadingAi || fileInputs.every(f => f.file === null)}
                  className="rounded-lg bg-green-600 text-white px-3 py-1.5 hover:bg-green-700 cursor-pointer text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-3 w-full"
                >
                  {isLoadingAi ? "Memproses..." : `Proses ${fileInputs.filter(f => f.file).length} File Tambahan`}
                </button>
              </div>
            )}


            {/* Table Section */}
            <section className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
              <h2 className="text-lg font-semibold text-slate-900 p-6 pb-2">
                Tabel Karyawan & Ranking
              </h2>

              {/* Table wrapper */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-100 text-left text-sm font-semibold text-slate-700">
                    <tr>
                      <Th field="rank" label="Rank" />
                      <Th field="nama" label="Nama" />
                      <Th field="departemen" label="Jabatan/Departemen" />
                      <Th field="status" label="Status" />
                      <Th field="tanggalMasuk" label="Masa Kerja" />
                      <Th field="gaji" label="Gaji" />
                      <Th field="umur" label="Umur" />
                      <Th field="tempatTinggal" label="Tempat Tinggal" />
                      <th className="px-4 py-3">Catatan AI</th>
                      <th className="px-4 py-3">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200 text-sm text-slate-800">
                    <AnimatePresence>
                      {paginated.map((e) => (
                        <React.Fragment key={e.nama}>
                          {/* Main Row */}
                          <tr
                            className="hover:bg-slate-50 cursor-pointer"
                            onClick={() => handleRowClick(e.nama)}
                          >
                            <td className="px-4 py-3 tabular-nums font-bold w-16">
                              {e.rank || "-"}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900">{e.nama}</td>
                            <td className="px-4 py-3">
                              <div>{e.jabatan}</div>
                              <div className="text-xs text-slate-600">{e.departemen}</div>
                            </td>
                            <td className="px-4 py-3">{e.status}</td>
                            <td className="px-4 py-3">{calculateMasaKerja(e.tanggalMasuk)}</td>
                            <td className="px-4 py-3 tabular-nums">{currency.format(e.gaji)}</td>
                            <td className="px-4 py-3 tabular-nums">{e.umur}</td>
                            <td className="px-4 py-3">{e.tempatTinggal}</td>
                            <td className="px-4 py-3 text-xs text-slate-600 max-w-xs whitespace-pre-line break-words">
                                {e.catatan || "-"}
                            </td>
                            <td className="px-4 py-3 w-16 text-center">
                              {expandedRow === e.nama ? (
                                <MinusCircle size={18} className="text-blue-600 mx-auto" />
                              ) : (
                                <PlusCircle size={18} className="text-slate-500 mx-auto" />
                              )}
                            </td>
                          </tr>

                          {/* Expanded Row */}
                          {expandedRow === e.nama && (
                            <motion.tr
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <td colSpan={10} className="p-0">
                                <PerformanceDetail
                                  history={e.performanceHistory}
                                  gaji={e.gaji}
                                  totalProyekSelesai={e.totalProyekSelesai || 0}
                                  avgSkorKinerja={e.avgSkorKinerja || 0}
                                />
                              </td>
                            </motion.tr>
                          )}
                        </React.Fragment>
                      ))}
                    </AnimatePresence>

                    {paginated.length === 0 && (
                      <tr>
                        <td colSpan={10} className="text-center p-12 text-slate-500">
                          {query ? `Tidak ada hasil untuk "${query}".` : "Tidak ada data karyawan."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="flex flex-col md:flex-row items-center justify-between text-sm text-slate-700 p-4 border-t border-slate-200 gap-3">
                <div className="flex items-center gap-3">
                  <label htmlFor="rowsPerPage" className="flex items-center gap-1">
                    Baris:
                    <select
                        id="rowsPerPage"
                        value={perPage}
                        onChange={(e) => {
                            setPerPage(Number(e.target.value));
                            setPage(1); // Reset ke halaman 1
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 cursor-pointer"
                    >
                        {[5, 10, 15, 25, 50].map(val => (
                            <option key={val} value={val}>{val}</option>
                        ))}
                    </select>
                  </label>
                  <p>
                    Menampilkan <strong>{paginated.length}</strong> dari <strong>{sorted.length}</strong> hasil
                    (halaman <strong>{page}</strong> dari <strong>{maxPage}</strong>)
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
                  >
                    Sebelumnya
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                    disabled={page === maxPage}
                    className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            </section>
          </React.Fragment>
        ) : (
          <>
            {aiNotes && (
              <div
                className={`mb-4 p-4 rounded-xl text-sm whitespace-pre-wrap leading-relaxed ${
                    aiNotes.includes("Error") || aiNotes.includes("Gagal") ? "bg-red-50 text-red-700 border border-red-300" : "bg-slate-100 text-slate-900 border border-slate-300"
                }`}
                dangerouslySetInnerHTML={{ __html: aiNotes.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
              />
            )}
            
            {/* RENDER HANYA TOMBOL IMPORT CSV SAAT DATA KOSONG */}
            {renderActionButtons(true)} 
            
            {/* Render baris input file dinamis (juga saat kosong) */}
            {fileInputs.length > 0 && (
              <div className="p-4 bg-white rounded-lg mb-4 border border-slate-300">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">
                  Antrean File untuk Ditambahkan:
                </h3>
                <div className="space-y-2">
                  {fileInputs.map((input, index) => (
                    <div key={input.id} className="flex items-center gap-2">
                      <label className="flex-1">
                        <span className="sr-only">Pilih file {index + 1}</span>
                        <input
                          type="file"
                          accept=".csv"
                          onChange={(e) => handleFileChange(input.id, e.target.files ? e.target.files[0] : null)}
                          className="text-xs text-slate-700 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 w-full"
                        />
                      </label>
                      <button
                        onClick={() => handleRemoveFileInput(input.id)}
                        className="text-red-500 hover:text-red-700"
                      > 
                        <MinusCircle size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleProcessAppend}
                  disabled={isLoadingAi || fileInputs.every(f => f.file === null)}
                  className="rounded-lg bg-green-600 text-white px-3 py-1.5 hover:bg-green-700 cursor-pointer text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-3 w-full"
                >
                  {isLoadingAi ? "Memproses..." : `Proses ${fileInputs.filter(f => f.file).length} File Tambahan`}
                </button>
              </div>
            )}
            
            <div className="text-center p-10 bg-white rounded-xl shadow-lg border border-slate-200 mt-6">
              <Upload size={40} className="mx-auto text-slate-400" />
              <h2 className="mt-4 text-xl font-semibold text-slate-800">Inputkan File CSV Karyawan</h2>
              <p className="mt-2 text-slate-600">
                Silakan impor file CSV Anda atau klik "Reset Data" untuk memuat data demo dan memulai analisis.
              </p>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-slate-500">
        Dashboard Perankingan Karyawan v1.0
      </footer>
    </div>
  );
}