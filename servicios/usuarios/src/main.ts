/**
 * Microservicio "Gestión de usuarios" (Sprint 0): autenticación con usuario y
 * contraseña (JWT), roles, verificación de usuarios contra la base de datos
 * escolar y alta de personal de la biblioteca.
 */
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { PUERTOS } from "../../comun/config";
import { iniciarServicio } from "../../comun/nest";
import { ControladorAuth, ControladorUsuarios } from "./controlador";
import { ServicioUsuarios } from "./servicio";

@Module({ controllers: [ControladorAuth, ControladorUsuarios], providers: [ServicioUsuarios] })
export class ModuloUsuarios {}

if (require.main === module) void iniciarServicio(ModuloUsuarios, "usuarios", PUERTOS.usuarios);
