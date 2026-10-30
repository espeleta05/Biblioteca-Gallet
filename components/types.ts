export type View = "inicio" | "usuarios" | "libros" | "buscar";

export type User = {
  id: string;
  name: string;
  identifier: string;
  role: "Administrador" | "Alumno" | "Profesor" | "Bibliotecario";
  status: "Activo" | "Suspendido";
  email: string;
};

export type Book = {
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

export type DashboardData = {
  currentUser: { name: string; role: string };
  availability: { total: number; available: number; borrowed: number };
  activity: { icon: string; title: string; detail: string }[];
};
