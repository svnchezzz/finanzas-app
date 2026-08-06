# Control F. MS — Especificación de Rediseño
### Guía integral de diseño visual, interacción y animación

> **Versión:** 1.0 · **Fecha:** 2026-07-30
> **Alcance:** Rediseño completo de la app (vistas Panel, Historial, Pendientes, Presupuestos, Recurrentes, Metas, Categorías) para Capacitor/Android y web.
> **Referencias de lujo:** Revolut (jerarquía numérica), Mercury (sobriedad B/N), Wise (claridad de flujo), Stripe (precisión tipográfica), iOS (navegación flotante).

---

## 1. Visión General

### 1.1 Concepto: "Monocromo con intención"

El rediseño convierte a Control F. MS en una app financiera de aspecto **premium, silencioso y preciso**. El lenguaje visual se construye sobre blanco y negro puros; el color solo aparece cuando comunica dinero (verde = entra, rojo = sale) y nunca como decoración.

### 1.2 Valores de diseño

| Valor | Traducción práctica |
|---|---|
| **Silencio visual** | Sin gradientes decorativos, sin sombras pesadas, sin más de 2 pesos tipográficos por pantalla |
| **El número es el héroe** | Las cifras monetarias siempre son el elemento más grande y contrastado de su sección |
| **Profundidad por capas, no por sombras** | La jerarquía se logra con tonos de superficie (fondo → tarjeta → elemento elevado), bordes hairline y blur |
| **Movimiento con propósito** | Toda animación responde a una acción del usuario o comunica un cambio de estado; nada se mueve "porque sí" |
| **Cero fricción de entrada** | Registrar un gasto debe tomar < 5 segundos: teclado numérico inmediato, formato automático, un solo tap para guardar |

### 1.3 Promesa visual

Al abrir la app, el usuario debe sentir que usa un producto del nivel de Mercury o Revolut: fondo limpio, un número grande que responde a su periodo seleccionado, tarjetas que respiran, y una barra flotante inferior que parece parte del sistema operativo, no de una página web.

---

## 2. Paleta de Colores

### 2.1 Tokens — Modo Claro

| Token | Hex | RGB | Uso |
|---|---|---|---|
| `--bg` | `#F7F7F5` | 247 247 245 | Fondo global (blanco cálido, evita el blanco clínico) |
| `--surface` | `#FFFFFF` | 255 255 255 | Tarjetas, modales, barra de navegación |
| `--surface-2` | `#F1F1EF` | 241 241 239 | Chips, filas alternas, campos de entrada |
| `--ink` | `#0A0A0A` | 10 10 10 | Texto principal, cifras, iconos activos |
| `--ink-2` | `#5C5C5C` | 92 92 92 | Texto secundario, etiquetas |
| `--ink-3` | `#9A9A96` | 154 154 150 | Placeholders, metadatos, iconos inactivos |
| `--line` | `#E7E7E4` | 231 231 228 | Bordes hairline (1px), divisores |
| `--accent` | `#0A0A0A` | 10 10 10 | Botón primario, tab activo, foco |
| `--on-accent` | `#FFFFFF` | 255 255 255 | Texto sobre botón primario |

### 2.2 Tokens — Modo Oscuro

| Token | Hex | RGB | Uso |
|---|---|---|---|
| `--bg` | `#0A0A0A` | 10 10 10 | Fondo global (negro casi puro; no `#000` para evitar smearing OLED en scroll) |
| `--surface` | `#161616` | 22 22 22 | Tarjetas, modales |
| `--surface-2` | `#212121` | 33 33 33 | Chips, campos de entrada |
| `--ink` | `#F5F5F3` | 245 245 243 | Texto principal (blanco cálido, no `#FFF` puro: reduce fatiga) |
| `--ink-2` | `#A3A3A0` | 163 163 160 | Texto secundario |
| `--ink-3` | `#6B6B68` | 107 107 104 | Placeholders, metadatos |
| `--line` | `#262626` | 38 38 38 | Bordes hairline, divisores |
| `--accent` | `#F5F5F3` | 245 245 243 | Botón primario (invertido), tab activo |
| `--on-accent` | `#0A0A0A` | 10 10 10 | Texto sobre botón primario |

### 2.3 Colores semánticos (únicos colores permitidos)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--pos` | `#0E8A4A` | `#37C97C` | Ingresos, metas cumplidas, deltas positivos |
| `--neg` | `#C93B3B` | `#F26D6D` | Gastos, vencidos, deltas negativos |
| `--warn` | `#B7791F` | `#E8B04B` | Pendientes próximos a vencer, presupuesto > 80% |
| `--pos-bg` | `#0E8A4A` al 10% | `#37C97C` al 14% | Fondo de badges de ingreso |
| `--neg-bg` | `#C93B3B` al 10% | `#F26D6D` al 14% | Fondo de badges de gasto |

**Reglas de uso del color:**
- El color semántico se aplica solo a: cifras con signo, badges de estado, barras de progreso de presupuesto/meta y puntos de categoría.
- Nunca colorear fondos completos de tarjeta ni títulos.
- Todos los pares texto/fondo cumplen WCAG AA (≥ 4.5:1 texto normal, ≥ 3:1 texto ≥ 18px). Los valores de `--pos`/`--neg` en oscuro están aclarados precisamente para esto.

### 2.4 Elevación y blur

| Capa | Claro | Oscuro |
|---|---|---|
| Tarjeta | `box-shadow: 0 1px 2px rgb(0 0 0 / .04)` + borde `--line` | Sin sombra; borde `--line` |
| Modal / sheet | `0 16px 48px rgb(0 0 0 / .12)` | `0 16px 48px rgb(0 0 0 / .55)` |
| Barra flotante | `background: rgb(255 255 255 / .78)` + `backdrop-filter: blur(20px) saturate(1.6)` + borde `--line` | `rgb(22 22 22 / .72)` + mismo blur |
| Scrim (detrás de modal) | `rgb(10 10 10 / .35)` | `rgb(0 0 0 / .6)` |

---

## 3. Tipografía

### 3.1 Familias

| Rol | Fuente | Fallback |
|---|---|---|
| UI y textos | **Inter** (variable) | `-apple-system, "SF Pro Text", Roboto, system-ui, sans-serif` |
| Cifras monetarias | **Inter** con `font-feature-settings: "tnum" 1` (dígitos tabulares) | igual |

> Una sola familia en toda la app. El "lujo" se logra con escala y espaciado, no mezclando fuentes. `tabular-nums` es **obligatorio** en toda cifra: evita el "baile" de dígitos al animar contadores y alinea columnas en Historial.

### 3.2 Escala tipográfica (base 16px = 1rem)

| Token | Tamaño | Peso | Line-height | Letter-spacing | Uso |
|---|---|---|---|---|---|
| `display` | 40px / 2.5rem | 700 | 1.1 | −0.03em | Cifra principal del Panel ("Disponible") |
| `h1` | 28px / 1.75rem | 700 | 1.15 | −0.02em | Cifras de KPI, título de modal |
| `h2` | 22px / 1.375rem | 650 | 1.2 | −0.015em | Títulos de vista ("Presupuestos por categoría") |
| `h3` | 17px / 1.0625rem | 600 | 1.3 | −0.01em | Títulos de tarjeta/sección ("Tendencia") |
| `body` | 15px / 0.9375rem | 450 | 1.45 | 0 | Texto general, filas de historial |
| `label` | 13px / 0.8125rem | 500 | 1.35 | +0.01em | Etiquetas de campo, chips de filtro |
| `caption` | 12px / 0.75rem | 500 | 1.3 | +0.02em | Metadatos (fecha, categoría en filas) |
| `overline` | 11px / 0.6875rem | 600 | 1.2 | +0.08em, MAYÚSCULAS | Etiquetas de KPI ("INGRESOS", "DISPONIBLE") |

### 3.3 Reglas

- Máximo **2 pesos por pantalla** además del peso de las cifras.
- Los decimales de cifras grandes se muestran al 60% del tamaño y en `--ink-2`: `$ 1.254.300,`<small>50</small> — patrón Revolut.
- El signo monetario (`$`) siempre al 70% del tamaño de la cifra, peso 500.
- Texto secundario nunca por debajo de 12px.

---

## 4. Espaciado y Márgenes

### 4.1 Grid base: 4px

Todos los valores de espaciado son múltiplos de 4.

| Token | Valor | Uso |
|---|---|---|
| `--s-1` | 4px | Separación icono–texto, gaps mínimos |
| `--s-2` | 8px | Gap entre chips, padding vertical de badges |
| `--s-3` | 12px | Gap entre filas de lista, padding de chips |
| `--s-4` | 16px | Padding interno de tarjetas pequeñas, gap entre tarjetas |
| `--s-5` | 20px | **Margen lateral de pantalla (móvil)**, padding de tarjetas |
| `--s-6` | 24px | Separación entre secciones dentro de una vista |
| `--s-7` | 32px | Separación entre bloques mayores (hero → KPIs) |
| `--s-8` | 48px | Aire superior de estados vacíos |

### 4.2 Radios

| Token | Valor | Uso |
|---|---|---|
| `--r-s` | 10px | Chips, badges, campos pequeños |
| `--r-m` | 14px | Botones, campos de entrada |
| `--r-l` | 20px | Tarjetas |
| `--r-xl` | 28px | Modales, bottom sheets (esquinas superiores) |
| `--r-pill` | 999px | Barra de navegación flotante, segmented controls |

### 4.3 Layout

- **Móvil:** 1 columna; margen lateral 20px; los KPIs en grid 2×2 con gap 12px.
- **≥ 768px:** contenido centrado `max-width: 1080px`; KPIs en fila de 4; gráficas en grid de 2 columnas.
- **Safe areas (Capacitor):** todo contenedor fijo usa `env(safe-area-inset-*)`. La barra flotante: `bottom: calc(16px + env(safe-area-inset-bottom))`.
- Espacio reservado al final del scroll: `padding-bottom: 112px` para que la barra flotante nunca tape contenido.

---

## 5. Componentes Principales

### 5.1 Botones

| Variante | Especificación |
|---|---|
| **Primario** | Fondo `--accent`, texto `--on-accent`, alto 52px, radio `--r-m`, texto `label` peso 600. Ocupa ancho completo en modales. |
| **Secundario (ghost)** | Fondo transparente, borde 1px `--line`, texto `--ink`, alto 52px. |
| **Terciario (texto)** | Solo texto `--ink-2`, alto 44px, sin borde. Para "Cancelar". |
| **FAB "Agregar"** | Círculo 56px, fondo `--accent`, icono `+` de 24px en `--on-accent`, posicionado 16px por encima de la barra flotante, lado derecho. Sombra de modal. |

**Estados (todas las variantes):**
- *Pressed:* `transform: scale(0.97)` + opacidad 0.9 — 120ms.
- *Disabled:* opacidad 0.4, sin eventos.
- *Loading:* el texto se desvanece y aparece spinner de 18px; el botón conserva su ancho (nunca "salta").

### 5.2 Tarjetas

```
┌──────────────────────────────────┐
│ TENDENCIA                    ⌄   │ ← overline --ink-2 + acción opcional
│                                  │
│ $ 2.340.000                      │ ← h1, tabular
│ ▲ 12% vs. periodo anterior       │ ← caption en --pos/--neg
│                                  │
│ [gráfica / contenido]            │
└──────────────────────────────────┘
radio 20px · padding 20px · fondo --surface · borde 1px --line
```

### 5.3 Filas de transacción (Historial)

```
┌──────────────────────────────────────────┐
│ (●)  Mercado                 −$ 84.500   │ ← body 600 | cifra tabular --neg
│      Alimentación · 12 jul       Gasto   │ ← caption --ink-3 | badge
└──────────────────────────────────────────┘
alto mínimo 64px · punto de categoría 10px con su color · divisor hairline entre filas
```

- Swipe a la izquierda revela acciones **Editar** (fondo `--surface-2`) y **Eliminar** (fondo `--neg`), 72px cada una.
- Tap abre el detalle en bottom sheet.

### 5.4 Segmented control (Día / Semana / Mes / Año)

- Contenedor pill: fondo `--surface-2`, padding 4px, radio `--r-pill`, alto 40px.
- Segmento activo: "píldora" `--surface` (claro) / `--surface-2` elevada con borde (oscuro), sombra `0 1px 3px rgb(0 0 0 / .08)`, texto `--ink` 600.
- La píldora activa **se desliza** entre posiciones (ver §9), nunca aparece/desaparece.

### 5.5 Chips de filtro (Todos / Ingresos / Gastos / Ahorro)

- Alto 34px, radio pill, texto `label`.
- Inactivo: borde `--line`, texto `--ink-2`. Activo: fondo `--ink`, texto `--bg`.

### 5.6 Barras de progreso (Presupuestos / Metas)

- Pista: alto 8px, radio pill, fondo `--surface-2`.
- Relleno: `--ink` por defecto; cambia a `--warn` al superar 80% y a `--neg` al 100% (presupuestos). En metas siempre `--pos`.
- Animación de llenado al entrar en viewport: 600ms, ease-out.

### 5.7 Bottom sheet (reemplaza a los modales centrados)

- Anclado al borde inferior, radio superior `--r-xl`, asa de arrastre de 36×4px en `--ink-3` al 40%.
- Se cierra con arrastre hacia abajo, tap en el scrim o botón Cancelar.
- Entrada: `translateY(100%) → 0` con spring suave (ver §9).

### 5.8 Badges de estado (Pendientes)

| Estado | Estilo |
|---|---|
| Pendiente | Fondo `--surface-2`, texto `--ink-2` |
| Vence pronto (≤ 3 días) | Fondo `--warn` al 12%, texto `--warn` |
| Vencido | Fondo `--neg-bg`, texto `--neg` |
| Completado | Fondo `--pos-bg`, texto `--pos` |

---

## 6. Barra de Navegación Inferior

### 6.1 Concepto

Píldora flotante estilo iOS — **no** una barra de borde a borde. Debe leerse como un objeto físico que flota sobre el contenido, similar a la barra de búsqueda de Safari en iOS o al dock flotante de Arc.

### 6.2 Especificación

```
                 contenido scrolleable (pasa por detrás)
        ┌───────────────────────────────────────────┐
        │   ▣ Panel    ☰    ⏱    ◎    ⋯             │
        └───────────────────────────────────────────┘
                         ● FAB (+)  ← flotando 16px arriba, lado derecho
```

| Propiedad | Valor |
|---|---|
| Ancho | `min(calc(100% - 48px), 360px)`, centrada horizontalmente |
| Alto | 64px |
| Posición | `position: fixed; bottom: calc(16px + env(safe-area-inset-bottom))` |
| Radio | `--r-pill` |
| Fondo | Blur según §2.4 (translúcido + `backdrop-filter: blur(20px)`) |
| Borde | 1px `--line` |
| Ítems | 5: **Panel · Historial · Pendientes · Metas · Más** |
| Icono | 24px, trazo 1.75px, `stroke-linecap: round` |

### 6.3 Estados de ítem

| Estado | Especificación |
|---|---|
| **Activo** | Variante preferida ("morphing pill", patrón iOS 18): el ítem activo se expande horizontalmente mostrando icono + etiqueta lado a lado dentro de una píldora interior `--surface-2`; los inactivos muestran solo el icono. Alternativa simple: etiqueta caption 11px bajo el icono, solo en el activo. |
| **Inactivo** | Icono en `--ink-3`, sin etiqueta |
| **Pressed** | `scale(0.9)` del icono, 120ms |
| **Cambio de tab** | La píldora interior se desliza del ítem anterior al nuevo (spring, ver §9); el icono nuevo hace un micro-bounce |

### 6.4 Comportamiento con scroll

- Scroll hacia abajo > 24px: la barra se **compacta** (alto 52px, iconos 22px, la etiqueta activa se oculta) — transición 250ms.
- Scroll hacia arriba o reposo: vuelve al estado completo.
- Nunca desaparece por completo (accesibilidad y orientación).

### 6.5 "Más"

Abre un bottom sheet con: Presupuestos, Recurrentes, Categorías, Exportar, Apariencia (tema), en filas de 56px con iconos.

---

## 7. Dashboards (Vista Panel)

### 7.1 Estructura vertical

```
1. Header ligero        Marca "Control F." + botón tema + Exportar
2. Segmented periodo    Día · Semana · Mes · Año   (sticky con blur al hacer scroll)
3. HERO                 "DISPONIBLE" (overline) + cifra display 40px
                        + delta vs. periodo anterior (caption ±%)
4. KPI grid 2×2         Ingresos · Gastos · Ahorro · Pendientes
5. Tarjeta Tendencia    Gráfica de línea/área del flujo del periodo
6. Tarjeta Gastos       Top 5 categorías con barras horizontales
7. Tarjeta Pendientes   Próximos 3 vencimientos + "Ver todos"
8. (padding 112px)      Aire para la barra flotante
```

### 7.2 Reglas de jerarquía

- **Un solo hero por pantalla.** La cifra "Disponible" es el único elemento en `display`; ningún KPI compite con ella.
- Cada tarjeta responde una sola pregunta: *¿cuánto tengo? → hero · ¿cómo voy? → tendencia · ¿en qué gasto? → categorías · ¿qué debo? → pendientes.*
- KPI card: overline + cifra h1 + delta caption. Sin iconos decorativos dentro de los KPIs.
- Al cambiar el periodo en el segmented, **todas** las cifras animan con count-up (§9.3) y las gráficas hacen morph — nunca un re-render seco.

### 7.3 Gráficas (estilo monocromo)

- Línea de tendencia: trazo 2px `--ink`; área bajo la curva: gradiente `--ink` 8% → 0%.
- Sin rejilla completa de ejes: solo 3 líneas horizontales hairline `--line` y etiquetas caption en `--ink-3`.
- Tooltip al tap: punto de 6px + pill flotante con fecha y cifra; línea vertical hairline.
- Barras de categorías: horizontales, alto 8px, en `--ink`; la categoría usa su punto de color solo en la etiqueta.

### 7.4 Estado vacío

- Ilustración lineal monocroma (trazo 1.5px) de 120px, título h3 "Empieza a controlar tus finanzas", subtítulo body `--ink-2` y botón primario "Agregar movimiento". Centrado, con `--s-8` superior.

---

## 8. Campos Monetarios

### 8.1 Teclado bloqueado a números (no negociable)

```html
<input
  type="text"
  inputmode="decimal"
  autocomplete="off"
  pattern="[0-9.,]*"
  enterkeyhint="done"
/>
```

- `inputmode="decimal"` fuerza el teclado numérico en Android (WebView de Capacitor) e iOS. **No usar `type="number"`**: rompe el formateo con separadores de miles y permite `e`, `+`, `-`.
- Sanitizado en el evento `input`: descartar todo carácter fuera de `[0-9]` (los separadores los pone el formateador, no el usuario).
- En Android, opcionalmente configurar el resize del teclado (plugin `@capacitor/keyboard`) para que el sheet no salte al abrirse.

### 8.2 Formato en vivo

- Localización `es-CO`: miles con `.`, decimales con `,` — vía `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`.
- El usuario teclea dígitos crudos; el campo muestra `$ 1.250.000` formateado en cada pulsación, manteniendo el caret al final.
- Cifra en el campo: h1 (28px) tabular, centrada — el monto es el protagonista del formulario.
- Campo vacío muestra `$ 0` en `--ink-3`.

### 8.3 Validación y feedback

| Caso | Comportamiento |
|---|---|
| Monto = 0 al guardar | Shake horizontal del campo (3 oscilaciones, 8px, 300ms) + borde `--neg` + háptico de error |
| Monto válido | Borde de foco 1.5px `--ink`; el botón Guardar se habilita (transición de opacidad 200ms) |
| Máximo | 12 dígitos; al alcanzarlo, pulsaciones extra producen un tick háptico suave y no entran |

### 8.4 Flujo "Agregar" (bottom sheet)

1. FAB `+` → sube el sheet, el campo de monto ya tiene **foco y teclado abierto** (0 taps extra).
2. Segmento Tipo: Gasto · Ingreso · Ahorro (pill, default: Gasto).
3. Categoría: carrusel horizontal de chips con punto de color.
4. Fecha (default hoy) y nota opcional colapsadas bajo "Más detalles".
5. Guardar → animación de éxito (§13.1) → el sheet baja → la nueva fila aparece en la lista con un highlight que se desvanece (1.2s).

---

## 9. Animaciones y Transiciones

### 9.1 Herramientas — decisión

| Prioridad | Herramienta | Uso | Justificación |
|---|---|---|---|
| **1** | **Rive** (`@rive-app/canvas`, ~90KB gz) | Animación de éxito al guardar, iconos de la barra de navegación (state machines), ilustraciones de estado vacío, splash | Interactividad por state machine, archivos `.riv` de 5–30KB, render en canvas a 60fps en WebView. **Opción recomendada.** |
| **2** | **After Effects → Lottie** (`lottie-web` o dotLottie, export con Bodymovin) | Alternativa si el equipo ya domina AE; mismas piezas que Rive | Pipeline de AE conocido; archivos mayores y sin state machines nativas. Usar formato `.lottie` (comprimido). |
| **3** | **CSS transitions / WAAPI** | Todo lo demás: navegación, píldoras, sheets, pressed states, conteos | Cero dependencias, GPU-friendly, ideal para micro-interacciones |

> Regla: **Rive/Lottie para piezas "ilustradas"** (éxito, vacíos, iconos animados); **CSS/WAAPI para todo lo estructural**. No cargar una librería para lo que CSS hace mejor.

### 9.2 Sistema de movimiento

| Token | Curva / Duración | Uso |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` · 250–350ms | Entradas: sheets, tarjetas, tooltips |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` · 200–300ms | Deslizamiento de píldoras (segmented, nav) |
| `--ease-press` | `cubic-bezier(0.34, 1.3, 0.64, 1)` · 120ms | Pressed/release con leve rebote |
| `--spring-sheet` | `cubic-bezier(0.32, 0.72, 0, 1)` · 420ms | Bottom sheets (curva estilo iOS) |
| Salidas | siempre ~30% más rápidas que las entradas | Cerrar debe sentirse inmediato |

**Presupuesto de duración:** ninguna animación bloqueante supera 450ms. Solo se animan `transform` y `opacity` (compositor); jamás `width/height/top` en listas largas.

### 9.3 Catálogo de animaciones

| Interacción | Especificación |
|---|---|
| **Cambio de vista (tabs)** | Cross-fade 180ms + `translateY(8px → 0)` de la vista entrante. Sin slides laterales (las vistas no son secuenciales). |
| **Count-up de cifras** | Al cambiar periodo o guardar: interpolar del valor anterior al nuevo en 500ms `--ease-out`, con `tabular-nums`. |
| **Píldora de segmented/nav** | La píldora activa desliza a la nueva posición 250ms `--ease-in-out`; la etiqueta entrante hace fade 150ms. |
| **Bottom sheet** | Entrada `translateY(100%) → 0` 420ms `--spring-sheet`; scrim fade 250ms; cierre 280ms. Arrastre: sigue el dedo 1:1; al soltar > 30% o velocidad > 0.5px/ms, cierra. |
| **Aparición de listas** | Stagger: cada fila `opacity 0→1` + `translateY(12px→0)`, 220ms, delay 30ms/ítem, máximo 8 ítems con stagger (el resto aparece junto). |
| **Swipe de fila** | Sigue el dedo; snap a 144px (dos acciones) con spring. |
| **Éxito al guardar** | Pieza Rive: círculo que se dibuja + check con rebote (600ms) sobre scrim ligero; se cierra solo. |
| **Pull-to-refresh** | Spinner de trazo `--ink` que rota y se dibuja proporcional al arrastre. |
| **Gráficas** | Trazado de línea con `stroke-dashoffset` 600ms al entrar; morph entre periodos interpolando puntos 400ms. |
| **Cambio de tema** | Ver §10.3. |

### 9.4 Accesibilidad de movimiento

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```
Los count-up muestran el valor final de inmediato; las piezas Rive saltan al frame final.

---

## 10. Modo Claro vs Modo Oscuro

### 10.1 Arquitectura

- Todos los colores viven como custom properties en `:root` (claro) y `[data-theme="dark"]` (oscuro). **Ningún hex hardcodeado** fuera de `styles.css`.
- Tres estados de preferencia: Claro · Oscuro · Sistema (default: Sistema, vía `prefers-color-scheme`). Persistir en la base local existente (`db.js`).
- `<meta name="theme-color">` y la StatusBar (plugin `@capacitor/status-bar`) se actualizan con el tema para que la barra de estado de Android combine.

### 10.2 Diferencias intencionales (no solo invertir)

| Aspecto | Claro | Oscuro |
|---|---|---|
| Profundidad | Sombras suaves + bordes | **Solo** tonos de superficie + bordes (las sombras no se leen sobre negro) |
| Cifras semánticas | Tonos profundos (`#0E8A4A`) | Tonos aclarados (`#37C97C`) para mantener contraste AA |
| Gráficas | Trazo negro, área 8% | Trazo blanco, área 10% |
| Blur de la barra | Blanco translúcido | Gris-negro translúcido con el borde levemente más marcado para definir el contorno |

### 10.3 Transición de tema

- Al alternar: cross-fade global de 300ms (`transition: background-color, color, border-color 300ms ease`) aplicado a los tokens — **no** un re-render brusco.
- El toggle en sí es una micro-animación (sol ↔ luna con morph, pieza Rive de ~6KB o SVG animado).

### 10.4 Accesibilidad

- Verificar AA en ambos temas para: `--ink-2` sobre `--surface`, `--pos/--neg` sobre `--surface`, texto sobre badges.
- Focus visible: anillo de 2px `--ink` con offset de 2px, en ambos temas (navegación por teclado en web).

---

## 11. Patrones UX Intuitivos

### 11.1 Acciones comunes

| Acción | Patrón |
|---|---|
| Registrar movimiento | FAB siempre visible → sheet con foco en el monto (< 5s total) |
| Cambiar periodo | Segmented sticky; el estado elegido persiste entre sesiones |
| Editar/eliminar | Swipe en la fila + confirmación **solo** para eliminar (sheet de 2 botones, el destructivo en `--neg`) |
| Deshacer | Tras eliminar: toast "Movimiento eliminado — Deshacer" visible 5s (preferible a la confirmación dura para acciones frecuentes) |
| Completar pendiente | Checkbox circular en la fila; al marcar, animación de check + la fila se desvanece hacia "Completados" |

### 11.2 Feedback y estados

| Estado | Especificación |
|---|---|
| **Carga inicial** | Skeletons con shimmer (gradiente `--surface-2` → `--line` → `--surface-2`, loop 1.4s) replicando el layout real: hero, 4 KPIs, 2 tarjetas. Nunca un spinner de página completa. |
| **Carga de acción** | En el botón (spinner inline §5.1); la UI no se bloquea |
| **Éxito** | Pieza Rive (§9.3) + háptico ligero |
| **Error** | Toast superior con borde `--neg` + mensaje accionable ("No se pudo guardar. Reintentar") |
| **Vacío** | Ilustración + CTA (§7.4), uno por vista con texto propio |
| **Offline** | La app es local-first: badge discreto "Sin conexión" solo si alguna función lo requiere |

### 11.3 Toques y ergonomía

- Área táctil mínima: **44×44px** en todo control, aunque el icono sea menor.
- Acciones primarias en el tercio inferior de la pantalla (zona del pulgar).
- Los toasts aparecen arriba (no chocan con la barra flotante).

---

## 12. Consideraciones de Implementación

### 12.1 Orden de trabajo sugerido

1. **Tokens** — reescribir `styles.css` con las custom properties de §2–§4 (base de todo lo demás).
2. **Tipografía y tarjetas** — escala, tabular-nums, tarjetas y filas.
3. **Barra flotante + FAB** — reemplaza la `bottomnav` actual de borde a borde.
4. **Bottom sheets** — migrar los modales actuales (`Agregar`, `Exportar`) a sheets.
5. **Campos monetarios** — sanitizado + formateo `Intl` + foco automático.
6. **Movimiento CSS/WAAPI** — píldoras, count-up, staggers, tema.
7. **Piezas Rive** — éxito, vacíos, toggle de tema, iconos de nav.

### 12.2 Notas técnicas

- **El stack actual (HTML/CSS/JS vanilla + Capacitor) es suficiente.** No se requiere framework; WAAPI + CSS cubren §9.
- Rive: `@rive-app/canvas` (~90KB gz) cargado con `defer`; los `.riv` como assets locales en `www/` (offline-first).
- `haptics.js` existente: mapear háptico *light* a taps de nav/segmented, *medium* a guardar, *error* a validación fallida.
- Fuente Inter variable **self-hosted** en `www/fonts/` (sin CDN de Google Fonts: offline y privacidad), `font-display: swap`, subset latin (~40KB woff2).
- Gráficas: mantener/implementar SVG propio (línea + barras bastan); evitar librerías de charting completas por peso.
- Rendimiento en WebView Android: `will-change: transform` solo durante la animación; listas de Historial > 100 ítems con render incremental (bloques de 30 al hacer scroll).
- Presupuesto de peso total añadido: < 250KB (fuente + runtime de Rive + archivos .riv).

### 12.3 Recursos a producir

| Asset | Formato | Piezas |
|---|---|---|
| Iconografía UI | SVG inline, trazo 1.75px, grid de 24px | ~24 iconos |
| Animación de éxito | `.riv` | 1 |
| Ilustraciones de estado vacío | `.riv` o SVG | 7 (una por vista) |
| Toggle de tema | `.riv` | 1 |
| Fuente Inter variable | `woff2` | 1 |

---

## 13. Elementos Adicionales Sugeridos (propuestas del diseñador)

### 13.1 Momento de celebración en Metas ✦
Cuando una meta de ahorro llega al 100%: pieza Rive de confeti monocromo (partículas negras/blancas + un acento `--pos`) de 1.2s sobre la tarjeta de la meta, con háptico de éxito doble. Convierte el momento más valioso de la app en algo memorable — y en monocromo se siente elegante, no infantil.

### 13.2 Háptica coreografiada
Sistema háptico consistente usando el `haptics.js` existente:
- *Tick ligero:* cambio de tab, cambio de segmento, chip de filtro.
- *Impacto medio:* guardar movimiento, completar pendiente.
- *Doble pulso:* meta cumplida, exportación lista.
- *Error:* validación fallida (junto al shake).
La háptica es el "material" que hace que la barra flotante y las píldoras se sientan físicas, como en iOS.

### 13.3 Modo privacidad (ocultar cifras)
Icono de ojo en el header del Panel: al activarlo, todas las cifras se sustituyen por `••••` con una transición blur-out de 200ms. Pensado para usar la app en público — patrón de Revolut/N26 que transmite seriedad financiera. Persistente entre sesiones.

### 13.4 Resumen inteligente del hero
Bajo la cifra de "Disponible", una línea de contexto generada por reglas locales: *"Gastaste 18% menos que la semana pasada"* o *"3 pendientes vencen esta semana"*. Da vida al dashboard sin añadir widgets y aprovecha datos que ya existen en `db.js`.

### 13.5 Number ticker por dígito
Evolución del count-up (§9.3): cada dígito rueda verticalmente como un odómetro (patrón Revolut). Implementable en CSS puro con columnas de dígitos y `translateY`; reservarlo solo para la cifra hero para mantener el rendimiento.

---

*Fin de la especificación. Cualquier decisión no cubierta aquí debe resolverse a favor de: menos elementos, más contraste tipográfico, y movimiento solo si comunica estado.*
