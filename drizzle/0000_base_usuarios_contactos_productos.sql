CREATE TYPE "public"."rol" AS ENUM('vendedor', 'taller', 'bodega', 'administracion', 'tecnico');--> statement-breakpoint
CREATE TABLE "categorias_producto" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"odoo_id" integer
);
--> statement-breakpoint
CREATE TABLE "contactos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"rut" text,
	"email" text,
	"telefono" text,
	"direccion" text,
	"comuna" text,
	"region" text,
	"giro" text,
	"es_empresa" boolean DEFAULT false NOT NULL,
	"es_cliente" boolean DEFAULT true NOT NULL,
	"es_proveedor" boolean DEFAULT false NOT NULL,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"odoo_id" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text,
	"nombre" text NOT NULL,
	"categoria_id" integer,
	"es_servicio" boolean DEFAULT false NOT NULL,
	"se_vende" boolean DEFAULT true NOT NULL,
	"se_compra" boolean DEFAULT false NOT NULL,
	"unidad" text DEFAULT 'Unidad' NOT NULL,
	"precio_venta" numeric(14, 2) DEFAULT '0' NOT NULL,
	"costo" numeric(14, 2) DEFAULT '0' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"odoo_id" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"rol" "rol" DEFAULT 'vendedor' NOT NULL,
	"password_hash" text,
	"activo" boolean DEFAULT true NOT NULL,
	"odoo_uid" integer,
	"ultimo_acceso" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_categorias_producto_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_producto"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_producto_odoo_id_idx" ON "categorias_producto" USING btree ("odoo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contactos_odoo_id_idx" ON "contactos" USING btree ("odoo_id");--> statement-breakpoint
CREATE INDEX "contactos_rut_idx" ON "contactos" USING btree ("rut");--> statement-breakpoint
CREATE INDEX "contactos_nombre_idx" ON "contactos" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "productos_odoo_id_idx" ON "productos" USING btree ("odoo_id");--> statement-breakpoint
CREATE INDEX "productos_codigo_idx" ON "productos" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_idx" ON "usuarios" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_odoo_uid_idx" ON "usuarios" USING btree ("odoo_uid");