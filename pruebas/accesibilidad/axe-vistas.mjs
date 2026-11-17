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
  await pagina.locator("#contenido").waitFor();
}

async function irA(pagina, vista) {
  const menu = pagina.getByRole("navigation", { name: "Menú principal" });
  if (!(await menu.isVisible())) await pagina.getByRole("button", { name: "Menú" }).click(); // celular
  await menu.getByRole("button", { name: vista }).click();
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
  // ignoreHTTPSErrors: el gateway de pruebas usa un certificado autofirmado (https://localhost).
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
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
  await abrirYAuditar(pagina, "Alta de libros", "Diálogo: alta de libros");
  await abrirYAuditar(pagina, "Baja de libros", "Diálogo: baja de libros");
  await abrirYAuditar(pagina, "Abrir ficha de", "Diálogo: ficha y ejemplares");
  await pagina.getByRole("tab", { name: "Listado para inventario" }).click();
  await pagina.getByRole("combobox", { name: "Tema" }).selectOption("Programación");
  await pagina.getByRole("button", { name: "Generar listado" }).click();
  await pagina.getByRole("region", { name: "Listado de ejemplares" }).waitFor();
  await auditar(pagina, "Listado para inventario");
  await pagina.getByRole("tab", { name: "Compra de libros" }).click();
  await pagina.getByRole("region", { name: "Órdenes de compra" }).waitFor();
  await auditar(pagina, "Compra de libros");
  await abrirYAuditar(pagina, /^Compra de libros$/, "Diálogo: orden de compra");
  await irA(pagina, "Buscar libros");
  await pagina.getByLabel(/Texto a buscar/).fill("java");
  await pagina.getByRole("button", { name: "Buscar", exact: true }).click();
  await pagina.getByRole("region", { name: "Resultados de la búsqueda" }).waitFor();
  await auditar(pagina, "Buscar libros");
  await irA(pagina, "Gestión de usuarios");
  await pagina.getByRole("combobox", { name: "Estatus" }).selectOption("Inactiva");
  await pagina.getByRole("button", { name: "Consultar cuentas" }).click();
  await pagina.getByRole("region", { name: "Cuentas" }).waitFor();
  await auditar(pagina, "Gestión de usuarios");
  await abrirYAuditar(pagina, "Alta de cuentas", "Diálogo: alta de cuentas");
  await abrirYAuditar(pagina, "Baja de cuentas", "Diálogo: baja de cuentas");
  await irA(pagina, "Gestión de perfiles");
  await auditar(pagina, "Gestión de perfiles");
  await abrirYAuditar(pagina, "Nuevo perfil", "Diálogo: nuevo perfil");
  await irA(pagina, "Mi cuenta");
  await auditar(pagina, "Mi cuenta (administrador)");

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
  await iniciarSesion(pagina, "ALU005");
  await auditar(pagina, "Buscar libros (alumno, 390 px)");
  await irA(pagina, "Mi cuenta");
  await pagina.getByRole("region", { name: "Mis préstamos" }).waitFor();
  await auditar(pagina, "Mi cuenta (alumno, 390 px)");
  await pagina.getByRole("button", { name: /^Asistente/ }).click();
  await pagina.getByLabel("Escribe tu pregunta").fill("¿Tengo multas?");
  await pagina.getByRole("button", { name: "Enviar" }).click();
  await pagina.locator("#chatbot").getByText(/multas pendientes|No tienes multas/).last().waitFor();
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
