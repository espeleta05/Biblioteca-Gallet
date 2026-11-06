"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Dashboard } from "../components/Dashboard";
import { BookSearch, BookManagement, UserManagement } from "../components/CatalogViews";
import { Icon } from "../components/Icon";
import { Field as ModalField, Modal, SelectRole } from "../components/Modal";
import { Book, DashboardData, User, View } from "../components/types";

type Session = { id: string; identifier: string; name: string; role: "Administrador" | "Bibliotecario" | "Alumno" | "Profesor" };
type Notice = { message: string; type: "success" | "error" };

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mobileView, setMobileView] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [view, setView] = useState<View>("inicio");
  const [users, setUsers] = useState<User[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("Todos");
  const [modal, setModal] = useState<"user" | "book" | "edit-user" | "edit-book" | "details" | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadCatalog = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/catalog", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No fue posible cargar el catálogo.");
      setUsers(result.users); setBooks(result.books); setDashboard(result.dashboard);
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "No fue posible cargar la base de datos.", type: "error" });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetch("/api/auth").then((response) => response.json()).then((result) => {
      setSession(result.session);
      if (result.session?.role === "Alumno" || result.session?.role === "Profesor") setView("buscar");
      setAuthLoading(false);
      if (result.session) void loadCatalog();
    }).catch(() => { setNotice({ message: "No fue posible comprobar la sesión.", type: "error" }); setAuthLoading(false); });
  }, []);

  const navigate = (nextView: View) => {
    if ((session?.role === "Alumno" || session?.role === "Profesor") && nextView !== "buscar") {
      setView("buscar");
      setNotice({ message: "Tu cuenta solo tiene acceso a la búsqueda de libros.", type: "error" });
      return;
    }
    if (nextView === "usuarios" && session?.role !== "Administrador") {
      setView("inicio");
      setNotice({ message: "Solo el administrador puede gestionar usuarios.", type: "error" });
      return;
    }
    setView(nextView); setQuery(""); setNotice(null); setMobileMenuOpen(false);
  };
  const filteredUsers = users.filter((user) => `${user.name} ${user.identifier} ${user.email}`.toLowerCase().includes(query.toLowerCase()) && (roleFilter === "Todos" || user.role === roleFilter));
  const filteredBooks = useMemo(() => books.filter((book) => `${book.title} ${book.author} ${book.isbn} ${book.category}`.toLowerCase().includes(query.toLowerCase())), [books, query]);
  const send = async (method: string, body: object) => {
    const response = await fetch("/api/catalog", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No fue posible completar la operación.");
  };
  const addUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try { await send("POST", { resource: "user", data: { name: data.get("name"), identifier: data.get("identifier"), email: data.get("email"), role: data.get("role"), password: data.get("password") } }); setModal(null); setNotice({ message: "Usuario guardado en PostgreSQL.", type: "success" }); await loadCatalog(); } catch (error) { setNotice({ message: error instanceof Error ? error.message : "Error al guardar usuario.", type: "error" }); }
  };
  const addBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try { await send("POST", { resource: "book", data: { title: data.get("title"), author: data.get("author"), isbn: data.get("isbn"), category: data.get("category"), copies: Number(data.get("copies")), location: data.get("location") } }); setModal(null); setNotice({ message: "Libro guardado en PostgreSQL.", type: "success" }); await loadCatalog(); } catch (error) { setNotice({ message: error instanceof Error ? error.message : "Error al guardar libro.", type: "error" }); }
  };
  const edit = async (event: FormEvent<HTMLFormElement>, resource: "user" | "book", id: string) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const payload = resource === "user" ? { name: data.get("name"), identifier: data.get("identifier"), email: data.get("email"), role: data.get("role") } : { title: data.get("title"), isbn: data.get("isbn"), author: data.get("author"), category: data.get("category") };
    try { await send("PATCH", { resource, id, data: payload }); setModal(null); setNotice({ message: "Cambios guardados en PostgreSQL.", type: "success" }); await loadCatalog(); } catch (error) { setNotice({ message: error instanceof Error ? error.message : "Error al editar.", type: "error" }); }
  };
  const remove = async (resource: "user" | "book", id: string) => {
    if (!window.confirm("¿Deseas eliminar este registro? Esta acción no se puede deshacer.")) return;
    try { await send("DELETE", { resource, id }); setNotice({ message: "Registro eliminado correctamente.", type: "success" }); await loadCatalog(); } catch (error) { setNotice({ message: error instanceof Error ? error.message : "Error al eliminar.", type: "error" }); }
  };
  const logout = async () => { await fetch("/api/auth", { method: "DELETE" }); setMobileMenuOpen(false); setSession(null); };

  if (authLoading) return <div className="loading-state">Comprobando sesión…</div>;
  if (!session) return <Login onLogin={(nextSession) => { setSession(nextSession); setView(nextSession.role === "Alumno" || nextSession.role === "Profesor" ? "buscar" : "inicio"); void loadCatalog(); }} notice={notice?.message ?? ""} mobileView={mobileView} onToggleMobile={() => setMobileView((current) => !current)} />;
  if (!session) return null;

  const title = view === "inicio" ? "Resumen general" : view === "usuarios" ? "Gestión de usuarios" : view === "libros" ? "Catálogo de libros" : "Buscar libros";
  return <div className={`shell ${mobileView ? "mobile-mode" : ""}`}>
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Icon name="book" /></div><div><strong>SIGEB</strong><span>Biblioteca universitaria</span></div></div>
      {(session.role === "Alumno" || session.role === "Profesor") ? <NavItem active={view === "buscar"} icon="search" label="Buscar libros" onClick={() => navigate("buscar")} /> : <><NavItem active={view === "inicio"} icon="home" label="Inicio" onClick={() => navigate("inicio")} /><span className="nav-label">Administración</span>
      {session.role === "Administrador" && <NavItem active={view === "usuarios"} icon="users" label="Gestión de usuarios" onClick={() => navigate("usuarios")} />}
      <NavItem active={view === "libros"} icon="book" label="Catálogo de libros" onClick={() => navigate("libros")} /><NavItem active={view === "buscar"} icon="search" label="Buscar libros" onClick={() => navigate("buscar")} /></>}
      <div className="sidebar-footer"><div className="avatar">{session.name.slice(0, 2).toUpperCase()}</div><div><strong>{session.name}</strong><span>{session.role}</span></div></div>
    </aside>
    <main className="main"><header className="topbar"><div className="mobile-header-actions">{mobileView && <button className="mobile-menu-button" aria-label="Abrir menú" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}><Icon name="menu" /></button>}</div><div className="breadcrumbs"><span>Biblioteca</span><b>/</b><strong>{title}</strong></div><div className="top-actions"><button className="button secondary desktop-logout" onClick={() => void logout()}>Cerrar sesión</button><div className="top-avatar">{session.name.slice(0, 2).toUpperCase()}</div></div></header>
      {mobileView && mobileMenuOpen && <div className="mobile-menu-panel"><div className="mobile-menu-user"><div className="top-avatar">{session.name.slice(0, 2).toUpperCase()}</div><div><strong>{session.name}</strong><small>{session.role}</small></div></div>{(session.role === "Alumno" || session.role === "Profesor") ? <NavItem active={view === "buscar"} icon="search" label="Buscar libros" onClick={() => navigate("buscar")} /> : <><NavItem active={view === "inicio"} icon="home" label="Inicio" onClick={() => navigate("inicio")} />{session.role === "Administrador" && <NavItem active={view === "usuarios"} icon="users" label="Gestión de usuarios" onClick={() => navigate("usuarios")} />}<NavItem active={view === "libros"} icon="book" label="Catálogo de libros" onClick={() => navigate("libros")} /><NavItem active={view === "buscar"} icon="search" label="Buscar libros" onClick={() => navigate("buscar")} /></>}<button className="mobile-logout" onClick={() => void logout()}>Cerrar sesión</button></div>}
      <div className="content">{notice && <div className={`notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}><span className="notice-indicator">{notice.type === "error" ? "!" : "✓"}</span><span>{notice.message}</span><button aria-label="Cerrar mensaje" onClick={() => setNotice(null)}><Icon name="close" /></button></div>}
        {loading ? <div className="loading-state">Conectando con PostgreSQL…</div> : <>{(session.role === "Alumno" || session.role === "Profesor") ? <BookSearch books={filteredBooks} query={query} setQuery={setQuery} onDetails={(book) => { setSelectedBook(book); setModal("details"); }} onReserve={() => setNotice({ message: "La solicitud se agregó a tu lista de espera.", type: "success" })} /> : <>{view === "inicio" && dashboard && <Dashboard users={users} books={books} dashboard={dashboard} onNavigate={navigate} canManageUsers={session.role === "Administrador"} />}
          {view === "usuarios" && session.role === "Administrador" && <UserManagement users={filteredUsers} query={query} setQuery={setQuery} roleFilter={roleFilter} setRoleFilter={setRoleFilter} onAdd={() => setModal("user")} onEdit={(user) => { setSelectedUser(user); setModal("edit-user"); }} onDelete={(id) => void remove("user", id)} />}
          {view === "usuarios" && session.role !== "Administrador" && dashboard && <Dashboard users={users} books={books} dashboard={dashboard} onNavigate={navigate} canManageUsers={false} />}
          {view === "libros" && <BookManagement books={filteredBooks} query={query} setQuery={setQuery} onAdd={() => setModal("book")} onEdit={(book) => { setSelectedBook(book); setModal("edit-book"); }} onDelete={(id) => void remove("book", id)} />}
          {view === "buscar" && <BookSearch books={filteredBooks} query={query} setQuery={setQuery} onDetails={(book) => { setSelectedBook(book); setModal("details"); }} onReserve={() => setNotice({ message: "La solicitud se agregó a tu lista de espera.", type: "success" })} />}
        </>}</>}</div>
    </main>
    <button className="view-toggle" onClick={() => setMobileView((current) => !current)}>{mobileView ? "Vista web" : "Vista móvil"}</button>
    {modal === "user" && <Modal title="Nuevo usuario" onClose={() => setModal(null)}><form onSubmit={addUser}><ModalField label="Nombre completo" name="name" placeholder="Ej. Ana Sofía Martínez" required /><div className="form-grid"><ModalField label="Matrícula / nómina" name="identifier" placeholder="B0041" required /><ModalField label="Correo institucional" name="email" type="email" placeholder="usuario@universidad.edu" required /></div><ModalField label="Contraseña de acceso" name="password" type="password" placeholder="Mínimo 4 caracteres" required /><label className="field"><span>Tipo de usuario</span><SelectRole value="Bibliotecario" /></label><Actions label="Crear usuario" onCancel={() => setModal(null)} /></form></Modal>}
    {modal === "book" && <Modal title="Agregar libro al catálogo" onClose={() => setModal(null)}><form onSubmit={addBook}><ModalField label="Título" name="title" placeholder="Nombre del libro" required /><ModalField label="Autor" name="author" placeholder="Nombre del autor" required /><div className="form-grid"><ModalField label="Tema" name="category" placeholder="Programación" required /><ModalField label="Ejemplares" name="copies" type="number" placeholder="1" required /></div><ModalField label="Ubicación" name="location" placeholder="Piso 2 · A-14" required /><p className="form-hint">El ISBN se asignará automáticamente al guardar.</p><Actions label="Agregar libro" onCancel={() => setModal(null)} /></form></Modal>}
    {modal === "edit-user" && selectedUser && <Modal title="Editar usuario" onClose={() => setModal(null)}><form onSubmit={(event) => void edit(event, "user", selectedUser.id)}><ModalField label="Nombre completo" name="name" placeholder="" defaultValue={selectedUser.name} required /><ModalField label="Matrícula / nómina" name="identifier" placeholder="" defaultValue={selectedUser.identifier} required /><ModalField label="Correo institucional (opcional)" name="email" type="email" placeholder="Solo alumnos y profesores" defaultValue={selectedUser.email} /><label className="field"><span>Tipo de usuario</span><SelectRole value={selectedUser.role} /></label><Actions label="Guardar cambios" onCancel={() => setModal(null)} /></form></Modal>}
    {modal === "edit-book" && selectedBook && <Modal title="Editar libro" onClose={() => setModal(null)}><form onSubmit={(event) => void edit(event, "book", selectedBook.id)}><ModalField label="Título" name="title" placeholder="" defaultValue={selectedBook.title} required /><ModalField label="Autor" name="author" placeholder="" defaultValue={selectedBook.author} required /><ModalField label="ISBN (10 o 13 dígitos)" name="isbn" placeholder="" defaultValue={selectedBook.isbn} required /><ModalField label="Tema" name="category" placeholder="" defaultValue={selectedBook.category} required /><Actions label="Guardar cambios" onCancel={() => setModal(null)} /></form></Modal>}
    {modal === "details" && selectedBook && <Modal title="Detalles del libro" onClose={() => setModal(null)}><div className="book-details"><h3>{selectedBook.title}</h3><p><b>Autor:</b> {selectedBook.author}</p><p><b>ISBN:</b> {selectedBook.isbn}</p><p><b>Tema:</b> {selectedBook.category}</p><p><b>Editorial:</b> {selectedBook.publisher}</p><p><b>Disponibilidad:</b> {selectedBook.available} de {selectedBook.copies}</p><p><b>Ubicación:</b> {selectedBook.location}</p></div></Modal>}
  </div>;
}

function Login({ onLogin, notice, mobileView, onToggleMobile }: { onLogin: (session: Session) => void; notice: string; mobileView: boolean; onToggleMobile: () => void }) {
  const [error, setError] = useState(notice);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: data.get("identifier"), password: data.get("password") }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "No fue posible iniciar sesión."); return; }
    onLogin(result.session);
  };
  return <main className={`login-page ${mobileView ? "login-mobile-mode" : ""}`}><section className="login-card"><div className="brand-mark"><Icon name="book" /></div><span className="eyebrow">SIGEB</span><h1>Iniciar sesión</h1><p>Accede a la biblioteca universitaria.</p><form onSubmit={submit}><ModalField label="Usuario, matrícula o nómina" name="identifier" placeholder="admin" required /><ModalField label="Contraseña" name="password" type="password" placeholder="••••" required />{error && <div className="notice error" role="alert"><span className="notice-indicator">!</span><span>{error}</span></div>}<button className="button primary login-button">Entrar</button></form><small>Administrador inicial: admin / 1234</small></section><button className="view-toggle" onClick={onToggleMobile}>{mobileView ? "Vista web" : "Vista móvil"}</button></main>;
}

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><Icon name={icon} /><span>{label}</span>{active && <em />}</button>; }
function Actions({ label, onCancel }: { label: string; onCancel: () => void }) { return <div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button type="submit" className="button primary">{label}</button></div>; }
