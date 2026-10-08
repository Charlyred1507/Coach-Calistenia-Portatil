# Coach-Calistenia-Portatil
Coach de calistenia portátil basado en AI y vision studio

El repositorio contiene dos entregables:

- `index.html` y `coach-ui.js`: aplicación de cámara y análisis local. El proyecto de Cloudflare Workers `coach-calistenia-portatil` despliega esta raíz desde GitHub y actualiza `app.calirepsai.com`. GitHub Pages también publica la raíz de `main`.
- `website/`: web informativa de CaliReps AI, recuperada de la versión pública de `calirepsai.com` y mantenida aquí. Incluye Quiénes somos, Contacto, Privacidad, Términos y 14 guías.

La web se puede revisar en [GitHub Pages](https://charlyred1507.github.io/Coach-Calistenia-Portatil/website/) y en [el despliegue de la app](https://app.calirepsai.com/website/). Sus enlaces relativos permiten publicarla tanto en esa subcarpeta como en la raíz de `calirepsai.com`.

## Publicación del dominio principal

El 8 de octubre de 2026 se verificó que el push actualiza la app y la vista de `/website/`. `calirepsai.com` seguía sirviendo la portada anterior y `/about.html` respondía 404. Antes de configurar su publicación, hay que identificar en Cloudflare el proyecto que tiene asignado ese dominio.

Ese proyecto debe publicar `website/` como raíz desde este repositorio. Si es Pages, su directorio de salida es `website`, sin compilación. Si es Workers con archivos estáticos, su directorio de assets debe ser `website`, conservando el nombre y los dominios del proyecto correspondiente. El servicio de la app debe seguir publicando la raíz del repositorio.

Para generar el paquete de publicación:

```sh
python3 scripts/package-website.py
```

El archivo `dist/calirepsai-website.zip` contiene `index.html` en la raíz y sirve como alternativa para un proyecto de Cloudflare Pages que admita cargas directas. La publicación desde GitHub debe configurarse en el proyecto del dominio principal; el despliegue de la app no actualiza por sí solo `calirepsai.com`.

La aplicación no sirve anuncios en cámara, resultados automáticos ni historial local. El código de AdSense se conserva en las páginas editoriales de la web. Los ajustes de consentimiento/CMP y las exclusiones de anuncios automáticos se administran en AdSense; hay detalles en [la revisión](docs/adsense-review.md).
