import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const allowedOrigins = new Set([
  "https://aeevi.org",
  "https://www.aeevi.org",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://aeevi.org",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" },
  });
}
function text(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}
function fail(message: string, status = 400) {
  return { error: message, status };
}
async function currentUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at) return null;
  return data.user;
}
async function requireRole(userId: string, roles: string[]) {
  const { data, error } = await db.from("admin_users")
    .select("role")
    .eq("auth_user_id", userId)
    .eq("enabled", true)
    .maybeSingle();
  if (error || !data || !roles.includes(data.role)) return null;
  return data.role as string;
}
async function writeAudit(actor: string, action: string, kind: string, id: string, details = {}) {
  const { error } = await db.from("audit_log").insert({
    actor_auth_user_id: actor,
    action,
    entity_type: kind,
    entity_id: id,
    details,
  });
  if (error) throw error;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Permintaan tidak valid." }, 400);
  }

  const action = text(body.action, 40);
  const user = await currentUser(req);

  try {
    if (action === "registration-window") {
      const now = new Date().toISOString();
      const { data, error } = await db.from("registration_windows")
        .select("id,calendar_year,period,opens_at,closes_at")
        .eq("is_enabled", true)
        .lte("opens_at", now)
        .gt("closes_at", now)
        .order("opens_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return json(req, { open: Boolean(data), window: data ?? null });
    }

    if (!user) return json(req, { error: "Masuk dengan email terverifikasi terlebih dahulu." }, 401);

    if (action === "submit-application") {
      const kind = text(body.kind, 20);
      const fullName = text(body.fullName, 180);
      const whatsapp = text(body.whatsapp, 40);
      const requestedNra = text(body.nra, 24);
      const consent = body.consent === true;
      if (!["new", "renewal"].includes(kind) || fullName.length < 3 || whatsapp.length < 8 || !consent) {
        return json(req, { error: "Lengkapi nama, WhatsApp, jenis pendaftaran, dan persetujuan." }, 400);
      }
      if (kind === "renewal" && !requestedNra) {
        return json(req, { error: "NRA diperlukan untuk registrasi ulang." }, 400);
      }

      const now = new Date().toISOString();
      const { data: windowRow, error: windowError } = await db.from("registration_windows")
        .select("id,calendar_year")
        .eq("is_enabled", true)
        .lte("opens_at", now)
        .gt("closes_at", now)
        .order("opens_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (windowError) throw windowError;
      if (!windowRow) return json(req, { error: "Pendaftaran sedang ditutup." }, 409);

      const { data: prior, error: priorError } = await db.from("applications")
        .select("id,status")
        .eq("applicant_auth_user_id", user.id)
        .eq("window_id", windowRow.id)
        .in("status", ["submitted", "under_review", "needs_correction"])
        .limit(1)
        .maybeSingle();
      if (priorError) throw priorError;
      if (prior) return json(req, { error: "Sudah ada pengajuan aktif untuk periode ini.", applicationId: prior.id }, 409);

      let linkedMemberId: string | null = null;
      if (kind === "renewal") {
        const { data: match, error: matchError } = await db.from("members")
          .select("id,email,auth_user_id")
          .eq("nra", requestedNra)
          .maybeSingle();
        if (matchError) throw matchError;
        if (match && (match.auth_user_id === user.id ||
          (match.email && match.email.toLowerCase() === (user.email ?? "").toLowerCase()))) {
          linkedMemberId = match.id;
        }
      }

      const email = (user.email ?? "").toLowerCase();
      const { data: application, error } = await db.from("applications").insert({
        applicant_auth_user_id: user.id,
        window_id: windowRow.id,
        member_id: linkedMemberId,
        kind,
        requested_nra: kind === "renewal" ? requestedNra : null,
        full_name: fullName,
        institution: text(body.institution, 180) || null,
        province: text(body.province, 100) || null,
        city_or_regency: text(body.cityOrRegency, 100) || null,
        discipline: text(body.discipline, 120) || null,
        category: text(body.category, 80) || null,
        email,
        whatsapp,
        consent_card_and_contact: consent,
        status: "submitted",
      }).select("id,status,submitted_at").single();
      if (error) throw error;
      return json(req, { application, memberLinked: Boolean(linkedMemberId) }, 201);
    }

    if (action === "attach-payment") {
      const applicationId = text(body.applicationId, 60);
      const evidencePath = text(body.evidencePath, 240);
      const amount = Number(body.amountIdr);
      const paidOn = text(body.paidOn, 10);
      if (!applicationId || !evidencePath.startsWith(applicationId + "/") ||
          !Number.isSafeInteger(amount) || amount <= 0) {
        return json(req, { error: "Data pembayaran tidak lengkap atau tidak valid." }, 400);
      }
      const { data: application, error: appError } = await db.from("applications")
        .select("id,applicant_auth_user_id,window_id")
        .eq("id", applicationId)
        .eq("applicant_auth_user_id", user.id)
        .maybeSingle();
      if (appError) throw appError;
      if (!application) return json(req, { error: "Pengajuan tidak ditemukan." }, 404);

      const { data: object, error: objectError } = await db.schema("storage").from("objects")
        .select("name")
        .eq("bucket_id", "payment-evidence")
        .eq("name", evidencePath)
        .maybeSingle();
      if (objectError) throw objectError;
      if (!object) return json(req, { error: "Bukti pembayaran belum berhasil diunggah." }, 400);

      const currentYear = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })).getFullYear();
      const { data, error } = await db.from("payment_submissions").insert({
        application_id: applicationId,
        calendar_year: currentYear,
        amount_idr: amount,
        paid_on: paidOn || null,
        evidence_object_path: evidencePath,
        status: "pending",
      }).select("id,status,calendar_year").single();
      if (error) throw error;
      return json(req, { payment: data }, 201);
    }

    if (action === "member-dashboard") {
      const [{ data: member, error: memberError }, { data: applications, error: appError }] = await Promise.all([
        db.from("members").select("id,nra,full_name,institution,province,city_or_regency,status")
          .eq("auth_user_id", user.id).maybeSingle(),
        db.from("applications")
          .select("id,kind,requested_nra,status,submitted_at,reviewer_note,window_id")
          .eq("applicant_auth_user_id", user.id)
          .order("submitted_at", { ascending: false }).limit(20),
      ]);
      if (memberError) throw memberError;
      if (appError) throw appError;
      let dues = [];
      if (member) {
        const { data, error } = await db.from("annual_membership_dues")
          .select("calendar_year,verified_at")
          .eq("member_id", member.id)
          .order("calendar_year", { ascending: false });
        if (error) throw error;
        dues = data ?? [];
      }
      return json(req, { member: member ?? null, dues, applications: applications ?? [] });
    }

    const role = await requireRole(user.id, ["registrar", "treasurer", "membership_admin", "superadmin"]);
    if (!role) return json(req, { error: "Akun ini tidak memiliki akses pengurus." }, 403);

    if (action === "admin-queue") {
      const { data, error } = await db.from("applications")
        .select("id,kind,requested_nra,full_name,institution,province,city_or_regency,email,whatsapp,status,submitted_at,member_id,payment_submissions(id,calendar_year,amount_idr,paid_on,status,evidence_object_path)")
        .order("submitted_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return json(req, { role, applications: data ?? [] });
    }

    if (action === "verify-payment") {
      if (!["treasurer", "membership_admin", "superadmin"].includes(role)) {
        return json(req, { error: "Hanya bendahara atau admin keanggotaan yang dapat memvalidasi pembayaran." }, 403);
      }
      const paymentId = text(body.paymentId, 60);
      const decision = text(body.decision, 20);
      if (!paymentId || !["verified", "rejected"].includes(decision)) {
        return json(req, { error: "Keputusan pembayaran tidak valid." }, 400);
      }
      const { data: payment, error: paymentError } = await db.from("payment_submissions")
        .select("id,application_id,calendar_year,status")
        .eq("id", paymentId).single();
      if (paymentError) throw paymentError;
      if (payment.status !== "pending") return json(req, { error: "Pembayaran ini sudah diproses." }, 409);

      const { error: updateError } = await db.from("payment_submissions").update({
        status: decision,
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      }).eq("id", paymentId).eq("status", "pending");
      if (updateError) throw updateError;

      if (decision === "verified") {
        const { data: app, error: appError } = await db.from("applications")
          .select("member_id").eq("id", payment.application_id).single();
        if (appError) throw appError;
        if (app.member_id) {
          const { error: duesError } = await db.from("annual_membership_dues").upsert({
            member_id: app.member_id,
            calendar_year: payment.calendar_year,
            payment_submission_id: payment.id,
            verified_at: new Date().toISOString(),
            verified_by: user.id,
          }, { onConflict: "member_id,calendar_year", ignoreDuplicates: true });
          if (duesError) throw duesError;
        }
      }
      await writeAudit(user.id, "verify_payment", "payment_submission", paymentId, { decision });
      return json(req, { ok: true, status: decision });
    }

    if (action === "review-application") {
      const applicationId = text(body.applicationId, 60);
      const decision = text(body.decision, 30);
      if (!applicationId) return json(req, { error: "ID pengajuan tidak valid." }, 400);

      if (decision === "approve") {
        if (!["membership_admin", "superadmin"].includes(role)) {
          return json(req, { error: "Persetujuan akhir hanya dapat dilakukan admin keanggotaan." }, 403);
        }
        const { data, error } = await db.rpc("approve_membership_application", {
          p_application_id: applicationId,
          p_actor_id: user.id,
        }).single();
        if (error) throw error;
        return json(req, { ok: true, member: data });
      }

      if (!["needs_correction", "rejected"].includes(decision) ||
          !["registrar", "membership_admin", "superadmin"].includes(role)) {
        return json(req, { error: "Keputusan verifikasi tidak valid." }, 403);
      }
      const { error } = await db.from("applications").update({
        status: decision,
        reviewer_note: text(body.note, 500) || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", applicationId)
        .in("status", ["submitted", "under_review"]);
      if (error) throw error;
      await writeAudit(user.id, decision, "application", applicationId);
      return json(req, { ok: true, status: decision });
    }

    if (action === "export-members") {
      if (!["membership_admin", "superadmin"].includes(role)) {
        return json(req, { error: "Hanya admin keanggotaan yang dapat mengunduh master anggota." }, 403);
      }
      const { data: members, error } = await db.from("members")
        .select("nra,full_name,category,discipline,institution,province,city_or_regency,email,whatsapp,status,joined_at")
        .order("nra", { ascending: true });
      if (error) throw error;
      const { data: dues, error: duesError } = await db.from("annual_membership_dues")
        .select("member_id,calendar_year,verified_at");
      if (duesError) throw duesError;

      const duesByMember = new Map<string, number[]>();
      for (const item of dues ?? []) {
        const years = duesByMember.get(item.member_id) ?? [];
        years.push(item.calendar_year);
        duesByMember.set(item.member_id, years);
      }
      const workbook = XLSX.utils.book_new();
      const membersSheet = XLSX.utils.json_to_sheet((members ?? []).map((m: any) => ({
        NRA: m.nra,
        Nama: m.full_name,
        Kategori: m.category,
        Disiplin: m.discipline,
        Institusi: m.institution,
        Provinsi: m.province,
        Kabupaten_Kota: m.city_or_regency,
        Email: m.email,
        WhatsApp: m.whatsapp,
        Status: m.status,
        Tahun_Bergabung: m.joined_at,
        Iuran_Terverifikasi: (duesByMember.get(m.id) ?? []).sort((a, b) => b - a).join(", "),
      })));
      XLSX.utils.book_append_sheet(workbook, membersSheet, "Master Anggota");
      const duesSheet = XLSX.utils.json_to_sheet((dues ?? []).map((d: any) => ({
        NRA: (members ?? []).find((m: any) => m.id === d.member_id)?.nra ?? "",
        Tahun_Iuran: d.calendar_year,
        Tanggal_Verifikasi: d.verified_at,
      })));
      XLSX.utils.book_append_sheet(workbook, duesSheet, "Iuran Tahunan");
      const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      await writeAudit(user.id, "export_members", "member_master", "all");
      return new Response(bytes, {
        headers: {
          ...cors(req),
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="AEEVI_Master_Anggota.xlsx"',
          "Cache-Control": "no-store",
        },
      });
    }

    return json(req, { error: "Aksi tidak dikenali." }, 404);
  } catch (error) {
    console.error("membership-api error", error);
    return json(req, { error: "Layanan gagal memproses permintaan. Coba lagi atau hubungi sekretariat." }, 500);
  }
});
