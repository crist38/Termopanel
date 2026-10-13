# Cotizador de Termopaneles 🪟

Una aplicación web moderna y dinámica diseñada para facilitar el cálculo, cotización y gestión de ventas de termopaneles a medida. Permite a los usuarios generar presupuestos rápidos basados en dimensiones y configuraciones de cristales, guardarlos en la nube, exportarlos como PDF y enviarlos automáticamente al ERP Odoo generando órdenes de venta y de fabricación.

## ✨ Características Principales

* **Autenticación Segura**: Login con correo/contraseña o Google (Firebase Auth). La app inicia en `/login` y redirige automáticamente si no hay sesión activa.
* **Cálculo Automático de Precios**: Calcula instantáneamente el costo en base al área (m²) y al tipo/espesor del vidrio (Incoloro, Bronce, etc.).
* **Generación de PDF con Logo**: Exporta presupuestos formales con el logo de la empresa, listos para entregar al cliente.
* **Integración ERP (Odoo)**: Al presionar "Enviar a Odoo" se ejecuta el flujo completo:
  1. Crea o localiza al cliente en `res.partner`
  2. Crea la orden de venta (`sale.order`) con unidad **Units**, precio por pieza y dimensiones en los campos personalizados `x_studio_ancho_m` / `x_studio_alto_m`
  3. Fuerza el precio correcto de la app vía `write()` antes de confirmar (evita que la lista de precios de Odoo lo sobreescriba)
  4. Confirma la orden de venta (`action_confirm`)
  5. Crea automáticamente la **orden de fabricación** (`mrp.production`) con las especificaciones del termopanel (cantidad, dimensiones, cristales, separador, extras) visibles en el campo `product_description_variants` y en el chatter
* **Fabricación de Obras (Taller PVC)**: La página `/fabricacion` lista las ventas de Odoo con la etiqueta **Taller PVC** (obras completas donde el termopanel ya está cobrado) y permite adjuntarles las medidas de los termopaneles, enviarlas a fabricación e imprimir las órdenes de taller, sin crear una venta nueva ni tocar precios.
* **Base de Datos en Tiempo Real**: Guarda y edita el historial de presupuestos utilizando Firebase Firestore.
* **Panel de Administración**: Permite actualizar los precios base (cristales, separadores) directamente desde la plataforma.

## 🛠️ Stack Tecnológico

* **Frontend / Backend**: [Next.js](https://nextjs.org/) (App Router, Server Actions)
* **Estilos**: [Tailwind CSS](https://tailwindcss.com/)
* **Base de Datos & Auth**: [Firebase](https://firebase.google.com/) (Firestore y Authentication)
* **ERP Backend**: Odoo 19 (vía API nativa JSON-RPC)
* **Generación PDF**: jsPDF (incluye logo de empresa)
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
   Crea un archivo `.env.local` en la raíz del proyecto. **No lo subas a GitHub.**

   ```env
   # Firebase Config (Cliente)
   NEXT_PUBLIC_FIREBASE_API_KEY="tu_api_key"
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="tu-proyecto.firebaseapp.com"
   NEXT_PUBLIC_FIREBASE_PROJECT_ID="tu-proyecto"
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="tu-proyecto.firebasestorage.app"
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="tu_sender_id"
   NEXT_PUBLIC_FIREBASE_APP_ID="tu_app_id"

    # Odoo Config (Servidor - Mantener seguro)
    ODOO_URL="https://tu-empresa.odoo.com"
    ODOO_DB="nombre_base_de_datos"
    ODOO_USERNAME="tu_correo_admin_odoo"
    ODOO_API_KEY="tu_clave_api_odoo"

    # ID del producto genérico en Odoo para las líneas de cotización de termopaneles (DVH)
    # Debe ser un producto de tipo "service" que genere órdenes de fabricación
    ODOO_DEFAULT_PRODUCT_ID=12345

    # ID del producto genérico en Odoo para las líneas de cotización monolíticas
    ODOO_MONOLITIC_PRODUCT_ID=67890

    # Nombre de la etiqueta (Tags / Etiquetas) en Odoo para clasificar y diferenciar las cotizaciones del taller
    ODOO_TAG_NAME="Termopanel"

    # Nombre de la etiqueta de Odoo de las ventas de obra completa que se muestran en /fabricacion
    # (opcional; por defecto "Taller PVC". La etiqueta debe existir en Odoo: la app no la crea)
    ODOO_PVC_TAG_NAME="Taller PVC"
    ```

4. **Logo de empresa**
   Coloca el archivo `logo.png` dentro de la carpeta `/public` del proyecto.

5. **Reglas de Seguridad en Firebase**
   Configura en la consola de Firebase (`Firestore > Reglas`) los permisos para las colecciones `/configuracion` y `/presupuestos_termopaneles`.

6. **Levantar el servidor de desarrollo**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000/login](http://localhost:3000/login) en tu navegador.

## 🔐 Flujo de Autenticación

- La app arranca en `/login` mostrando el logo de la empresa.
- Soporta login con **correo + contraseña** y con **Google**.
- Si el usuario ya tiene sesión activa, es redirigido automáticamente al cotizador (`/`).
- Si accede a `/` sin sesión, es redirigido automáticamente a `/login`.

## 🏭 Flujo de Odoo (Integración ERP)

La integración se maneja desde el servidor (Next.js Server Actions), garantizando que las credenciales ERP nunca viajen al navegador:

1. **Cliente**: Busca por nombre. Si no existe, lo crea en `res.partner`.
2. **Orden de Venta**: Crea en `sale.order` con:
   - Unidad de medida: **Units** (evita conflictos con campos m² de Odoo Studio)
   - Precio por pieza exacto de la app (forzado vía `write()` antes de confirmar)
   - Campos personalizados `x_studio_ancho_m` y `x_studio_alto_m` para visualización
   - Línea de nota con dirección y observaciones
   - Etiquetas de clasificación/taller (`tag_ids`) configuradas vía la variable `ODOO_TAG_NAME` (crea la etiqueta automáticamente si no existe)
3. **Confirmación**: Llama a `action_confirm` para pasar la orden a estado "Orden de Venta".
4. **Orden de Fabricación**: Crea `mrp.production` por cada línea con:
   - Descripción completa: cantidad, dimensiones, cristales, separador y extras
   - Referencia a la orden de venta en el campo `origin`
   - Nota detallada en el chatter con las especificaciones del termopanel

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
