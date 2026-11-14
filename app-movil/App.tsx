/**
 * App móvil SIGEB (Propuesta 3.2: React Native para Android e iOS).
 * Funciones para alumnos, profesores y colaboradores: Buscar libros y Chatbot.
 * Accesibilidad: etiquetas para lectores de pantalla (TalkBack/VoiceOver),
 * texto que respeta el tamaño de letra del sistema y contraste AA.
 */
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { buscarLibros, cerrarSesion, ErrorApi, iniciarSesion, preguntarChatbot, sesionActual, type Libro, type Sesion } from "./src/api";

const C = { tinta: "#13202f", tenue: "#4a5668", azul: "#1a56b8", fondo: "#f3f6fa", linea: "#c9d1dc", verde: "#116343", rojo: "#a3221a", blanco: "#ffffff" };

function Boton({ texto, alPresionar, secundario, deshabilitado }: { texto: string; alPresionar: () => void; secundario?: boolean; deshabilitado?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: deshabilitado }} disabled={deshabilitado} onPress={alPresionar}
      style={({ pressed }) => [estilos.boton, secundario && estilos.botonSecundario, (pressed || deshabilitado) && { opacity: 0.6 }]}>
      <Text style={[estilos.botonTexto, secundario && { color: C.azul }]}>{texto}</Text>
    </Pressable>
  );
}

function InicioSesion({ alEntrar }: { alEntrar: (s: Sesion) => void }) {
  const [identificador, setIdentificador] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const entrar = async () => {
    setEnviando(true); setError(null);
    try { alEntrar(await iniciarSesion(identificador.trim(), contrasena)); } catch (e) { setError(e instanceof ErrorApi ? e.message : "No fue posible iniciar sesión."); } finally { setEnviando(false); }
  };
  return (
    <View style={estilos.centro}>
      <Text style={estilos.titulo} accessibilityRole="header">SIGEB</Text>
      <Text style={estilos.tenue}>Biblioteca · Universidad Ducky</Text>
      <Text style={estilos.etiqueta} nativeID="etq-usuario">Matrícula o nómina</Text>
      <TextInput accessibilityLabelledBy="etq-usuario" accessibilityLabel="Matrícula o nómina" style={estilos.entrada} value={identificador} onChangeText={setIdentificador} autoCapitalize="characters" autoCorrect={false} />
      <Text style={estilos.etiqueta} nativeID="etq-contrasena">Contraseña</Text>
      <TextInput accessibilityLabelledBy="etq-contrasena" accessibilityLabel="Contraseña" style={estilos.entrada} value={contrasena} onChangeText={setContrasena} secureTextEntry onSubmitEditing={() => void entrar()} />
      {error && <Text style={estilos.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">{error}</Text>}
      <Boton texto={enviando ? "Entrando…" : "Iniciar sesión"} alPresionar={() => void entrar()} deshabilitado={enviando || !identificador || !contrasena} />
    </View>
  );
}

function BuscarLibros() {
  const [texto, setTexto] = useState("");
  const [soloDisponibles, setSoloDisponibles] = useState(false);
  const [libros, setLibros] = useState<Libro[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const buscar = async () => {
    setCargando(true); setError(null);
    try { setLibros(await buscarLibros(texto.trim(), soloDisponibles)); } catch (e) { setError(e instanceof Error ? e.message : "Error al buscar."); } finally { setCargando(false); }
  };
  useEffect(() => { void buscar(); }, [soloDisponibles]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flex: 1 }}>
      <TextInput accessibilityLabel="Buscar por título, autor, ISBN o tema" placeholder="Título, autor, ISBN o tema" placeholderTextColor={C.tenue} style={estilos.entrada} value={texto} onChangeText={setTexto} onSubmitEditing={() => void buscar()} returnKeyType="search" />
      <View style={estilos.fila}>
        <Switch value={soloDisponibles} onValueChange={setSoloDisponibles} accessibilityLabel="Mostrar solo libros disponibles" />
        <Text style={estilos.texto}>Solo disponibles</Text>
        <View style={{ flex: 1 }} />
        <Boton texto="Buscar" alPresionar={() => void buscar()} />
      </View>
      {error && <Text style={estilos.error} accessibilityRole="alert">{error}</Text>}
      {cargando ? <ActivityIndicator accessibilityLabel="Buscando" color={C.azul} /> : (
        <FlatList data={libros ?? []} keyExtractor={(l) => String(l.id)} ListEmptyComponent={<Text style={estilos.tenue}>No se encontraron libros.</Text>}
          renderItem={({ item }) => (
            <View style={estilos.tarjeta} accessible accessibilityLabel={`${item.titulo}, de ${item.autores}. ${item.disponibles} de ${item.existencia} disponibles. ${item.ubicaciones.map((u) => `${u.piso}, ${u.area}, pasillo ${u.pasillo}, estante ${u.estante}`).join("; ")}`}>
              <Text style={estilos.subtitulo}>{item.titulo}</Text>
              <Text style={estilos.tenue}>{item.autores} · {item.tema}</Text>
              <Text style={[estilos.texto, { color: item.disponibles ? C.verde : C.rojo, fontWeight: "700" }]}>{item.disponibles ? `${item.disponibles} de ${item.existencia} disponibles` : "Sin ejemplares disponibles"}</Text>
              {item.tipoUso !== "Préstamo externo" && <Text style={estilos.tenue}>{item.tipoUso}: no se presta fuera de la biblioteca</Text>}
              {item.ubicaciones.map((u) => <Text key={`${u.piso}${u.pasillo}${u.estante}`} style={estilos.texto}>📍 {u.piso} · {u.area} · pasillo {u.pasillo} · estante {u.estante}</Text>)}
            </View>
          )} />
      )}
    </View>
  );
}

type Mensaje = { de: "usuario" | "bot"; texto: string };
function Chatbot() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ de: "bot", texto: "Hola, pregúntame por vigencias, renovaciones, multas, costos de reposición o por tus préstamos." }]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const lista = useRef<ComponentRef<typeof ScrollView>>(null);
  const enviar = async (pregunta = texto) => {
    if (!pregunta.trim()) return;
    setMensajes((m) => [...m, { de: "usuario", texto: pregunta }]); setTexto(""); setEnviando(true);
    try { const r = await preguntarChatbot(pregunta); setMensajes((m) => [...m, { de: "bot", texto: r.respuesta }]); }
    catch { setMensajes((m) => [...m, { de: "bot", texto: "No pude responder en este momento." }]); } finally { setEnviando(false); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={lista} style={{ flex: 1 }} onContentSizeChange={() => lista.current?.scrollToEnd()} accessibilityLiveRegion="polite">
        {mensajes.map((m, i) => (
          <Text key={i} style={[estilos.burbuja, m.de === "usuario" ? estilos.burbujaUsuario : estilos.burbujaBot]} accessibilityLabel={`${m.de === "bot" ? "Asistente" : "Tú"}: ${m.texto}`}>{m.texto}</Text>
        ))}
        {mensajes.length === 1 && ["¿Cuántos días dura un préstamo?", "¿Tengo multas?", "¿Cuándo vence mi libro?"].map((s) => <Boton key={s} texto={s} secundario alPresionar={() => void enviar(s)} />)}
        {enviando && <ActivityIndicator accessibilityLabel="El asistente está escribiendo" color={C.azul} />}
      </ScrollView>
      <View style={estilos.fila}>
        <TextInput accessibilityLabel="Escribe tu pregunta" placeholder="Escribe tu pregunta" placeholderTextColor={C.tenue} style={[estilos.entrada, { flex: 1, marginBottom: 0 }]} value={texto} onChangeText={setTexto} onSubmitEditing={() => void enviar()} maxLength={300} />
        <Boton texto="Enviar" alPresionar={() => void enviar()} deshabilitado={enviando} />
      </View>
    </KeyboardAvoidingView>
  );
}

export default function App() {
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  const [pantalla, setPantalla] = useState<"buscar" | "chatbot">("buscar");
  useEffect(() => { void sesionActual().then(setSesion).catch(() => setSesion(null)); }, []);
  return (
    <SafeAreaView style={estilos.raiz}>
      <StatusBar style="dark" />
      {sesion === undefined ? <ActivityIndicator style={{ flex: 1 }} accessibilityLabel="Cargando" color={C.azul} /> : !sesion ? <InicioSesion alEntrar={setSesion} /> : (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={estilos.fila}>
            <Text style={[estilos.subtitulo, { flex: 1 }]} accessibilityRole="header">Hola, {sesion.nombre}</Text>
            <Boton texto="Salir" secundario alPresionar={() => void cerrarSesion().then(() => setSesion(null))} />
          </View>
          <View style={estilos.fila} accessibilityRole="tablist">
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: pantalla === "buscar" }} onPress={() => setPantalla("buscar")} style={[estilos.pestana, pantalla === "buscar" && estilos.pestanaActiva]}><Text style={[estilos.pestanaTexto, pantalla === "buscar" && { color: C.blanco }]}>Buscar libros</Text></Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: pantalla === "chatbot" }} onPress={() => setPantalla("chatbot")} style={[estilos.pestana, pantalla === "chatbot" && estilos.pestanaActiva]}><Text style={[estilos.pestanaTexto, pantalla === "chatbot" && { color: C.blanco }]}>Asistente</Text></Pressable>
          </View>
          {pantalla === "buscar" ? <BuscarLibros /> : <Chatbot />}
        </View>
      )}
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: C.fondo },
  centro: { flex: 1, justifyContent: "center", padding: 24 },
  titulo: { fontSize: 32, fontWeight: "800", color: C.tinta },
  subtitulo: { fontSize: 18, fontWeight: "700", color: C.tinta },
  texto: { fontSize: 16, color: C.tinta },
  tenue: { fontSize: 15, color: C.tenue, marginBottom: 8 },
  etiqueta: { fontSize: 16, fontWeight: "700", color: C.tinta, marginTop: 16, marginBottom: 6 },
  entrada: { borderWidth: 1, borderColor: C.tenue, borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: C.blanco, color: C.tinta, marginBottom: 12, minHeight: 48 },
  error: { color: C.rojo, fontSize: 16, marginVertical: 8 },
  boton: { backgroundColor: C.azul, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, minHeight: 48, justifyContent: "center", marginVertical: 4 },
  botonSecundario: { backgroundColor: C.blanco, borderWidth: 1, borderColor: C.azul },
  botonTexto: { color: C.blanco, fontSize: 16, fontWeight: "700", textAlign: "center" },
  fila: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  tarjeta: { backgroundColor: C.blanco, borderWidth: 1, borderColor: C.linea, borderRadius: 10, padding: 14, marginBottom: 10 },
  pestana: { flex: 1, borderWidth: 1, borderColor: C.azul, borderRadius: 8, paddingVertical: 10, minHeight: 48, justifyContent: "center" },
  pestanaActiva: { backgroundColor: C.azul },
  pestanaTexto: { textAlign: "center", fontSize: 16, fontWeight: "700", color: C.azul },
  burbuja: { fontSize: 16, padding: 10, borderRadius: 12, marginVertical: 4, maxWidth: "85%" },
  burbujaUsuario: { alignSelf: "flex-end", backgroundColor: C.azul, color: C.blanco },
  burbujaBot: { alignSelf: "flex-start", backgroundColor: C.blanco, color: C.tinta, borderWidth: 1, borderColor: C.linea },
});
