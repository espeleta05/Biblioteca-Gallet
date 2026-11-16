/**
 * Auditoría automatizada de accesibilidad (Propuesta 3.3: WCAG 2.1 AA revisado con
 * axe; Google cap. 4: ingeniería para la equidad). Inicia sesión como personal y
 * como alumno, recorre todas las vistas y diálogos, y ejecuta axe-core en cada una,
 * también en modo de alto contraste y con la letra al 175 %.
 *
 * Uso: node pruebas/accesibilidad/axe-vistas.mjs [URL]   (por defecto http://localhost:3000)
 * Requiere Chrome o Edge instalado (CHROME_PATH para otra ruta) y el sistema corriendo.
 * Termina con código 1 si encuentra violaciones.
 */
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { existsSync } from "node:fs";

const URL = process.argv[2] ?? "http://localhost:3000";
const NAVEGADORES = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome"].filter(Boolean);
const ejecutable = NAVEGADORES.find((ruta) => existsSync(ruta));
if (!ejecutable) throw new Error("No se encontró Chrome ni Edge. Define CHROME_PATH.");

const ETIQUETAS_WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const resultados = [];

async function auditar(pagina, nombre) {
  const r = await new AxeBuilder({ page: pagina }).withTags(ETIQUETAS_WCAG).analyze();
  resultados.push({ nombre, violaciones: r.violations, revisadas: r.passes.length });
  const estado = r.violations.length ? `✗ ${r.violations.length} tipo(s) de violación` : "✓ sin violaciones";
  console.log(`${estado.padEnd(30)} ${nombre} (${r.passes.length} reglas aprobadas)`);
}

async function iniciarSesion(pagina, usuario) {
  await pagina.goto(URL);
  await pagina.getByLabel("Usuario, matrícula o nómina").fill(usuario);
  await pagina.getByLabel("Contraseña").fill("1234");
  await pagina.getByRole("button", { name: "Iniciar sesión" }).click();
  await pagina.getByRole("navigation", { name: "Menú principal" }).waitFor();
}

async function irA(pagina, vista) {
  await pagina.getByRole("navigation", { name: "Menú principal" }).getByRole("button", { name: vista }).click();
  await pagina.waitForLoadState("networkidle");
}

async function abrirYAuditar(pagina, boton, nombre) {
  await pagina.getByRole("button", { name: boton }).first().click();
  await pagina.getByRole("dialog").waitFor();
  await auditar(pagina, nombre);
  await pagina.keyboard.press("Escape");
}

const navegador = await chromium.launch({ executablePath: ejecutable });
try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const pagina = await contexto.newPage();
  await pagina.goto(URL);
  await pagina.getByLabel("Usuario, matrícula o nómina").waitFor();
  await auditar(pagina, "Inicio de sesión");

  await iniciarSesion(pagina, "admin");
  await auditar(pagina, "Inicio (administrador)");
  await irA(pagina, "Prestar y devolver");
  await auditar(pagina, "Prestar y devolver");
  await irA(pagina, "Multas y adeudos");
  await auditar(pagina, "Multas");
  await pagina.getByRole("tab", { name: "Personas con adeudos" }).click();
  await auditar(pagina, "Personas con adeudos");
  await irA(pagina, "Alumnos suspendidos");
  await auditar(pagina, "Alumnos suspendidos");
  await abrirYAuditar(pagina, "Registrar suspensión", "Diálogo: registrar suspensión");
  await irA(pagina, "Gestionar libros");
  await auditar(pagina, "Gestionar libros");
  await abrirYAuditar(pagina, "Nueva ficha", "Diálogo: nueva ficha bibliográfica");
  await abrirYAuditar(pagina, "Abrir ficha de", "Diálogo: ficha y ejemplares");
  await irA(pagina, "Buscar libros");
  await auditar(pagina, "Buscar libros");
  await irA(pagina, "Gestión de usuarios");
  await auditar(pagina, "Gestión de usuarios");
  await abrirYAuditar(pagina, "Alta de personal", "Diálogo: alta de personal");

  // Mismas vistas con alto contraste y letra al 175 %.
  await pagina.getByRole("button", { name: "Alto contraste" }).click();
  for (let i = 0; i < 6; i += 1) await pagina.getByRole("button", { name: "A+ Aumentar tamaño de letra" }).click();
  await irA(pagina, "Prestar y devolver");
  await auditar(pagina, "Prestar y devolver (alto contraste, letra 175 %)");
  await pagina.getByRole("button", { name: "Alto contraste" }).click();
  for (let i = 0; i < 6; i += 1) await pagina.getByRole("button", { name: "A− Reducir tamaño de letra" }).click();
  await pagina.getByRole("button", { name: "Cerrar sesión" }).click();

  // Alumno en pantalla de celular: búsqueda y chatbot.
  await pagina.setViewportSize({ width: 390, height: 844 });
  await iniciarSesion(pagina, "ALU001");
  await auditar(pagina, "Buscar libros (alumno, 390 px)");
  await pagina.getByRole("button", { name: "Asistente de la biblioteca" }).click();
  await pagina.getByLabel("Escribe tu pregunta").fill("¿Tengo multas?");
  await pagina.getByRole("button", { name: "Enviar" }).click();
  await pagina.getByText(/multas pendientes|No tienes multas/).waitFor();
  await auditar(pagina, "Chatbot (alumno, 390 px)");
} finally {
  await navegador.close();
}

const conViolaciones = resultados.filter((r) => r.violaciones.length);
console.log(`\n${resultados.length} pantallas auditadas · ${conViolaciones.length} con violaciones WCAG 2.1 AA`);
for (const r of conViolaciones) {
  console.log(`\n## ${r.nombre}`);
  for (const v of r.violaciones) {
    console.log(`- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} elemento(s))`);
    for (const n of v.nodes.slice(0, 3)) console.log(`    ${n.target.join(" ")} → ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`);
  }
}
process.exitCode = conViolaciones.length ? 1 : 0;
