const config = window.AEEVI_SUPABASE_CONFIG || {};
const setupNotice = document.querySelector("#setup-notice");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const applicationForm = document.querySelector("#application-form");
const applicationMessage = document.querySelector("#application-message");
const applicationKind = document.querySelector("#application-kind");
const nraField = document.querySelector("#nra-field");
const windowStatus = document.querySelector("#window-status");
const authPanel = document.querySelector("#auth-panel");
const memberPanel = document.querySelector("#member-panel");
const currentYear = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })).getFullYear();
document.querySelector("#current-year").textContent = String(currentYear);

let supabase = null;
let activeWindow = null;
let sessionUser = null;

function setMessage(node, message, type = "") {
  node.textContent = message;
  node.className = `form-message ${type}`.trim();
}
function setFormEnabled(enabled) {
  for (const el of applicationForm.elements) el.disabled = !enabled;
}
function statusLabel(status) {
  return ({
    submitted: "Diterima, menunggu pemeriksaan",
    under_review: "Sedang diverifikasi",
    needs_correction: "Perlu perbaikan data",
    approved: "Disetujui",
    rejected: "Belum dapat disetujui",
    withdrawn: "Dibatalkan",
    pending: "Menunggu verifikasi bendahara",
    verified: "Terverifikasi",
  })[status] || status;
}
function showSetupMessage(message) {
  setupNotice.hidden = false;
  setupNotice.textContent = message;
  setFormEnabled(false);
  loginForm.querySelector("button").disabled = true;
}
function renderCard(member) {
  const card = document.querySelector("#digital-card");
  if (!member || !member.nra || member.status !== "active") {
    card.hidden = true;
    return;
  }
  card.replaceChildren();
  const brand = document.createElement("div");
  brand.className = "card-brand";
  brand.textContent = "AEEVI · ANGGOTA";
  const name = document.createElement("h4");
  name.textContent = member.full_name;
  const nra = document.createElement("div");
  nra.className = "card-nra";
  nra.textContent = member.nra;
  const institution = document.createElement("p");
  institution.textContent = [member.institution, member.province].filter(Boolean).join(" · ");
  const foot = document.createElement("div");
  foot.className = "card-foot";
  foot.textContent = "Kartu digital anggota AEEVI";
  const printButton = document.createElement("button");
  printButton.type = "button";
  printButton.className = "button button-outline";
  printButton.textContent = "Cetak / simpan sebagai PDF";
  printButton.addEventListener("click", () => window.print());
  card.append(brand, name, nra, institution, foot, printButton);
  card.hidden = false;
}
function renderDashboard(data) {
  const correction = (data.applications || []).find((app) => app.status === "needs_correction");
  const evidenceInput = document.querySelector("#payment-evidence");
  const submitButton = document.querySelector("#submit-button");
  if (correction) {
    applicationForm.dataset.revisingId = correction.id;
    applicationForm.elements.namedItem("kind").value = correction.kind;
    applicationForm.elements.namedItem("nra").value = correction.requested_nra || "";
    applicationForm.elements.namedItem("fullName").value = correction.full_name || "";
    applicationForm.elements.namedItem("institution").value = correction.institution || "";
    applicationForm.elements.namedItem("discipline").value = correction.discipline || "";
    applicationForm.elements.namedItem("province").value = correction.province || "";
    applicationForm.elements.namedItem("cityOrRegency").value = correction.city_or_regency || "";
    applicationForm.elements.namedItem("whatsapp").value = correction.whatsapp || "";
    applicationForm.elements.namedItem("consent").checked = true;
    const hasUsablePayment = (correction.payment_submissions || []).some((payment) => ["pending", "verified"].includes(payment.status));
    evidenceInput.required = !hasUsablePayment;
    applicationKind.dispatchEvent(new Event("change"));
    submitButton.textContent = "Kirim perbaikan";
    setFormEnabled(Boolean(sessionUser));
    setMessage(applicationMessage, "Pengurus meminta perbaikan. Perbarui data di bawah ini.", "");
  } else if (applicationForm.dataset.revisingId) {
    delete applicationForm.dataset.revisingId;
    evidenceInput.required = true;
    submitButton.innerHTML = "Kirim pendaftaran <span>↗</span>";
  }
  const target = document.querySelector("#dashboard-content");
  target.replaceChildren();
  const rows = [];
  if (data.member) {
    const item = document.createElement("div");
    item.className = "status-item";
    const strong = document.createElement("strong");
    strong.textContent = `NRA ${data.member.nra || "belum diterbitkan"} · ${data.member.full_name}`;
    const status = document.createElement("span");
    status.textContent = `Status keanggotaan: ${data.member.status === "active" ? "aktif" : "tidak aktif"}`;
    item.append(strong, status);
    rows.push(item);
  }
  for (const app of data.applications || []) {
    const payments = app.payment_submissions || [];
    const item = document.createElement("div");
    item.className = "status-item";
    const strong = document.createElement("strong");
    strong.textContent = app.kind === "renewal" ? `Registrasi ulang · NRA ${app.requested_nra || "belum dihubungkan"}` : "Pendaftaran anggota baru";
    const status = document.createElement("span");
    status.textContent = `${statusLabel(app.status)} · ${new Date(app.submitted_at).toLocaleDateString("id-ID")}`;
    item.append(strong, status);
    for (const payment of payments) {
      const pay = document.createElement("div");
      pay.textContent = `Iuran ${payment.calendar_year}: ${statusLabel(payment.status)}`;
      item.append(pay);
    }
    if (app.reviewer_note) {
      const note = document.createElement("p");
      note.textContent = `Catatan pengurus: ${app.reviewer_note}`;
      item.append(note);
    }
    const mayRetryPayment = app.status === "submitted" &&
      (payments.length === 0 || payments.every((payment) => payment.status === "rejected"));
    if (mayRetryPayment) {
      const retryForm = document.createElement("form");
      retryForm.className = "retry-payment join-form";
      const title = document.createElement("strong");
      title.textContent = "Kirim ulang bukti pembayaran";
      const fileLabel = document.createElement("label");
      fileLabel.textContent = "Bukti pembayaran";
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".pdf,image/jpeg,image/png";
      fileInput.required = true;
      fileLabel.append(fileInput);
      const amountLabel = document.createElement("label");
      amountLabel.textContent = "Jumlah yang dibayarkan (Rp)";
      const amountInput = document.createElement("input");
      amountInput.type = "number";
      amountInput.min = "1";
      amountInput.step = "1";
      amountInput.required = true;
      amountLabel.append(amountInput);
      const dateLabel = document.createElement("label");
      dateLabel.textContent = "Tanggal pembayaran";
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.required = true;
      dateLabel.append(dateInput);
      const retryButton = document.createElement("button");
      retryButton.type = "submit";
      retryButton.className = "button button-primary";
      retryButton.textContent = "Unggah bukti baru";
      retryForm.append(title, fileLabel, amountLabel, dateLabel, retryButton);
      retryForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const file = fileInput.files?.[0];
        if (!file || file.size > 5 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
          setMessage(applicationMessage, "Pilih bukti PDF, JPG, atau PNG dengan ukuran maksimal 5 MB.", "error");
          return;
        }
        retryButton.disabled = true;
        try {
          const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-90) || "bukti";
          const evidencePath = `${app.id}/${crypto.randomUUID()}-${safeName}`;
          const { error: uploadError } = await supabase.storage.from("payment-evidence")
            .upload(evidencePath, file, { upsert: false, contentType: file.type });
          if (uploadError) throw uploadError;
          await invoke("attach-payment", {
            applicationId: app.id,
            evidencePath,
            amountIdr: Number(amountInput.value),
            paidOn: dateInput.value,
          });
          setMessage(applicationMessage, "Bukti pembayaran baru berhasil dikirim dan menunggu pemeriksaan bendahara.", "success");
          await refreshDashboard();
        } catch (error) {
          setMessage(applicationMessage, error.message || "Bukti pembayaran gagal dikirim.", "error");
          retryButton.disabled = false;
        }
      });
      item.append(retryForm);
    }
    rows.push(item);
  }
  if (data.member) {
    const currentDues = (data.dues || []).find((due) => due.calendar_year === currentYear);
    const item = document.createElement("div");
    item.className = "status-item";
    const strong = document.createElement("strong");
    strong.textContent = `Iuran tahunan ${currentYear}`;
    const status = document.createElement("span");
    status.textContent = currentDues ? "Sudah tercatat terverifikasi" : "Belum tercatat terverifikasi";
    item.append(strong, status);
    rows.push(item);
  }
  if (rows.length) target.append(...rows);
  else {
    const p = document.createElement("p");
    p.textContent = "Belum ada pengajuan atau NRA yang terhubung dengan akun ini.";
    target.append(p);
  }
  renderCard(data.member);
}
async function invoke(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke("membership-api", { body: { action, ...payload } });
  if (error) {
    let message = error.message || "Permintaan gagal.";
    try { message = (await error.context.json()).error || message; } catch { /* retain SDK message */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
async function loadWindow() {
  try {
    const result = await invoke("registration-window");
    activeWindow = result.window;
    if (activeWindow) {
      const begin = new Date(activeWindow.opens_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
      const finish = new Date(new Date(activeWindow.closes_at).getTime() - 1).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
      windowStatus.textContent = `Pendaftaran dibuka · ${begin}–${finish}`;
    } else {
      windowStatus.textContent = "Pendaftaran ditutup. Periode rutin: 1–30 Januari dan 1–30 Juni.";
    }
    setFormEnabled(Boolean(sessionUser && (activeWindow || applicationForm.dataset.revisingId)));
  } catch {
    windowStatus.textContent = "Periode pendaftaran belum dapat diperiksa.";
    setFormEnabled(false);
  }
}
async function refreshDashboard() {
  if (!sessionUser) return;
  try {
    const data = await invoke("member-dashboard");
    renderDashboard(data);
  } catch (error) {
    const target = document.querySelector("#dashboard-content");
    target.textContent = error.message;
  }
}
function updateAuthView(user) {
  sessionUser = user;
  authPanel.hidden = Boolean(user);
  memberPanel.hidden = !user;
  if (user) {
    document.querySelector("#account-email").textContent = user.email || "Akun anggota";
    refreshDashboard();
  }
  loadWindow();
}
applicationKind.addEventListener("change", () => {
  const isRenewal = applicationKind.value === "renewal";
  nraField.hidden = !isRenewal;
  document.querySelector("#nra-input").required = isRenewal;
});

if (!config.url || !config.publishableKey) {
  showSetupMessage("Formulir belum diaktifkan. Pengurus perlu menghubungkan layanan backend AEEVI terlebih dahulu. Data yang Anda isi tidak akan dikirim sebelum layanan siap.");
  windowStatus.textContent = "Layanan pendaftaran sedang disiapkan.";
} else {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  supabase = createClient(config.url, config.publishableKey, {
    auth: { flowType: "pkce", autoRefreshToken: true, persistSession: true },
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.querySelector("#login-email").value.trim();
    setMessage(loginMessage, "Mengirim tautan masuk…");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split("#")[0] },
    });
    setMessage(loginMessage, error ? error.message : "Tautan masuk telah dikirim. Periksa email Anda.", error ? "error" : "success");
  });

  document.querySelector("#signout-button").addEventListener("click", async () => {
    await supabase.auth.signOut();
    updateAuthView(null);
  });

  applicationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const revisingId = applicationForm.dataset.revisingId || null;
    if (!sessionUser || (!activeWindow && !revisingId)) {
      setMessage(applicationMessage, "Masuk dan tunggu periode pendaftaran dibuka.", "error");
      return;
    }
    const form = new FormData(applicationForm);
    const evidenceInput = document.querySelector("#payment-evidence");
    const file = form.get("evidence");
    const hasFile = file instanceof File && file.size > 0;
    if (!revisingId && !hasFile) {
      setMessage(applicationMessage, "Unggah bukti pembayaran untuk mengirim pendaftaran.", "error");
      return;
    }
    if (hasFile && (file.size > 5 * 1024 * 1024 ||
        !["application/pdf", "image/jpeg", "image/png"].includes(file.type))) {
      setMessage(applicationMessage, "Unggah bukti PDF, JPG, atau PNG dengan ukuran maksimal 5 MB.", "error");
      return;
    }
    const button = document.querySelector("#submit-button");
    button.disabled = true;
    setMessage(applicationMessage, hasFile ? "Mengirim data dan bukti pembayaran…" : "Mengirim perbaikan data…");
    try {
      const fields = {
        kind: form.get("kind"),
        nra: form.get("nra"),
        fullName: form.get("fullName"),
        institution: form.get("institution"),
        discipline: form.get("discipline"),
        province: form.get("province"),
        cityOrRegency: form.get("cityOrRegency"),
        whatsapp: form.get("whatsapp"),
        consent: form.get("consent") === "on",
      };
      let applicationId;
      if (revisingId) {
        await invoke("revise-application", { applicationId: revisingId, ...fields });
        applicationId = revisingId;
      } else {
        const created = await invoke("submit-application", fields);
        applicationId = created.application.id;
      }
      if (hasFile) {
        const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-90) || "bukti";
        const evidencePath = `${applicationId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("payment-evidence")
          .upload(evidencePath, file, { upsert: false, contentType: file.type });
        if (uploadError) throw new Error(`Pengajuan ${applicationId} tersimpan, tetapi unggah bukti gagal: ${uploadError.message}. Hubungi sekretariat dengan nomor ini.`);
        await invoke("attach-payment", {
          applicationId,
          evidencePath,
          amountIdr: Number(form.get("amountIdr")),
          paidOn: form.get("paidOn"),
        });
      }
      setMessage(applicationMessage, `Pengajuan ${revisingId ? "perbaikan" : "baru"} berhasil dikirim. Nomor pengajuan: ${applicationId}.`, "success");
      applicationForm.reset();
      delete applicationForm.dataset.revisingId;
      nraField.hidden = true;
      document.querySelector("#nra-input").required = false;
      evidenceInput.required = true;
      button.innerHTML = "Kirim pendaftaran <span>↗</span>";
      await refreshDashboard();
    } catch (error) {
      setMessage(applicationMessage, error.message || "Pengajuan gagal dikirim.", "error");
    } finally {
      button.disabled = false;
      setFormEnabled(Boolean(sessionUser && (activeWindow || applicationForm.dataset.revisingId)));
    }
  });

  const { data: authData } = await supabase.auth.getSession();
  updateAuthView(authData.session?.user ?? null);
  supabase.auth.onAuthStateChange((_event, session) => updateAuthView(session?.user ?? null));
}
