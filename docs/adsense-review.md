# Revisión de preparación para AdSense — 8 de octubre de 2026

El correo de Google confirma que el sitio sigue en revisión; no es una notificación de rechazo. Recomienda contenido original y útil, Quiénes somos y Contacto, navegación clara, rapidez, SEO básico, variedad y mantenimiento editorial.

## Cambios y comprobaciones

| Recomendación | Resultado en esta versión |
| --- | --- |
| Quiénes somos | Nueva página con propósito del proyecto independiente y límites del MVP; resumen en portada. |
| Contacto | Existía. Se amplía a soporte y consultas de privacidad, conservando el formulario publicado. No se inventan un correo ni tiempos de respuesta. |
| Navegación | Enlaces a Quiénes somos y Contacto en todas las páginas; menú visible también en móvil; foco de teclado y enlace para saltar al contenido. |
| Privacidad | Aviso actualizado sobre publicidad y cookies de Google, terceros, almacenamiento local, cámara y sincronización opcional. Se evita prometer controles de consentimiento que no se han configurado. |
| SEO | Títulos y descripciones, canonical por página, Open Graph, sitemap ampliado y rutas rastreables. robots.txt y ads.txt existentes se conservan. |
| Rendimiento y formatos | Web estática, CSS local y tipografía del sistema; formularios diferidos; esquema SVG con dimensiones explícitas. La app conserva la carga diferida de librerías de visión al iniciar un análisis. |
| Exactitud del contenido | 14 guías revisadas contra el código. Se aclaran las aproximaciones del modelo, la pérdida de velocidad y el carácter provisional de los resultados. |
| Anuncios | Sin código publicitario en páginas de contacto, legales, Quiénes somos o índice de guías; sin espacios publicitarios en pantallas de la app ni resultados automáticos. Se conserva el fragmento original de AdSense en portada y artículos. |

## Pendiente de publicación y cuenta

- La captura de Cloudflare identifica `calireps-ai-website` como el proyecto de `calirepsai.com`, conectado al repositorio `CaliReps-AI-Website`. Ese repositorio publica los archivos estáticos desde la raíz. El proyecto `coach-calistenia-portatil` y su repositorio se mantienen separados para `app.calirepsai.com`.
- Las mejoras se trasladaron a este repositorio conservando la estructura de publicación y los archivos originales `script.js`, `robots.txt` y `ads.txt`. La antigua ruta `/guides/contact.html` redirige al contacto vigente sin anuncios.
- Antes del traslado se comprobaron las 20 páginas de contenido en tres anchuras de pantalla, los enlaces locales y el comportamiento de la app. La publicación debe verificarse en el dominio principal tras el despliegue automático.
- Verificar en AdSense la CMP certificada de Google/TCF si se muestran anuncios a usuarios del EEE, Reino Unido o Suiza. El aviso de privacidad no reemplaza el consentimiento. El estado de esta configuración no es accesible desde el repositorio.
- Configurar en AdSense las exclusiones de anuncios automáticos para Contacto, Privacidad, Términos, Quiénes somos y pantallas de la herramienta. Quitar el script de una página no sustituye esa configuración de cuenta.
- Mantener las guías revisadas al cambiar los jueces. Incorporar demostraciones reales propias si están disponibles; no se publican videos ni credenciales ficticias para simular variedad.
- Verificar el estado de revisión, los datos de contacto/pagos y ads.txt desde la cuenta. No hacer clic en anuncios propios ni solicitar clics. No se ha añadido Analytics sin una configuración autorizada del proyecto.
- Las comprobaciones de navegador verifican diseño, rutas y comportamiento; no constituyen una medición de Core Web Vitals con usuarios reales ni una garantía de aprobación.

## Fuentes oficiales

- [Preparar el contenido y la navegación](https://support.google.com/adsense/answer/7299563?hl=es).
- [Políticas del programa AdSense](https://support.google.com/adsense/answer/48182?hl=es).
- [Avisos de privacidad obligatorios](https://support.google.com/publisherpolicies/answer/10437794?hl=es).
- [Valor del contenido y pantallas sin contenido editorial](https://support.google.com/publisherpolicies/answer/11112688?hl=es).
- [Requisitos de CMP](https://support.google.com/adsense/answer/13554116?hl=es).
- [SEO básico](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=es).
- [Estado de revisión del sitio](https://support.google.com/adsense/answer/12170222?hl=es).
