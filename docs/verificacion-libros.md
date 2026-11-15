# Verificación contra SWEBOK V4 e "Ingeniería de Software en Google"

Esta revisión aplica la lista de verificación A1–H2 del grafo de conocimiento (`conocimiento-ingsw/verificacion/checklist-verificacion.md`). Se hizo el 2026-11-13 al cerrar el trabajo de la rama `feat/completar-sprints-sigeb`.

Leyenda: ✅ se cumple, con evidencia · ⏳ preparado, pero falta ejecutarlo · ❌ no se cumple todavía.

## A. Requisitos (SWEBOK 01)

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| A1 | Todo es trazable al backlog o a las Reglas 1 a 6 | ✅ | `docs/trazabilidad.md` |
| A2 | No se agregó nada fuera del backlog | ✅ | Se quitaron las tablas de compras, presupuestos y facturas (9.3) y el "modo móvil" simulado de la web |
| A3 | Las ambigüedades quedan registradas y se consultan con el PO | ✅ | `docs/decisiones-pendientes.md` (10 puntos) |
| A4 | Cada requisito es comprobable con un caso de prueba | ✅ | 209 pruebas y 25 casos de UAT |
| A5 | Se usa el vocabulario de la biblioteca | ✅ | Dominio, API y pantallas en español con los términos de la propuesta |

## B. Arquitectura (SWEBOK 02)

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| B1 | Decisiones registradas con alternativas y trade-offs | ✅ | `docs/adr/0001`, `0002` |
| B2 | Un módulo por función; un cambio en multas no rompe préstamos | ✅ | 8 microservicios; si falla una llamada entre servicios, no se deshace la operación (`seguimiento`) |
| B3 | La deuda técnica está escrita | ✅ | Sección "Deuda registrada" del ADR 0001 |

## C. Diseño (SWEBOK 03)

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| C1 | Interfaz, lógica de negocio y datos separadas | ✅ | `comun/dominio` (puro) / servicios / controladores y DTO / componentes React |
| C2 | Alta cohesión y bajo acoplamiento | ✅ | Un servicio por función; dependencias solo hacia `comun` |
| C3 | La lógica reutilizable está centralizada | ✅ | Días hábiles, multas, tipo de cambio y situación del solicitante, cada uno en un solo lugar |
| C4 | Uniformidad | ✅ | Formato de error `{ error, motivos }` en servicios, gateway y simuladores |
| C5 | Testabilidad sin BD ni red | ✅ | 150 pruebas unitarias del dominio y permisos sin BD |
| C6 | Diseño centrado en el usuario | ✅ | Vista previa de multas, motivos de rechazo completos, accesos directos |
| C7 | Modelo de datos documentado | ✅ | `docs/modelo-datos.md` |

## D. Construcción (SWEBOK 04)

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| D1 | Minimizar complejidad; sin código muerto | ✅ | Se eliminaron `diseño.tsx`, el layout duplicado, la configuración de Tailwind sin uso y el backend viejo |
| D2 | Anticipar el cambio | ✅ | Políticas en la tabla `ROLES`; valores ambiguos en constantes o en el entorno |
| D3 | Construir para verificar | ✅ | Las pruebas del dominio se escribieron antes que los servicios; detectaron 3 defectos reales (formato de error, especificidad CSS, búsqueda repetida) |
| D4 | Reutilizar | ✅ | NestJS, class-validator, jose, pg, nodemailer, Expo |
| D5 | Estándares | ✅ | `docs/normas.md`; TypeScript estricto en los 3 proyectos |
| D6 | Programación defensiva | ✅ | DTO con `whitelist`, SQL parametrizado, transacciones, `FOR UPDATE`, `CHECK` en la base de datos, validación del entorno al arrancar |
| D7 | Contrato de API documentado | ✅ | `docs/api/integraciones.md` (tabla REST; no es OpenAPI) |
| D8 | Análisis estático y build | ✅ | `tsc` sin errores en servicios, web y app; `next build` con lint; bundle de Android |

## E. Pruebas (SWEBOK 05 + Google cap. 10)

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| E1 | Particiones de equivalencia y valores límite | ✅ | TC-E01–04 (ejemplares), TC-RA (renovaciones), TC-F (fechas), TC-S (suspensión), TC-I (ISBN) |
| E2 | Tablas de decisión | ✅ | Regla 1 (CP1–CP9), cargos de devolución (CP1–CP5), permisos rol × función |
| E3 | Pruebas de integración | ✅ | 59 pruebas con BD real, servicios comunicándose y simuladores |
| E4 | A través de la API pública, centradas en comportamiento | ✅ | Las pruebas de integración usan HTTP (supertest) |
| E5 | Mensajes de error descriptivos | ✅ | Las pruebas verifican el texto de los motivos |
| E6 | Proporción cercana a 80/20 | ✅ aprox. | 150 unitarias (72%) y 59 de integración (28%) |
| E7 | Pruebas 4C | ✅ | Claras (ID y caso), correctas, completas por regla; el consenso con el cliente queda en la UAT |
| E8 | Casos límite de la propuesta | ✅ | Tercer ejemplar, renovación número tres, fin de semana (TC-F02, F03, V03) |
| E9 | Guion de UAT | ✅ / ⏳ | `docs/pruebas-aceptacion-uat.md`; falta ejecutarlo con la Biblioteca |
| — | Pruebas automatizadas de la interfaz web | ✅ / ⏳ | La auditoría `pruebas/accesibilidad/axe-vistas.mjs` recorre con Playwright 16 pantallas y diálogos con inicio de sesión real. Faltan pruebas funcionales de la interfaz (los flujos se verificaron a mano en el navegador). |

## F. Prácticas de equipo (Google caps. 2, 3, 8 y 9)

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| F1 | Cambios pequeños, un commit por cambio lógico | ✅ | Un commit por sprint, más web, app móvil y documentación (PR #1) |
| F2 | Revisión de código y VoBo antes de integrar | ⏳ | PR #1 abierto; falta la revisión de otro integrante |
| F3 | Automatizar lo mecánico (CI) | ✅ | `.github/workflows/ci.yml` (corre en GitHub al hacer push) |
| F4 | Normas escritas | ✅ | `docs/normas.md` |
| F5 | Documentación que deja rastro | ✅ | README, manual, ADRs, trazabilidad, UAT, decisiones |

## G. Equidad y accesibilidad (Google cap. 4 + RNF)

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| G1 | Contraste y tipografía para baja visión | ✅ | Paleta con contraste ≥ 4.5:1 (comentada en `globals.css`), escala de letra y alto contraste |
| G2 | Lectores de pantalla y teclado | ✅ | Etiquetas, roles ARIA, `aria-live`, foco atrapado en modales, enlace para saltar al contenido; accesibilidad nativa en la app |
| G3 | Pantallas responsivas | ✅ | Breakpoint de 860 px con menú desplegable |
| G4 | Auditoría Lighthouse/axe (WCAG 2.1 AA) | ✅ | 2026-11-13: axe con 0 violaciones en 16 pantallas (incluye alto contraste, letra al 175 % y 390 px); Lighthouse con 100 en accesibilidad y 100 en buenas prácticas. Corrigió 3 defectos: tabla desplazable sin teclado (2.1.1), nombre accesible distinto del texto visible (2.5.3) e icono faltante. Resultados en `pruebas/accesibilidad/resultados/` |

## H. Calidad de servicio (Google caps. 6–7 + RNF)

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| H1 | ≤ 3 s; índices | ✅ | 2026-11-13, k6 con 100 usuarios durante 1 min: 11,531 peticiones, 0 % de errores, p95 de 33.8 ms (máx. 1.09 s) contra los servicios directos. Falta repetirla a través de NGINX en Docker. Resultado en `pruebas/carga/resultados/` |
| H2 | Métricas útiles | ✅ | Umbral `p(95)<3000` en k6; tabla `BITACORA` para auditoría |

## Lo que falta para cerrar el Sprint 4 por completo

1. Revisión del PR #1 y VoBo de otro integrante (F2). Los commits por sprint ya están hechos (F1).
2. Levantar el stack con Docker Compose en un equipo con Docker y repetir k6 a través de NGINX (H1 ya se cumple contra los servicios directos).
3. La app ya se probó en un celular real con Expo Go (2026-11-15); falta repetir la prueba en el otro sistema operativo (Android o iOS).
4. Cargar las credenciales reales que entrega la Universidad: Banxico, SMTP, WhatsApp y Dialogflow CX (ADR 0002).
5. Ejecutar la UAT y la capacitación con la Biblioteca, y firmar el acta (E9). Esto no es código.
6. Que el PO resuelva `docs/decisiones-pendientes.md`.
