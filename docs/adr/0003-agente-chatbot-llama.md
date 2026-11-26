# ADR 0003 · Agente del chatbot con Llama (Ollama)

- **Estado:** aceptada por el equipo; pendiente de confirmar con el Product Owner
- **Fecha:** 2026-11-17
- **Fuente del requisito:** Propuesta SIGEB 3.2 (chatbot con Google Cloud), 3.5 (Dialogflow CX) y Sprint 4 (HU1 a HU3-SP7)

## Contexto

La propuesta pide un chatbot en lenguaje natural con Google Cloud (Dialogflow CX). El adaptador de Dialogflow existe (ADR 0002), pero sin las credenciales de la Universidad responde solo el clasificador local por palabras clave. Ese clasificador:

- no entiende preguntas abiertas ni escritas de otra forma;
- no responde sobre la aplicación (objetivo, alcance y plataformas), que pide la HU3-SP7;
- no busca libros.

## Decisión

Agregar un **agente con Llama 3.2 (3B)**, que corre en **Ollama** dentro de Docker Compose, en el mismo servidor de SIGEB.

- **Ruta de cada pregunta** (`chatbot/src/main.ts`):
  1. Dialogflow CX, si está configurado.
  2. El clasificador local, si reconoce la pregunta con seguridad (consulta personal, "ayuda" o una regla con 2 o más palabras clave). Responde al instante y cumple el RNF de 3 s.
  3. El agente con Llama, para lo demás.
  4. Si Ollama está apagado o no responde a tiempo (45 s), lo que haya entendido el clasificador.
- **Herramientas del agente** (`comun/dominio/agente.ts`): `consultar_mis_prestamos`, `consultar_mis_multas` y `buscar_libros`. El servicio las ejecuta **con la sesión del JWT**: las herramientas personales no reciben parámetros, así que el modelo no puede pedir datos de otra persona (riesgo principal del Sprint 4).
- **Instrucciones del agente:** las políticas de `CHATBOT_REGLAS` (validadas por la Biblioteca) y la información de SIGEB (HU3-SP7). Responde solo sobre la Biblioteca y no puede registrar operaciones.
- **Despliegue:**
  - Servicio `ollama` (imagen `ollama/ollama:0.40.13`), visible solo dentro de la red de Docker. Los modelos se guardan en el volumen `modelos-ollama`.
  - El contenedor `ollama-modelo` descarga `llama3.2:3b` la primera vez.
  - Variables: `URL_OLLAMA`, `MODELO_OLLAMA` y `OLLAMA_TIEMPO_LIMITE_MS`.
- **Gateway:** `/api/chatbot` tiene 60 s de espera (las demás rutas, 5 s).

### Ajustes tras las pruebas con usuarios (2026-11-17)

Un modelo de 3B a veces inventa. En las pruebas, por ejemplo:

- escribió como texto una herramienta que no existe (`{"name":"costos_de_reposicion"…}`);
- dijo que se puede renovar desde la app;
- omitió el costo de un libro perdido;
- ante una búsqueda, contestó "¿Cuál deseas prestar?".

Por eso, **los datos exactos nunca los redacta el modelo**:

- **Políticas:** si la pregunta coincide con una política por una palabra clave específica ("pierdo", "renovar", "multa"; no "día"), se responde con el texto exacto de `CHATBOT_REGLAS`. Esos textos dicen dónde se hace cada trámite.
- **Préstamos y multas propios:** respuesta determinista del clasificador.
- **Búsqueda de libros:** Llama solo decide qué buscar. La respuesta la escribe el sistema con los títulos, copias, ubicaciones y devoluciones reales (`redactarBusqueda`), sin otra vuelta del modelo.
- **Herramienta inventada:** nunca se muestra. Se le pide una vez al modelo que responda con texto y, si insiste, contesta el clasificador.
- **Lo que hace Llama:** información de SIGEB, la fecha, preguntas que no son de la Biblioteca y preguntas abiertas que no coinciden con una política.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Solo Dialogflow CX | Requiere la cuenta y credenciales de Google Cloud de la Universidad, que aún no se tienen. Sigue disponible y tiene prioridad si se configura. |
| API de un modelo en la nube | Costo por uso, y los datos de préstamos y multas saldrían del servidor de la Universidad. |
| Llama 3.1 de 8B | Respuestas mejores, pero en un servidor sin GPU tarda el doble y usa unos 5 GB de RAM. Se puede cambiar con `MODELO_OLLAMA`. |

## Consecuencias

- **A favor:**
  - Sin costo por uso.
  - Los datos no salen del servidor.
  - Funciona sin credenciales externas.
  - Cubre la HU3-SP7 y la búsqueda de libros desde el chat.
- **En contra:**
  - Sin GPU, una pregunta abierta tarda varios segundos. Medición del 2026-11-17 en una laptop con Intel i5-1335U, sin tarjeta gráfica, y Docker con 7.6 GB:
    - Información de SIGEB: 4 a 11 s.
    - Políticas de la Biblioteca: 5 s.
    - Préstamos propios: 8 s.
    - Búsqueda de libros (dos vueltas del modelo): 17 s.
    - Las preguntas frecuentes las contesta el clasificador en menos de 0.1 s.
    
    Para no superar el RNF de 3 s en las preguntas frecuentes, esas siguen respondiéndose con el clasificador. Para bajar los tiempos de las preguntas abiertas:
    - las instrucciones fijas se precargan al arrancar;
    - los préstamos y multas van en el contexto en lugar de pedirse con herramientas;
    - la búsqueda solo se ofrece cuando la pregunta trata de libros;
    - el modelo se queda en memoria 24 h.
    
    Con una GPU, las respuestas bajarían a 1 o 2 s.
  - Un modelo de 3B puede equivocarse con fechas. Por eso el contexto le dice explícitamente qué hacer con un préstamo vencido, y los datos personales exactos los sigue dando "Mi cuenta".
  - El servidor necesita unos 3 GB de RAM más y 2 GB de disco para el modelo.
- **Licencia:** Llama 3.2 se distribuye con la licencia comunitaria de Meta, que permite este uso y pide indicar que se usa Llama ("Built with Llama").
- **Cambio respecto a la propuesta:** la 3.2 dice Google Cloud. Queda registrado en `docs/decisiones-pendientes.md` (punto 15) para confirmarlo con el Product Owner.
- **Pruebas:** `tests/unit/agente.test.ts` prueba el ciclo de herramientas con un modelo simulado, la privacidad, el JSON que Llama a veces escribe como texto, las fallas de herramientas y el respaldo cuando Ollama no está.
