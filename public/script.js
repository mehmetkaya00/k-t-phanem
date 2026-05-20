const $ = (sel) => document.querySelector(sel);

const el = {
  message: $("#message"),
  authSection: $("#auth-section"),
  appSection: $("#app-section"),
  loginForm: $("#login-form"),
  registerForm: $("#register-form"),
  logoutBtn: $("#logout-btn"),
  userEmail: $("#user-email"),
  userRoleBadge: $("#user-role-badge"),
  bookForm: $("#book-form"),
  booksTbody: $("#books-tbody"),
  booksEmpty: $("#books-empty"),
  adminSection: $("#admin-section"),
  usersTbody: $("#users-tbody"),
  refreshUsersBtn: $("#refresh-users-btn"),
};

const fetchOpts = { credentials: "include" };

function showMessage(text, type) {
  el.message.textContent = text;
  el.message.className = "message " + (type || "error");
  el.message.hidden = false;
}

function hideMessage() {
  el.message.hidden = true;
  el.message.textContent = "";
}

async function parseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || "Bilinmeyen hata." };
  }
}

function setLoggedInUI(user) {
  el.authSection.hidden = true;
  el.appSection.hidden = false;
  el.userEmail.textContent = user.email;
  el.userRoleBadge.textContent = user.role;
  if (user.role === "admin") {
    el.adminSection.hidden = false;
    loadUsers();
  } else {
    el.adminSection.hidden = true;
  }
}

function setLoggedOutUI() {
  el.authSection.hidden = false;
  el.appSection.hidden = true;
  el.adminSection.hidden = true;
  el.booksTbody.innerHTML = "";
  el.usersTbody.innerHTML = "";
}

async function loadMe() {
  hideMessage();
  const res = await fetch("/api/me", fetchOpts);
  if (res.status === 401) {
    setLoggedOutUI();
    return null;
  }
  const data = await parseJson(res);
  if (!res.ok) {
    showMessage(data.error || "Oturum okunamadı.", "error");
    setLoggedOutUI();
    return null;
  }
  setLoggedInUI(data);
  return data;
}

async function loadBooks() {
  const res = await fetch("/api/books", fetchOpts);
  const data = await parseJson(res);
  if (!res.ok) {
    showMessage(data.error || "Kitaplar yüklenemedi.", "error");
    return;
  }
  el.booksTbody.innerHTML = "";
  if (!data.length) {
    el.booksEmpty.hidden = false;
    return;
  }
  el.booksEmpty.hidden = true;
  for (const b of data) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(b.title)}</td>
      <td>${escapeHtml(b.author)}</td>
      <td>${escapeHtml(String(b.page_count))}</td>
      <td>${escapeHtml(b.isbn || "—")}</td>
      <td><button type="button" data-id="${b.id}">Sil</button></td>
    `;
    tr.querySelector("button").addEventListener("click", () => deleteBook(b.id));
    el.booksTbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function deleteBook(id) {
  if (!confirm("Bu kitabı silmek istiyor musunuz?")) return;
  const res = await fetch("/api/books/" + id, { method: "DELETE", ...fetchOpts });
  const data = await parseJson(res);
  if (!res.ok) {
    showMessage(data.error || "Silinemedi.", "error");
    return;
  }
  showMessage("Kitap silindi.", "success");
  await loadBooks();
}

async function loadUsers() {
  const res = await fetch("/api/admin/users", fetchOpts);
  const data = await parseJson(res);
  if (!res.ok) {
    showMessage(data.error || "Kullanıcı listesi alınamadı.", "error");
    return;
  }
  el.usersTbody.innerHTML = "";
  for (const u of data) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(String(u.id))}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.role)}</td>
    `;
    el.usersTbody.appendChild(tr);
  }
}

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMessage();
  const fd = new FormData(el.loginForm);
  const body = {
    email: fd.get("email"),
    password: fd.get("password"),
  };
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...fetchOpts,
  });
  const data = await parseJson(res);
  if (!res.ok) {
    showMessage(data.error || "Giriş başarısız.", "error");
    return;
  }
  el.loginForm.reset();
  setLoggedInUI(data);
  showMessage("Giriş yapıldı.", "success");
  await loadBooks();
});

el.registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMessage();
  const fd = new FormData(el.registerForm);
  const body = {
    email: fd.get("email"),
    password: fd.get("password"),
  };
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...fetchOpts,
  });
  const data = await parseJson(res);
  if (!res.ok) {
    showMessage(data.error || "Kayıt başarısız.", "error");
    return;
  }
  el.registerForm.reset();
  setLoggedInUI(data);
  showMessage("Kayıt tamamlandı ve oturum açıldı.", "success");
  await loadBooks();
});

el.logoutBtn.addEventListener("click", async () => {
  hideMessage();
  await fetch("/api/logout", { method: "POST", ...fetchOpts });
  setLoggedOutUI();
  showMessage("Çıkış yapıldı.", "success");
});

el.bookForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMessage();
  const fd = new FormData(el.bookForm);
  const pageCount = Number(fd.get("page_count"));
  const body = {
    title: fd.get("title"),
    author: fd.get("author"),
    page_count: pageCount,
    isbn: fd.get("isbn") || "",
    notes: fd.get("notes") || "",
  };
  const res = await fetch("/api/books", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...fetchOpts,
  });
  const data = await parseJson(res);
  if (!res.ok) {
    showMessage(data.error || "Kitap eklenemedi.", "error");
    return;
  }
  el.bookForm.reset();
  showMessage("Kitap eklendi.", "success");
  await loadBooks();
});

el.refreshUsersBtn.addEventListener("click", () => {
  hideMessage();
  loadUsers();
});

(async function init() {
  const user = await loadMe();
  if (user) await loadBooks();
})();
