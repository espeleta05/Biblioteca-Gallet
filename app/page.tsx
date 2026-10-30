"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Dashboard } from "../components/Dashboard";
import { BookSearch, BookManagement, UserManagement } from "../components/CatalogViews";
import { Icon } from "../components/Icon";
import { Field as ModalField, Modal, SelectRole } from "../components/Modal";
import { Book, DashboardData, User, View } from "../components/types";

export default function Page() {
  const [view, setView] = useState<View>("inicio");
  const [users, setUsers] = useState<User[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("Todos");
  const [modal, setModal] = useState<"user" | "book" | "edit-user" | "edit-book" | "details" | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [notice, setNotice] = useState("");

  const loadCatalog = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/catalog", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No fue posible cargar el catálogo.");
      setUsers(result.users); setBooks(result.books); setDashboard(result.dashboard);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible cargar la base de datos.");
    } finally { setLoading(false); }
  };
  useEffect(() => { void loadCatalog(); }, []);

  const navigate = (nextView: View) => { setView(nextView); setQuery(""); setNotice(""); };
  const filteredUsers = users.filter((user) => `${user.name} ${user.identifier} ${user.email}`.toLowerCase().includes(query.toLowerCase()) && (roleFilter === "Todos" || user.role === roleFilter));
  const filteredBooks = useMemo(() => books.filter((book) => `${book.title} ${book.author} ${book.isbn} ${book.category}`.toLowerCase().includes(query.toLowerCase())), [books, query]);
  const send = async (method: string, body: object) => {
    const response = await fetch("/api/catalog", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No fue posible completar la operación.");
  };
  const addUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try { await send("POST", { resource: "user", data: { name: data.get("name"), identifier: data.get("identifier"), email: data.get("email"), role: data.get("role") } }); setModal(null); setNotice("Usuario guardado en PostgreSQL."); await loadCatalog(); } catch (error) { setNotice(error instanceof Error ? error.message : "Error al guardar usuario."); }
  };
  const addBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try { await send("POST", { resource: "book", data: { title: data.get("title"), author: data.get("author"), isbn: data.get("isbn"), category: data.get("category"), copies: Number(data.get("copies")), location: data.get("location") } }); setModal(null); setNotice("Libro guardado en PostgreSQL."); await loadCatalog(); } catch (error) { setNotice(error instanceof Error ? error.message : "Error al guardar libro."); }
  };
  const edit = async (event: FormEvent<HTMLFormElement>, resource: "user" | "book", id: string) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const payload = resource === "user" ? { name: data.get("name"), identifier: data.get("identifier"), email: data.get("email"), role: data.get("role") } : { title: data.get("title"), isbn: data.get("isbn"), author: data.get("author"), category: data.get("category") };
    try { await send("PATCH", { resource, id, data: payload }); setModal(null); setNotice("Cambios guardados en PostgreSQL."); await loadCatalog(); } catch (error) { setNotice(error instanceof Error ? error.message : "Error al editar."); }
  };
  const remove = async (resource: "user" | "book", id: string) => {
    if (!window.confirm("¿Deseas eliminar este registro? Esta acción no se puede deshacer.")) return;
    try { await send("DELETE", { resource, id }); setNotice("Registro eliminado correctamente."); await loadCatalog(); } catch (error) { setNotice(error instanceof Error ? error.message : "Error al eliminar."); }
  };
  const title = view === "inicio" ? "Resumen general" : view === "usuarios" ? "Gestión de usuarios" : view === "libros" ? "Catálogo de libros" : "Buscar libros";
  return <div className="shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><Icon name="book" /></div><div><strong>SIGEB</strong><span>Biblioteca universitaria</span></div></div><NavItem active={view === "inicio"} icon="home" label="Inicio" onClick={() => navigate("inicio")} /><span className="nav-label">Administración</span><NavItem active={view === "usuarios"} icon="users" label="Gestión de usuarios" onClick={() => navigate("usuarios")} /><NavItem active={view === "libros"} icon="book" label="Catálogo de libros" onClick={() => navigate("libros")} /><NavItem active={view === "buscar"} icon="search" label="Buscar libros" onClick={() => navigate("buscar")} /><div className="sidebar-footer"><div className="avatar">{dashboard?.currentUser.name.slice(0, 2).toUpperCase() ?? "--"}</div><div><strong>{dashboard?.currentUser.name ?? "Cargando..."}</strong><span>{dashboard?.currentUser.role ?? "Bibliotecario"}</span></div></div></aside><main className="main"><header className="topbar"><button className="mobile-menu" aria-label="Abrir menú"><Icon name="menu" /></button><div className="breadcrumbs"><span>Biblioteca</span><b>/</b><strong>{title}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notificaciones"><Icon name="bell" /></button><div className="top-avatar">{dashboard?.currentUser.name.slice(0, 2).toUpperCase() ?? "--"}</div></div></header><div className="content">{notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}><Icon name="close" /></button></div>}{loading ? <div className="loading-state">Conectando con PostgreSQL…</div> : <>{view === "inicio" && dashboard && <Dashboard users={users} books={books} dashboard={dashboard} onNavigate={navigate} />}{view === "usuarios" && <UserManagement users={filteredUsers} query={query} setQuery={setQuery} roleFilter={roleFilter} setRoleFilter={setRoleFilter} onAdd={() => setModal("user")} onEdit={(user) => { setSelectedUser(user); setModal("edit-user"); }} onDelete={(id) => void remove("user", id)} />}{view === "libros" && <BookManagement books={filteredBooks} query={query} setQuery={setQuery} onAdd={() => setModal("book")} onEdit={(book) => { setSelectedBook(book); setModal("edit-book"); }} onDelete={(id) => void remove("book", id)} />}{view === "buscar" && <BookSearch books={filteredBooks} query={query} setQuery={setQuery} onDetails={(book) => { setSelectedBook(book); setModal("details"); }} onReserve={() => setNotice("La solicitud se agregó a tu lista de espera.")} />}</>}</div></main>{modal === "user" && <Modal title="Nuevo usuario" onClose={() => setModal(null)}><form onSubmit={addUser}><ModalField label="Nombre completo" name="name" placeholder="Ej. Ana Sofía Martínez" required /><div className="form-grid"><ModalField label="Matrícula / nómina" name="identifier" placeholder="A01724531" required /><ModalField label="Correo institucional" name="email" type="email" placeholder="usuario@universidad.edu" required /></div><label className="field"><span>Tipo de usuario</span><SelectRole /></label><Actions label="Crear usuario" onCancel={() => setModal(null)} /></form></Modal>}{modal === "book" && <Modal title="Agregar libro al catálogo" onClose={() => setModal(null)}><form onSubmit={addBook}><ModalField label="Título" name="title" placeholder="Ej. Diseño de software" required /><div className="form-grid"><ModalField label="Autor" name="author" placeholder="Nombre del autor" required /><ModalField label="ISBN" name="isbn" placeholder="9780000000000" required /></div><div className="form-grid"><ModalField label="Tema" name="category" placeholder="Ingeniería" required /><ModalField label="Ejemplares" name="copies" type="number" placeholder="1" required /></div><ModalField label="Ubicación" name="location" placeholder="Piso 2 · A-01" required /><Actions label="Agregar libro" onCancel={() => setModal(null)} /></form></Modal>}{selectedUser && modal === "edit-user" && <Modal title="Editar usuario" onClose={() => setModal(null)}><form onSubmit={(event) => edit(event, "user", selectedUser.id)}><ModalField label="Nombre completo" name="name" placeholder="" defaultValue={selectedUser.name} required /><div className="form-grid"><ModalField label="Matrícula / nómina" name="identifier" placeholder="" defaultValue={selectedUser.identifier} required /><ModalField label="Correo institucional" name="email" type="email" placeholder="" defaultValue={selectedUser.email} required /></div><label className="field"><span>Tipo de usuario</span><SelectRole value={selectedUser.role} /></label><Actions label="Guardar cambios" onCancel={() => setModal(null)} /></form></Modal>}{selectedBook && modal === "edit-book" && <Modal title="Editar libro" onClose={() => setModal(null)}><form onSubmit={(event) => edit(event, "book", selectedBook.id)}><ModalField label="Título" name="title" placeholder="" defaultValue={selectedBook.title} required /><div className="form-grid"><ModalField label="Autor" name="author" placeholder="" defaultValue={selectedBook.author} required /><ModalField label="ISBN" name="isbn" placeholder="" defaultValue={selectedBook.isbn} required /></div><ModalField label="Tema" name="category" placeholder="" defaultValue={selectedBook.category} required /><Actions label="Guardar cambios" onCancel={() => setModal(null)} /></form></Modal>}{selectedBook && modal === "details" && <Modal title="Detalles del libro" onClose={() => setModal(null)}><div className="book-details"><div className="cover-large"><Icon name="book" /><span>{selectedBook.category}</span></div><h3>{selectedBook.title}</h3><p><b>Autor:</b> {selectedBook.author}</p><p><b>ISBN:</b> {selectedBook.isbn}</p><p><b>Editorial:</b> {selectedBook.publisher ?? "Sin editorial"}</p><p><b>Edición:</b> {selectedBook.edition ?? "No registrada"} · <b>Páginas:</b> {selectedBook.pages ?? "No registradas"}</p><p><b>Ejemplares:</b> {selectedBook.available} disponibles de {selectedBook.copies}</p><p><b>Ubicación:</b> {selectedBook.location}</p></div></Modal>}</div>;
}
function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><Icon name={icon} /><span>{label}</span>{active && <em />}</button>; }
function Actions({ label, onCancel }: { label: string; onCancel: () => void }) { return <div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary">{label}</button></div>; }
