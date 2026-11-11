"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type UserOption = { id: number; name: string; identifier: string; role: string; status: string; email: string; phone: string; dias_prestamo: number; max_ejemplares: number; max_renovaciones: number };
type BookOption = { id: string; title: string; isbn: string; available: number };
type Loan = { id: number; user_id: number; title: string; isbn: string; identifier: string; user_name: string; fecha_vencimiento: string; estado: string };
type Fine = { id: number; identifier: string; user_name: string; amount: string; motivo: string; status: string };
type Renewal = { id: number; user_id: number; loan_id: number; fecha_renovacion: string; fecha_vencimiento_nueva: string };
type Suspension = { id: number; user_id: number; motivo: string; fecha_inicio: string; fecha_fin: string | null; estado: string };
type WaitRequest = { id: number; user_id: number; title: string; estado: string };

function Suggestions({ items, value, selectedId, onChange, onSelect, placeholder, label, render }: {
  items: { id: string | number; label: string }[];
  value: string;
  selectedId?: string;
  onChange: (value: string) => void;
  onSelect: (id: string) => void;
  placeholder: string;
  label: string;
  render?: (item: { id: string | number; label: string }) => string;
}) {
  const matches = !selectedId && value.trim().length > 0
    ? items.filter((item) => item.label.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : [];
  return <div className="autocomplete"><label className="field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" required /></label>{matches.length > 0 && <div className="autocomplete-options">{matches.map((item) => <button type="button" key={item.id} onClick={() => { onChange(render ? render(item) : item.label); onSelect(String(item.id)); }}>{item.label}</button>)}</div>}</div>;
}

export function CirculationViews({ onNotice, onCatalogChanged }: { onNotice: (message: string, type: "success" | "error") => void; onCatalogChanged: () => Promise<void> }) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [books, setBooks] = useState<BookOption[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [suspensions, setSuspensions] = useState<Suspension[]>([]);
  const [waitlist, setWaitlist] = useState<WaitRequest[]>([]);
  const [tab, setTab] = useState<"loans" | "fines" | "lookup">("loans");
  const [userText, setUserText] = useState("");
  const [userId, setUserId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [bookText, setBookText] = useState("");
  const [bookId, setBookId] = useState("");
  const [loanText, setLoanText] = useState("");
  const [loanId, setLoanId] = useState("");
  const [fineQuery, setFineQuery] = useState("");
  const [loanLookupQuery, setLoanLookupQuery] = useState("");
  const [lookupSelectedUserId, setLookupSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const response = await fetch("/api/circulation", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No fue posible consultar circulación.");
    setUsers(result.users ?? []);
    setBooks(result.books ?? []);
    setLoans(result.loans ?? []);
    setFines(result.fines ?? []);
    setRenewals(result.renewals ?? []);
    setSuspensions(result.suspensions ?? []);
    setWaitlist(result.waitlist ?? []);
  };
  useEffect(() => { void load().catch((error) => onNotice(error.message, "error")).finally(() => setLoading(false)); }, []);

  const sendAction = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/circulation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No fue posible completar la operación.");
    onNotice("Operación registrada correctamente.", "success");
    await load();
    await onCatalogChanged();
  };

  const registerLoan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try { await sendAction({ action: "loan", bookId, userId: Number(userId) }); setUserText(""); setBookText(""); setUserId(""); setBookId(""); } catch (error) { onNotice(error instanceof Error ? error.message : "No fue posible registrar el préstamo.", "error"); }
  };
  const operateLoan = async (action: "renew" | "return") => {
    try { await sendAction({ action, loanId: Number(loanId) }); setLoanText(""); setLoanId(""); } catch (error) { onNotice(error instanceof Error ? error.message : "No fue posible operar el préstamo.", "error"); }
  };
  const userItems = users.map((user) => ({ id: user.id, label: `${user.name} · ${user.identifier}` }));
  const bookItems = books.map((book) => ({ id: book.id, label: `${book.title} · ${book.isbn} · ${book.available} disponibles` }));
  const loanItems = loans.filter((loan) => loan.estado === "Activo").map((loan) => ({ id: loan.id, label: `#${loan.id} · ${loan.user_name} · ${loan.title}` }));
  const filteredFines = useMemo(() => fines.filter((fine) => `${fine.user_name} ${fine.identifier} ${fine.motivo} ${fine.status}`.toLowerCase().includes(fineQuery.toLowerCase())), [fines, fineQuery]);
  const activeLoans = useMemo(() => loans.filter((loan) => loan.estado === "Activo"), [loans]);
  const filteredLoanLookup = useMemo(() => {
    const query = loanLookupQuery.trim().toLowerCase();
    if (!query) return activeLoans;
    return activeLoans.filter((loan) => `${loan.user_name} ${loan.identifier} ${loan.title} ${loan.isbn ?? ""}`.toLowerCase().includes(query));
  }, [activeLoans, loanLookupQuery]);
  const lookupOptions = useMemo(() => {
    const query = loanLookupQuery.trim().toLowerCase();
    if (!query) return [];
    const matchingUsers = users
      .filter((user) => `${user.name} ${user.identifier}`.toLowerCase().includes(query))
      .slice(0, 5)
      .map((user) => ({ kind: "user" as const, id: String(user.id), label: user.name, detail: user.identifier }));
    const matchingBooks = books
      .filter((book) => `${book.title} ${book.isbn}`.toLowerCase().includes(query))
      .slice(0, 5)
      .map((book) => ({ kind: "book" as const, id: book.id, label: book.title, detail: book.isbn }));
    return [...matchingUsers, ...matchingBooks];
  }, [books, users, loanLookupQuery]);
  const selectedProfile = users.find((user) => String(user.id) === profileId);
  const profileLoans = loans.filter((loan) => String(loan.user_id) === profileId || loan.identifier === selectedProfile?.identifier);
  const activeProfileLoans = profileLoans.filter((loan) => loan.estado === "Activo");
  const overdueProfileLoans = activeProfileLoans.filter((loan) => new Date(loan.fecha_vencimiento).getTime() < Date.now());
  const returnedProfileLoans = profileLoans.filter((loan) => loan.estado !== "Activo");
  const profileFines = fines.filter((fine) => fine.identifier === selectedProfile?.identifier);
  const profileRenewals = renewals.filter((renewal) => String(renewal.user_id) === profileId);
  const profileSuspensions = suspensions.filter((suspension) => String(suspension.user_id) === profileId);
  const profileWaitlist = waitlist.filter((request) => String(request.user_id) === profileId);

  return <><div className="page-header"><div><span className="eyebrow">CIRCULACIÓN</span><h1>Préstamos y multas</h1><p>Busca usuarios, libros y multas escribiendo; las opciones aparecen mientras capturas.</p></div></div>
    <div className="circulation-tabs"><button className={tab === "loans" ? "active" : ""} onClick={() => setTab("loans")}>Préstamos</button><button className={tab === "lookup" ? "active" : ""} onClick={() => setTab("lookup")}>Ver préstamos</button><button className={tab === "fines" ? "active" : ""} onClick={() => setTab("fines")}>Multas</button></div>
    {tab === "loans" && <><div className="form-grid circulation-grid"><section className="panel form-panel"><h2>Registrar préstamo</h2><form onSubmit={registerLoan}><Suggestions items={userItems} value={userText} selectedId={userId} onChange={(value) => { setUserText(value); setUserId(""); }} onSelect={(id) => { setUserId(id); setProfileId(id); }} label="Buscar usuario" placeholder="Escribe nombre, matrícula o nómina" /><Suggestions items={bookItems} value={bookText} selectedId={bookId} onChange={(value) => { setBookText(value); setBookId(""); }} onSelect={setBookId} label="Buscar libro" placeholder="Escribe título, ISBN o clave" /><button className="button primary" type="submit" disabled={!userId || !bookId}>Registrar préstamo</button></form></section><section className="panel form-panel"><h2>Operar préstamo</h2><Suggestions items={loanItems} value={loanText} selectedId={loanId} onChange={(value) => { setLoanText(value); setLoanId(""); }} onSelect={setLoanId} label="Buscar préstamo" placeholder="Escribe nombre, libro o número" /><div className="row-actions"><button className="button secondary" type="button" disabled={!loanId} onClick={() => void operateLoan("renew")}>Renovar</button><button className="button primary" type="button" disabled={!loanId} onClick={() => void operateLoan("return")}>Devolver</button></div></section></div>{selectedProfile && <section className="panel profile-panel"><div className="profile-header"><div><span className="eyebrow">PERFIL DEL USUARIO</span><h2>{selectedProfile.name}</h2><p>{selectedProfile.identifier} · {selectedProfile.role} · {selectedProfile.status}</p></div><div><b>{activeProfileLoans.length}</b><small> préstamos actuales</small><br /><b>{profileLoans.length}</b><small> registros históricos</small><br /><b>{profileFines.length}</b><small> multas</small></div></div><p><b>Correo:</b> {selectedProfile.email || "No registrado"} · <b>Teléfono:</b> {selectedProfile.phone || "No registrado"}</p>    <div className="table-wrap"><table><thead><tr><th>Historial de préstamos</th><th>Libro</th><th>Vence</th><th>Estado</th></tr></thead><tbody>{profileLoans.map((loan) => <tr key={loan.id}><td>#{loan.id}</td><td>{loan.title}</td><td>{new Date(loan.fecha_vencimiento).toLocaleDateString("es-MX")}</td><td>{loan.estado}</td></tr>)}</tbody></table>{profileLoans.length === 0 && <div className="empty">Este usuario no tiene préstamos registrados.</div>}</div><h3 className="profile-subtitle">Multas del usuario</h3><div className="table-wrap"><table><thead><tr><th>Multa</th><th>Monto</th><th>Motivo</th><th>Estado</th></tr></thead><tbody>{profileFines.map((fine) => <tr key={fine.id}><td>#{fine.id}</td><td>${fine.amount}</td><td>{fine.motivo}</td><td>{fine.status}</td></tr>)}</tbody></table>{profileFines.length === 0 && <div className="empty">Este usuario no tiene multas registradas.</div>}    </div><h3 className="profile-subtitle">Renovaciones y suspensiones</h3>    <p><b>Renovaciones:</b> {profileRenewals.length} · <b>Suspensiones:</b> {profileSuspensions.length} · <b>Lista de espera:</b> {profileWaitlist.length} · <b>Límite de ejemplares:</b> {selectedProfile.max_ejemplares} · <b>Días por préstamo:</b> {selectedProfile.dias_prestamo} · <b>Máximo de renovaciones:</b> {selectedProfile.max_renovaciones}</p></section>}<section className="panel table-panel"><h2>Préstamos registrados</h2><div className="table-wrap"><table><thead><tr><th>ID</th><th>Usuario</th><th>Libro</th><th>Vence</th><th>Estado</th></tr></thead><tbody>{loans.map((loan) => <tr key={loan.id}><td>#{loan.id}</td><td><b>{loan.user_name}</b><small>{loan.identifier}</small></td><td>{loan.title}</td><td>{new Date(loan.fecha_vencimiento).toLocaleDateString("es-MX")}</td><td>{loan.estado}</td></tr>)}</tbody></table>{loans.length === 0 && <div className="empty">No hay préstamos registrados.</div>}</div></section></>}
    {tab === "fines" && <section className="panel table-panel"><div className="page-header compact"><div><h2>Multas</h2><p>Busca por nombre de la persona, matrícula, motivo o estado.</p></div></div><div className="search-input"><input value={fineQuery} onChange={(event) => setFineQuery(event.target.value)} placeholder="Buscar multa por nombre de la persona..." /></div><div className="table-wrap"><table><thead><tr><th>ID</th><th>Persona</th><th>Monto</th><th>Motivo</th><th>Estado</th></tr></thead><tbody>{filteredFines.map((fine) => <tr key={fine.id}><td>#{fine.id}</td><td><b>{fine.user_name}</b><small>{fine.identifier}</small></td><td>${fine.amount}</td><td>{fine.motivo}</td><td>{fine.status}</td></tr>)}</tbody></table>{filteredFines.length === 0 && <div className="empty">No se encontraron multas con ese criterio.</div>}</div></section>}
    {tab === "lookup" && <section className="panel table-panel loan-lookup-panel"><div className="page-header compact"><div><span className="eyebrow">CONSULTA RÁPIDA</span><h2>Ver préstamos actuales</h2><p>Busca por nombre o matrícula de usuario, o por título e ISBN del libro.</p></div></div><div className="lookup-autocomplete"><div className="search-input loan-lookup-search">    <input value={loanLookupQuery} onChange={(event) => { setLoanLookupQuery(event.target.value); setLookupSelectedUserId(""); setProfileId(""); }}  placeholder="Ej. Ana Martínez o Fundamentos de programación..." aria-label="Buscar préstamos por usuario o libro" />{loanLookupQuery && <button type="button" className="clear-search" onClick={() => { setLoanLookupQuery(""); setLookupSelectedUserId(""); }} aria-label="Limpiar búsqueda">×</button>}</div>{lookupOptions.length > 0 && <div className="lookup-options"><span className="lookup-options-title">Selecciona una opción</span>{lookupOptions.map((option) => <button type="button" key={`${option.kind}-${option.id}`} onClick={() => { setLoanLookupQuery(option.label); if (option.kind === "user") { setLookupSelectedUserId(option.id); setProfileId(option.id); } }}>{option.kind === "user" ? "Usuario" : "Libro"}: <b>{option.label}</b><small>{option.detail}</small></button>)}</div>}</div><div className="lookup-summary"><span><b>{filteredLoanLookup.length}</b> {filteredLoanLookup.length === 1 ? "préstamo encontrado" : "préstamos encontrados"}</span>{loanLookupQuery && <span>Coincidencias para <b>“{loanLookupQuery}”</b></span>}</div>    {selectedProfile && <section className="lookup-profile-link"><b>Perfil seleccionado:</b> {selectedProfile.name} · <button type="button" onClick={() => document.getElementById("loan-profile")?.scrollIntoView({ behavior: "smooth" })}>Ver perfil completo</button></section>}    <section id="loan-profile" className="lookup-profile-card"><div className="profile-close-row"><span>Perfil del usuario</span><button type="button" className="profile-close-button" onClick={() => { setProfileId(""); setLookupSelectedUserId(""); }}>Dejar de ver perfil</button></div>{selectedProfile ? <><div className="profile-header"><div><span className="eyebrow">PERFIL DEL USUARIO</span><h2>{selectedProfile.name}</h2><p>{selectedProfile.identifier} · {selectedProfile.role} · {selectedProfile.status}</p></div><div><b>{activeProfileLoans.length}</b><small> activos</small><br /><b>{overdueProfileLoans.length}</b><small> vencidos</small><br /><b>{returnedProfileLoans.length}</b><small> históricos</small><br /><b>{profileFines.length}</b><small> multas</small></div></div><p><b>Correo:</b> {selectedProfile.email || "No registrado"} · <b>Teléfono:</b> {selectedProfile.phone || "No registrado"}</p><h3 className="profile-subtitle">Historial de préstamos</h3><div className="table-wrap"><table><thead><tr><th>Libro</th><th>Vencimiento</th><th>Estado</th></tr></thead><tbody>{profileLoans.map((loan) => { const overdue = loan.estado === "Activo" && new Date(loan.fecha_vencimiento).getTime() < Date.now(); return <tr key={loan.id}><td>{loan.title}</td><td>{new Date(loan.fecha_vencimiento).toLocaleDateString("es-MX")}</td><td>{overdue ? "Vencido" : loan.estado}</td></tr>; })}</tbody></table>{profileLoans.length === 0 && <div className="empty">No tiene historial de préstamos.</div>}</div><h3 className="profile-subtitle">Multas</h3><p>{profileFines.length ? `Tiene ${profileFines.length} multa(s) registrada(s).` : "No tiene multas registradas."}</p><p><b>Renovaciones:</b> {profileRenewals.length} · <b>Suspensiones:</b> {profileSuspensions.length} · <b>Lista de espera:</b> {profileWaitlist.length}</p></> : <div className="empty">Selecciona un usuario en las opciones de búsqueda para ver su perfil completo.</div>}</section><div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Libro prestado</th><th>Préstamo</th><th>Fecha de vencimiento</th><th>Estado</th></tr></thead><tbody>{filteredLoanLookup.map((loan) => <tr key={loan.id}><td><button type="button" className="lookup-user-button" onClick={() => { const user = users.find((item) => item.identifier === loan.identifier); if (user) { setProfileId(String(user.id)); setLookupSelectedUserId(String(user.id)); } }}><b>{loan.user_name}</b><small>{loan.identifier}</small></button></td><td><b>{loan.title}</b><small>{loan.isbn}</small></td><td>#{loan.id}</td><td>{new Date(loan.fecha_vencimiento).toLocaleDateString("es-MX")}</td><td><span className={`status ${new Date(loan.fecha_vencimiento).getTime() < Date.now() ? "suspended" : ""}`}><i />{new Date(loan.fecha_vencimiento).getTime() < Date.now() ? "Vencido" : "Activo"}</span></td></tr>)}</tbody></table>{filteredLoanLookup.length === 0 && <div className="empty">{loanLookupQuery ? "No hay préstamos activos que coincidan con ese usuario o libro." : "No hay préstamos activos registrados."}</div>}</div></section>}
    {loading && <div className="loading-state">Cargando circulación…</div>}
  </>;
}
