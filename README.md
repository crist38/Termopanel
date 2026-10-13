# Cotizador de Termopaneles 🪟

Aplicación web de PRO WINDOWS para cotizar, vender y fabricar termopaneles y cristales a medida. Calcula presupuestos según dimensiones y configuración de cristales, los guarda como ventas en el ERP Odoo, genera los PDF de presupuesto y de taller, y crea las órdenes de fabricación y de trabajo para los talleres.

**Versión actual: 3.0**

## ✨ Características Principales

* **Acceso con usuario de Odoo**: Cada vendedor entra con su correo y contraseña de Odoo. La barra superior muestra su nombre y foto, y las ventas que crea quedan asignadas a él.
* **Cotizador de Termopaneles (`/`)**: Tabla editable con cantidad, medidas, cristales, separador, extras (pulido, micropersiana, palillaje) y descuento. Calcula el precio con la fórmula de costos configurable.
* **Corte de Vidrio Monolítico (`/monolitico`)**: Cotizador de cristales simples cortados a medida.
* **Formas (`/formas`)**: Termopaneles con figura: arco, medio arco, círculo y forma libre con puntos arrastrables, con visualizador y cálculo de área y perímetro reales.
* **Fabricación de Obras (`/fabricacion`)**: Lista las ventas de Odoo con la etiqueta **Taller PVC** (obras completas donde el termopanel ya está cobrado) y permite adjuntarles las medidas de los termopaneles, enviarlas a fabricación e imprimir las órdenes de taller, sin crear una venta nueva ni tocar precios.
* **Cotizaciones (`/cotizaciones`)**: Listado de las ventas creadas desde la app, con búsqueda, filtro por estado, detalle, edición, cancelación, confirmación con creación de órdenes de taller y reimpresión de PDF.
* **Reportes (`/reports`)**: Ingresos, volumen de producción por taller, mano de obra, insumos y componentes utilizados, ranking de clientes y detalle de ventas confirmadas.
* **Planchas a Cortar (`/corte`)**: Optimizador que recibe las medidas del cotizador y distribuye los cristales en planchas.
* **Configuración (`/admin/config`)**: Precios de cristales, espesores y colores de separador, matriz de precios de separadores y parámetros de costos e insumos.
* **PDF con logo**: Presupuesto para el cliente y órdenes de trabajo para Taller Corte Vidrio y Taller Termopaneles, con el dibujo de las figuras.
* **Borrador automático**: Los cotizadores guardan la cotización en curso en el navegador y ofrecen recuperarla.

## 🛠️ Stack Tecnológico

* **Frontend / Backend**: [Next.js](https://nextjs.org/) 16 (App Router, Server Actions) con React 19 y TypeScript
* **Estilos**: [Tailwind CSS](https://tailwindcss.com/)
* **ERP y autenticación**: Odoo 19 (vía API nativa JSON-RPC)
* **Configuración de precios**: [Firebase](https://firebase.google.com/) Firestore (opcional; sin Firebase se usan los valores por defecto y los guardados en el navegador)
* **Generación PDF**: jsPDF
* **Iconos**: Lucide React

## 🚀 Instalación y Configuración Local

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/crist38/Termopanel.git
   cd Termopanel
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar Variables de Entorno**
   Crea un archivo `.env.local` (o `.env`) en la raíz del proyecto. **No lo subas a GitHub.**

   ```env
   # Odoo (Servidor - Mantener seguro)
   ODOO_URL="https://tu-empresa.odoo.com"       # sin slash final
   ODOO_DB="nombre_base_de_datos"
   ODOO_USERNAME="usuario_api_odoo"             # usuario de sistema con el que la app opera en Odoo
   ODOO_API_KEY="clave_api_odoo"                # también se acepta ODOO_PASSWORD

   # ID del producto genérico en Odoo para las líneas de termopaneles (DVH)
   ODOO_DEFAULT_PRODUCT_ID=12345

   # ID del producto genérico en Odoo para las líneas de cristal monolítico
   # (si falta, se usa ODOO_DEFAULT_PRODUCT_ID)
   ODOO_MONOLITIC_PRODUCT_ID=67890

   # Etiqueta de Odoo con la que se marcan las ventas creadas desde la app
   # (opcional; por defecto "Termopanel". Se crea sola si no existe)
   ODOO_TAG_NAME="Termopanel"

   # Etiqueta de Odoo de las ventas de obra completa que se muestran en /fabricacion
   # (opcional; por defecto "Taller PVC". Debe existir en Odoo: la app no la crea)
   ODOO_PVC_TAG_NAME="Taller PVC"

   # Firebase (opcional): solo para guardar la configuración de precios en la nube
   NEXT_PUBLIC_FIREBASE_API_KEY="tu_api_key"
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="tu-proyecto.firebaseapp.com"
   NEXT_PUBLIC_FIREBASE_PROJECT_ID="tu-proyecto"
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="tu-proyecto.firebasestorage.app"
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="tu_sender_id"
   NEXT_PUBLIC_FIREBASE_APP_ID="tu_app_id"
   ```

4. **Requisitos en Odoo**
   - Centros de trabajo **Taller Corte Vidrio** y **Taller Termopaneles** (módulo de Fabricación).
   - Campos personalizados `x_studio_ancho_m` y `x_studio_alto_m` en las líneas de venta.
   - Etiqueta **Taller PVC** en las ventas de obra que se quieran ver en Fabricación.

5. **Logo de empresa**
   Coloca `logo.png` y `logo-texto.png` dentro de la carpeta `/public` del proyecto.

6. **Firebase (opcional)**
   Si se usa, configura en la consola de Firebase (`Firestore > Reglas`) los permisos del documento `configuracion/termopaneles`.

7. **Levantar el servidor de desarrollo**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000/login](http://localhost:3000/login) en tu navegador.

## 🔐 Flujo de Autenticación

- La app arranca en `/login`. El vendedor ingresa su **correo y contraseña de Odoo**, que se validan directamente contra Odoo.
- Si son correctos, la sesión se guarda en una cookie segura (HTTP-only) que dura **8 horas**. La contraseña no se almacena.
- Todas las páginas exigen sesión: sin ella se redirige a `/login`.
- El menú del avatar en la barra superior muestra los datos del vendedor y la opción **Cerrar sesión**.
- Las operaciones en Odoo se ejecutan con el usuario de sistema (`ODOO_USERNAME`); las ventas se asignan al vendedor que inició sesión.

## 🏭 Flujo de Odoo (Integración ERP)

La integración se maneja desde el servidor (Next.js Server Actions), por lo que las credenciales del ERP nunca viajan al navegador.

**Al guardar una cotización** (botón "Guardar Cotización / Presupuesto PDF" de los cotizadores):

1. **Cliente**: Se elige con el buscador por nombre o RUT. Si no existe, se crea en `res.partner`.
2. **Venta en borrador**: Se crea una `sale.order` con:
   - Una línea por ítem, con la cantidad en **m² totales** y el precio por m², de modo que el subtotal coincide con el de la app
   - Lista de precios desactivada y precio forzado vía `write()`, para que Odoo no lo sobreescriba
   - Campos `x_studio_ancho_m` y `x_studio_alto_m` con las dimensiones
   - Descripción con referencia, cantidad, medidas, cristales, separador, extras y figura
   - Obra y fecha de entrega en la nota de la venta
   - Etiqueta `ODOO_TAG_NAME` y el vendedor que inició sesión
3. **PDF**: Se descarga el presupuesto con el número de venta asignado por Odoo.

Una cotización en borrador se puede reabrir y editar desde `/cotizaciones`; al guardar se actualiza la misma venta.

**Al confirmar** (botón "Confirmar y Crear Órdenes de Taller" en `/cotizaciones`):

1. **Confirmación**: `action_confirm` pasa la venta a "Orden de Venta".
2. **Órdenes de fabricación**: Una `mrp.production` por línea, con la descripción del ítem. En termopaneles incluye además sus componentes (cristales, separador, hotmelt, butilo, sal, escuadras y pulido) y una nota con especificaciones e insumos.
3. **Órdenes de trabajo**: Una `mrp.workorder` en **Taller Corte Vidrio** y otra en **Taller Termopaneles** por cada termopanel (solo corte para los monolíticos).
4. **Resumen de insumos**: Se publica en el historial de la venta.
5. **Órdenes de compra** (solo termopaneles): Se generan pedidos a **Alar** (planchas de cristal) y **Soluex** (insumos).

## 🔨 Flujo de Fabricación (Taller PVC)

Las obras completas (ventanas de PVC con sus termopaneles incluidos) se cotizan y cobran en Odoo con la etiqueta **Taller PVC**. La página `/fabricacion` trabaja sobre esas ventas ya existentes:

1. **Listado**: muestra solo las ventas con la etiqueta `ODOO_PVC_TAG_NAME`, con buscador por N° de venta o cliente e indicador "Con medidas / Sin medidas".
2. **Medidas**: al abrir una venta se conserva su número de Odoo (ej. `S00552`) y se cargan sus ventanas (`V1`, `V2`…). Cada ventana agrega filas a una tabla igual a la de Termopaneles (cantidad, ancho, alto, cristales, separador, extras), sin precios. Si una ventana lleva varios paños, las filas se nombran `V1a`, `V1b`, `V1c`…
3. **Figuras**: cada fila puede abrir el editor de formas (arco, medio arco, círculo y forma libre con puntos arrastrables).
4. **Adjuntar medidas a la venta**: guarda el archivo `medidas_termopaneles.json` como adjunto de la `sale.order` (permite reabrir y editar) y publica una nota con la tabla de medidas en su historial. No modifica líneas ni precios de la venta.
5. **Enviar a fabricación**: con la venta confirmada y las medidas adjuntas, crea una `mrp.production` por medida, con sus órdenes de trabajo en Taller Corte Vidrio y Taller Termopaneles y el número de la venta en el campo `origin`. El envío queda registrado; reenviar pide confirmación porque crea órdenes nuevas. Este flujo **no** genera órdenes de compra.
6. **Taller PDF**: descarga las órdenes de trabajo de ambos talleres con el número de venta, incluyendo el dibujo a escala de las figuras.

## 📋 Changelog

### v3.0 - Octubre 2026
- ✅ **Nueva página Fabricación (`/fabricacion`)**: Ubicada después de Formas en el menú. Lista las ventas de Odoo con la etiqueta **Taller PVC**, donde está cobrada la obra completa incluyendo termopaneles, y permite adjuntarles las medidas de fabricación sin crear una venta nueva.
- ✅ **Editor al estilo Termopaneles**: Tabla editable en línea (Ref, Cant., Ancho, Alto, Cristal 1 y 2, Separador, Pulido / Micropersiana / Palillaje, Observación) sin precios, con pie fijo de metraje total y el **número de venta de Odoo** en el encabezado.
- ✅ **Ventanas con varios paños**: Cada ventana de la venta puede llevar más de un termopanel; las referencias se asignan solas como `V1a`, `V1b`, `V1c`… y el nuevo paño copia el vidrio del anterior.
- ✅ **Editor de figuras en Fabricación**: Arco, medio arco, círculo y forma libre con puntos arrastrables, igual al de Formas, disponible por fila (`components/fabricacion/EditorMedida.tsx`).
- ✅ **Medidas adjuntas en Odoo**: Se guardan como adjunto `medidas_termopaneles.json` de la venta y como nota con tabla en su historial, sin tocar líneas ni precios.
- ✅ **Enviar a fabricación**: Crea las órdenes de fabricación y de trabajo (Taller Corte Vidrio y Taller Termopaneles) a partir de las medidas adjuntas, usando el número de venta como origen. Registra el envío para evitar duplicados.
- ✅ **Taller PDF con dibujo de figuras**: Órdenes de trabajo para ambos talleres con el número de venta y el dibujo a escala de cada figura. La rutina de dibujo se movió a `lib/utils/pdf-figuras.ts` y es compartida con Formas.
- ✅ **Barra de navegación redimensionada**: Más ancha, sin saltos de línea en los enlaces y con el menú de pestañas deslizables por debajo de 1280 px, para dar cabida al nuevo enlace.
- ✅ **Nueva variable opcional `ODOO_PVC_TAG_NAME`**: Nombre de la etiqueta de las ventas de obra (por defecto `Taller PVC`).

### v2.7 - Agosto 2026
- ✅ **Gestión de RUT de Clientes**: Se incorporó el campo de **RUT del Cliente** en todos los cotizadores (Termopaneles `/`, Monolíticos `/monolitico` y Formas CAD `/formas`).
- ✅ **Búsqueda y Autocompletado en ClientSelector**: La búsqueda de clientes ahora permite encontrar por Nombre o por RUT, autocompletando los datos del contacto registrado en Odoo (`res.partner.vat`).
- ✅ **Creación Automática con RUT en Odoo**: Al crear cotizaciones con clientes nuevos o al usar la modal de nuevo contacto, se registra el RUT en Odoo.
- ✅ **Inclusión de RUT en Documentos PDF**: Tanto los presupuestos para clientes como las órdenes de trabajo para taller (corte y ensamblaje) ahora muestran el RUT del cliente.
- ✅ **Persistencia y Resiliencia**: El RUT se guarda en el borrador automático de `localStorage` y se configuró fallback predeterminado para el ID de producto genérico (`17983`).

### v2.6 - Agosto 2026
- ✅ **Palillaje en Reportes**: La sección "Insumos y Componentes Utilizados" del dashboard de reportes ahora incluye un desglose de **Palillaje por Color**. Muestra, para cada color de palillaje utilizado en el período, la cantidad de termopaneles que lo llevan y el total de tiras consumidas, con un badge visual que refleja el color real (blanco, negro, bronce, gris, café, dorado, etc.). La sección solo aparece si existe al menos un termopanel con palillaje en el período seleccionado.

### v2.5 - Julio 2026
- ✅ **Distinción Visual de Botones al Editar**: Al editar una cotización existente, el botón "Actualizar Borrador / PDF" ahora se muestra en **azul** (gradiente `blue` → `cyan`), diferenciándose claramente del botón verde "Confirmar en Odoo y Enviar a Taller". Esto evita confusión visual al operar sobre cotizaciones ya existentes.

### v2.4 - Junio 2026
- ✅ **Remoción de Rectángulo y Nuevas Formas (Medio Arco & Círculo)**: Se quitó la forma estándar de Rectángulo del cotizador de formas y se agregaron las dos nuevas formas geométricas solicitadas: **Medio Arco** (definido por Ancho, Altura Recta y Altura Total) y **Círculo** (definido por Diámetro).
- ✅ **Cálculos y PDF Vectorial**: Se implementaron las fórmulas matemáticas precisas para el área y perímetro de las nuevas formas, y se extendió el renderizado vectorial de jsPDF (`drawShapeInPdf`) para dibujarlas de forma nativa en los PDFs de presupuestos y órdenes de taller, manteniendo soporte de compatibilidad para renderizar rectángulos en cotizaciones previas.
- ✅ **Edición Directa desde el Listado (Redirección Inteligente)**: Se incorporó un botón "Editar" al lado del botón de imprimir en la vista de detalle de cotizaciones. Al hacer clic, la aplicación redirige de manera automática al cotizador correspondiente (Termopaneles `/`, Monolíticos `/monolitico` o Formas `/formas`) cargando todos los ítems de Odoo para su edición.
- ✅ **Flujo de Actualización en Odoo**: Al editar una cotización, el botón de guardado cambia de color a verde esmeralda y muestra "Actualizar S00XXX (Odoo + PDFs)", garantizando que el usuario sepa que está modificando la cotización actual en Odoo en lugar de duplicarla.
- ✅ **Clasificación por Taller (Etiquetas Odoo)**: Se agregó soporte para asignar automáticamente etiquetas (Tags) a los pedidos creados en Odoo (ej. `"Taller PVC"` o `"Termopanel"`). El nombre de la etiqueta es completamente parametrizable usando la variable `ODOO_TAG_NAME` en `.env.local`, y la app se encarga de crearla en Odoo de manera transparente si no existe.

### v2.3 - Junio 2026
- ✅ **Reemplazo de Gas Argón por Pulido**: Se sustituyó el extra "Gas Argón" por la opción de "Pulido" en el cotizador y en las especificaciones enviadas a Odoo.
- ✅ **Costo de Pulido Configurable**: Se añadió un campo en el panel de configuración `/admin/config` para editar libremente el precio unitario del Pulido.
- ✅ **Desglose y Edición de Insumos**: Se agregaron entradas en la configuración para editar individualmente los costos de **escuadras**, **hotmelt**, **sal higroscópica** y **butilo**.
- ✅ **Fórmula de Maquila Detallada**: La fórmula de cálculo ahora integra los costos de estos insumos individuales de manera dinámica.
- ✅ **Matriz de Precios de Separadores**: Nueva interfaz en la configuración para visualizar y editar el precio por metro lineal de los separadores por combinación de color y espesor.
- ✅ **Re-impresión de Cotizaciones a PDF**: Botón "Imprimir PDF" en la vista de detalle de cotizaciones históricas para volver a generar y descargar presupuestos con formato oficial, firmas, condiciones de pago y notas comerciales.
- ✅ **Edición Completa de Cotizaciones**: Posibilidad de modificar la descripción (`name`), cantidad, precio unitario y dimensiones de ancho/alto (en mm) directamente en las líneas de pedido desde `/cotizaciones`.

### v2.2 - Junio 2026
- ✅ **Gestión de Cotizaciones de Odoo**: Nueva página `/cotizaciones` para listar, buscar, filtrar por estado y ver el detalle de cotizaciones almacenadas en Odoo.
- ✅ **Búsqueda y Paginación**: Caja de búsqueda interactiva (con debounce) por cliente y N° de Orden, y paginación de 15 registros por página.
- ✅ **Edición de Cotizaciones Draft**: Permite modificar la cantidad y el precio unitario de las líneas de cotizaciones en borrador (`draft`) directamente desde la app, recalculando los totales (neto, IVA y total) y sincronizándolos con Odoo.
- ✅ **Cancelación de Pedidos**: Opción de cancelar cotizaciones en estado borrador desde la interfaz con confirmación de seguridad.
- ✅ **Navegación Integrada**: Enlace directo en el Navbar con el ícono `FileText` para fácil acceso.

### v2.1 - Junio 2026
- ✅ **Optimización de Integración con Odoo**: Creación de MOs y WOs por lote (batching) y notas en paralelo (reduce las llamadas API de 28 a solo 3 para cotizaciones de varios productos).
- ✅ **Ejecución en Segundo Plano**: Uso de Next.js `after()` para confirmar pedidos y fabricar en Odoo en segundo plano (la respuesta web es instantánea y se evitan timeouts).
- ✅ **Edición Directa en Panel Admin**: Los cristales, espesores y colores del panel de configuración `/admin/config` ahora son completamente editables en línea antes de guardar.
- ✅ **Fusión de Botones**: Unificado el flujo de Odoo y PDFs en un solo botón principal "Procesar Todo (Odoo + PDFs)" con transiciones visuales avanzadas.
- ✅ **Número de Presupuesto Editable e Incremental**: El número de presupuesto en el encabezado ahora es un campo numérico editable y se incrementa automáticamente al procesar con éxito una cotización.
- ✅ **PDF del Presupuesto Profesional**: Agregado el bloque de términos y condiciones legales, líneas de firmas de aceptación y modalidad de pago con ajuste de página inteligente.
- ✅ **Descargas Personalizadas**: Nombre del cliente sanitizado y añadido al nombre de los archivos PDF generados para fácil identificación.
- ✅ **Limpieza de campos**: Eliminados los campos redundantes de dirección de obra y observaciones para simplificar el flujo.

### v2.0 - Mayo 2026
- ✅ Página de login con logo de empresa, correo/contraseña y Google OAuth
- ✅ Protección de rutas: redirige a `/login` si no hay sesión activa
- ✅ Logo de empresa incluido en el PDF exportado
- ✅ Integración Odoo completa: crea orden de venta **y** orden de fabricación automáticamente
- ✅ Precios correctos en Odoo: fuerza el valor de la app ignorando la lista de precios del ERP
- ✅ Cantidades correctas en Odoo: usa UOM Units para evitar el recompute de campos Studio (m²)
- ✅ Especificaciones visibles en la orden de fabricación: cantidad, dimensiones, cristales, separador, extras
- ✅ Observaciones y dirección enviadas como línea de nota (sin afectar el total)
- ✅ Eliminado botón "Panel Admin" del header principal

---

Desarrollado para optimizar tiempos de respuesta y brindar cotizaciones profesionales en terreno. 🚀
