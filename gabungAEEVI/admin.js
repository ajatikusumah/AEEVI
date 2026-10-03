const config = window.AEEVI_SUPABASE_CONFIG || {};
const authBox = document.querySelector("#admin-auth");
const adminPanel = document.querySelector("#admin-panel");
const setupNotice = document.querySelector("#setup-notice");
const queueTarget = document.querySelector("#application-queue");
const queueMessage = document.querySelector("#queue-message");
let supabase;
let currentRole = null;

function message(text, type = "") {
  queueMessage.textContent = text;
  queueMessage.className = `form-message ${type}`.trim();
}
async function call(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke("membership-api", { body: { action, ...payload } });
  if (error) {
    let detail = error.message || "Permintaan gagal.";
    try { detail = (await error.context.json()).error || detail; } catch {}
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
function addText(parent, tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = value ?? "";
  parent.append(el);
  return el;
}
async function loadQueue() {
  message("Memuat daftar pengajuan…");
  queueTarget.replaceChildren();
  try {
    const result = await call("admin-queue");
    document.querySelector("#admin-account").textContent = `${(await supabase.auth.getUser()).data.user?.email || ""} · ${result.role}`;
    if (!result.applications.length) {
      addText(queueTarget, "p", "", "Belum ada pengajuan.");
      message("");
      return;
    }
    for (const app of result.applications) {
      const card = document.createElement("article");
      card.className = "status-item admin-app";
      addText(card, "strong", "", `${app.kind === "new" ? "Anggota baru" : "Registrasi ulang"} · ${app.full_name}`);
      addText(card, "p", "", `Status: ${app.status} · Dikirim: ${new Date(app.submitted_at).toLocaleString("id-ID")}`);
      addText(card, "p", "", `NRA pengajuan: ${app.requested_nra || "belum ada"} · Institusi: ${app.institution || "belum diisi"}`);
      addText(card, "p", "", `Wilayah: ${[app.city_or_regency, app.province].filter(Boolean).join(", ") || "belum diisi"} · WhatsApp: ${app.whatsapp}`);
      addText(card, "p", "", `Email: ${app.email}`);

      const payments = app.payment_submissions || [];
      for (const payment of payments) {
        const pay = document.createElement("div");
        pay.className = "payment-review";
        addText(pay, "p", "", `Iuran ${payment.calendar_year}: Rp ${Number(payment.amount_idr).toLocaleString("id-ID")} · ${payment.status}`);
        const proof = document.createElement("button");
        proof.type = "button";
        proof.className = "button button-outline";
        proof.textContent = "Lihat bukti";
        proof.addEventListener("click", async () => {
          const { data, error } = await supabase.storage.from("payment-evidence").createSignedUrl(payment.evidence_object_path, 90);
          if (error) { message(error.message, "error"); return; }
          window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        });
        pay.append(proof);
        if (payment.status === "pending" && ["treasurer", "membership_admin", "superadmin"].includes(currentRole)) {
          const verify = document.createElement("button");
          verify.type = "button";
          verify.className = "button button-primary";
          verify.textContent = "Validasi pembayaran";
          verify.addEventListener("click", async () => {
            verify.disabled = true;
            try { await call("verify-payment", { paymentId: payment.id, decision: "verified" }); await loadQueue(); }
            catch (error) { message(error.message, "error"); verify.disabled = false; }
          });
          pay.append(verify);
        }
        card.append(pay);
      }

      const actions = document.createElement("div");
      actions.className = "admin-actions";
      if (app.status === "submitted" || app.status === "under_review") {
        for (const [decision, label] of [
          ["needs_correction", "Minta perbaikan"],
          ["rejected", "Tolak"],
          ["approve", "Setujui"],
        ]) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = decision === "approve" ? "button button-primary" : "button button-outline";
          button.textContent = label;
          button.addEventListener("click", async () => {
            const note = decision === "needs_correction" || decision === "rejected"
              ? window.prompt("Catatan untuk pemohon:") || ""
              : "";
            if ((decision === "needs_correction" || decision === "rejected") && !note.trim()) return;
            button.disabled = true;
            try {
              await call("review-application", { applicationId: app.id, decision, note });
              await loadQueue();
            } catch (error) { message(error.message, "error"); button.disabled = false; }
          });
          actions.append(button);
        }
      }
      card.append(actions);
      queueTarget.append(card);
    }
    message(`${result.applications.length} pengajuan dimuat. Peran Anda: ${result.role}.`);
  } catch (error) {
    message(error.message, "error");
  }
}
function updateView(user) {
  authBox.hidden = Boolean(user);
  adminPanel.hidden = !user;
  if (user) loadQueue();
}
if (!config.url || !config.publishableKey) {
  setupNotice.hidden = false;
  setupNotice.textContent = "Portal belum terhubung ke backend Supabase AEEVI.";
  document.querySelector("#admin-login button").disabled = true;
} else {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  supabase = createClient(config.url, config.publishableKey, { auth: { flowType: "pkce", persistSession: true } });
  document.querySelector("#admin-login").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.querySelector("#admin-email").value.trim();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
    document.querySelector("#admin-message").textContent = error ? error.message : "Tautan masuk dikirim ke email pengurus.";
  });
  document.querySelector("#admin-signout").addEventListener("click", async () => { await supabase.auth.signOut(); updateView(null); });
  document.querySelector("#refresh-queue").addEventListener("click", loadQueue);
  document.querySelector("#export-members").addEventListener("click", async () => {
    const button = document.querySelector("#export-members");
    button.disabled = true;
    message("Menyiapkan file Excel…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${config.url}/functions/v1/membership-api`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.publishableKey,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "export-members" }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Ekspor gagal.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "AEEVI_Master_Anggota.xlsx";
      link.click();
      URL.revokeObjectURL(url);
      message("File Excel selesai diunduh.", "success");
    } catch (error) { message(error.message, "error"); }
    finally { button.disabled = false; }
  });
  const { data: { session } } = await supabase.auth.getSession();
  updateView(session?.user ?? null);
  supabase.auth.onAuthStateChange((_event, session) => updateView(session?.user ?? null));
}
