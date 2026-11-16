# Guion de la exposición: funciones de SIGEB

Demostración en vivo de las **8 funciones del Product Backlog** (Propuesta 2.3), en el orden de los sprints. Cada función se muestra con una regla de la propuesta funcionando. Duración: unos 12 minutos.

## Antes de empezar (5 minutos antes)

1. Abre **Docker Desktop** y espera a que diga *Engine running*.
2. En PowerShell, desde la carpeta del proyecto:

   ```
   powershell -ExecutionPolicy Bypass -File infra\preparar-demostracion.ps1
   ```

   Deja la base con la escena de demostración. Vuelve a ejecutarlo antes de cada ensayo.
3. Abre **https://localhost**. Ante el aviso del certificado de pruebas: *Configuración avanzada → Continuar*.
4. Ten listas dos ventanas del navegador: una normal para el personal y una de incógnito para el alumno.

**Cuentas** (contraseña `1234`):

| Cuenta | Rol |
|---|---|
| `admin` | Administrador |
| `B-0041` | Bibliotecaria |
| `ALU001` | Alumno |

**Escena precargada:**

| Persona | Situación | Para mostrar |
|---|---|---|
| ALU005 | Préstamo **vencido** hace 3 días | Validar fechas, multa por retraso y bloqueo |
| ALU006 | **Multa pendiente** de $50 | Bloqueo por adeudo y pago con Tesorería |
| ALU007 / ALU008 | ALU007 tiene el único ejemplar de *Ingeniería de software en Google*; ALU008 lo **espera** | Lista de espera |
| ALU009 | **Suspendido** por mal uso | Bloqueo por suspensión |
| ALU010 | Préstamo con **1 renovación** ya hecha | Límite de renovaciones |

---

## Sprint 0 · 1. Gestión de usuarios (cuenta `admin`)

1. Inicia sesión con `admin`. **Punto a explicar:** el menú cambia según el rol.
2. Abre **Gestión de usuarios** → **Verificar con base escolar**. **Punto a explicar:** los alumnos y profesores vienen de la base de datos escolar; aparece cuántos se consultaron, cuántos son nuevos y cuántos se dieron de baja.
3. **Alta de personal:** crea un bibliotecario. **Punto a explicar:** desde SIGEB solo se da de alta al personal de la biblioteca.
4. *(Opcional)* En la ventana de incógnito, escribe mal la contraseña de `ALU050` 5 veces. **Punto a explicar:** al quinto intento se bloquea la cuenta (Propuesta 3.3).

## Sprint 1 · 2. Gestionar libros (cuenta `admin`)

1. **Gestionar libros:** filtra por **Tema** y por **Estado de ejemplares**. **Punto a explicar:** es el listado de libros por diversos filtros (inventario).
2. **Ficha** de un libro: ISBN, autores, editorial y **precio de la última compra en dólares**. **Punto a explicar:** ese precio se usa en la Regla 4.
3. En la ficha, cambia un ejemplar a **Dañado**. **Punto a explicar:** el estado del libro (prestado, perdido, etc.).
4. Pestaña **Solicitudes de compra:** aprueba "Refactoring". **Punto a explicar:** solo la solicitud; el proceso de compras está excluido (9.3).

## Sprint 1 · 3. Buscar libros (ventana de incógnito, cuenta `ALU001`)

1. Inicia sesión con `ALU001`. **Punto a explicar:** el alumno solo ve **Buscar libros** y el **Asistente**.
2. Busca "java" y marca **Solo disponibles**. **Punto a explicar:** muestra la existencia y la ubicación (piso, área, pasillo y estante).
3. *(Opcional)* Muestra lo mismo en la **app móvil** con Expo Go.

## Sprint 2 · 4. Prestar libros (cuenta `B-0041`)

1. Cierra sesión del `admin` y entra con `B-0041` → **Prestar y devolver**.
2. Solicitante `ALU001` y libro *Effective Java*, recibo por **Impresión** → **Registrar préstamo**. **Punto a explicar:** vence en **5 días hábiles** sin contar el fin de semana (Regla 5); se muestra el recibo.
3. Con el mismo alumno, presta *Don Quijote*. Luego intenta un **tercer** libro. **Punto a explicar:** se rechaza por "el máximo es 2" (Regla 1).
4. Solicitante `ALU005` y *Don Quijote* → se rechaza. **Punto a explicar:** tiene un préstamo vencido (Regla 1).
5. Solicitante `ALU009` → se rechaza. **Punto a explicar:** está suspendido.
6. Solicitante `ALU001` y *Introduction to Algorithms* → se rechaza. **Punto a explicar:** es de consulta interna.
7. En **Préstamos activos**, busca `ALU010` → **Renovar** → pasa (2 de 2). **Renovar** otra vez → se rechaza. **Punto a explicar:** máximo 2 renovaciones para alumnos y 3 para profesores (Reglas 2 y 6).
8. Solicitante `ALU002` y libro *Clean Code* (0 disponibles) → **Agregar a lista de espera**.

## Sprint 2 · 5. Devolver libros (cuenta `B-0041`)

1. En **Préstamos activos**, busca `ALU005` → **Devolver**. La vista previa marca **$30**. **Punto a explicar:** $10 por cada uno de los 3 días de retraso (Regla 3). Confirma.
2. Busca `ALU007` → **Devolver** en buen estado. **Punto a explicar:** el sistema avisa a la primera persona en lista de espera (ALU008).
3. Busca `ALU001` → **Devolver** y elige la condición **Perdido**. **Punto a explicar:** costo de reposición = precio en USD × tipo de cambio de Banxico (Regla 4), con aviso a Tesorería y Servicios Escolares.

## Sprint 3 · 6. Gestión de multas (cuenta `B-0041`)

1. **Multas y adeudos** → pestaña **Préstamos vencidos**. **Punto a explicar:** valida las fechas y muestra la multa acumulada al día.
2. Pestaña **Multas:** la de `ALU006` ($50) → **Registrar pago** con la referencia `TES-000123`. **Punto a explicar:** Tesorería confirma la referencia y se emite el recibo de pago.
3. Repite con una referencia inválida como `ABC-1`. **Punto a explicar:** Tesorería la rechaza.
4. Pestaña **Personas con adeudos** → **Exportar lista (CSV)** y **Enviar avisos por correo**. **Punto a explicar:** es la lista para Servicios Escolares.

## Sprint 3 · 7. Alumnos suspendidos (cuenta `B-0041`)

1. **Alumnos suspendidos:** aparece ALU009 con su causa y el aviso a Servicios Escolares.
2. **Registrar suspensión** de otro alumno por *Mal uso*. **Punto a explicar:** el robo y el exceso de multas (3 pendientes) suspenden de forma automática.

## Sprint 4 · 8. Chatbot (las dos ventanas)

1. Como `B-0041`, abre el **Asistente de la biblioteca** y pregunta "¿Cuántos días dura un préstamo?".
2. En incógnito, entra con `ALU005` y pregunta "¿Cuándo vence mi libro?" y luego "¿Tengo multas?". **Punto a explicar:** responde con sus datos reales.

## Cierre (1 minuto)

- **Accesibilidad:** pulsa **A+** varias veces y luego **Alto contraste**. **Punto a explicar:** cumple WCAG 2.1 AA (axe sin errores, Lighthouse 100).
- **Arquitectura:** en PowerShell ejecuta `docker compose ps`. **Punto a explicar:** son 14 contenedores (8 microservicios, NGINX, PostgreSQL, respaldos y simuladores).
- **Calidad:** 210 pruebas automáticas; prueba de carga con 100 usuarios con un p95 de 81.5 ms, cuando la propuesta pide 3 s o menos.

## Si algo falla

| Problema | Solución |
|---|---|
| La página no carga | Revisa que Docker Desktop esté abierto y ejecuta `docker compose --profile pruebas up -d` |
| Los datos quedaron revueltos por un ensayo | Vuelve a correr `infra\preparar-demostracion.ps1` |
| "Cuenta bloqueada" | Espera 15 minutos o usa otra cuenta (`ALU0xx`) |
