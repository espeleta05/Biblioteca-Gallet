"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "inicio" | "usuarios" | "libros" | "buscar";
type User = {
  id: string;
  name: string;
  identifier: string;
  role: "Alumno" | "Profesor" | "Bibliotecario";
  status: "Activo" | "Suspendido";
  email: string;
};
type DashboardData = {
  currentUser: { name: string; role: string };
  availability: { total: number; available: number; borrowed: number };
  activity: { icon: string; title: string; detail: string }[];
};
type Book = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  copies: number;
  available: number;
  location: string;
  type: "General" | "Reserva";
  pages?: number;
  edition?: number;
  price?: string;
  publisher?: string;
};

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 10.5 12 3l9 7.5M5.5 9v10h13V9M9 19v-5h6v5",
    users: "M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 3.2a4 4 0 0 1 0 7.7M21 20v-1.5a3.4 3.4 0 0 0-2.5-3.3",
    book: "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5V4.5ZM4 18.5A2.5 2.5 0 0 1 6.5 16H20",
    search: "m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z",
    plus: "M12 5v14M5 12h14",
    menu: "M4 6h16M4 12h16M4 18h16",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4",
    close: "m6 6 12 12M18 6 6 18",
    arrow: "M5 12h14M13 6l6 6-6 6",
  };
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export default function Page() {
  const [view, setView] = useState<View>("inicio");
  const [users, setUsers] = useState<User[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("Todos");
  const [showUserForm, setShowUserForm] = useState(false);
  const [showBookForm, setShowBookForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [detailsBook, setDetailsBook] = useState<Book | null>(null);
  const [notice, setNotice] = useState("");

  const loadCatalog = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/catalog", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No fue posible cargar el catálogo.");
      setUsers(result.users);
      setBooks(result.books);
      setDashboard(result.dashboard);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible cargar la base de datos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  const filteredUsers = users.filter((user) => {
    const text = `${user.name} ${user.identifier} ${user.email}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (roleFilter === "Todos" || user.role === roleFilter);
  });
  const filteredBooks = useMemo(() => books.filter((book) =>
    `${book.title} ${book.author} ${book.isbn} ${book.category}`.toLowerCase().includes(query.toLowerCase())
  ), [books, query]);

  const navigate = (nextView: View) => {
    setView(nextView);
    setQuery("");
    setNotice("");
  };

  const addUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "");
    const response = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "user", data: {
        name, identifier: String(data.get("identifier")), email: String(data.get("email")),
        role: String(data.get("role")),
      }}),
    });
    const result = await response.json();
    if (!response.ok) {
      setNotice(result.error || "No fue posible crear el usuario.");
      return;
    }
    setShowUserForm(false);
    setNotice(`Usuario ${name} creado y guardado en PostgreSQL.`);
    await loadCatalog();
  };

  const addBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "");
    const copies = Number(data.get("copies") || 1);
    const response = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "book", data: {
        title, author: String(data.get("author")), isbn: String(data.get("isbn")),
        category: String(data.get("category")), copies, location: String(data.get("location")),
      }}),
    });
    const result = await response.json();
    if (!response.ok) {
      setNotice(result.error || "No fue posible crear el libro.");
      return;
    }
    setShowBookForm(false);
    setNotice(`Libro “${title}” guardado en PostgreSQL.`);
    await loadCatalog();
  };

  const removeRecord = async (resource: "user" | "book", id: string) => {
    if (!window.confirm("¿Deseas eliminar este registro? Esta acción no se puede deshacer.")) return;
    const response = await fetch("/api/catalog", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource, id }) });
    const result = await response.json();
    setNotice(response.ok ? "Registro eliminado correctamente." : result.error || "No fue posible eliminar el registro.");
    if (response.ok) await loadCatalog();
  };

  const updateRecord = async (event: FormEvent<HTMLFormElement>, resource: "user" | "book", id: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = resource === "user"
      ? { name: String(data.get("name")), identifier: String(data.get("identifier")), email: String(data.get("email")), role: String(data.get("role")) }
      : { title: String(data.get("title")), isbn: String(data.get("isbn")), author: String(data.get("author")), category: String(data.get("category")) };
    const response = await fetch("/api/catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource, id, data: payload }) });
    const result = await response.json();
    if (!response.ok) { setNotice(result.error || "No fue posible editar el registro."); return; }
    setEditingUser(null); setEditingBook(null); setNotice("Cambios guardados en PostgreSQL."); await loadCatalog();
  };

  const title = view === "inicio" ? "Resumen general" : view === "usuarios" ? "Gestión de usuarios" : view === "libros" ? "Catálogo de libros" : "Buscar libros";
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Icon name="book" /></div><div><strong>SIGEB</strong><span>Biblioteca universitaria</span></div></div>
        <div className="nav-section">
          <span className="nav-label">Principal</span>
          <NavItem active={view === "inicio"} icon="home" label="Inicio" onClick={() => navigate("inicio")} />
        </div>
        <div className="nav-section">
          <span className="nav-label">Administración</span>
          <NavItem active={view === "usuarios"} icon="users" label="Gestión de usuarios" onClick={() => navigate("usuarios")} />
          <NavItem active={view === "libros"} icon="book" label="Catálogo de libros" onClick={() => navigate("libros")} />
          <NavItem active={view === "buscar"} icon="search" label="Buscar libros" onClick={() => navigate("buscar")} />
        </div>
        <div className="nav-section muted-section"><span className="nav-label">Próximamente</span><NavItem disabled icon="arrow" label="Préstamos" /><NavItem disabled icon="book" label="Devoluciones" /><NavItem disabled icon="bell" label="Multas y adeudos" /></div>
        <div className="sidebar-footer"><div className="avatar">{dashboard?.currentUser.name.slice(0, 2).toUpperCase() ?? "--"}</div><div><strong>{dashboard?.currentUser.name ?? "Cargando..."}</strong><span>{dashboard?.currentUser.role ?? "Bibliotecario"}</span></div><span className="dots">•••</span></div>
      </aside>
      <main className="main">
        <header className="topbar"><button className="mobile-menu" aria-label="Abrir menú"><Icon name="menu" /></button><div className="breadcrumbs"><span>Biblioteca</span><b>/</b><strong>{title}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notificaciones"><Icon name="bell" /><i /></button><div className="top-avatar">{dashboard?.currentUser.name.slice(0, 2).toUpperCase() ?? "--"}</div><span className="profile-name">{dashboard?.currentUser.name ?? "Cargando..."}</span></div></header>
        <div className="content">
          {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}><Icon name="close" /></button></div>}
          {loading ? <div className="loading-state">Conectando con PostgreSQL…</div> : <>
            {view === "inicio" && dashboard && <Dashboard users={users} books={books} dashboard={dashboard} onNavigate={navigate} />}
            {view === "usuarios" && <UserManagementActions users={filteredUsers} query={query} setQuery={setQuery} roleFilter={roleFilter} setRoleFilter={setRoleFilter} onAdd={() => setShowUserForm(true)} onEdit={setEditingUser} onDelete={(id) => void removeRecord("user", id)} />}
            {view === "libros" && <BookManagementActions books={filteredBooks} query={query} setQuery={setQuery} onAdd={() => setShowBookForm(true)} onEdit={setEditingBook} onDelete={(id) => void removeRecord("book", id)} />}
            {view === "buscar" && <BookSearchDetails books={filteredBooks} query={query} setQuery={setQuery} onDetails={setDetailsBook} onReserve={() => setNotice("La solicitud se agregó a tu lista de espera.")} />}
          </>}
        </div>
      </main>
      {showUserForm && <Modal title="Nuevo usuario" onClose={() => setShowUserForm(false)}><form onSubmit={addUser}><Field label="Nombre completo" name="name" placeholder="Ej. Ana Sofía Martínez" required /><div className="form-grid"><Field label="Matrícula / nómina" name="identifier" placeholder="A01724531" required /><Field label="Correo institucional" name="email" type="email" placeholder="usuario@universidad.edu" required /></div><label className="field"><span>Tipo de usuario</span><select name="role" defaultValue="Alumno"><option>Alumno</option><option>Profesor</option><option>Bibliotecario</option></select></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowUserForm(false)}>Cancelar</button><button className="button primary">Crear usuario</button></div></form></Modal>}
      {showBookForm && <Modal title="Agregar libro al catálogo" onClose={() => setShowBookForm(false)}><form onSubmit={addBook}><Field label="Título" name="title" placeholder="Ej. Diseño de software" required /><div className="form-grid"><Field label="Autor" name="author" placeholder="Nombre del autor" required /><Field label="ISBN" name="isbn" placeholder="9780000000000" required /></div><div className="form-grid"><Field label="Tema" name="category" placeholder="Ingeniería" required /><Field label="Ejemplares" name="copies" type="number" placeholder="1" required /></div><Field label="Ubicación" name="location" placeholder="Piso 2 · A-01" required /><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowBookForm(false)}>Cancelar</button><button className="button primary">Agregar libro</button></div></form></Modal>}
      {editingUser && <Modal title="Editar usuario" onClose={() => setEditingUser(null)}><form onSubmit={(event) => updateRecord(event, "user", editingUser.id)}><Field label="Nombre completo" name="name" placeholder="" required defaultValue={editingUser.name} /><div className="form-grid"><Field label="Matrícula / nómina" name="identifier" placeholder="" required defaultValue={editingUser.identifier} /><Field label="Correo institucional" name="email" type="email" placeholder="" required defaultValue={editingUser.email} /></div><label className="field"><span>Tipo de usuario</span><select name="role" defaultValue={editingUser.role}><option>Alumno</option><option>Profesor</option><option>Bibliotecario</option></select></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditingUser(null)}>Cancelar</button><button className="button primary">Guardar cambios</button></div></form></Modal>}
      {editingBook && <Modal title="Editar libro" onClose={() => setEditingBook(null)}><form onSubmit={(event) => updateRecord(event, "book", editingBook.id)}><Field label="Título" name="title" placeholder="" required defaultValue={editingBook.title} /><div className="form-grid"><Field label="Autor" name="author" placeholder="" required defaultValue={editingBook.author} /><Field label="ISBN" name="isbn" placeholder="" required defaultValue={editingBook.isbn} /></div><Field label="Tema" name="category" placeholder="" required defaultValue={editingBook.category} /><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditingBook(null)}>Cancelar</button><button className="button primary">Guardar cambios</button></div></form></Modal>}
      {detailsBook && <Modal title="Detalles del libro" onClose={() => setDetailsBook(null)}><div className="book-details"><div className="cover-large"><Icon name="book" /><span>{detailsBook.category}</span></div><h3>{detailsBook.title}</h3><p><b>Autor:</b> {detailsBook.author}</p><p><b>ISBN:</b> {detailsBook.isbn}</p><p><b>Editorial:</b> {detailsBook.publisher ?? "Sin editorial"}</p><p><b>Edición:</b> {detailsBook.edition ?? "No registrada"} · <b>Páginas:</b> {detailsBook.pages ?? "No registradas"}</p><p><b>Ejemplares:</b> {detailsBook.available} disponibles de {detailsBook.copies}</p><p><b>Ubicación:</b> {detailsBook.location}</p></div></Modal>}
    </div>
  );
}

function NavItem({ icon, label, active, disabled, onClick }: { icon: string; label: string; active?: boolean; disabled?: boolean; onClick?: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""} ${disabled ? "disabled" : ""}`} onClick={onClick} disabled={disabled}><Icon name={icon} /><span>{label}</span>{active && <em />}</button>;
}
function Dashboard({ users, books, dashboard, onNavigate }: { users: User[]; books: Book[]; dashboard: DashboardData; onNavigate: (view: View) => void }) {
  const availability = dashboard.availability.total ? Math.round((dashboard.availability.available / dashboard.availability.total) * 100) : 0;
  return <><div className="hero"><div><span className="eyebrow">Panel de biblioteca</span><h1>Buenos días, {dashboard.currentUser.name.split(" ")[0]} <span>👋</span></h1><p>Esto es lo que está ocurriendo en tu biblioteca.</p></div><button className="button primary" onClick={() => onNavigate("buscar")}><Icon name="search" /> Explorar catálogo</button></div><div className="stats"><Stat label="Usuarios registrados" value={users.length.toString()} detail="Datos de PostgreSQL" trend="up" icon="users" /><Stat label="Libros en catálogo" value={books.length.toString()} detail="Catálogo persistido" trend="up" icon="book" /><Stat label="Disponibilidad" value={`${availability}%`} detail={`${dashboard.availability.borrowed} ejemplares prestados`} trend="neutral" icon="search" /></div><div className="dashboard-grid"><section className="panel activity"><div className="panel-heading"><div><h2>Actividad reciente</h2><p>Registros consultados desde PostgreSQL</p></div><button className="text-button">Actualizada <Icon name="arrow" /></button></div>{dashboard.activity.map((item, index) => <Activity key={`${item.title}-${index}`} icon={item.icon} title={item.title} detail={item.detail} />)}</section><section className="panel quick"><div className="panel-heading"><div><h2>Acciones rápidas</h2><p>Accede a las tareas más frecuentes</p></div></div><button onClick={() => onNavigate("usuarios")}><span className="quick-icon blue"><Icon name="users" /></span><span><b>Registrar usuario</b><small>Crear una nueva cuenta</small></span><Icon name="arrow" /></button><button onClick={() => onNavigate("libros")}><span className="quick-icon green"><Icon name="book" /></span><span><b>Agregar libro</b><small>Ampliar el catálogo</small></span><Icon name="arrow" /></button><button onClick={() => onNavigate("buscar")}><span className="quick-icon orange"><Icon name="search" /></span><span><b>Buscar disponibilidad</b><small>Consultar ejemplares</small></span><Icon name="arrow" /></button></section></div></>;
}
function Stat({ label, value, detail, trend, icon }: { label: string; value: string; detail: string; trend: string; icon: string }) { return <div className="stat"><div className={`stat-icon ${trend}`}><Icon name={icon} /></div><div><span>{label}</span><strong>{value}</strong><small className={trend}>{trend === "up" ? "↑ " : "• "}{detail}</small></div></div>; }
function Activity({ icon, title, detail }: { icon: string; title: string; detail: string }) { return <div className="activity-row"><span className="activity-icon"><Icon name={icon} /></span><div><b>{title}</b><small>{detail}</small></div><span className="activity-dot" /></div>; }
function UserManagement({ users, query, setQuery, roleFilter, setRoleFilter, onAdd }: { users: User[]; query: string; setQuery: (v: string) => void; roleFilter: string; setRoleFilter: (v: string) => void; onAdd: () => void }) { return <><PageHeader eyebrow="ADMINISTRACIÓN" title="Gestión de usuarios" description="Administra las cuentas y permisos de la comunidad universitaria." action="Nuevo usuario" onAction={onAdd} /><section className="panel table-panel"><div className="toolbar"><div className="search-input"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, matrícula o correo..." /></div><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option>Todos</option><option>Alumno</option><option>Profesor</option><option>Bibliotecario</option></select><button className="filter-button">Filtros</button></div><div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Matrícula / nómina</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="person"><span className="table-avatar">{user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</span><span><b>{user.name}</b><small>{user.email}</small></span></div></td><td>{user.identifier}</td><td><span className="role">{user.role}</span></td><td><span className={`status ${user.status === "Activo" ? "available" : "suspended"}`}><i />{user.status}</span></td><td><button className="more">•••</button></td></tr>)}</tbody></table>{users.length === 0 && <div className="empty">No se encontraron usuarios con esos criterios.</div>}</div><div className="table-footer">Mostrando <b>{users.length}</b> usuarios <span>1–{users.length} de {users.length}</span></div></section></>; }
function BookManagement({ books, query, setQuery, onAdd }: { books: Book[]; query: string; setQuery: (v: string) => void; onAdd: () => void }) { return <><PageHeader eyebrow="ADMINISTRACIÓN" title="Catálogo de libros" description="Registra, organiza y consulta el inventario bibliográfico." action="Agregar libro" onAction={onAdd} /><section className="panel table-panel"><div className="toolbar"><div className="search-input"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título, autor, ISBN o tema..." /></div><button className="filter-button">Filtros</button></div><div className="table-wrap"><table><thead><tr><th>Libro</th><th>ISBN</th><th>Disponibilidad</th><th>Ubicación</th><th>Tipo</th><th>Acciones</th></tr></thead><tbody>{books.map((book) => <tr key={book.id}><td><div className="person"><span className="book-cover"><Icon name="book" /></span><span><b>{book.title}</b><small>{book.author} · {book.category}</small></span></div></td><td>{book.isbn}</td><td><span className={`availability ${book.available === 0 ? "none" : book.available < 2 ? "low" : ""}`}><i />{book.available} de {book.copies} disponibles</span></td><td>{book.location}</td><td><span className="role">{book.type}</span></td><td><button className="more">•••</button></td></tr>)}</tbody></table></div><div className="table-footer">Mostrando <b>{books.length}</b> libros <span>Catálogo actualizado</span></div></section></>; }
function BookSearch({ books, query, setQuery, onReserve }: { books: Book[]; query: string; setQuery: (v: string) => void; onReserve: () => void }) { return <><div className="search-hero"><span className="eyebrow">CATÁLOGO UNIVERSITARIO</span><h1>Encuentra tu próximo libro</h1><p>Busca por título, autor, ISBN o tema y consulta su disponibilidad.</p><div className="big-search"><Icon name="search" /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="¿Qué libro estás buscando?" /><button>Buscar</button></div></div><div className="results-heading"><div><h2>{query ? `Resultados para “${query}”` : "Libros destacados"}</h2><p>{books.length} resultados encontrados</p></div><select><option>Ordenar: relevancia</option><option>Ordenar: título</option></select></div><div className="book-grid">{books.map((book) => <article className="book-card" key={book.id}><div className="cover-large"><Icon name="book" /><span>{book.category}</span></div><div className="book-card-body"><div className="book-card-title"><h3>{book.title}</h3><span className={`status ${book.available ? "available" : "suspended"}`}><i />{book.available ? "Disponible" : "No disponible"}</span></div><p>{book.author}</p><small>ISBN {book.isbn}</small><div className="card-bottom"><span><Icon name="book" /> {book.available} ejemplares</span><button onClick={book.available ? undefined : onReserve} className={book.available ? "details" : "reserve"}>{book.available ? "Ver detalles" : "Solicitar espera"}</button></div></div></article>)}</div>{books.length === 0 && <div className="empty">No encontramos libros. Intenta con otro término.</div>}</>; }
function PageHeader({ eyebrow, title, description, action, onAction }: { eyebrow: string; title: string; description: string; action: string; onAction: () => void }) { return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><button className="button primary" onClick={onAction}><Icon name="plus" /> {action}</button></div>; }
function Field({ label, name, placeholder, type = "text", required, defaultValue }: { label: string; name: string; placeholder: string; type?: string; required?: boolean; defaultValue?: string }) { return <label className="field"><span>{label}</span><input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={required} /></label>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal"><div className="modal-header"><div><span className="eyebrow">SIGEB</span><h2>{title}</h2></div><button className="close-button" onClick={onClose}><Icon name="close" /></button></div>{children}</div></div>; }

function UserManagementActions({ users, query, setQuery, roleFilter, setRoleFilter, onAdd, onEdit, onDelete }: { users: User[]; query: string; setQuery: (v: string) => void; roleFilter: string; setRoleFilter: (v: string) => void; onAdd: () => void; onEdit: (user: User) => void; onDelete: (id: string) => void }) {
  return <><PageHeader eyebrow="ADMINISTRACIÓN" title="Gestión de usuarios" description="Administra las cuentas y permisos de la comunidad universitaria." action="Nuevo usuario" onAction={onAdd} /><section className="panel table-panel"><div className="toolbar"><div className="search-input"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, matrícula o correo..." /></div><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option>Todos</option><option>Alumno</option><option>Profesor</option><option>Bibliotecario</option></select></div><div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Matrícula / nómina</th><th>Tipo</th><th>Estado</th><th>Opciones</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="person"><span className="table-avatar">{user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</span><span><b>{user.name}</b><small>{user.email}</small></span></div></td><td>{user.identifier}</td><td><span className="role">{user.role}</span></td><td><span className={`status ${user.status === "Activo" ? "available" : "suspended"}`}><i />{user.status}</span></td><td><div className="row-actions"><button onClick={() => onEdit(user)}>Editar</button><button className="danger-text" onClick={() => onDelete(user.id)}>Borrar</button></div></td></tr>)}</tbody></table>{users.length === 0 && <div className="empty">No se encontraron usuarios con esos criterios.</div>}</div><div className="table-footer">Mostrando <b>{users.length}</b> usuarios</div></section></>;
}

function BookManagementActions({ books, query, setQuery, onAdd, onEdit, onDelete }: { books: Book[]; query: string; setQuery: (v: string) => void; onAdd: () => void; onEdit: (book: Book) => void; onDelete: (id: string) => void }) {
  return <><PageHeader eyebrow="ADMINISTRACIÓN" title="Catálogo de libros" description="Registra, organiza y consulta el inventario bibliográfico." action="Agregar libro" onAction={onAdd} /><section className="panel table-panel"><div className="toolbar"><div className="search-input"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título, autor, ISBN o tema..." /></div></div><div className="table-wrap"><table><thead><tr><th>Libro</th><th>ISBN</th><th>Disponibilidad</th><th>Ubicación</th><th>Opciones</th></tr></thead><tbody>{books.map((book) => <tr key={book.id}><td><div className="person"><span className="book-cover"><Icon name="book" /></span><span><b>{book.title}</b><small>{book.author} · {book.category}</small></span></div></td><td>{book.isbn}</td><td><span className={`availability ${book.available === 0 ? "none" : book.available < 2 ? "low" : ""}`}><i />{book.available} de {book.copies} disponibles</span></td><td>{book.location}</td><td><div className="row-actions"><button onClick={() => onEdit(book)}>Editar</button><button className="danger-text" onClick={() => onDelete(book.id)}>Borrar</button></div></td></tr>)}</tbody></table></div><div className="table-footer">Mostrando <b>{books.length}</b> libros</div></section></>;
}

function BookSearchDetails({ books, query, setQuery, onDetails, onReserve }: { books: Book[]; query: string; setQuery: (v: string) => void; onDetails: (book: Book) => void; onReserve: () => void }) {
  return <><div className="search-hero"><span className="eyebrow">CATÁLOGO UNIVERSITARIO</span><h1>Encuentra tu próximo libro</h1><p>Busca por título, autor, ISBN o tema y consulta su disponibilidad.</p><div className="big-search"><Icon name="search" /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="¿Qué libro estás buscando?" /><button>Buscar</button></div></div><div className="results-heading"><div><h2>{query ? `Resultados para “${query}”` : "Libros destacados"}</h2><p>{books.length} resultados encontrados</p></div></div><div className="book-grid">{books.map((book) => <article className="book-card" key={book.id}><div className="cover-large"><Icon name="book" /><span>{book.category}</span></div><div className="book-card-body"><div className="book-card-title"><h3>{book.title}</h3><span className={`status ${book.available ? "available" : "suspended"}`}><i />{book.available ? "Disponible" : "No disponible"}</span></div><p>{book.author}</p><small>ISBN {book.isbn}</small><div className="card-bottom"><span><Icon name="book" /> {book.available} ejemplares</span><button onClick={book.available ? () => onDetails(book) : onReserve} className={book.available ? "details" : "reserve"}>{book.available ? "Ver detalles" : "Solicitar espera"}</button></div></div></article>)}</div>{books.length === 0 && <div className="empty">No encontramos libros. Intenta con otro término.</div>}</>;
}
