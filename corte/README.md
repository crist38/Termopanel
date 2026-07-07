# GlassOpt - Optimizador de Cortes para Vidrio

![Estado del Proyecto](https://img.shields.io/badge/Estado-Completado-green)
![Next.js](https://img.shields.io/badge/Next.js-15.0-black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-blue)

GlassOpt es una aplicación web moderna diseñada para optimizar cortes en planchas de vidrio plano. Utiliza un algoritmo de **empaquetado tipo guillotina (Guillotine Packing)** para maximizar el aprovechamiento del material, respetando las restricciones físicas de las mesas de corte de vidrio (cortes de borde a borde).

## 🚀 Características Principales

- **Optimización en Tiempo Real**: Visualización instantánea del esquema de corte.
- **Algoritmo Guillotina 2D**: Garantiza que todos los cortes sean líneas rectas de un extremo al otro, requisito indispensable para el corte de vidrio.
- **Soporte Multi-Plancha**: Si las piezas no caben en una sola hoja, el sistema genera automáticamente múltiples planchas y permite navegar entre ellas.
- **Dimensiones Personalizables**: Define el tamaño de tu plancha base (ej. 2500x3600mm).
- **Control de Inventario**: Agrega piezas especificando ancho, alto y cantidad.
- **Estadísticas Detalladas**:
  - Porcentaje de Aprovechamiento (Yield).
  - Porcentaje de Desperdicio.
  - Cantidad de piezas por plancha.
- **Diseño Premium**: Interfaz limpia y profesional con soporte nativo para **Modo Oscuro**, optimizada para grandes pantallas.

## 🛠️ Tecnologías Utilizadas

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Iconos**: Lucide React
- **Utilidades**: `clsx`, `tailwind-merge`

## 📦 Instalación y Uso

1. **Clonar o Descargar el proyecto**:
   Asegúrate de tener [Node.js](https://nodejs.org/) instalado.

2. **Instalar Dependencias**:
   ```bash
   npm install
   # o
   pnpm install
   ```

3. **Ejecutar en Desarrollo**:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

4. **Construir para Producción**:
   ```bash
   npm run build
   npm start
   ```

## 🧩 Estructura del Proyecto

- `app/`: Rutas y layouts de Next.js.
  - `page.tsx`: Página principal.
  - `globals.css`: Estilos globales y configuración de Tailwind.
- `components/`: Componentes de React.
  - `Optimizer.tsx`: Componente principal que contiene la lógica de UI, inputs y el visualizador SVG.
- `lib/`: Lógica de negocio y utilidades.
  - `packer.ts`: **Núcleo del algoritmo**. Contiene la clase `GuillotinePacker` y la lógica de recursión para cortes de guillotina.

## 📐 Sobre el Algoritmo

El algoritmo implementado en `lib/packer.ts` utiliza una heurística de **"Best Area Fit"** (Mejor Ajuste de Área) combinada con una estrategia de división de rectángulos libres.

1. **Selección**: Busca el espacio libre más pequeño donde la pieza quepa, minimizando el desperdicio inmediato.
2. **Corte (Split)**: Una vez colocada la pieza, el espacio restante se divide en dos nuevos rectángulos libres.
3. **Regla de Guillotina**: La división siempre se realiza extendiendo el corte a lo largo de uno de los ejes, asegurando que la pieza sea físicamente cortable en una mesa de vidrio convencional.

---

**Desarrollado con ❤️ para la eficiencia en corte.**
