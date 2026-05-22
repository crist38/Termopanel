# Cotizador de Termopaneles 🪟

Una aplicación web moderna y dinámica diseñada para facilitar el cálculo, cotización y gestión de ventas de termopaneles a medida. Permite a los usuarios generar presupuestos rápidos basados en dimensiones y configuraciones de cristales, guardarlos en la nube, exportarlos como PDF y enviarlos automáticamente a tu sistema ERP.

## ✨ Características Principales

* **Cálculo Automático de Precios**: Calcula instantáneamente el costo en base al área (m²) y al tipo/espesor del vidrio (Incoloro, Bronce, etc.).
* **Generación de PDF**: Exporta presupuestos formales listos para entregar o enviar al cliente.
* **Integración ERP (Odoo)**: Sincroniza las cotizaciones generadas directamente con **Odoo 19+** creando la información del cliente (`res.partner`) y la orden de venta en borrador (`sale.order`) usando JSON-RPC nativo.
* **Base de Datos en Tiempo Real**: Guarda y edita el historial de presupuestos utilizando Firebase Firestore.
* **Panel de Administración**: Funcionalidad de login protegida que permite a administradores actualizar los precios base (cristales, separadores) directamente desde la plataforma.

## 🛠️ Stack Tecnológico

* **Frontend / Backend**: [Next.js](https://nextjs.org/) (App Router, Server Actions)
* **Estilos**: [Tailwind CSS](https://tailwindcss.com/)
* **Base de Datos & Auth**: [Firebase](https://firebase.google.com/) (Firestore y Authentication)
* **ERP Backend**: Odoo 19 (vía API nativa JSON-RPC)
* **Generación PDF**: jsPDF
* **Iconos**: Lucide React

## 🚀 Instalación y Configuración Local

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/crist38/Termopanel.git
   cd Termopanel
   ```

2. **Instalar dependencias**
   Puedes usar `npm`, `yarn` o `pnpm` (recomendado):
   ```bash
   npm install
   ```

3. **Configurar Variables de Entorno**
   Crea un archivo `.env.local` en la raíz del proyecto. **No lo subas a GitHub.** Debes proporcionar tus llaves de Firebase y Odoo:

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
   ```

4. **Reglas de Seguridad en Firebase**
   Asegúrate de configurar en la consola de Firebase (`Firestore > Reglas`) los permisos de lectura/escritura correspondientes para las colecciones `/configuracion` y `/presupuestos_termopaneles` según tu nivel de autenticación.

5. **Levantar el servidor de desarrollo**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver el resultado.

## 🤝 Flujo de Odoo

La integración con Odoo se maneja puramente desde el servidor (Next.js Server Actions) garantizando que tus credenciales ERP nunca viajen al navegador del cliente:
1. Verifica la existencia del cliente por Nombre/Rut/Correo. Si no existe, lo crea automáticamente.
2. Formatea las medidas, espesores y configuraciones del termopanel en líneas de cotización nativas de Odoo.
3. Devuelve el número de identificación único generado en el ERP tras crearse exitosamente en estado "draft" (borrador).

---

Desarrollado para optimizar tiempos de respuesta y brindar cotizaciones profesionales en terreno. 🚀
