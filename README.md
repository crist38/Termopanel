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

   # ID del producto genérico en Odoo para las líneas de cotización
   # Debe ser un producto de tipo "service" que genere órdenes de fabricación
   ODOO_DEFAULT_PRODUCT_ID=12345
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
3. **Confirmación**: Llama a `action_confirm` para pasar la orden a estado "Orden de Venta".
4. **Orden de Fabricación**: Crea `mrp.production` por cada línea con:
   - Descripción completa: cantidad, dimensiones, cristales, separador y extras
   - Referencia a la orden de venta en el campo `origin`
   - Nota detallada en el chatter con las especificaciones del termopanel

## 📋 Changelog

### v2.3 - Junio 2026
- ✅ **Reemplazo de Gas Argón por Pulido**: Se sustituyó el extra "Gas Argón" por la opción de "Pulido" en el cotizador y en las especificaciones enviadas a Odoo.
- ✅ **Costo de Pulido Configurable**: Se añadió un campo en el panel de configuración `/admin/config` para editar libremente el precio unitario del Pulido.
- ✅ **Desglose y Edición de Insumos**: Se agregaron entradas en la configuración para editar individualmente los costos de **escuadras**, **hotmelt**, **sal higroscópica** y **butilo**.
- ✅ **Fórmula de Maquila Detallada**: La fórmula de cálculo ahora integra los costos de estos insumos individuales de manera dinámica.
- ✅ **Matriz de Precios de Separadores**: Nueva interfaz en la configuración para visualizar y editar el precio por metro lineal de los separadores por combinación de color y espesor.

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
