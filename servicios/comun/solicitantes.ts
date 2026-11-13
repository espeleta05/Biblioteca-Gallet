/**
 * Consulta de la situación de un solicitante (Regla 1): préstamos activos y sus
 * vencimientos, multas pendientes, suspensión y política de su rol.
 */
import { consultarUno, type Ejecutor, obtenerPool } from "./db";
import type { PoliticaPrestamo, RolUsuario } from "./dominio/politicas";
import type { Solicitante } from "./dominio/prestamos";

export type SituacionSolicitante = Solicitante & { idCredencial: number; rol: RolUsuario; identificador: string; nombre: string };

export async function situacionSolicitante(idCredencial: number, ejecutor: Ejecutor = obtenerPool()): Promise<SituacionSolicitante | undefined> {
  const fila = await consultarUno<{
    id_credencial: number; rol: RolUsuario; identificador: string; nombre: string; activo: boolean; suspendido: boolean;
    multas: number; activos: number; vencimientos: string[]; dias_prestamo: number; max_ejemplares: number; max_renovaciones: number;
  }>(`
    SELECT c.id_credencial, r.nombre_rol AS rol, c.matricula_nomina AS identificador,
           COALESCE(e.nombre_completo, p.nombre_completo, c.matricula_nomina) AS nombre,
           (c.estatus = 'Activa' AND COALESCE(e.activo_en_escuela, TRUE)) AS activo,
           EXISTS (SELECT 1 FROM SUSPENSIONES s WHERE s.id_credencial = c.id_credencial AND s.estado = 'Activa'
                   AND (s.fecha_fin IS NULL OR s.fecha_fin >= CURRENT_DATE)) AS suspendido,
           (SELECT COUNT(*)::int FROM MULTAS m WHERE m.id_credencial = c.id_credencial AND m.estatus = 'Pendiente') AS multas,
           (SELECT COUNT(*)::int FROM PRESTAMOS x WHERE x.id_credencial = c.id_credencial AND x.estado = 'Activo') AS activos,
           ARRAY(SELECT x.fecha_vencimiento::text FROM PRESTAMOS x WHERE x.id_credencial = c.id_credencial AND x.estado = 'Activo') AS vencimientos,
           r.dias_prestamo, r.max_ejemplares, r.max_renovaciones
    FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol
    LEFT JOIN USUARIOS_ESCOLARES e ON e.id_credencial = c.id_credencial
    LEFT JOIN PERSONAL_BIBLIOTECA p ON p.id_credencial = c.id_credencial
    WHERE c.id_credencial = $1`, [idCredencial], ejecutor);
  if (!fila) return undefined;
  const politica: PoliticaPrestamo = { diasHabiles: fila.dias_prestamo, maxEjemplares: fila.max_ejemplares, maxRenovaciones: fila.max_renovaciones };
  return {
    idCredencial: fila.id_credencial, rol: fila.rol, identificador: fila.identificador, nombre: fila.nombre,
    activo: fila.activo, suspendido: fila.suspendido, multasPendientes: fila.multas, prestamosActivos: fila.activos,
    vencimientosActivos: fila.vencimientos, politica,
  };
}
